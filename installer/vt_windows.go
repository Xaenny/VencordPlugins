//go:build windows

// Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
// SPDX-License-Identifier: MIT
package main

import (
	"syscall"
	"unsafe"
)

// prepareConsole switches the console into VT mode so ANSI colours render, and to the UTF-8 code
// page so box drawing and check marks aren't mojibake. Windows Terminal is already both; the
// classic console is neither, and without this the escapes and glyphs print as noise.
func prepareConsole() consoleSupport {
	return consoleSupport{vt: enableVirtualTerminal(), utf8: enableUTF8()}
}

// enableUTF8 sets the console output code page to UTF-8 (65001).
func enableUTF8() bool {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	setConsoleOutputCP := kernel32.NewProc("SetConsoleOutputCP")

	const cpUTF8 = 65001
	result, _, _ := setConsoleOutputCP.Call(uintptr(cpUTF8))
	return result != 0
}

func enableVirtualTerminal() bool {
	const enableVirtualTerminalProcessing = 0x0004

	handle, err := syscall.GetStdHandle(syscall.STD_OUTPUT_HANDLE)
	if err != nil {
		return false
	}

	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getConsoleMode := kernel32.NewProc("GetConsoleMode")
	setConsoleMode := kernel32.NewProc("SetConsoleMode")

	var mode uint32
	if result, _, _ := getConsoleMode.Call(uintptr(handle), uintptr(unsafe.Pointer(&mode))); result == 0 {
		return false
	}

	if mode&enableVirtualTerminalProcessing != 0 {
		return true
	}

	result, _, _ := setConsoleMode.Call(uintptr(handle), uintptr(mode|enableVirtualTerminalProcessing))
	return result != 0
}
