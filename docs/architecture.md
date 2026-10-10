最終更新: 2026-10-10（public 化に向けて構成を変更）

# 仕組み

## 全体の流れ

```
[手元]  資料.pptx ──pptx2pdf.sh──▶ 資料.pdf ──add-deck.sh──▶ <storage>/decks/<slug>/
                                                            ├ deck.json    資料の情報・ダウンロード可否・並べ替えの seed
                                                            ├ full/001.webp …   表示用（幅1600px。ダウンロード不可ならマスを並べ替え済み）
                                                            ├ thumb/001.webp …  サムネイル（幅320px。並べ替えない）
                                                            └ original.pdf  --download のときだけ

[ブラウザ]  <div class="slide-viewer" data-deck="<slug>">
   │  1. GET <endpoint>/deck/?deck=<slug>   → 資料の情報 + トークン（10分有効）+ cookie sv_sid
   │  2. GET <endpoint>/page/?deck=&p=&s=full|thumb&e=<期限>&t=<トークン>  → ページ画像（fetch で取得）
   │  3. 並べ替えてあれば元の並びに戻し、canvas に描く
   └  ダウンロード可なら <a href="<endpoint>/download/?deck=<slug>"> を出す

[静的モード]  data-static="<URL>" のときは API を使わず <URL>/<slug>/deck.json と画像を直接読む
```

PDF.js は使っていない。表示はすべてページ画像（WebP）。
ダウンロード可の資料も表示は画像で、PDF はダウンロード用に置くだけ（理由は history.md）。

## ファイル構成

**`slide-viewer/` フォルダが配布物そのもの**。どのサイトにもこのフォルダをコピーすれば動く
（2026-10-10 まではリポジトリの構成とサイトの構成が違い、書き出し時にパスを sed で書き換えていた）。

| パス | 役割 |
|---|---|
| `slide-viewer/slide-viewer.js` | ビューア本体。CSS は自分で読み込むので、ページ側は script 1行でよい |
| `slide-viewer/slide-viewer.css` | ビューアのスタイル。すべて `.sv-root` の中だけに効く |
| `slide-viewer/api/deck/index.php` | 資料の情報とトークンを返す。初回に cookie `sv_sid` を発行 |
| `slide-viewer/api/page/index.php` | ページ画像を返す。トークン・cookie・`Sec-Fetch-Dest`・回数制限を確認 |
| `slide-viewer/api/download/index.php` | `deck.json` で許可された資料だけ PDF を返す |
| `slide-viewer/private/lib.php` | API の共通処理（設定の読み込み、トークン、回数制限、キャッシュ禁止ヘッダ） |
| `slide-viewer/private/config.example.php` | 設定の見本。`config.php` にコピーして使う（無ければ既定値） |
| `slide-viewer/private/.htaccess` | Apache 用。`private/` を Web から開けないようにする |
| `slide-viewer/private/decks/<slug>/` | 資料の既定の置き場所（git には入れない） |
| `slide-viewer/private/secret.key` | トークンの署名に使う秘密の値。初回の API 呼び出しで自動生成。git に入れない |
| `demo/index.html` | API を使うデモ（わざと強い全体リセットを入れて、スタイルが漏れないか確かめる） |
| `demo/static.html` | 静的モードのデモ。GitHub Pages にもこれを出す |
| `demo/decks/` | デモ用の資料（`usage` = ダウンロード可 / `locked` = 不可・並べ替え済み） |
| `tools/add-deck.sh` | 資料の登録（PDF / PowerPoint → ページ画像 + deck.json） |
| `tools/scramble.php` | ページ画像のマスを並べ替える（add-deck.sh から呼ぶ） |
| `tools/pptx2pdf.sh` | PowerPoint → PDF（Microsoft PowerPoint を AppleScript で操作） |
| `tools/make-samples.py` | デモ用のサンプル資料（`samples/*.pptx`）を作る |
| `tools/export-to-site.sh` | `slide-viewer/` をサイトのリポジトリへコピーする（資料・鍵・設定には触らない） |
| `tools/router.php` | `serve.sh` 用。本番と同じく `private/` と `secret.key` を 403 にする |
| `.github/workflows/pages.yml` | `main` に push すると静的モードのデモを GitHub Pages に出す |

