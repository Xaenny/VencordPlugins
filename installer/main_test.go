package main

import (
	"os"
	"path/filepath"
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
