#Requires -Version 5.1
<#
.SYNOPSIS
    Copies this repo's plugins into a Vencord checkout's src\userplugins folder.

.DESCRIPTION
    Vencord builds from src\userplugins, so the plugins have to be copied in. Junctions and
    symlinks do not work: esbuild resolves them to their real path, which falls outside the
    Vencord tree, and the @api/@utils/@webpack aliases then fail to resolve.

    Editing the copies instead of this repo is how the two drift apart, so this script always
    treats the repo as the source of truth. If a destination folder differs from the repo, it is
    backed up under %LOCALAPPDATA%\VencordPluginBackups before being replaced, so local edits
    made in the wrong place are never silently lost.

.PARAMETER Vencord
    Path to the Vencord checkout. Defaults to C:\Users\thorb\Vencord.

.PARAMETER Build
    Also run "pnpm build --dev" and "pnpm inject" in the Vencord checkout afterwards.

.PARAMETER Release
    Build without --dev. Dev builds keep Vencord's tracer live (every webpack lookup times itself
    and writes to the console), hold on to the full pre-patch source of every patched module, and
    make a stale lookup throw inside a React render instead of degrading. None of that is wanted
    unless you are debugging the plugins themselves.

.PARAMETER NoPull
    Skip "git pull" - for both this repo and the Vencord checkout - and sync what is on disk.

.EXAMPLE
    .\scripts\sync-to-vencord.ps1 -Build
#>
[CmdletBinding()]
param(
    [string] $Vencord = "C:\Users\thorb\Vencord",
    [switch] $Build,
    [switch] $Release,
    [switch] $NoPull
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$dest = Join-Path (Join-Path $Vencord "src") "userplugins"

if (-not (Test-Path (Join-Path $Vencord "package.json"))) {
    throw "No Vencord checkout at '$Vencord' (package.json not found). Pass -Vencord <path>."
}

function Get-FolderFingerprint {
    param([string] $Path)

    if (-not (Test-Path $Path)) { return $null }

    Get-ChildItem -Path $Path -Recurse -File |
        Sort-Object FullName |
        ForEach-Object {
            "$($_.FullName.Substring($Path.Length)):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"
        } | Out-String
}

# Pull first. Syncing without pulling copies whatever this checkout happens to hold, which looks
# exactly like "the fix didn't work" - the plugins get rebuilt, just from stale source.
if (-not $NoPull) {
    Push-Location $repo
    try {
        $branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
        if ($LASTEXITCODE -ne 0) {
            Write-Host "! $repo is not a git checkout - syncing it as-is" -ForegroundColor Yellow
        } else {
            $dirty = @(& git status --porcelain) | Where-Object { $_ }
            if ($dirty) {
                Write-Host "! Local changes in $repo - they are kept, but a pull may be refused:" -ForegroundColor Yellow
                $dirty | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
            }

            Write-Host "Pulling $branch ..."
            & git pull --ff-only
            if ($LASTEXITCODE -ne 0) {
                Write-Host "! git pull failed - syncing the commit already checked out" -ForegroundColor Yellow
            }
        }
    } finally {
        Pop-Location
    }
}

# Vencord itself goes stale the same way, and it is the half nobody thinks to update. Its webpack
# lookups are rewritten whenever Discord re-minifies its bundle, so an old checkout throws inside a
# React render - which is a client crash, not a broken plugin. (That is what "Modal" did: Discord
# dropped the export, and every plugin opening a modal took Discord down until Vencord re-anchored
# the lookup.) Pulling it here costs a second and is not optional in practice.
if (-not $NoPull) {
    Push-Location $Vencord
    try {
        if (-not (Test-Path (Join-Path $Vencord ".git"))) {
            Write-Host "! $Vencord is not a git checkout - leaving it alone" -ForegroundColor Yellow
        } else {
            $before = (& git rev-parse HEAD 2>$null)

            Write-Host "Pulling Vencord ..."
            & git pull --ff-only
            if ($LASTEXITCODE -ne 0) {
                Write-Host "! git pull failed in $Vencord - building the commit already checked out" -ForegroundColor Yellow
            } elseif ((& git rev-parse HEAD 2>$null) -ne $before) {
                # Any move at all, not just a changed lockfile: pnpm refuses to build when package.json
                # and node_modules disagree, and Vencord bumps its version in package.json alone on
                # nearly every release. It is a no-op when nothing actually changed.
                Write-Host "Vencord moved - running pnpm install ..."
                pnpm install --frozen-lockfile
                if ($LASTEXITCODE -ne 0) { throw "pnpm install failed in $Vencord" }
            }

            $vhead = (& git log -1 --oneline 2>$null)
            if ($vhead) { Write-Host "Vencord at: $vhead" -ForegroundColor Cyan }
        }
    } finally {
        Pop-Location
    }
}

Push-Location $repo
try { $head = (& git log -1 --oneline 2>$null) } finally { Pop-Location }
if ($head) { Write-Host "Syncing from: $head" -ForegroundColor Cyan }

New-Item -ItemType Directory -Path $dest -Force | Out-Null

# A plugin folder is one with an index.ts/index.tsx - this skips scripts, .github and the README
$plugins = Get-ChildItem -Path $repo -Directory | Where-Object {
    (Test-Path (Join-Path $_.FullName "index.ts")) -or (Test-Path (Join-Path $_.FullName "index.tsx"))
}

if (-not $plugins) { throw "No plugin folders found in '$repo'." }

$backupBase = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.IO.Path]::GetTempPath() }
$backupRoot = Join-Path (Join-Path $backupBase "VencordPluginBackups") (Get-Date -Format "yyyyMMdd-HHmmss")
$copied = @()

