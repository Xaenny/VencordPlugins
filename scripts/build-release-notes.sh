#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TEMPLATE="${ROOT}/RELEASE_TEMPLATE.md"
OUTPUT="${1:-}"

if [[ ! -f "$TEMPLATE" ]]; then
    echo "Missing RELEASE_TEMPLATE.md" >&2
    exit 1
fi

TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo "v1.0.0")"
GENERATED_AT="$(date -u +"%Y-%m-%d %H:%M UTC")"

{
    cat "$TEMPLATE"
    echo ""
    echo "---"
    echo ""
    echo "## Recent Changes (since ${TAG})"
    echo ""
    echo "_Auto-updated: ${GENERATED_AT}_"
    echo ""

    COMMITS="$(git log "${TAG}..HEAD" --pretty=format:"- %s (%h)" --no-merges 2>/dev/null || true)"

    if [[ -n "$COMMITS" ]]; then
        echo "$COMMITS"
    else
        echo "_No new commits since ${TAG}._"
    fi
} > "${OUTPUT:-/dev/stdout}"
