//go:build !windows

// Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
// SPDX-License-Identifier: MIT
package main

// prepareConsole is a no-op away from Windows, where terminals already handle ANSI and UTF-8.
func prepareConsole() consoleSupport {
	return consoleSupport{vt: true, utf8: true}
}
