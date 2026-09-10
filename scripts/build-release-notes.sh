#!/usr/bin/env bash
# Builds the release notes for a tag.
#
# Only commit subjects go in - the bodies carry implementation detail and trailers that mean
# nothing to somebody reading a release page.
#
# Usage: build-release-notes.sh <previous tag> <new tag> [output file]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PREV_TAG="${1:?Previous tag required}"
NEW_TAG="${2:?New tag required}"
OUTPUT="${3:-release-body.md}"
REPO="${GITHUB_REPOSITORY:-Xaenny/VencordPlugins}"

# During a release the tag doesn't exist yet, so the range ends at HEAD. When regenerating notes
# for a tag that is already published, it ends at the tag itself.
if git rev-parse --verify --quiet "${NEW_TAG}^{commit}" >/dev/null; then
    END_REF="${NEW_TAG}"
else
    END_REF="HEAD"
fi

if git rev-parse --verify --quiet "${PREV_TAG}^{commit}" >/dev/null; then
    RANGE="${PREV_TAG}..${END_REF}"
else
    RANGE="${END_REF}"
fi

CHANGES="$(git log "${RANGE}" --reverse --no-merges --pretty=format:'- %s' 2>/dev/null | grep -v '\[skip release\]' || true)"

{
    echo "## What's new"
    echo ""
    if [[ -n "$CHANGES" ]]; then
        echo "$CHANGES"
    else
        echo "- Small fixes and tidying up"
    fi
    echo ""
    echo "## Installing"
    echo ""
    echo "Download **VencordPluginsInstaller.exe** below and run it. It installs Vencord, adds all the"
    echo "plugins and patches Discord for you. Already set up? Run it again and it updates everything."
    echo ""
    echo "You need [Git](https://git-scm.com/download/win) and [Node.js 22 or newer](https://nodejs.org)"
    echo "installed first. Windows will warn about the file because it isn't signed - the SHA256 is"
    echo "published next to it if you want to check the download."
    echo ""
    echo "Prefer to do it by hand? The [README](https://github.com/${REPO}/blob/master/README.md) has the steps."
    echo ""
    echo "## What's in here"
    echo ""
    echo "- **ModToolDiscord** — moderation shortcuts: right-click a message or member to open a panel with your punishment commands, presets and per-server command channel"
    echo "- **FavoriteMedia** — save images, videos and files as favourites, with their own tabs in the GIF picker"
    echo "- **SavedTexts** — save text snippets and paste them from the expression picker"
    echo "- **BetterFormattingRedux** — a formatting toolbar for the chat box"
    echo "- **CustomLoadingLogo** — swap Discord's loading logo for your own image"
    echo "- **HideGiftButton** — hide the Nitro gift button"
    echo ""
    if git rev-parse --verify --quiet "${PREV_TAG}^{commit}" >/dev/null; then
        echo "**Full changelog:** [${PREV_TAG}...${NEW_TAG}](https://github.com/${REPO}/compare/${PREV_TAG}...${NEW_TAG})"
    fi
} > "$OUTPUT"

echo "Wrote ${OUTPUT}"
