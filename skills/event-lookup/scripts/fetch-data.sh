#!/usr/bin/env bash
# Download the production discovery API data files used by the event-lookup
# search script. Caches under /tmp/206events/ so repeated invocations are cheap.
#
# Usage:
#   bash skills/event-lookup/scripts/fetch-data.sh           # refresh if older than 1h
#   bash skills/event-lookup/scripts/fetch-data.sh --force   # always refresh
set -euo pipefail

CACHE_DIR="${EVENT_LOOKUP_CACHE_DIR:-/tmp/206events}"
SITE="${EVENT_LOOKUP_SITE:-https://206.events}"
MAX_AGE_SECONDS=3600
FORCE=0

for arg in "$@"; do
    case "$arg" in
        --force) FORCE=1 ;;
        *) echo "unknown arg: $arg" >&2; exit 2 ;;
    esac
done

mkdir -p "$CACHE_DIR"

needs_refresh() {
    local path="$1"
    [ "$FORCE" = "1" ] && return 0
    [ ! -s "$path" ] && return 0
    local now mtime age
    now=$(date +%s)
    mtime=$(stat -c %Y "$path" 2>/dev/null || stat -f %m "$path")
    age=$((now - mtime))
    [ "$age" -gt "$MAX_AGE_SECONDS" ]
}

fetch() {
    local name="$1"
    local dest="$CACHE_DIR/$name"
    if needs_refresh "$dest"; then
        echo "fetching $name..." >&2
        curl -fsSL --retry 3 --retry-delay 2 -o "$dest.tmp" "$SITE/$name"
        mv "$dest.tmp" "$dest"
    else
        echo "cached $name (fresh)" >&2
    fi
}

fetch events-index.json
fetch manifest.json
fetch venues.json

echo "$CACHE_DIR"
