#Requires -Version 5.1
<#
.SYNOPSIS
    Sets up Vencord with these plugins from scratch, and updates an existing setup.

.DESCRIPTION
    Clones (or updates) Vencord, installs its dependencies, copies these plugins into
    src\userplugins, builds a dev build and runs the Vencord installer to patch Discord.

    Safe to re-run: an existing Vencord checkout is pulled rather than re-cloned, and the plugin
    copies are refreshed. Nothing here touches Discord itself except the final inject step.

.PARAMETER Vencord
    Where the Vencord checkout lives, or should be created. Defaults to %USERPROFILE%\Vencord.

.PARAMETER Plugins
    The plugin repo. Defaults to the repo this script sits in; if the script is run on its own,
    the repo is cloned to %USERPROFILE%\VencordPlugins.

.PARAMETER SkipInject
    Build everything but don't run the Vencord installer. Use when Discord is already patched.

.EXAMPLE
    .\scripts\install.ps1

.EXAMPLE
    .\scripts\install.ps1 -Vencord D:\Vencord -SkipInject
#>
[CmdletBinding()]
param(
    [string] $Vencord = (Join-Path $env:USERPROFILE "Vencord"),
    [string] $Plugins,
    [switch] $SkipInject
)

$ErrorActionPreference = "Stop"

$PluginsRepoUrl = "https://github.com/Xaenny/VencordPlugins"
$VencordRepoUrl = "https://github.com/Vendicated/Vencord"
$MinNodeMajor = 22

function Write-Step {
    param([string] $Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Note {
    param([string] $Message)
    Write-Host "    $Message" -ForegroundColor DarkGray
}

function Test-Command {
    param([string] $Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Checked {
    param([string] $Exe, [string[]] $Arguments, [string] $What)

    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)" }
}

# --- prerequisites --------------------------------------------------------------------------

Write-Step "Checking prerequisites"

if (-not (Test-Command "git")) {
    throw "git is not installed. Get it from https://git-scm.com/download/win then run this again."
}
Write-Note "git    $((& git --version) -replace 'git version ', '')"

if (-not (Test-Command "node")) {
    throw "Node.js is not installed. Get Node $MinNodeMajor or newer from https://nodejs.org then run this again."
}

$nodeVersion = (& node --version).TrimStart("v")
$nodeMajor = [int]($nodeVersion -split "\.")[0]
if ($nodeMajor -lt $MinNodeMajor) {
    throw "Node $nodeVersion is too old - Vencord needs $MinNodeMajor or newer. Update from https://nodejs.org then run this again."
}
Write-Note "node   $nodeVersion"

if (-not (Test-Command "pnpm")) {
    Write-Note "pnpm is missing - enabling it through corepack"
    & corepack enable pnpm 2>$null | Out-Null

    if (-not (Test-Command "pnpm")) {
        Write-Note "corepack didn't work - installing pnpm globally through npm"
        & npm install -g pnpm 2>$null | Out-Null
    }

    if (-not (Test-Command "pnpm")) {
        throw "Couldn't install pnpm. Install it yourself (https://pnpm.io/installation) then run this again."
    }
}
Write-Note "pnpm   $(& pnpm --version)"

# --- the plugin repo ------------------------------------------------------------------------

Write-Step "Locating the plugins"

if (-not $Plugins) {
    $candidate = Split-Path -Parent $PSScriptRoot
    if (Test-Path (Join-Path (Join-Path $candidate "ModToolDiscord") "index.tsx")) {
        $Plugins = $candidate
    } else {
        $Plugins = Join-Path $env:USERPROFILE "VencordPlugins"
    }
}

if (Test-Path (Join-Path $Plugins ".git")) {
    Write-Note "using $Plugins"
    Push-Location $Plugins
    try {
        & git pull --ff-only
        if ($LASTEXITCODE -ne 0) { Write-Host "    ! git pull failed - using the commit already checked out" -ForegroundColor Yellow }
    } finally {
        Pop-Location
    }
} elseif (Test-Path $Plugins) {
    Write-Note "using $Plugins (not a git checkout, so nothing to pull)"
} else {
    Write-Note "cloning $PluginsRepoUrl into $Plugins"
    Invoke-Checked "git" @("clone", $PluginsRepoUrl, $Plugins) "Cloning the plugin repo"
}

Push-Location $Plugins
try { $pluginsHead = (& git log -1 --oneline 2>$null) } finally { Pop-Location }
if ($pluginsHead) { Write-Note "plugins at $pluginsHead" }

# --- Vencord --------------------------------------------------------------------------------

if (Test-Path (Join-Path $Vencord "package.json")) {
    Write-Step "Updating Vencord in $Vencord"
    Push-Location $Vencord
    try {
        & git pull --ff-only
        if ($LASTEXITCODE -ne 0) { Write-Host "    ! git pull failed - building the commit already checked out" -ForegroundColor Yellow }
    } finally {
        Pop-Location
    }
} else {
    Write-Step "Cloning Vencord into $Vencord"
    if ((Test-Path $Vencord) -and (Get-ChildItem -Path $Vencord -Force | Select-Object -First 1)) {
        throw "$Vencord already exists and is not a Vencord checkout. Move it aside, or pass -Vencord <other path>."
    }

    Invoke-Checked "git" @("clone", $VencordRepoUrl, $Vencord) "Cloning Vencord"
}

Write-Step "Installing Vencord's dependencies"
Push-Location $Vencord
try {
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        Write-Note "the lockfile install failed - retrying without --frozen-lockfile"
        Invoke-Checked "pnpm" @("install") "pnpm install"
    }
} finally {
    Pop-Location
}

# --- plugins + build ------------------------------------------------------------------------

Write-Step "Copying the plugins into src\userplugins"

# Resolved from the plugin repo, not from $PSScriptRoot: when only this file was downloaded, the
# repo was just cloned somewhere else and that is where the sync script lives.
$syncScript = Join-Path (Join-Path $Plugins "scripts") "sync-to-vencord.ps1"
if (-not (Test-Path $syncScript)) { throw "Couldn't find $syncScript - is $Plugins really the plugin repo?" }

& $syncScript -Vencord $Vencord -NoPull

Write-Step "Building Vencord (dev build)"
Push-Location $Vencord
try {
    Invoke-Checked "pnpm" @("build", "--dev") "pnpm build --dev"
} finally {
    Pop-Location
}

if ($SkipInject) {
    Write-Step "Done - skipped the inject step as asked"
    Write-Host "Restart Discord fully to load the new build." -ForegroundColor Green
    return
}

# --- inject ---------------------------------------------------------------------------------

Write-Step "Patching Discord"
Write-Note "The Vencord installer opens next. Pick the Discord you actually use (Stable / PTB / Canary)"
Write-Note "and choose Install. Close Discord first if it is running."

Push-Location $Vencord
try {
    & pnpm inject
} finally {
    Pop-Location
}

Write-Step "Done"
Write-Host "Fully restart Discord, then enable the plugins in Vencord Settings > Plugins." -ForegroundColor Green
Write-Host "To update later, run this script again." -ForegroundColor Green
