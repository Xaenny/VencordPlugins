// ModTool Installer - sets up Vencord with Xaenny's plugins and patches Discord.
//
// Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
// SPDX-License-Identifier: MIT
//
// Everything here shells out to the tools that already do the job properly: git for the two
// repositories, pnpm for Vencord's build, and Vencord's own installer for the Discord patch. The
// only thing this adds is doing them in the right order without a terminal session.
package main

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

const (
	pluginsRepoURL = "https://github.com/Xaenny/VencordPlugins"
	vencordRepoURL = "https://github.com/Vendicated/Vencord"
	minNodeMajor   = 22
)

// discordBranch is one of the Discord releases Vencord's installer understands.
type discordBranch struct {
	// flag is what Vencord's installer expects for --branch
	flag string
	// label is what the user sees
	label string
	// dir is the folder Discord installs itself into, under LOCALAPPDATA
	dir string
}

var branches = []discordBranch{
	{flag: "stable", label: "Discord (Stable)", dir: "Discord"},
	{flag: "ptb", label: "Discord PTB", dir: "DiscordPTB"},
	{flag: "canary", label: "Discord Canary", dir: "DiscordCanary"},
}

var stdin = bufio.NewReader(os.Stdin)

func main() {
	var (
		vencordPath = flag.String("vencord", "", "Where Vencord lives or should be cloned (default: %USERPROFILE%\\Vencord)")
		pluginsPath = flag.String("plugins", "", "The plugin repo (default: next to this exe, else cloned into %USERPROFILE%\\VencordPlugins)")
		branchName  = flag.String("branch", "", "Discord to patch: stable, ptb or canary (default: ask)")
		skipInject  = flag.Bool("skip-inject", false, "Build everything but leave Discord alone")
		assumeYes   = flag.Bool("y", false, "Never prompt - fails instead of asking")
	)
	flag.Parse()

	if err := run(*vencordPath, *pluginsPath, *branchName, *skipInject, *assumeYes); err != nil {
		fmt.Fprintf(os.Stderr, "\n  Failed: %v\n", err)
		waitForExit(*assumeYes)
		os.Exit(1)
	}

	waitForExit(*assumeYes)
}

func run(vencordPath, pluginsPath, branchName string, skipInject, assumeYes bool) error {
	fmt.Println("  ModTool Installer - Vencord + Xaenny's plugins")
	fmt.Println("  ---------------------------------------------")

	if vencordPath == "" {
		vencordPath = filepath.Join(homeDir(), "Vencord")
	}

	step("Checking what's installed")
	if err := checkPrerequisites(); err != nil {
		return err
	}

	step("Getting the plugins")
	pluginsPath, err := ensureRepo(pluginsPath, pluginsRepoURL, defaultPluginsPath)
	if err != nil {
		return err
	}
	if head := gitHead(pluginsPath); head != "" {
		note("plugins at " + head)
	}

	step("Getting Vencord")
	if _, err := ensureRepo(vencordPath, vencordRepoURL, func() string { return vencordPath }); err != nil {
		return err
	}

	step("Installing Vencord's dependencies (this takes a minute)")
	if err := runIn(vencordPath, "pnpm", "install", "--frozen-lockfile"); err != nil {
		note("the lockfile install failed - retrying without --frozen-lockfile")
		if err := runIn(vencordPath, "pnpm", "install"); err != nil {
			return fmt.Errorf("pnpm install: %w", err)
		}
	}

	step("Copying the plugins in")
	copied, err := syncPlugins(pluginsPath, filepath.Join(vencordPath, "src", "userplugins"))
	if err != nil {
		return err
	}
	for _, name := range copied {
		note("+ " + name)
	}

	step("Building Vencord")
	if err := runIn(vencordPath, "pnpm", "build", "--dev"); err != nil {
		return fmt.Errorf("pnpm build --dev: %w", err)
	}

	if skipInject {
		step("Done - Discord was left alone as asked")
		fmt.Println("  Restart Discord fully to load the new build.")
		return nil
	}

	step("Patching Discord")
	branch, err := chooseBranch(branchName, assumeYes)
	if err != nil {
		return err
	}

	note("close Discord before continuing - the patch can't be applied while it's running")
	if !assumeYes {
		prompt("  Press Enter once Discord is closed...")
	}

	// pnpm inject is "node scripts/runInstaller.mjs -- --install"; everything after the -- is
	// handed to Vencord's own installer, which takes --branch.
	if err := runIn(vencordPath, "node", "scripts/runInstaller.mjs", "--", "--install", "--branch", branch.flag); err != nil {
		return fmt.Errorf("patching %s: %w", branch.label, err)
	}

	step("Done")
	fmt.Printf("  %s is patched. Start it, then enable the plugins in Vencord Settings > Plugins.\n", branch.label)
	fmt.Println("  Run this again any time to update Vencord and the plugins.")
	return nil
}