資料の置き場所は `private/config.php` の `storage`、または環境変数 `SV_STORAGE` で変えられる（API・add-deck.sh の両方）。

## 埋め込み方と設定

```html
<script src="/slide-viewer/slide-viewer.js" defer></script>
<div class="slide-viewer" data-deck="usage"></div>
```

設定は4段階。**後のものほど優先**される。

| 段階 | 書き方 |
|---|---|
| 既定値 | `endpoint: <script と同じ場所>/api`, `static: ""`, `download: true`, `thumbs: true`, `header: true`, `start: 1`, `lang: <ページの lang>` |
| サイト全体 | `SlideViewer.config({ download: false })`（script の後に書く） |
| 埋め込み1つ | `data-download="false"` `data-thumbs="open"` `data-header="false"` `data-start="3"` `data-accent="#ff9500"` `data-endpoint="..."` `data-static="..."` `data-lang="en"` |
| JS から載せる | `SlideViewer.mount(el, { deck: "locked", thumbs: false })` |

- `thumbs`: `true` = サムネイルボタンあり / `"open"` = 開いた状態で始める / `false` = ボタンなし
- **ダウンロードボタンは「deck.json が許可」かつ「ページ側の設定も許可」のときだけ出る。**
  ページ側で `download: true` にしても、deck.json が `false` なら出ない（API も PDF を返さない）
- `endpoint` の既定値は script を読み込んだ場所から決まるので、`slide-viewer/` フォルダごと置けば指定は要らない
- ボタンの読み上げ名（aria-label）は日本語と英語。`lang` かページの `<html lang>` が `ja` で始まれば日本語、それ以外は英語
- 色は CSS 変数で上書きできる（`--sv-accent` `--sv-surface` `--sv-text` `--sv-radius` など。一覧は CSS の先頭）
- JS で後から要素を足したページでは `SlideViewer.mountAll(container)` か `SlideViewer.mount(el)` を呼ぶ
- ページ側から操作する: `SlideViewer.get(el).go(9)` / `.next()` / `.prev()` / `.page()`。
  まだ資料を読み込む前に `go(n)` を呼ぶと、読み込み後に n ページ目から表示する
- script を `defer` で読むと script の実行と同時に mount されるので、あとに書いた `SlideViewer.config()` は間に合わない。
  ページごとに変えたい値は `data-*` で渡す
- 外側の余白（margin）はビューアの CSS では触らない。載せる側のページが自由に決める

### 全画面

- 黒背景。しばらく（2.5秒）マウスが動かないと操作バー・サムネイル列・ポインタを隠す。キー操作では出さない
  （3px 未満の揺れも無視）
- × は左上。ポインタを上端から 96px 以内に近づけたときだけ上から降りてくる。タッチではタップで出る
- Tab でボタンを選んでいる間・ボタンの上にポインタがある間は隠さない

### 載せる側のページと干渉しないための工夫

- クラス名はすべて `sv-` で始まる。スタイルは `.sv-root` の中にしか効かせない
- `.sv-root` の中で margin/padding/box-sizing と、canvas・svg の枠線などを打ち消している
  （デモページはわざと `* { margin:0 }`・`button { all: unset }`・`canvas { border: 4px solid red }` を入れて確かめている）
- 狭い場所での調整は画面幅ではなく**置いた場所の幅**で切り替える（コンテナクエリ `@container sv`）

## ダウンロード対策

### やっていること

1. **ダウンロード不可の資料は PDF をサーバーに置かない**。ページ画像だけ。
   PDF をブラウザに送る方式（PDF.js など）では、デベロッパーツールの通信の一覧から必ず保存できるため
2. 資料は `private/`（または公開ディレクトリの外）。**Web サーバーで `private/` を deny する**（Apache は同梱の `.htaccess`、nginx は README の設定）
3. ページ画像はトークンつきでしか返さない。トークンは `資料名|期限|cookie sv_sid` の HMAC-SHA256
   - 期限は10分（`token_ttl`）。切れたらビューアが自動で取り直す
   - cookie に結び付いているので、URL を別のブラウザに貼っても開けない（403）
