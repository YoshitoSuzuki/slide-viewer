# slide-viewer

PDF・PowerPoint のスライド資料を、`<script>` 1行で Web ページに埋め込めるビューアです。資料ごとにダウンロードを許可するかどうかを決められます。

[English](README.md) · [デモ](https://yoshitosuzuki.github.io/slide-viewer/)

- 1枚ずつめくる表示、サムネイル、キーボード・スワイプ操作、全画面、ライト／ダークモード
- 置いた場所の幅に合わせて縮む（コンテナクエリ）。スタイルは載せる側のページに漏れない
- **資料ごとのダウンロード制御**。ダウンロード不可の資料は元の PDF をブラウザに送らず、ページ画像だけを短時間のトークンつきで返す。画像はマスを並べ替えた状態で保存してある
- ビルド不要。ブラウザ側は依存ライブラリなし、サーバー側は小さな PHP ファイル3つ

## 使い方（PHP）

サーバーに PHP 8.1 以上が必要です。資料の変換には `poppler`（`pdftoppm`・`pdfinfo`）と `webp`（`cwebp`）を使います（macOS なら `brew install poppler webp`）。

1. **`slide-viewer/` フォルダをサイトにコピー**する（例: `/slide-viewer/`）
2. **`slide-viewer/private/` を Web から開けないようにする**。資料と署名用の鍵が入る
   - Apache: 同梱の `.htaccess` で対応済み
   - nginx:
     ```nginx
     location ^~ /slide-viewer/private/ { deny all; }
     ```
   - または資料を公開ディレクトリの外に置く: `private/config.example.php` を `private/config.php` にコピーして `storage` を書き換える
3. **資料を登録する**（PDF か PowerPoint）
   ```bash
   SV_STORAGE=/path/to/site/slide-viewer/private \
     tools/add-deck.sh talk.pdf my-talk --title "発表"                # 閲覧のみ
   SV_STORAGE=... tools/add-deck.sh handout.pdf handout --download   # ダウンロード可
   ```
   `.pptx` は Microsoft PowerPoint（macOS）で PDF に変換します。先に自分で PDF に書き出しても構いません。
4. **ページに埋め込む**
   ```html
   <script src="/slide-viewer/slide-viewer.js" defer></script>
   <div class="slide-viewer" data-deck="my-talk"></div>
   ```

初めて資料を表示したときに `private/secret.key` を自動で作るので、`private/` は PHP から書き込める必要があります。書き込めない場合は先に作っておきます: `openssl rand -hex 32 > slide-viewer/private/secret.key`

## 静的モード（サーバーなし）

守る必要のない資料なら、GitHub Pages などにファイルを置くだけで使えます。`tools/add-deck.sh` で作った `decks/` フォルダをアップロードし、その場所を指定します。

```html
<div class="slide-viewer" data-deck="my-talk" data-static="/decks/"></div>
```

マスの並べ替えは静的モードでも効きますが、`deck.json` や `original.pdf` は誰でも直接開けます。

## 設定

サイト全体・要素ごと・JavaScript から指定できます。後のものほど優先されます:
既定値 < `SlideViewer.config({...})` < `data-*` 属性 < `SlideViewer.mount(el, {...})`

| 設定 | 属性 | 既定値 | |
|---|---|---|---|
| `endpoint` | `data-endpoint` | script と同じ場所の `api/` | PHP の API の場所 |
| `static` | `data-static` | なし | API の代わりに、この URL から資料をファイルとして読む |
| `download` | `data-download` | `true` | ダウンロードボタンを出す（資料が許可しているときだけ） |
| `thumbs` | `data-thumbs` | `true` | `true` ボタンあり / `"open"` 開いた状態 / `false` なし |
| `header` | `data-header` | `true` | スライドの上のタイトルとページ数 |
| `start` | `data-start` | `1` | 最初に出すページ |
| `accent` | `data-accent` | なし | アクセント色 |
| `lang` | `data-lang` | ページの `lang` | ボタンの読み上げ名（`ja` / `en`） |

色は CSS 変数でも上書きできます（`--sv-accent`・`--sv-surface`・`--sv-text`・`--sv-radius` など。一覧は `slide-viewer.css` の先頭）。

JavaScript: `SlideViewer.mount(el, opts)`、`SlideViewer.mountAll(container)`、`SlideViewer.get(el).go(n) / .next() / .prev() / .page()`

## ダウンロード対策で守れること・守れないこと

`--download` なしで登録した資料について:

守れること

- 元の PDF はサーバーに置かず、ブラウザにも送らない
- ページ画像の URL は、cookie に結び付いた10分間のトークンがないと開けない。URL の共有・アドレスバーでの直接表示・`<img>` での埋め込みはできない
- 大きいページ画像はマスを並べ替えて保存してある。開発者ツールの「ネットワーク」から保存しても、ばらばらの画像になる
- 短時間の一括取得を遅くする（cookie ごとに1分間90ページまで。スクリプトなら cookie を取り直せるので、完全には止められない）
- 印刷するとスライドは表示されない。スライド上の右クリックとドラッグは無効

守れないこと

- スクリーンショット
- 開発者ツールに詳しい人が canvas の中身を読む・マスを並べ直すこと

つまり、守れるのは「ファイルそのもの」と「気軽な保存」までです。画面に見えているものは、最終的には撮れます。必要なら透かしを入れてください。

## 開発

```bash
./serve.sh                      # http://localhost:8000/demo/（php -S）
python3 tools/make-samples.py   # サンプルの .pptx を作り直す（python-pptx）
```

設計の記録は [`docs/`](docs/) にあります。

## ライセンス

[MIT](LICENSE)