// --- prerequisites ------------------------------------------------------------------------

func checkPrerequisites() error {
	if _, err := exec.LookPath("git"); err != nil {
		return errors.New("git isn't installed. Get it from https://git-scm.com/download/win, then run this again")
	}
	note("git found")

	nodePath, err := exec.LookPath("node")
	if err != nil {
		return fmt.Errorf("Node.js isn't installed. Get Node %d or newer from https://nodejs.org, then run this again", minNodeMajor)
	}

	version, err := output(nodePath, "--version")
	if err != nil {
		return fmt.Errorf("couldn't run node: %w", err)
	}

	major, err := strconv.Atoi(strings.SplitN(strings.TrimPrefix(strings.TrimSpace(version), "v"), ".", 2)[0])
	if err != nil {
		return fmt.Errorf("couldn't read the node version from %q", version)
	}
	if major < minNodeMajor {
		return fmt.Errorf("Node %s is too old - Vencord needs %d or newer. Update from https://nodejs.org, then run this again", strings.TrimSpace(version), minNodeMajor)
	}
	note("node " + strings.TrimSpace(version))

	if _, err := exec.LookPath("pnpm"); err != nil {
		note("pnpm is missing - enabling it through corepack")
		_ = runQuiet("corepack", "enable", "pnpm")

		if _, err := exec.LookPath("pnpm"); err != nil {
			note("corepack didn't work - installing pnpm through npm")
			_ = runQuiet("npm", "install", "-g", "pnpm")
		}

		if _, err := exec.LookPath("pnpm"); err != nil {
			return errors.New("couldn't install pnpm. Install it from https://pnpm.io/installation, then run this again")
		}
	}
	note("pnpm found")

	return nil
}

// --- repositories -------------------------------------------------------------------------

func defaultPluginsPath() string {
	// Running from inside a checkout (the usual case when the exe sits in the repo)
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		for _, candidate := range []string{dir, filepath.Dir(dir)} {
			if isPluginRepo(candidate) {
				return candidate
			}
		}
	}

	if cwd, err := os.Getwd(); err == nil && isPluginRepo(cwd) {
		return cwd
	}

	return filepath.Join(homeDir(), "VencordPlugins")
}

func isPluginRepo(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "ModToolDiscord", "index.tsx"))
	return err == nil
}

// ensureRepo clones url into path when it isn't there yet, and pulls when it is.
func ensureRepo(path, url string, fallback func() string) (string, error) {
	if path == "" {
		path = fallback()
	}

	if _, err := os.Stat(filepath.Join(path, ".git")); err == nil {
		note("updating " + path)
		if err := runIn(path, "git", "pull", "--ff-only"); err != nil {
			note("git pull failed - carrying on with the commit already checked out")
		}
		return path, nil
	}

	if entries, err := os.ReadDir(path); err == nil && len(entries) > 0 {
		return path, fmt.Errorf("%s already exists and isn't a git checkout - move it aside, or pass a different path", path)
	}

	note("cloning into " + path)
	if err := runIn("", "git", "clone", url, path); err != nil {
		return path, fmt.Errorf("cloning %s: %w", url, err)
	}

	return path, nil
}

func gitHead(dir string) string {
	out, err := output("git", "-C", dir, "log", "-1", "--oneline")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// --- plugins ------------------------------------------------------------------------------

// syncPlugins copies every plugin folder into Vencord. They have to be copied rather than linked:
// esbuild resolves links to their real path outside the Vencord tree, and the @api/@utils/@webpack
// aliases stop resolving.
func syncPlugins(pluginsPath, dest string) ([]string, error) {
	entries, err := os.ReadDir(pluginsPath)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", pluginsPath, err)
	}

	if err := os.MkdirAll(dest, 0o755); err != nil {
		return nil, fmt.Errorf("creating %s: %w", dest, err)
	}

	var copied []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		source := filepath.Join(pluginsPath, entry.Name())
		if !hasIndex(source) {
			continue
		}

		target := filepath.Join(dest, entry.Name())
		if err := os.RemoveAll(target); err != nil {
			return nil, fmt.Errorf("replacing %s: %w", target, err)
		}
		if err := copyDir(source, target); err != nil {
			return nil, fmt.Errorf("copying %s: %w", entry.Name(), err)
		}

		copied = append(copied, entry.Name())
	}

	if len(copied) == 0 {
		return nil, fmt.Errorf("no plugin folders found in %s", pluginsPath)
	}

	return copied, nil
}

