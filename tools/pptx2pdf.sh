#!/bin/bash
# PowerPoint (.pptx) を PDF に書き出す。Microsoft PowerPoint を AppleScript で操作する
# 使い方: tools/pptx2pdf.sh input.pptx [output.pdf]
#
# 使っている途中の PowerPoint を巻き込まないよう:
# - 対象の資料を PowerPoint で開いている（~$ のロックファイルがある）ときは何もせずに止める
# - 自分で開いた資料だけを閉じる。PowerPoint がもともと起動していたら終了させない
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 input.pptx [output.pdf]" >&2
  exit 1
fi

in="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
out="${2:-${in%.*}.pdf}"
out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"

lock="$(dirname "$in")/~\$$(basename "$in")"
if [ -e "$lock" ]; then
  echo "PowerPoint でこの資料を開いています。保存して閉じてから実行してください: $in" >&2
  echo "（PowerPoint を閉じてもロックファイル $lock が残っている場合は、それを削除してください）" >&2
  exit 1
fi

if pgrep -fq "Microsoft PowerPoint.app/Contents/MacOS/Microsoft PowerPoint$"; then running=true; else running=false; fi
rm -f "$out"

# 保存先は HFS パスで渡さないと、成功を返すのにファイルができない
osascript - "$in" "$out" "$running" "$(basename "$in")" <<'EOF'
on run argv
  set inPath to item 1 of argv
  set outPath to (POSIX file (item 2 of argv)) as string
  set wasRunning to (item 3 of argv) is "true"
  tell application "Microsoft PowerPoint"
    open POSIX file inPath
    -- open は資料を返さないので、ファイル名で探す
    set p to presentation (item 4 of argv)
    save p in outPath as save as PDF
    close p saving no
    -- 自分で起動したときだけ終了する（起動時に自動で開き直された資料は未編集なので、保存せず閉じてよい）
    if not wasRunning then quit saving no
  end tell
end run
EOF

if [ ! -f "$out" ]; then
  echo "PDF が書き出されませんでした: $out" >&2
  exit 1
fi
echo "$out"