4. `Sec-Fetch-Dest` が `empty`（fetch）以外なら断る。アドレスバーに貼る・`<img>` で埋め込む、は 403
5. `Cache-Control: private, no-store`。Cloudflare にもブラウザにも残さない
6. **大きいページ画像はマスを並べ替えて保存**する（ダウンロード不可の資料の既定。`--no-scramble` で無効）
   - 80px 四方のマスに切り、`deck.json` の seed とページ番号から決まる順番で並べ替える。ビューアが同じ順番で元に戻して描く
   - 並べ替えの計算は `tools/scramble.php` の `sv_order()` と `slide-viewer.js` の `order()` の2か所にある。**変えるときは必ず両方そろえる**
     （xorshift32 で Fisher–Yates。32bit の範囲で計算し、PHP と JS で同じ結果になることを確かめてある）
   - 並べ替えた画像は `cwebp -near_lossless 60` で保存する。非可逆（`-q 82`）だと、圧縮のときに隣のブロックから予測する分の誤差で、
     並べ替える前に隣にあったマスの跡が、戻したあとに薄い線や点として残った。near_lossless は大きさも `-q 82` とほぼ同じ
     （Git 入門の38枚で 1.59MB。並べ替えない `-q 82` は 1.53MB、完全な可逆は 1.72MB）
   - サムネイル（幅320px）は並べ替えない
7. **回数制限**: 同じ cookie からの大きいページ画像は1分間に90枚まで（`rate_limit`）。超えると 429。
   `private/rate/` に cookie ごとの小さなファイルを置き、ときどき1時間以上前のものを消す
8. 画像は `<img>` でなく canvas に描き、ステージとサムネイルでは右クリックとドラッグを止めている。印刷ではスライドを隠す

### 防げないこと

- スクリーンショット
- デベロッパーツールで canvas の中身を書き出すこと、並べ替えたマスを自分で並べ直すこと（seed は API が返している）
- `Sec-Fetch-Dest` は自作のプログラムなら偽れる（cookie とトークンを手で用意すれば画像は取れる。回数制限も cookie を取り直せば越えられる）
- 回数制限を IP ごとにしなかったのは、CDN の内側では全員が CDN の IP に見えることがあり、普通の閲覧まで止めてしまうため

守れるのは「元の PDF ファイルそのもの」「URL を使い回すこと」「気軽な保存」まで。

### 足していないもの（必要になったら）

- 透かし: `add-deck.sh` で画像に文字を焼き込む。PHP に gd はあるので、API 側で付けることもできる
- ページごとのトークン: ビューアは全ページ分のトークンを受け取る必要があるので、一括取得を防ぐ効果は無い。代わりに回数制限を入れた

## サイトへの書き出し

```bash
tools/export-to-site.sh /path/to/site/slide-viewer
SV_STORAGE=/path/to/site/slide-viewer/private tools/add-deck.sh 資料.pptx <slug> --title "…"
```

- ビューアを直したら、このリポジトリで直してから書き出す（サイト側のコピーを直接直さない）
- `export-to-site.sh` は書き出し先の資料（`private/decks/`）・`secret.key`・`config.php` には触らない
- サイトのリポジトリが丸ごと公開ディレクトリにコピーされる構成なら、Web サーバーで `private/` を deny する。
  nginx では `location ^~ /slide-viewer/private/ { deny all; }`（`^~` が無いと `location ~ \.php$` が先に一致する）
- PHP が `private/` に書き込めないサーバーでは、`secret.key`（無いと API が 500）と `rate/`（無いと回数制限が効かない）を先に作る
- CDN が静的ファイルをキャッシュする場合は、JS/CSS を更新したら script の URL の `?v=` を変える
  （JS が CSS を読むときにも同じ `?v=` を付けるので、CSS 側は何もしなくてよい）
- PHP 8.1 以上で動く書き方にする（8.3 以降の機能を使わない）。mbstring の無い環境もあるので mb_* は使わない
- 自分のサイト（yoshito.me）での手順は、そのサイトの記録（非公開）に書いてある