func hasIndex(dir string) bool {
	for _, name := range []string{"index.ts", "index.tsx"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
			return true
		}
	}
	return false
}

func copyDir(source, target string) error {
	return filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}

		destination := filepath.Join(target, rel)
		if info.IsDir() {
			return os.MkdirAll(destination, 0o755)
		}

		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()

		out, err := os.Create(destination)
		if err != nil {
			return err
		}
		defer out.Close()

		_, err = io.Copy(out, in)
		return err
	})
}

// --- Discord ------------------------------------------------------------------------------

func chooseBranch(requested string, assumeYes bool) (discordBranch, error) {
	if requested != "" {
		for _, branch := range branches {
			if strings.EqualFold(requested, branch.flag) {
				return branch, nil
			}
		}
		return discordBranch{}, fmt.Errorf("unknown branch %q - use stable, ptb or canary", requested)
	}

	installed := installedBranches()
	if len(installed) == 1 {
		note("only " + installed[0].label + " is installed, using that")
		return installed[0], nil
	}

	if assumeYes {
		return discordBranch{}, errors.New("several Discord versions are installed - pass -branch stable|ptb|canary")
	}

	// Offer everything when detection found nothing, rather than refusing to continue
	choices := installed
	if len(choices) == 0 {
		note("couldn't tell which Discord versions are installed - listing all of them")
		choices = branches
	}

	fmt.Println()
	fmt.Println("  Which Discord should be patched?")
	for i, branch := range choices {
		fmt.Printf("    %d) %s\n", i+1, branch.label)
	}

	for {
		answer := prompt(fmt.Sprintf("  Enter 1-%d: ", len(choices)))
		if index, err := strconv.Atoi(strings.TrimSpace(answer)); err == nil && index >= 1 && index <= len(choices) {
			return choices[index-1], nil
		}
		fmt.Println("  Not one of the options.")
	}
}

// installedBranches reports the Discord versions actually present, so the menu only offers real ones.
func installedBranches() []discordBranch {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" || runtime.GOOS != "windows" {
		return nil
	}

	var found []discordBranch
	for _, branch := range branches {
		if info, err := os.Stat(filepath.Join(base, branch.dir)); err == nil && info.IsDir() {
			found = append(found, branch)
		}
	}

	return found
}

// --- process helpers ----------------------------------------------------------------------

// command builds a command, routing .cmd/.bat shims (pnpm, npm, corepack on Windows) through
// cmd.exe, which is the only way Windows will execute them.
func command(name string, args ...string) *exec.Cmd {
	resolved, err := exec.LookPath(name)
	if err != nil {
		resolved = name
	}

	if runtime.GOOS == "windows" {
		lower := strings.ToLower(resolved)
		if strings.HasSuffix(lower, ".cmd") || strings.HasSuffix(lower, ".bat") {
			return exec.Command("cmd.exe", append([]string{"/c", resolved}, args...)...)
		}
	}

	return exec.Command(resolved, args...)
}

func runIn(dir, name string, args ...string) error {
	cmd := command(name, args...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

func runQuiet(name string, args ...string) error {
	return command(name, args...).Run()
}

func output(name string, args ...string) (string, error) {
	out, err := command(name, args...).Output()
	return string(out), err
}

// --- output helpers -----------------------------------------------------------------------

func step(message string) {
	fmt.Printf("\n==> %s\n", message)
}

func note(message string) {
	fmt.Printf("    %s\n", message)
}

func prompt(message string) string {
	fmt.Print(message)
	line, _ := stdin.ReadString('\n')
	return line
}

func homeDir() string {
	if profile := os.Getenv("USERPROFILE"); profile != "" {
		return profile
	}
	if home, err := os.UserHomeDir(); err == nil {
		return home
	}
	return "."
}

// waitForExit keeps the window open when the exe was double-clicked rather than run from a shell.
func waitForExit(assumeYes bool) {
	if assumeYes {
		return
	}
	prompt("\n  Press Enter to close...")
}
