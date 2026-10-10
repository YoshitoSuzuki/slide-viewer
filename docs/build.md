最終更新: 2026-10-10（public 化に向けて構成を変更）

# デモの起動と資料の登録

## 必要なもの（このMacでは導入済み）

| ツール | 用途 |
|---|---|
| `php`（8.x） | API とデモサーバー |
| `pdftoppm` `pdfinfo`（poppler, Homebrew） | PDF → 画像、ページ数 |
| `cwebp`（Homebrew の webp） | PNG → WebP |
| `sips`（macOS 標準） | 画像の寸法 |
| Microsoft PowerPoint | `.pptx` → PDF（PowerPoint を使うときだけ） |
| `python3` + `python-pptx` | サンプル資料を作るときだけ |

## デモを動かす

```bash
./serve.sh            # http://localhost:8000/demo/ で起動（ポートは PORT=8080 ./serve.sh で変更）
open http://localhost:8000/demo/              # API を使うデモ
open http://localhost:8000/demo/static.html   # 静的モードのデモ（GitHub Pages に出すもの）
```

`file://` では動かない（API に PHP を使うため）。デモの資料は `demo/decks/`、鍵は `demo/secret.key`（git に入れない）。

## 資料を登録する

```bash
export SV_STORAGE=<置き場所>   # 省略すると slide-viewer/private/（decks/<slug>/ ができる）

# ダウンロード不可（PDF は置かず、ページ画像だけ。大きい画像はマスを並べ替える）
tools/add-deck.sh ~/Downloads/発表.pptx my-talk --title "発表のタイトル"

# ダウンロード可（元の PDF も置く）
tools/add-deck.sh ~/Downloads/資料.pdf handout --title "配布資料" --download
```

- 成功すると `my-talk: 12 ページ（1600x900）download=false scramble=true` のように出て、
  `<置き場所>/decks/my-talk/` ができる
- ダウンロード不可の資料は、大きいページ画像のマスを並べ替える。並べ替えたくないときは `--no-scramble`
  （ダウンロード可の資料は PDF ごと渡すので並べ替えない）
- slug（2つ目の引数）は英小文字・数字・ハイフンのみ。これが `data-deck` に書く名前になる
- 同じ slug で実行し直すと上書きされる（ダウンロード可→不可にしたいときも、`--download` なしで実行し直す。
  `original.pdf` も消える）
- `.pptx` を渡すと PowerPoint で PDF に書き出す。自分で開いた資料だけを閉じ、PowerPoint は
  もともと起動していなかったときだけ終了する
- その資料を PowerPoint で開いている（`~$資料名.pptx` のロックファイルがある）ときは、何もせずに止まる

### PowerPoint の変換で失敗しやすい点

- 保存先を HFS パス（`Macintosh HD:Users:...`）で渡さないと、成功を返すのにファイルができない
  （`pptx2pdf.sh` は対処済み）
- PowerPoint で同じ資料を開いたままだと古い内容が書き出される。そのためロックファイルがあれば止める
- AppleScript の `open` は開いた資料を返さない。ファイル名で `presentation "<名前>"` を探す
- `count of presentations` は 0 件のとき `missing value` を返す
- `pgrep -x "Microsoft PowerPoint"` は一致しない（プロセス名が15文字で切れる）。実行ファイルのパスで探す
- `tell application "Microsoft PowerPoint"` は、止まっている PowerPoint を起動してしまう。状態を見るだけなら先に pgrep で確かめる

## サンプル資料を作り直す

```bash
python3 tools/make-samples.py
export SV_STORAGE=demo
tools/add-deck.sh samples/usage.pptx usage --title "slide-viewer の使い方" --download
tools/add-deck.sh samples/locked.pptx locked --title "4:3 のサンプル"
```

## GitHub Pages のデモ

`main` に push すると `.github/workflows/pages.yml` が `demo/static.html` と `demo/decks/`・ビューアを
組み立てて https://yoshitosuzuki.github.io/slide-viewer/ に出す（Pages の設定は Source = GitHub Actions）。
