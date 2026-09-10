// Inspecting Discord installs: which are present, which version, and whether Vencord's patch is
// in a sane state.
//
// Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
// SPDX-License-Identifier: MIT
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// asarState describes what Vencord's patcher would find in a Discord install.
//
// Patching renames app.asar to _app.asar and writes its own app.asar in its place; unpatching
// reverses that. So the pair of files tells you exactly where an install stands - including the
// half-patched case, where a patch was interrupted after the rename and before the write.
type asarState int

const (
	asarUnknown  asarState = iota // no app.asar and no backup - not a Discord install we understand
	asarClean                     // app.asar only: unpatched, ready to patch
	asarPatched                   // app.asar plus _app.asar backup: Vencord is installed
	asarBroken                    // backup only, app.asar missing: an interrupted patch
)

func (s asarState) String() string {
	switch s {
	case asarClean:
		return "not patched"
	case asarPatched:
		return "patched"
	case asarBroken:
		return "needs repair"
	default:
		return "unrecognised"
	}
}

type discordInstall struct {
	branch    discordBranch
	root      string // e.g. %LOCALAPPDATA%\Discord
	version   string // e.g. app-1.0.9249
	resources string // the resources folder inside the newest app-* folder
	state     asarState
}

// inspectInstall reports on the Discord install rooted at dir. Discord keeps one app-<version>
// folder per update, and the patcher works on the newest, so that is the one to look at.
func inspectInstall(branch discordBranch, root string) (discordInstall, bool) {
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return discordInstall{}, false
	}

	install := discordInstall{branch: branch, root: root}

	version := newestAppFolder(root)
	if version == "" {
		// Installed, but no app folder yet (a fresh install that has never run)
		return install, true
	}

	install.version = version
	install.resources = filepath.Join(root, version, "resources")
	install.state = inspectAsar(install.resources)

	return install, true
}

// newestAppFolder returns the highest-versioned app-* folder, matching what the patcher picks.
func newestAppFolder(root string) string {
	entries, err := os.ReadDir(root)
	if err != nil {
		return ""
	}

	var names []string
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), "app-") {
			names = append(names, entry.Name())
		}
	}
	if len(names) == 0 {
		return ""
	}

	sort.Slice(names, func(i, j int) bool { return lessVersion(names[i], names[j]) })
	return names[len(names)-1]
}

// lessVersion compares app-1.0.9249 style names numerically, so app-1.0.10000 sorts above
// app-1.0.9249 rather than below it as a string compare would.
func lessVersion(a, b string) bool {
	partsA := strings.Split(strings.TrimPrefix(a, "app-"), ".")
	partsB := strings.Split(strings.TrimPrefix(b, "app-"), ".")

	for i := 0; i < len(partsA) && i < len(partsB); i++ {
		numA, errA := strconv.Atoi(partsA[i])
		numB, errB := strconv.Atoi(partsB[i])
		if errA != nil || errB != nil {
			if partsA[i] != partsB[i] {
				return partsA[i] < partsB[i]
			}
			continue
		}
		if numA != numB {
			return numA < numB
		}
	}

	return len(partsA) < len(partsB)
}

func inspectAsar(resources string) asarState {
	_, appErr := os.Stat(filepath.Join(resources, "app.asar"))
	_, backupErr := os.Stat(filepath.Join(resources, "_app.asar"))

	switch {
	case appErr == nil && backupErr == nil:
		return asarPatched
	case appErr == nil:
		return asarClean
	case backupErr == nil:
		return asarBroken
	default:
		return asarUnknown
	}
}

// repair restores Discord's own backup, which is the second half of what Vencord's unpatch does.
// After it, the install is simply unpatched and can be patched normally.
func (install discordInstall) repair() error {
	if install.state != asarBroken {
		return fmt.Errorf("%s doesn't need repairing", install.branch.label)
	}

	backup := filepath.Join(install.resources, "_app.asar")
	target := filepath.Join(install.resources, "app.asar")

	if err := os.Rename(backup, target); err != nil {
		return fmt.Errorf("restoring %s: %w", target, err)
	}

	return nil
}

// describe is the one-line summary shown in the picker.
func (install discordInstall) describe() string {
	switch {
	case install.version == "":
		return install.branch.label
	case install.state == asarClean:
		return fmt.Sprintf("%s  (%s)", install.branch.label, install.version)
	default:
		return fmt.Sprintf("%s  (%s, %s)", install.branch.label, install.version, install.state)
	}
}
