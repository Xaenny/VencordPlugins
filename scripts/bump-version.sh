#!/usr/bin/env bash
set -euo pipefail

# Prints the next patch version after the latest v* tag (e.g. v1.0.0 -> v1.0.1).
LATEST="$(git tag -l 'v*' --sort=-v:refname | head -n1)"

if [[ -z "$LATEST" ]]; then
    echo "v1.0.0"
    exit 0
fi

VERSION="${LATEST#v}"
IFS=. read -r MAJOR MINOR PATCH <<< "$VERSION"
PATCH=$((PATCH + 1))
echo "v${MAJOR}.${MINOR}.${PATCH}"
