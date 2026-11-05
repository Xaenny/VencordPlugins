package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestChooseBranchAcceptsKnownNames(t *testing.T) {
	for _, name := range []string{"stable", "ptb", "canary", "PTB", "Canary"} {
		install, err := chooseBranch(name, true)
		if err != nil {
			t.Fatalf("chooseBranch(%q) returned an error: %v", name, err)
		}
		if install.branch.flag == "" {
			t.Fatalf("chooseBranch(%q) returned an empty branch", name)
		}
	}
}

func TestChooseBranchRejectsUnknownNames(t *testing.T) {
	if _, err := chooseBranch("beta", true); err == nil {
		t.Fatal("chooseBranch(\"beta\") should have failed")
	}
}

// Without -branch and with several versions installed there is nothing safe to guess at, so -y
// must fail rather than patch the wrong Discord.
func TestChooseBranchNeedsAnAnswerWhenNonInteractive(t *testing.T) {
	if _, err := chooseBranch("", true); err == nil {
		t.Fatal("chooseBranch should have failed without a branch in non-interactive mode")
	}
}

func TestBranchFlagsMatchWhatTheInstallerExpects(t *testing.T) {
	want := map[string]bool{"stable": true, "ptb": true, "canary": true}
	for _, branch := range branches {
		if !want[branch.flag] {
			t.Fatalf("branch %q isn't one Vencord's installer accepts", branch.flag)
		}
	}
}

