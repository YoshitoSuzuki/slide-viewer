最終更新: 2026-10-10（public 化に向けて構成を変更）

# 動作確認

`./serve.sh` で起動してから行う。

## ブラウザで見るところ

1. `http://localhost:8000/demo/` の各ビューアで、タイトル行・スライド・操作バーが崩れていないこと。スライドの周りに赤い枠が無いこと
   （赤い枠はデモページ側の `canvas { border: 4px solid red }`。出ていれば CSS がビューアに漏れている）
2. ‹ › ボタン・← → キー・スワイプでめくれ、「2 / 6」と下の線が進むこと
3. サムネイルボタンで列が開閉し、サムネイルを押すとそのページへ移ること
4. 全画面ボタンで黒背景の表示になり、Esc か × で戻ること
5. ↓ ボタン: 「記事の本文」には有る／「2カラムの左」（deck.json で不可）と「全幅」（ページ側で不可）には無い
6. ダークモードで色が切り替わること
7. 「表示する」で JS から後で載せたビューアが出ること。「存在しない資料」は再読み込みアイコンだけになること

## ダウンロード対策（curl）

```bash
B=http://localhost:8000/slide-viewer; J=/tmp/sv-cj.txt; rm -f $J; rm -rf demo/rate
m=$(curl -s -c $J "$B/api/deck/?deck=locked"); echo "$m"
e=$(echo "$m" | python3 -c 'import json,sys;print(json.load(sys.stdin)["exp"])')
t=$(echo "$m" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
u="$B/api/page/?deck=locked&p=2&s=full&e=$e&t=$t"
c(){ curl -s -o /dev/null -w "%{http_code}\n" "$@"; }
c -b $J -H "Sec-Fetch-Dest: empty" "$u"      # 200（ビューアの fetch と同じ）
c -b $J -H "Sec-Fetch-Dest: document" "$u"   # 403（アドレスバーで開いた）
c -b $J -H "Sec-Fetch-Dest: image" "$u"      # 403（<img> で埋め込んだ）
c "$u"                                       # 403（cookie なし = 別のブラウザ）
c -b $J "$B/api/page/?deck=locked&p=2&s=full&e=1000&t=$t"   # 403（期限切れ）
c "$B/api/download/?deck=locked"             # 404（ダウンロード不可）
c "$B/api/download/?deck=usage"              # 200（ダウンロード可）
c "$B/api/deck/?deck=../decks/locked"        # 404（パスで遡れない）
c "$B/private/lib.php"                       # 403（private/ は開けない。serve.sh の router.php）
c "http://localhost:8000/demo/secret.key"    # 403
# 回数制限: 同じ cookie で大きい画像を95回取ると、最後の5回が 429
for i in $(seq 1 95); do curl -s -o /dev/null -w "%{http_code}\n" -b $J -H "Sec-Fetch-Dest: empty" "$u"; done | sort | uniq -c
```

### マスの並べ替え

- `dwebp demo/decks/locked/full/001.webp -o /tmp/raw.png && open /tmp/raw.png` で、保存した画像がばらばらになっていること
- デモの「4:3 のサンプル」が正しい並びで表示され、マスの境目が見えないこと
- 並べ替えの順番を変えたときは、PHP の `sv_order()` と JS の `order()` で同じ結果になるかを
  いくつかの seed（0・4294967295 など）で比べる

ブラウザでは、デベロッパーツールの「ネットワーク」に PDF が流れていないこと、
`page/?deck=locked…` を新しいタブで開くと 403 になることを見る。

## 2026-10-10 の確認結果

- curl の確認はすべて期待どおり
- Chrome（ユーザーが目視）で上の1〜7を確認し問題なし
- ヘッドレス Chrome の撮影は、`--force-device-scale-factor=2` だと終わらなかった（未解決。history.md 参照）
- 構成変更後（public 化の準備）: curl の確認・回数制限（90回目まで 200、以降 429）・並べ替えたサンプルの表示・
  静的モードのデモをヘッドレス Chrome で確認。PHP と JS の並べ替えの順番が一致することも確認
