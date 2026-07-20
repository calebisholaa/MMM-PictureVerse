#!/bin/bash

# keep-alive.sh - Pings the network gateway on an interval so the mirror's
# WiFi connection doesn't get dropped for being idle.
# Not meant to be run directly - use start-keep-alive.sh / stop-keep-alive.sh.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="${SCRIPT_DIR}/logs"
LOG_FILE="${LOG_DIR}/keep-alive.log"

# Seconds between pings (override: KEEP_ALIVE_INTERVAL=30 ./keep-alive.sh)
INTERVAL="${KEEP_ALIVE_INTERVAL:-60}"

# Host to ping (override: KEEP_ALIVE_TARGET=1.1.1.1 ./keep-alive.sh)
# Defaults to the default gateway, falling back to 1.1.1.1 if it can't be detected.
TARGET="${KEEP_ALIVE_TARGET:-}"
if [ -z "$TARGET" ]; then
    TARGET="$(ip route 2>/dev/null | awk '/^default/ {print $3; exit}')"
fi
if [ -z "$TARGET" ]; then
    TARGET="1.1.1.1"
fi

mkdir -p "$LOG_DIR"

echo "==================================================" >> "$LOG_FILE"
echo "Starting keep-alive at $(date) (target=$TARGET, interval=${INTERVAL}s)" >> "$LOG_FILE"
echo "==================================================" >> "$LOG_FILE"

FAIL_COUNT=0

while true; do
    if ping -c 1 -W 5 "$TARGET" > /dev/null 2>&1; then
        if [ "$FAIL_COUNT" -gt 0 ]; then
            echo "$(date): back online after $FAIL_COUNT failed ping(s)" >> "$LOG_FILE"
        fi
        FAIL_COUNT=0
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        echo "$(date): ping to $TARGET failed (consecutive failures: $FAIL_COUNT)" >> "$LOG_FILE"
    fi

    sleep "$INTERVAL"
done