Write-Host "Syncing $($plugins.Count) plugin(s) from $repo"

foreach ($plugin in $plugins) {
    $target = Join-Path $dest $plugin.Name

    if ((Get-FolderFingerprint $target) -eq (Get-FolderFingerprint $plugin.FullName)) {
        Write-Host "  = $($plugin.Name) already up to date"
        continue
    }

    if (Test-Path $target) {
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
        Copy-Item $target (Join-Path $backupRoot $plugin.Name) -Recurse
        Write-Host "  ! $($plugin.Name) differed - old copy saved to $backupRoot" -ForegroundColor Yellow
        Remove-Item $target -Recurse -Force
    }

    Copy-Item $plugin.FullName $target -Recurse
    Write-Host "  + $($plugin.Name) copied" -ForegroundColor Green
    $copied += $plugin.Name
}

if (-not $copied) { Write-Host "Nothing changed - the copies already match this commit." }

# Stray folders here are built too, and a leftover copy of a plugin can shadow the real one
Write-Host "`nsrc\userplugins now holds:"
Get-ChildItem -Path $dest -Directory | ForEach-Object { Write-Host "  $($_.Name)" }

if ($Build) {
    Push-Location $Vencord
    try {
        # Spelled out rather than splatted: splatting a one-element array unrolls the string into
        # its characters, so a -Release build would run "pnpm b u i l d".
        if ($Release) {
            Write-Host "Running pnpm build ..."
            pnpm build
            if ($LASTEXITCODE -ne 0) { throw "pnpm build failed" }
        } else {
            Write-Host "Running pnpm build --dev ..."
            pnpm build --dev
            if ($LASTEXITCODE -ne 0) { throw "pnpm build --dev failed" }
        }

        pnpm inject
        if ($LASTEXITCODE -ne 0) { throw "pnpm inject failed" }
    } finally {
        Pop-Location
    }

    Write-Host "`nDone - fully restart Discord to load the new build." -ForegroundColor Green
} else {
    Write-Host "`nNext:"
    Write-Host "  cd $Vencord"
    Write-Host "  pnpm build --dev"
    Write-Host "  pnpm inject"
}
