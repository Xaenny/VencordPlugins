#Requires -Version 5.1
<#
.SYNOPSIS
    Reports what is actually installed and running: the repo, the Vencord checkout, and - the part
    that keeps being assumed rather than checked - which Vencord each Discord install is patched to.

.DESCRIPTION
    Rebuilding a Vencord checkout only reaches Discord if that Discord is patched to point at it.
    Patch Stable and run PTB, or patch from a second checkout, and every rebuild succeeds while the
    client keeps loading something else entirely. This prints both halves so they can be compared.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\doctor.ps1
#>
[CmdletBinding()]
param(
    [string] $Vencord = "C:\Users\thorb\Vencord"
)

$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot

function Write-Head([string] $text) {
    Write-Host ""
    Write-Host $text -ForegroundColor Cyan
    Write-Host ("-" * $text.Length) -ForegroundColor DarkGray
}

Write-Head "Plugin repo: $repo"
Push-Location $repo
try {
    Write-Host "  commit  $(& git log -1 --oneline 2>$null)"
    $dirty = @(& git status --porcelain --untracked-files=no) | Where-Object { $_ }
    if ($dirty) { Write-Host "  ! $($dirty.Count) edited file(s) not committed" -ForegroundColor Yellow }
} finally { Pop-Location }

Write-Head "Vencord checkout: $Vencord"
$vencordDist = $null
if (-not (Test-Path (Join-Path $Vencord "package.json"))) {
    Write-Host "  ! not a Vencord checkout" -ForegroundColor Red
} else {
    Push-Location $Vencord
    try {
        $version = $null
        try { $version = (Get-Content (Join-Path $Vencord "package.json") -Raw | ConvertFrom-Json).version } catch { }
        Write-Host "  version $(if ($version) { "v$version" } else { "unknown" })"
        Write-Host "  branch  $(& git rev-parse --abbrev-ref HEAD 2>$null)"
        Write-Host "  commit  $(& git log -1 --oneline 2>$null)"

        $when = (& git log -1 --format=%cI 2>$null)
        if ($when) {
            $age = [int]((Get-Date) - [datetimeoffset]::Parse($when).LocalDateTime).TotalDays
            $colour = if ($age -gt 14) { "Red" } else { "Gray" }
            Write-Host "  age     $age day(s) old" -ForegroundColor $colour
        }

        $dirty = @(& git status --porcelain --untracked-files=no) | Where-Object { $_ }
        if ($dirty) { Write-Host "  ! $($dirty.Count) edited tracked file(s) - this blocks git pull" -ForegroundColor Yellow }
    } finally { Pop-Location }

    $patcher = Join-Path (Join-Path $Vencord "dist") "patcher.js"
    if (Test-Path $patcher) {
        $vencordDist = (Resolve-Path (Join-Path $Vencord "dist")).Path
        Write-Host "  built   $((Get-Item $patcher).LastWriteTime)"
    } else {
        Write-Host "  ! dist\patcher.js is missing - this checkout has never been built" -ForegroundColor Red
    }

    $userplugins = Join-Path (Join-Path $Vencord "src") "userplugins"
    if (Test-Path $userplugins) {
        $names = (Get-ChildItem $userplugins -Directory | ForEach-Object { $_.Name }) -join ", "
        Write-Host "  plugins $names"
    }
}

Write-Head "Discord installs"
$local = $env:LOCALAPPDATA
$branches = [ordered]@{ "Stable" = "Discord"; "PTB" = "DiscordPTB"; "Canary" = "DiscordCanary" }
$any = $false

foreach ($name in $branches.Keys) {
    $root = Join-Path $local $branches[$name]
    if (-not (Test-Path $root)) { continue }
    $any = $true

    # app-1.0.10000 beats app-1.0.9249, which a string sort gets wrong
    $app = Get-ChildItem $root -Directory -Filter "app-*" |
        Sort-Object { [version]($_.Name -replace '^app-', '') } -ErrorAction SilentlyContinue |
        Select-Object -Last 1

    if (-not $app) { Write-Host "  $name - installed, but no app-* folder" -ForegroundColor Yellow; continue }

    $resources = Join-Path $app.FullName "resources"
    $asar = Join-Path $resources "app.asar"
    $backup = Join-Path $resources "_app.asar"
    $hasAsar = Test-Path $asar
    $hasBackup = Test-Path $backup

    Write-Host "  $name  ($($app.Name))"

    if ($hasAsar -and -not $hasBackup) { Write-Host "    not patched - Vencord is not installed here" -ForegroundColor Yellow; continue }
    if (-not $hasAsar -and $hasBackup) { Write-Host "    BROKEN: a half-finished patch (backup only, no app.asar)" -ForegroundColor Red; continue }
    if (-not $hasAsar -and -not $hasBackup) { Write-Host "    unrecognised - neither app.asar nor a backup" -ForegroundColor Red; continue }

    # Patched. Find the path its loader points at - that is the Vencord actually being run.
    $text = ""
    if ((Get-Item $asar).PSIsContainer) {
        Get-ChildItem $asar -Recurse -File | ForEach-Object { $text += (Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue) }
    } else {
        $bytes = [System.IO.File]::ReadAllBytes($asar)
        $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    }

    # Windows paths normally; the POSIX alternative keeps this testable off Windows
    $match = [regex]::Match($text, '(?:[A-Za-z]:[\\/]|/)[^"'')\x00]*?patcher\.js')
    if (-not $match.Success) {
        Write-Host "    patched, but could not read which Vencord it loads" -ForegroundColor Yellow
        continue
    }

    $loaded = $match.Value
    Write-Host "    patched -> $loaded"

    if ($vencordDist) {
        $expected = Join-Path $vencordDist "patcher.js"
        # Normalise BOTH sides, not just one: the loader stores a path with different
        # separators from what Join-Path produces, and comparing a normalised path against a
        # raw one reports a mismatch for an install that is actually correct.
        $norm = { param($p) ($p -replace '/', '\').TrimEnd('\') }
        if ((& $norm $loaded) -ieq (& $norm $expected)) {
            Write-Host "    this is the checkout above" -ForegroundColor Green
        } else {
            Write-Host "    MISMATCH: this is NOT the checkout above." -ForegroundColor Red
            Write-Host "    Everything built in $Vencord is going nowhere for this Discord." -ForegroundColor Red
            Write-Host "    Fix it with:  cd `"$Vencord`"; pnpm inject" -ForegroundColor Yellow
        }
    }
}

if (-not $any) { Write-Host "  no Discord installs found under $local" -ForegroundColor Yellow }

Write-Host ""
Write-Host "Compare the branch you actually use against the checkout above." -ForegroundColor Cyan
Write-Host ""
