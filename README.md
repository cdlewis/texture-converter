# RT64 Texture converter

A standalone static website that converts RT64 v5 texture dumps to PNGs entirely in the browser.
Select a folder; the converter downloads a ZIP containing only PNGs under `images/`.
Folder structure and texture identifiers are preserved. Original files are never modified or uploaded.

## Run locally

Use Python 3 to serve the static files:

```sh
python3 -m http.server 4173 --directory docs
```

Open http://localhost:4173. Serve over HTTP(S); do not open `index.html` directly as a file,
because the application uses JavaScript modules and a module worker.
There is no build or dependency installation step. Deploy the contents of `docs` to any static host.
For GitHub Pages, select the `main` branch and `/docs` folder under Settings > Pages.

## Supported input

- Names: `<16 lowercase hexadecimal characters>.v5.tile.json` paired with `.v5.tmem`.
- CI4/CI8 with RGBA16 palettes, and I4 without a palette.
- TMEM files must contain exactly 4,096 bytes; dimensions must be positive integers no larger than 4,096.
- Unsupported, malformed, or unpaired records appear in the on-page error list; other sidecars are ignored.
- Zero-stride textures are unsupported, matching the Python reference.
- Outputs are decoded source images, not replacements or an installable texture pack.

Conversion runs sequentially in a Web Worker. PNG encoding preserves RGBA bytes directly, including
RGB under zero alpha. Already-compressed PNGs are stored in a ZIP without a second compression pass.
The archive is retained in browser memory; output is capped at 512 MB. For larger dumps, convert
subfolders separately. Cancel terminates the worker and discards its work. Automatic download behavior
is browser-dependent; the completed download remains available through the download button.

## Checks

Requires Node.js and Python 3:

```sh
npm test
```

Tests cover reference decoder parity on 96 synthetic cases, palette addressing, wrapping, odd-row
swapping, alpha, PNG CRCs and exact pixel round trips, ZIP extraction, nested paths, partial failures,
invalid inputs, and UI cancellation/retry/download state using a simulated worker.
No copyrighted game assets are included. Desktop browser interaction testing remains separate from
these checks. Optional WebMCP status/cancel tools are feature-detected; their contracts are tested with
a simulated registry, not a live WebMCP browser.

## Sources and dependencies

- [RT64 texture-pack documentation](https://github.com/rt64/rt64/blob/main/TEXTURE-PACKS.md).
- [fflate 0.8.2](https://github.com/101arrowz/fflate/tree/v0.8.2), vendored in `docs/vendor`
  with its MIT license. No CDN is contacted at runtime.
