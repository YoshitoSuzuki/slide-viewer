#!/bin/bash
# ビューアと API をサイトへ書き出す（slide-viewer/ フォルダをそのままコピーする）。
# 書き出し先の資料（private/decks/）・secret.key・config.php には触らない。
# 使い方: tools/export-to-site.sh <書き出し先>
#   例: tools/export-to-site.sh /path/to/site/slide-viewer
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
if [ $# -ne 1 ]; then
  echo "usage: $0 <dest>" >&2
  exit 1
fi
mkdir -p "$1"
rsync -a \
  --exclude 'private/decks/' --exclude 'private/secret.key' --exclude 'private/config.php' --exclude 'private/rate/' \
  --exclude '.DS_Store' \
  "$root/slide-viewer/" "$1/"
echo "exported to $1"
