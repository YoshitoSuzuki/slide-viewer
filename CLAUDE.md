# CLAUDE.md

Web ページに埋め込むスライドビューア（PDF / PowerPoint）。作業前に `docs/` を読むこと
（特に architecture.md のダウンロード対策と「サイトへの書き出し」）。
**public リポジトリ**（MIT）。使う人向けの説明は README.md（英語）と README.ja.md、開発の記録は docs/（日本語）。

## ブランチ運用（Git-flow）

- `main` → `develop` → 作業ブランチ `<type>/<short-kebab-case>`（type: feature / fix / hotfix / chore / refactor / docs / test）
- 作業ブランチは `develop` へ squash merge し、マージ後に削除する。`main` へのマージは事前にユーザーへ確認する
- コミットメッセージは英語小文字の短文
- GitHub: `YoshitoSuzuki/slide-viewer`（2026-10-10 作成）。`main` に push すると GitHub Pages のデモも更新される

## 守ること

- ダウンロード不可の資料の PDF を、公開ディレクトリや API の応答に出さない
- `secret.key`・`config.php` と、公開しない資料をコミット・公開しない（`.gitignore` 済み。デモの資料 `demo/decks/` だけは入れる）
- ビューアのスタイルは `.sv-root` の外に漏らさない。画面に説明文を置かない
- 構成・手順・設定を変えたら docs/ と README（英日両方）も更新する
- 並べ替えの順番の計算（`tools/scramble.php` と `slide-viewer.js`）は必ず両方そろえる
