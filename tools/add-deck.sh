#!/bin/bash
# 資料を登録する: PDF / PowerPoint → ページ画像（WebP）+ deck.json
# 使い方: tools/add-deck.sh <file.pdf|file.pptx> <slug> [--title "タイトル"] [--download] [--no-scramble]
#   --download    元の PDF も置き、ダウンロードできるようにする
#   --no-scramble 大きいページ画像のマスを並べ替えない（ダウンロード不可の資料は既定で並べ替える）
# 置き場所は SV_STORAGE（既定は slide-viewer/private）。<置き場所>/decks/<slug>/ ができる
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
storage="${SV_STORAGE:-$root/slide-viewer/private}"
full_width=1600
thumb_width=320
tile=80 # 並べ替えるマスの大きさ

if [ $# -lt 2 ]; then
  echo "usage: $0 <file.pdf|file.pptx> <slug> [--title TITLE] [--download] [--no-scramble]" >&2
  exit 1
fi

src="$1"
slug="$2"
shift 2
title=""
download=false
scramble=
while [ $# -gt 0 ]; do
  case "$1" in
    --title) title="$2"; shift 2 ;;
    --download) download=true; shift ;;
    --no-scramble) scramble=false; shift ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

# ダウンロード可の資料は PDF ごと渡すので、並べ替えても意味がない
[ -n "$scramble" ] || { $download && scramble=false || scramble=true; }
seed=0
$scramble && seed=$(od -An -N4 -tu4 /dev/urandom | tr -d ' ')

if ! [[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]]; then
  echo "slug は英小文字・数字・ハイフンのみ: $slug" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

case "$src" in
  *.pptx|*.ppt) pdf="$tmp/src.pdf"; "$root/tools/pptx2pdf.sh" "$src" "$pdf" >/dev/null ;;
  *.pdf) pdf="$src" ;;
  *) echo "PDF か PowerPoint を指定してください: $src" >&2; exit 1 ;;
esac

[ -n "$title" ] || title="$(basename "${src%.*}")"
pages="$(pdfinfo "$pdf" | awk '/^Pages:/ {print $2}')"

deck="$storage/decks/$slug"
mkdir -p "$deck"
rm -rf "$deck/full" "$deck/thumb" "$deck/original.pdf"
mkdir -p "$deck/full" "$deck/thumb"

render() { # <幅> <出力先> <並べ替えるか>
  pdftoppm -png -scale-to-x "$1" -scale-to-y -1 "$pdf" "$tmp/r"
  local i=0
  for f in $(ls "$tmp"/r-*.png | sort); do
    i=$((i + 1))
    out="$(printf '%s/%03d.webp' "$2" "$i")"
    if $3; then
      php "$root/tools/scramble.php" "$f" "$tmp/s.png" "$seed" "$i" "$tile"
      # 非可逆の圧縮は隣のブロックから予測するので、並べ替えた隣のマスの跡が薄く残る。
      # near_lossless なら跡が出ず、大きさも -q 82 とほぼ同じ（文字中心のスライドで確認）
      cwebp -quiet -near_lossless 60 "$tmp/s.png" -o "$out"
    else
      cwebp -quiet -q 82 "$f" -o "$out"
    fi
  done
  # 寸法は最初のページで代表させる
  sips -g pixelWidth -g pixelHeight "$(ls "$tmp"/r-*.png | sort | head -1)" \
    | awk '/pixelWidth/ {w=$2} /pixelHeight/ {h=$2} END {print w, h}' > "$tmp/size"
  rm -f "$tmp"/r-*.png
}

render "$thumb_width" "$deck/thumb" false
render "$full_width" "$deck/full" "$scramble"
read -r width height < "$tmp/size"

if $download; then
  cp "$pdf" "$deck/original.pdf"
fi

python3 -I - "$deck/deck.json" "$title" "$pages" "$width" "$height" "$download" "$scramble" "$seed" "$tile" <<'EOF'
import json, sys
out, title, pages, w, h, dl, sc, seed, tile = sys.argv[1:]
d = {"title": title, "pages": int(pages), "width": int(w), "height": int(h), "download": dl == "true"}
if sc == "true":
    d["scramble"] = {"seed": int(seed), "tile": int(tile)}
with open(out, "w") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
EOF

echo "$slug: $pages ページ（${width}x${height}）download=$download scramble=$scramble"
