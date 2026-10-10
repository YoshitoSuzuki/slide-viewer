#!/bin/bash
# デモを http://localhost:8000/demo/ で動かす（API に PHP を使うので php の内蔵サーバーで起動する）
# 資料はデモ用の demo/decks/ を読む
cd "$(dirname "$0")" && SV_STORAGE="$PWD/demo" exec php -S localhost:${PORT:-8000} tools/router.php
