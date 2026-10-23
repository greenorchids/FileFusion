# Contributing to File Fusion

Thanks for helping! File Fusion is a static site: everything lives in `ui/` and runs in the browser.

## Run it locally

```bash
node tools/build-pages.mjs   # generates the converter pages (not committed)
cd ui && python3 -m http.server 8000
```

Then open http://localhost:8000.

## Add a conversion format

1. Add the format to `FORMATS` and `targetsFor` in `ui/convert.js`.
2. Implement it in `convert()` using browser APIs only. Files must never be uploaded.
3. Optionally add a landing page entry in `tools/build-pages.mjs` and run `node tools/build-pages.mjs`.

## Good first contributions

- New formats: HEIC, GIF output, DOCX to text, YAML input, MP4 to GIF
- Translations of the landing page
- Accessibility and mobile polish

Open an issue with the **Request a conversion format** template if you're unsure where to start.

## Pull requests

- Keep changes focused and describe how you tested them.
- Never commit API keys, `.env` files or OAuth client secrets.
