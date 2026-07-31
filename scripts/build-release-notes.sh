#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PREV_TAG="${1:?Previous tag required}"
NEW_TAG="${2:?New tag required}"
OUTPUT="${3:-release-body.md}"
REPO="${GITHUB_REPOSITORY:-Xaenny/VencordPlugins}"
GENERATED_AT="$(date -u +"%Y-%m-%d %H:%M UTC")"

{
    echo "# Release ${NEW_TAG}"
    echo ""
    echo "_Published: ${GENERATED_AT}_"
    echo ""
    echo "## What's Changed"
    echo ""

    COMMITS="$(git log "${PREV_TAG}..HEAD" --reverse --pretty=format:"- %s (%h)%n%b" --no-merges 2>/dev/null || true)"

    if [[ -n "$COMMITS" ]]; then
        echo "$COMMITS"
    else
        echo "_Maintenance release._"
    fi

    echo ""
    echo "---"
    echo ""
    echo "## Plugins in this repository"
    echo ""
    echo "- **BetterFormattingRedux** — formatting toolbar for chat"
    echo "- **CustomLoadingLogo** — custom Discord loading screen logo"
    echo "- **FavoriteMedia** — favourite images, videos, and files in the media picker"
    echo "- **SavedTexts** — saved text snippets in the expression picker"
    echo "- **HideGiftButton** — hide the Nitro gift button"
    echo ""
    echo "See the [README](https://github.com/${REPO}/blob/master/README.md) for installation, settings, and license details."
} > "$OUTPUT"

echo "Wrote ${OUTPUT}"
