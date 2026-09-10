// Terminal output: colours, step headers and prompts.
//
// Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
// SPDX-License-Identifier: MIT
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

const totalSteps = 7

var (
	colorEnabled = false
	// Box drawing and check marks need a UTF-8 console; a legacy code page would show mojibake,
	// so the glyphs drop to ASCII when the console can't be switched over.
	unicodeEnabled = false
	stdin          = bufio.NewReader(os.Stdin)
	stepNumber     = 0
)

func initUI() {
	console := prepareConsole()

	// NO_COLOR is the usual opt-out; otherwise colours need the console in VT mode, which older
	// Windows consoles are not by default.
	colorEnabled = os.Getenv("NO_COLOR") == "" && console.vt
	unicodeEnabled = console.utf8
}

// consoleSupport reports what the terminal can actually render.
type consoleSupport struct {
	vt   bool
	utf8 bool
}

type glyphs struct {
	topLeft, topRight, bottomLeft, bottomRight, horizontal, vertical string
	tick, cross, bang                                                string
}

func glyph() glyphs {
	if unicodeEnabled {
		return glyphs{"┌", "┐", "└", "┘", "─", "│", "✓", "✗", "!"}
	}
	return glyphs{"+", "+", "+", "+", "-", "|", "OK", "X", "!"}
}

func paint(code, text string) string {
	if !colorEnabled {
		return text
	}
	return "\x1b[" + code + "m" + text + "\x1b[0m"
}

func bold(text string) string   { return paint("1", text) }
func dim(text string) string    { return paint("90", text) }
func cyan(text string) string   { return paint("36", text) }
func green(text string) string  { return paint("32", text) }
func yellow(text string) string { return paint("33", text) }
func red(text string) string    { return paint("31", text) }

const bannerWidth = 56

func banner() {
	g := glyph()
	line := strings.Repeat(g.horizontal, bannerWidth+2)

	// Padding is applied to the plain text before colouring - escape codes have no width on
	// screen but would otherwise be counted by %-*s and pull the right border out of line.
	row := func(text string, style func(string) string) {
		fmt.Printf("  %s %s %s\n", cyan(g.vertical), style(fmt.Sprintf("%-*s", bannerWidth, text)), cyan(g.vertical))
	}

	fmt.Println()
	fmt.Println(cyan("  " + g.topLeft + line + g.topRight))
	row("Vencord + Xaenny's plugins", bold)
	row("installs Vencord, adds the plugins, patches Discord", dim)
	fmt.Println(cyan("  " + g.bottomLeft + line + g.bottomRight))
}

// step prints a numbered header. The count matches the steps in the Vencord docs plus the
// plugin copy, so the output can be followed alongside them.
func step(title string) {
	stepNumber++
	fmt.Printf("\n%s %s\n", cyan(fmt.Sprintf("[%d/%d]", stepNumber, totalSteps)), bold(title))
}

func ok(format string, args ...any) {
	fmt.Printf("   %s %s\n", green(glyph().tick), fmt.Sprintf(format, args...))
}

func info(format string, args ...any) {
	fmt.Printf("     %s\n", dim(fmt.Sprintf(format, args...)))
}

func warn(format string, args ...any) {
	fmt.Printf("   %s %s\n", yellow(glyph().bang), fmt.Sprintf(format, args...))
}

func fail(format string, args ...any) {
	fmt.Printf("   %s %s\n", red(glyph().cross), fmt.Sprintf(format, args...))
}

// running announces a command before it runs, so a long silence is explainable.
func running(command string) {
	fmt.Printf("   %s %s\n", dim("$"), dim(command))
}

func prompt(message string) string {
	fmt.Print(message)
	line, _ := stdin.ReadString('\n')
	return strings.TrimSpace(line)
}

func done(message string) {
	fmt.Println()
	fmt.Printf("  %s %s\n", green(glyph().tick), green(bold(message)))
}
