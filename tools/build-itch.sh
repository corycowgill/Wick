#!/bin/sh
# Package the game for itch.io: a zip with index.html at its root.
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/wick-itch.zip
zip -rq dist/wick-itch.zip index.html src intro assets -x '*.DS_Store'
echo "dist/wick-itch.zip ($(du -h dist/wick-itch.zip | cut -f1))"
