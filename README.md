# slide-viewer

Embed PDF / PowerPoint slide decks in any web page with one `<script>` tag — and decide, per deck, whether visitors may download it.

[日本語](README.ja.md) · [Demo](https://yoshitosuzuki.github.io/slide-viewer/)

- Page-by-page viewer with thumbnails, keyboard / swipe navigation, full screen, light / dark mode
- Fits whatever box you put it in (container queries); its styles never leak into your page
- **Download control per deck.** Decks that are not downloadable never send the original PDF to the browser — only page images, served through short-lived tokens and stored as shuffled tiles
- No build step, no dependencies in the browser. The server side is three small PHP files

## Quick start (PHP)

Requires PHP 8.1+ on the server. To prepare decks you need `poppler` (`pdftoppm`, `pdfinfo`) and `webp` (`cwebp`); on macOS: `brew install poppler webp`.

1. **Copy the `slide-viewer/` folder** to your site, e.g. as `/slide-viewer/`.
2. **Block web access to `slide-viewer/private/`.** It holds your decks and the signing key.
   - Apache: already handled by the included `.htaccess`.
   - nginx:
     ```nginx
     location ^~ /slide-viewer/private/ { deny all; }
     ```
   - Or keep decks outside the web root: copy `private/config.example.php` to `private/config.php` and set `storage`.
3. **Add a deck** (PDF or PowerPoint):
   ```bash
   SV_STORAGE=/path/to/site/slide-viewer/private \
     tools/add-deck.sh talk.pdf my-talk --title "My talk"            # view only
   SV_STORAGE=... tools/add-deck.sh handout.pdf handout --download  # downloadable
   ```
   `.pptx` files are converted with Microsoft PowerPoint (macOS). Or export to PDF yourself first.
4. **Embed it:**
   ```html
   <script src="/slide-viewer/slide-viewer.js" defer></script>
   <div class="slide-viewer" data-deck="my-talk"></div>
   ```

The `slide-viewer/private/` folder must be writable by PHP the first time a deck is viewed (to create `secret.key`), or create it yourself: `openssl rand -hex 32 > slide-viewer/private/secret.key`.

## Static mode (no server)

For decks you don't need to protect, you can host everything as plain files (GitHub Pages, Netlify, S3 …). Prepare decks with `tools/add-deck.sh` as above, upload the `decks/` folder, and point the viewer at it:

```html
<div class="slide-viewer" data-deck="my-talk" data-static="/decks/"></div>
```

Scrambled tiles still work in static mode, but anyone can read `deck.json` and `original.pdf` directly.

## Options

Set them site-wide, per element, or from JavaScript. Later ones win:
defaults < `SlideViewer.config({...})` < `data-*` attributes < `SlideViewer.mount(el, {...})`.

| Option | Attribute | Default | |
|---|---|---|---|
| `endpoint` | `data-endpoint` | `api/` next to the script | Where the PHP API lives |
| `static` | `data-static` | — | Read decks as static files from this URL instead of the API |
| `download` | `data-download` | `true` | Show the download button (only if the deck allows it) |
| `thumbs` | `data-thumbs` | `true` | `true` button / `"open"` start open / `false` none |
| `header` | `data-header` | `true` | Title and page count above the slide |
| `start` | `data-start` | `1` | First page shown |
| `accent` | `data-accent` | — | Accent color |
| `lang` | `data-lang` | page `lang` | Button labels: `ja` or `en` |

Colors can also be overridden with CSS variables (`--sv-accent`, `--sv-surface`, `--sv-text`, `--sv-radius` …, listed at the top of `slide-viewer.css`).

JavaScript API: `SlideViewer.mount(el, opts)`, `SlideViewer.mountAll(container)`, `SlideViewer.get(el).go(n) / .next() / .prev() / .page()`.

## What download protection does — and doesn't

For decks added without `--download`:

Protected:

- The original PDF is never stored on the server or sent to the browser.
- Page image URLs only work with a 10-minute token tied to a cookie, so they can't be shared, opened in the address bar, or embedded with `<img>`.
- Full-size images are stored as shuffled tiles. Saving one from the network panel gives you a scrambled picture.
- Bulk fetching is slowed down: 90 full-size pages per minute per cookie. (A script can get a new cookie, so this is a speed bump, not a wall.)
- Printing hides the slides; right-click and drag are disabled on them.

Not protected:

- Screenshots.
- A determined user with developer tools can still read the canvas or reassemble the tiles.

In short: it protects the file itself and stops casual saving. Anything visible on screen can ultimately be captured. Add a watermark if that matters.

## Development

```bash
./serve.sh                      # http://localhost:8000/demo/  (php -S)
python3 tools/make-samples.py   # regenerate sample .pptx files (python-pptx)
```

Japanese design notes live in [`docs/`](docs/).

## License

[MIT](LICENSE)
