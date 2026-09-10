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

.PARAMETER NoPull
    Skip "git pull" and sync the repo exactly as it is on disk.

.EXAMPLE
    .\scripts\sync-to-vencord.ps1 -Build
#>
[CmdletBinding()]
param(
    [string] $Vencord = "C:\Users\thorb\Vencord",
    [switch] $Build,
    [switch] $NoPull
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $Vencord "src\userplugins"

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

Push-Location $repo
try { $head = (& git log -1 --oneline 2>$null) } finally { Pop-Location }
if ($head) { Write-Host "Syncing from: $head" -ForegroundColor Cyan }

New-Item -ItemType Directory -Path $dest -Force | Out-Null

# A plugin folder is one with an index.ts/index.tsx - this skips scripts, .github and the README
$plugins = Get-ChildItem -Path $repo -Directory | Where-Object {
    (Test-Path (Join-Path $_.FullName "index.ts")) -or (Test-Path (Join-Path $_.FullName "index.tsx"))
}

if (-not $plugins) { throw "No plugin folders found in '$repo'." }

$backupRoot = Join-Path $env:LOCALAPPDATA "VencordPluginBackups\$(Get-Date -Format 'yyyyMMdd-HHmmss')"
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
        pnpm build --dev
        if ($LASTEXITCODE -ne 0) { throw "pnpm build --dev failed" }

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