func TestHasIndexFindsBothExtensions(t *testing.T) {
	dir := t.TempDir()

	if hasIndex(dir) {
		t.Fatal("an empty folder should not look like a plugin")
	}

	if err := os.WriteFile(filepath.Join(dir, "index.tsx"), []byte("export default {}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !hasIndex(dir) {
		t.Fatal("a folder with index.tsx should look like a plugin")
	}
}

func TestSyncPluginsCopiesOnlyPluginFolders(t *testing.T) {
	source := t.TempDir()
	dest := filepath.Join(t.TempDir(), "userplugins")

	// a plugin, with a nested file
	plugin := filepath.Join(source, "MyPlugin")
	if err := os.MkdirAll(filepath.Join(plugin, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(plugin, "index.ts"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(plugin, "nested", "style.css"), []byte("y"), 0o644); err != nil {
		t.Fatal(err)
	}

	// things that are not plugins and must be skipped, or Vencord's build would try to import them
	if err := os.MkdirAll(filepath.Join(source, "scripts"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "README.md"), []byte("z"), 0o644); err != nil {
		t.Fatal(err)
	}

	copied, err := syncPlugins(source, dest)
	if err != nil {
		t.Fatalf("syncPlugins: %v", err)
	}

	if len(copied) != 1 || copied[0] != "MyPlugin" {
		t.Fatalf("expected only MyPlugin to be copied, got %v", copied)
	}
	if _, err := os.Stat(filepath.Join(dest, "MyPlugin", "nested", "style.css")); err != nil {
		t.Fatalf("nested files should be copied: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dest, "scripts")); err == nil {
		t.Fatal("scripts is not a plugin and should not have been copied")
	}
}

func TestSyncPluginsReplacesAnOldCopy(t *testing.T) {
	source := t.TempDir()
	dest := filepath.Join(t.TempDir(), "userplugins")

	plugin := filepath.Join(source, "MyPlugin")
	if err := os.MkdirAll(plugin, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(plugin, "index.ts"), []byte("new"), 0o644); err != nil {
		t.Fatal(err)
	}

	// a stale copy, including a file that no longer exists in the repo
	stale := filepath.Join(dest, "MyPlugin")
	if err := os.MkdirAll(stale, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stale, "index.ts"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stale, "removed.ts"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := syncPlugins(source, dest); err != nil {
		t.Fatalf("syncPlugins: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(stale, "index.ts"))
	if err != nil || string(content) != "new" {
		t.Fatalf("the copy should have been refreshed, got %q (%v)", content, err)
	}
	if _, err := os.Stat(filepath.Join(stale, "removed.ts")); err == nil {
		t.Fatal("files deleted from the repo should not survive in the copy")
	}
}

// --- Discord install inspection -----------------------------------------------------------

func writeFile(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("asar"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestInspectAsarRecognisesEachState(t *testing.T) {
	cases := []struct {
		name  string
		files []string
		want  asarState
	}{
		{"fresh install", []string{"app.asar"}, asarClean},
		{"patched by Vencord", []string{"app.asar", "_app.asar"}, asarPatched},
		{"patch interrupted after the rename", []string{"_app.asar"}, asarBroken},
		{"nothing there", nil, asarUnknown},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resources := t.TempDir()
			for _, file := range tc.files {
				writeFile(t, filepath.Join(resources, file))
			}

			if got := inspectAsar(resources); got != tc.want {
				t.Fatalf("inspectAsar = %v, want %v", got, tc.want)
			}
		})
	}
}

// The half-patched state is the one that makes Vencord's patcher fail, so repairing it has to
// leave exactly what an unpatched install looks like.
func TestRepairRestoresTheBackup(t *testing.T) {
	resources := t.TempDir()
	writeFile(t, filepath.Join(resources, "_app.asar"))

	install := discordInstall{
		branch:    branches[0],
		resources: resources,
		state:     inspectAsar(resources),
	}
	if install.state != asarBroken {
		t.Fatalf("expected a broken install, got %v", install.state)
	}

	if err := install.repair(); err != nil {
		t.Fatalf("repair: %v", err)
	}

	if got := inspectAsar(resources); got != asarClean {
		t.Fatalf("after repair the install should be clean, got %v", got)
	}
}

func TestRepairRefusesWhenNothingIsWrong(t *testing.T) {
	resources := t.TempDir()
	writeFile(t, filepath.Join(resources, "app.asar"))

	install := discordInstall{branch: branches[0], resources: resources, state: inspectAsar(resources)}
	if err := install.repair(); err == nil {
		t.Fatal("repair should refuse an install that isn't broken")
	}
}

// Discord keeps one folder per version and the patcher uses the newest, so 10000 has to win
// over 9249 - which a plain string sort gets wrong.
func TestNewestAppFolderComparesVersionsNumerically(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"app-1.0.9249", "app-1.0.10000", "app-1.0.888", "modules"} {
		if err := os.MkdirAll(filepath.Join(root, name), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	if got := newestAppFolder(root); got != "app-1.0.10000" {
		t.Fatalf("newestAppFolder = %q, want app-1.0.10000", got)
	}
}

func TestInspectInstallReportsTheNewestVersion(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "app-1.0.9249", "resources", "app.asar"))
	writeFile(t, filepath.Join(root, "app-1.0.10000", "resources", "_app.asar"))

	install, present := inspectInstall(branches[0], root)
	if !present {
		t.Fatal("the install should have been found")
	}
	if install.version != "app-1.0.10000" {
		t.Fatalf("version = %q, want app-1.0.10000", install.version)
	}
	if install.state != asarBroken {
		t.Fatalf("state = %v, want %v", install.state, asarBroken)
	}
}

func TestInspectInstallIgnoresMissingRoots(t *testing.T) {
	if _, present := inspectInstall(branches[0], filepath.Join(t.TempDir(), "nope")); present {
		t.Fatal("a missing folder should not report an install")
	}
}

// --- pull diagnosis -------------------------------------------------------------------------

func gitIn(t *testing.T, dir string, args ...string) {
	t.Helper()
	full := append([]string{"-C", dir}, args...)
	if out, err := exec.Command("git", full...).CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

// originAndClone builds a real origin repo plus a clone of it, which is the only way to exercise
// the upstream comparisons diagnosePull makes.
func originAndClone(t *testing.T) (origin, clone string) {
	return originAndCloneOn(t, "main")
}

// originAndCloneOn does the same on a named default branch. Both names have to be covered: this
// repo's default is master, Vencord's is main, and the remedies used to hardcode one of them.
func originAndCloneOn(t *testing.T, defaultBranch string) (origin, clone string) {
	t.Helper()
	root := t.TempDir()
	origin = filepath.Join(root, "origin")
	clone = filepath.Join(root, "clone")

	if err := os.MkdirAll(origin, 0o755); err != nil {
		t.Fatal(err)
	}
	gitIn(t, origin, "init", "-q", "-b", defaultBranch)
	gitIn(t, origin, "config", "user.email", "t@t")
	gitIn(t, origin, "config", "user.name", "t")
	if err := os.WriteFile(filepath.Join(origin, "file.txt"), []byte("one\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitIn(t, origin, "add", ".")
	gitIn(t, origin, "commit", "-qm", "first")

	if out, err := exec.Command("git", "clone", "-q", origin, clone).CombinedOutput(); err != nil {
		t.Fatalf("clone: %v\n%s", err, out)
	}
	gitIn(t, clone, "config", "user.email", "t@t")
	gitIn(t, clone, "config", "user.name", "t")
	return origin, clone
}

func TestDiagnosePullSpotsADetachedHead(t *testing.T) {
	_, clone := originAndClone(t)
	gitIn(t, clone, "checkout", "-q", "--detach", "HEAD")

	if got, _ := diagnosePull(clone); got != pullDetached {
		t.Fatalf("got %v, want pullDetached", got)
	}
}

func TestDiagnosePullSpotsADivergedBranch(t *testing.T) {
	origin, clone := originAndClone(t)

	// the remote moves on, and so does the clone, separately
	if err := os.WriteFile(filepath.Join(origin, "file.txt"), []byte("two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitIn(t, origin, "commit", "-qam", "second")
	gitIn(t, clone, "commit", "-q", "--allow-empty", "-m", "local only")
	gitIn(t, clone, "fetch", "-q", "origin")

	if got, _ := diagnosePull(clone); got != pullDiverged {
		t.Fatalf("got %v, want pullDiverged", got)
	}
}

// An edited tracked file is dirty; an untracked one never blocks a fast-forward and must not be
// reported as the cause. Getting that wrong sent the PowerShell version chasing a stray file.
func TestDiagnosePullSpotsEditedTrackedFilesButIgnoresUntrackedOnes(t *testing.T) {
	_, clone := originAndClone(t)

	if err := os.WriteFile(filepath.Join(clone, "untracked.txt"), []byte("junk\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got, _ := diagnosePull(clone); got == pullDirty {
		t.Fatal("an untracked file was reported as blocking the pull")
	}

	if err := os.WriteFile(filepath.Join(clone, "file.txt"), []byte("edited\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got, _ := diagnosePull(clone); got != pullDirty {
		t.Fatalf("got %v, want pullDirty", got)
	}
}

func TestDiagnosePullRemediesNameTheCheckout(t *testing.T) {
	_, clone := originAndClone(t)
	gitIn(t, clone, "checkout", "-q", "--detach", "HEAD")

	_, remedy := diagnosePull(clone)
	if !strings.Contains(remedy, clone) {
		t.Fatalf("remedy %q does not mention the checkout path", remedy)
	}
}

// The remedy is a command the user pastes, so naming the wrong branch makes it fail on arrival -
// and a command that fails gets tried before it gets doubted. This repo's default is master, so a
// remedy mentioning "main" is the bug this locks out.
func TestDiagnosePullRemedyNamesTheCheckoutsOwnBranch(t *testing.T) {
	origin, clone := originAndCloneOn(t, "master")

	if err := os.WriteFile(filepath.Join(origin, "file.txt"), []byte("two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitIn(t, origin, "commit", "-qam", "second")
	gitIn(t, clone, "commit", "-q", "--allow-empty", "-m", "local only")
	gitIn(t, clone, "fetch", "-q", "origin")

	problem, remedy := diagnosePull(clone)
	if problem != pullDiverged {
		t.Fatalf("got %v, want pullDiverged", problem)
	}
	if !strings.Contains(remedy, "origin/master") {
		t.Fatalf("remedy %q does not name origin/master", remedy)
	}
	if strings.Contains(remedy, "origin/main") {
		t.Fatalf("remedy %q still names origin/main", remedy)
	}
}

// A detached HEAD has no upstream of its own, so the branch has to come from the remote's default.
func TestDiagnosePullDetachedRemedyNamesTheRemotesDefaultBranch(t *testing.T) {
	_, clone := originAndCloneOn(t, "master")
	gitIn(t, clone, "checkout", "-q", "--detach", "HEAD")

	problem, remedy := diagnosePull(clone)
	if problem != pullDetached {
		t.Fatalf("got %v, want pullDetached", problem)
	}
	if !strings.Contains(remedy, "checkout master") {
		t.Fatalf("remedy %q does not check out master", remedy)
	}
}

func TestUpstreamOfReadsTheTrackedBranch(t *testing.T) {
	_, clone := originAndCloneOn(t, "master")

	remote, branch := upstreamOf(clone)
	if remote != "origin" || branch != "master" {
		t.Fatalf("got %q/%q, want origin/master", remote, branch)
	}
}

// The remedies are pasted into a shell, and %q would print C:\\Users\\thorb for C:\Users\thorb -
// Go string escaping, not shell quoting. The existing path test only catches this on Windows,
// because a Linux temp path has no backslashes to escape, so check the formatting directly.
func TestQuotePathLeavesWindowsSeparatorsAlone(t *testing.T) {
	got := quotePath(`C:\Users\thorb\VencordPlugins`)
	want := `"C:\Users\thorb\VencordPlugins"`
	if got != want {
		t.Fatalf("got %s, want %s", got, want)
	}
	if strings.Contains(got, `\\`) {
		t.Fatalf("%s has doubled separators", got)
	}
}

// Same thing one level up, so a remedy that reintroduces %q is caught too.
func TestDiagnosePullRemedyQuotesPathsForAShell(t *testing.T) {
	_, clone := originAndCloneOn(t, "master")
	gitIn(t, clone, "checkout", "-q", "--detach", "HEAD")

	_, remedy := diagnosePull(clone)
	if !strings.Contains(remedy, `"`+clone+`"`) {
		t.Fatalf("remedy %q does not contain the path quoted verbatim", remedy)
	}
}

// writeIn is for the rewritten-history fixtures below, which need real content changes: an empty
// commit has an empty diff, and git cherry compares patch ids.
func writeIn(t *testing.T, dir, name, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// rewrittenClone reproduces what an authorised history rewrite does to a clone that already pulled:
// the clone keeps a commit whose change is upstream under a different SHA, and upstream has moved on.
// git can only call that a divergence, which is the whole reason it needs detecting by content.
func rewrittenClone(t *testing.T) (origin, clone string) {
	t.Helper()
	origin, clone = originAndCloneOn(t, "master")

	writeIn(t, origin, "file.txt", "two\n")
	gitIn(t, origin, "commit", "-qam", "second")
	gitIn(t, clone, "pull", "-q", "--ff-only")

	// same diff, new SHA - then upstream carries on past it
	gitIn(t, origin, "commit", "-q", "--amend", "--no-edit", "--date", "2020-01-01T00:00:00")
	writeIn(t, origin, "file.txt", "three\n")
	gitIn(t, origin, "commit", "-qam", "third")
	gitIn(t, clone, "fetch", "-q", "origin")
	return origin, clone
}

func TestOnlyRewrittenCommitsSpotsADuplicatedChange(t *testing.T) {
	_, clone := rewrittenClone(t)

	if got, _ := diagnosePull(clone); got != pullDiverged {
		t.Fatalf("fixture is not diverged: got %v", got)
	}
	if !onlyRewrittenCommits(clone) {
		t.Fatal("a rewritten duplicate was not recognised, so the installer would refuse to repair it")
	}
}

// The guard that matters: real unpushed work must never be reset away.
func TestOnlyRewrittenCommitsRefusesGenuineLocalWork(t *testing.T) {
	_, clone := rewrittenClone(t)

	writeIn(t, clone, "mine.txt", "work nobody else has\n")
	gitIn(t, clone, "add", ".")
	gitIn(t, clone, "commit", "-qm", "local work")

	if onlyRewrittenCommits(clone) {
		t.Fatal("would have reset away a commit that exists nowhere upstream")
	}
}

// reset --hard discards uncommitted edits too, and those the reflog cannot give back.
func TestOnlyRewrittenCommitsRefusesADirtyTree(t *testing.T) {
	_, clone := rewrittenClone(t)
	writeIn(t, clone, "file.txt", "edited but not committed\n")

	if onlyRewrittenCommits(clone) {
		t.Fatal("would have discarded uncommitted edits")
	}
}

func TestResetToUpstreamLandsOnTheUpstreamCommit(t *testing.T) {
	_, clone := rewrittenClone(t)

	if !resetToUpstream(clone) {
		t.Fatal("reset reported failure")
	}

	head := strings.TrimSpace(gitOutput(clone, "rev-parse", "HEAD"))
	want := strings.TrimSpace(gitOutput(clone, "rev-parse", "origin/master"))
	if head != want || head == "" {
		t.Fatalf("HEAD is %q, want %q", head, want)
	}

	// and the thing the installer actually needed: the next pull is a no-op rather than a refusal
	if got, _ := diagnosePull(clone); got == pullDiverged {
		t.Fatal("still diverged after the repair")
	}
}
