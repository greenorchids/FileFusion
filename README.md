```text
 _____ _ _        _____          _
|  ___(_) | ___  |  ___|   _ ___(_) ___  _ __
| |_  | | |/ _ \ | |_ | | | / __| |/ _ \| '_ \
|  _| | | |  __/ |  _|| |_| \__ \ | (_) | | | |
|_|   |_|_|\___| |_|   \__,_|___/_|\___/|_| |_|
```

# File Fusion

This repository contains the core logic for a modular file conversion system, named File Fusion.

It also contains the web app in `ui/`: a landing page and a converter that runs entirely in the browser (images to PNG/JPG/WEBP/PDF, CSV/TSV/JSON to JSON/CSV/TSV/Markdown/HTML/YAML/XML, Markdown/HTML/text conversions). It is deployed to GitHub Pages at https://ybelov27.github.io/FileFusion/.

## Web App

To run the web app locally, you can use Python's built-in HTTP server.

1. Navigate to the `ui` directory:
   ```bash
   cd ui
   ```

2. Start a local web server:
   ```bash
   python -m http.server 8000
   ```

3. Open your web browser and navigate to:
   * Landing Page: `http://localhost:8000/`
   * App UI: `http://localhost:8000/app.html`

### Google sign-in

Sign-in uses Google Identity Services and is optional; it stays hidden until a client ID is configured.

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an OAuth client ID of type **Web application**.
2. Under **Authorized JavaScript origins**, add `https://ybelov27.github.io` and `http://localhost:8000`.
3. Paste the client ID into `ui/config.js` as `googleClientId`.

## Core System Development

To work on the core system or run the unit tests:

1. Install pytest:
   ```bash
   pip install pytest
   ```

2. Run the tests from the root of the repository:
   ```bash
   pytest tests/
   ```
