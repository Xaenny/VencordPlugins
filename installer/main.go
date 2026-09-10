// ModTool Installer - sets up Vencord with Xaenny's plugins and patches Discord.
//
// Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
// SPDX-License-Identifier: MIT
//
// It follows the official source install from https://docs.vencord.dev/installing/ - the same
// prerequisite checks, the same clone, the same "pnpm install --frozen-lockfile", the same build
// and the same inject - and adds the plugin copy in the only place it fits, between installing
// dependencies and building. Everything is done by the tools that own the job: git, pnpm, and
// Vencord's own installer for the Discord patch.
package main

import (
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

func main() {
	var (
		vencordPath = flag.String("vencord", "", "Where Vencord lives or should be cloned (default: %USERPROFILE%\\Vencord)")
		pluginsPath = flag.String("plugins", "", "The plugin repo (default: next to this exe, else cloned into %USERPROFILE%\\VencordPlugins)")
		branchName  = flag.String("branch", "", "Discord to patch: stable, ptb or canary (default: ask)")
		skipInject  = flag.Bool("skip-inject", false, "Build everything but leave Discord alone")
		assumeYes   = flag.Bool("y", false, "Never prompt - fails instead of asking")
	)
	flag.Parse()
	initUI()

	if err := run(*vencordPath, *pluginsPath, *branchName, *skipInject, *assumeYes); err != nil {
		fmt.Println()
		fail("%v", err)
		waitForExit(*assumeYes)
		os.Exit(1)
	}

	waitForExit(*assumeYes)
}

func run(vencordPath, pluginsPath, branchName string, skipInject, assumeYes bool) error {
	banner()

	if vencordPath == "" {
		vencordPath = filepath.Join(homeDir(), "Vencord")
	}

	// 1 - "Make sure you have the following installed" (docs.vencord.dev/installing)
	step("Checking prerequisites")
	if err := checkPrerequisites(); err != nil {
		return err
	}

	// 2 - the plugins themselves, which the Vencord docs don't cover
	step("Getting the plugins")
	pluginsPath, err := ensureRepo(pluginsPath, pluginsRepoURL, defaultPluginsPath)
	if err != nil {
		return err
	}
	ok("plugins in %s", pluginsPath)
	if head := gitHead(pluginsPath); head != "" {
		info("at %s", head)
	}

	// 3 - "git clone https://github.com/Vendicated/Vencord"
	step("Getting Vencord")
	if _, err := ensureRepo(vencordPath, vencordRepoURL, func() string { return vencordPath }); err != nil {
		return err
	}
	ok("Vencord in %s", vencordPath)
	if head := gitHead(vencordPath); head != "" {
		info("at %s", head)
	}

	// 4 - "pnpm install --frozen-lockfile"
	step("Installing Vencord's dependencies")
	info("this is the slow one - a few minutes on a first run")
	running("pnpm install --frozen-lockfile")
	if err := runIn(vencordPath, "pnpm", "install", "--frozen-lockfile"); err != nil {
		warn("the locked install failed - retrying without --frozen-lockfile")
		running("pnpm install")
		if err := runIn(vencordPath, "pnpm", "install"); err != nil {
			return fmt.Errorf("pnpm install: %w", err)
		}
	}
	ok("dependencies installed")

	// 5 - the plugins go in before the build, so the build picks them up
	step("Adding the plugins to Vencord")
	userplugins := filepath.Join(vencordPath, "src", "userplugins")
	created, err := ensureDir(userplugins)
	if err != nil {
		return err
	}
	if created {
		ok("created %s", userplugins)
	} else {
		ok("found %s", userplugins)
	}

	copied, err := syncPlugins(pluginsPath, userplugins)
	if err != nil {
		return err
	}
	for _, name := range copied {
		info("%s", name)
	}
	ok("%d plugin(s) copied", len(copied))

	// 6 - "pnpm build", with --dev so failed webpack lookups report instead of failing silently
	step("Building Vencord")
	running("pnpm build --dev")
	if err := runIn(vencordPath, "pnpm", "build", "--dev"); err != nil {
		return fmt.Errorf("pnpm build --dev: %w", err)
	}
	ok("build finished")

	// 7 - "pnpm inject"
	if skipInject {
		step("Skipping the Discord patch")
		ok("everything is built - Discord was left alone as asked")
		done("Restart Discord fully to load the new build.")
		return nil
	}

	step("Patching Discord")
	branch, err := chooseBranch(branchName, assumeYes)
	if err != nil {
		return err
	}

	warn("close %s before continuing - it can't be patched while running", branch.label)
	if !assumeYes {
		prompt(dim("     press Enter once it's closed... "))
	}

	// pnpm inject is "node scripts/runInstaller.mjs -- --install"; everything after the -- is
	// handed to Vencord's own installer, which takes --branch.
	running("pnpm inject --branch " + branch.flag)
	if err := runIn(vencordPath, "node", "scripts/runInstaller.mjs", "--", "--install", "--branch", branch.flag); err != nil {
		return fmt.Errorf("patching %s: %w", branch.label, err)
	}

	done(branch.label + " is patched")
	fmt.Println()
	info("start %s, then turn the plugins on in Vencord Settings > Plugins", branch.label)
	info("run this again any time to update Vencord and the plugins")
	return nil
}

// ensureDir creates a folder if it isn't there, reporting whether it had to.
func ensureDir(path string) (bool, error) {
	if info, err := os.Stat(path); err == nil {
		if !info.IsDir() {
			return false, fmt.Errorf("%s exists but is a file, not a folder", path)
		}
		return false, nil
	}

	if err := os.MkdirAll(path, 0o755); err != nil {
		return false, fmt.Errorf("creating %s: %w", path, err)
	}

	return true, nil
}

// --- prerequisites ------------------------------------------------------------------------

// checkPrerequisites runs the same three checks the docs ask you to run by hand - git --version,
// node --version, pnpm --version - and installs pnpm rather than sending you away for it.
func checkPrerequisites() error {
	gitVersion, err := output("git", "--version")
	if err != nil {
		fail("git is missing")
		return errors.New("install Git from https://git-scm.com/download/win, then run this again")
	}
	ok("%s", strings.TrimSpace(gitVersion))

	nodeVersion, err := output("node", "--version")
	if err != nil {
		fail("Node.js is missing")
		return fmt.Errorf("install Node %d or newer from https://nodejs.org, then run this again", minNodeMajor)
	}
	nodeVersion = strings.TrimSpace(nodeVersion)

	major, err := strconv.Atoi(strings.SplitN(strings.TrimPrefix(nodeVersion, "v"), ".", 2)[0])
	if err != nil {
		return fmt.Errorf("couldn't read the node version from %q", nodeVersion)
	}
	if major < minNodeMajor {
		fail("node %s is too old", nodeVersion)
		return fmt.Errorf("Vencord needs Node %d or newer - update from https://nodejs.org, then run this again", minNodeMajor)
	}
	ok("node %s", nodeVersion)

	pnpmVersion, err := output("pnpm", "--version")
	if err != nil {
		warn("pnpm is missing - enabling it through corepack")
		_ = runQuiet("corepack", "enable", "pnpm")

		if pnpmVersion, err = output("pnpm", "--version"); err != nil {
			warn("corepack didn't work - installing pnpm through npm")
			_ = runQuiet("npm", "install", "-g", "pnpm")
			pnpmVersion, err = output("pnpm", "--version")
		}

		if err != nil {
			fail("pnpm is missing")
			return errors.New("install pnpm from https://pnpm.io/installation, then run this again")
		}
	}
	ok("pnpm %s", strings.TrimSpace(pnpmVersion))

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
		info("updating %s", path)
		if err := runIn(path, "git", "pull", "--ff-only"); err != nil {
			warn("git pull failed - carrying on with the commit already checked out")
		}
		return path, nil
	}

	if entries, err := os.ReadDir(path); err == nil && len(entries) > 0 {
		return path, fmt.Errorf("%s already exists and isn't a git checkout - move it aside, or pass a different path", path)
	}

	info("cloning into %s", path)
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
		ok("only %s is installed - using that", installed[0].label)
		return installed[0], nil
	}

	if assumeYes {
		return discordBranch{}, errors.New("several Discord versions are installed - pass -branch stable|ptb|canary")
	}

	// Offer everything when detection found nothing, rather than refusing to continue
	choices := installed
	if len(choices) == 0 {
		warn("couldn't detect your Discord installs - listing all of them")
		choices = branches
	}

	fmt.Println()
	fmt.Printf("   %s\n", bold("Which Discord should be patched?"))
	for i, branch := range choices {
		fmt.Printf("     %s %s\n", cyan(fmt.Sprintf("%d)", i+1)), branch.label)
	}
	fmt.Println()

	for {
		answer := prompt(fmt.Sprintf("   %s ", dim(fmt.Sprintf("enter 1-%d:", len(choices)))))
		if index, err := strconv.Atoi(answer); err == nil && index >= 1 && index <= len(choices) {
			return choices[index-1], nil
		}
		fail("not one of the options")
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
	prompt(dim("\n  press Enter to close... "))
}
