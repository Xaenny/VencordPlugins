package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestChooseBranchAcceptsKnownNames(t *testing.T) {
	for _, name := range []string{"stable", "ptb", "canary", "PTB", "Canary"} {
		branch, err := chooseBranch(name, true)
		if err != nil {
			t.Fatalf("chooseBranch(%q) returned an error: %v", name, err)
		}
		if branch.flag == "" {
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
