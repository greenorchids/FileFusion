```text
 _____ _ _        _____          _
|  ___(_) | ___  |  ___|   _ ___(_) ___  _ __
| |_  | | |/ _ \ | |_ | | | / __| |/ _ \| '_ \
|  _| | | |  __/ |  _|| |_| \__ \ | (_) | | | |
|_|   |_|_|\___| |_|   \__,_|___/_|\___/|_| |_|
```

# File Fusion

[![Live site](https://img.shields.io/badge/live-ybelov27.github.io%2FFileFusion-1a73e8?style=flat&logo=googlechrome&logoColor=white)](https://ybelov27.github.io/FileFusion/)
[![Deploy to GitHub Pages](https://github.com/ybelov27/FileFusion/actions/workflows/pages.yml/badge.svg)](https://github.com/ybelov27/FileFusion/actions/workflows/pages.yml)
[![GitHub stars](https://img.shields.io/github/stars/ybelov27/FileFusion?style=flat&logo=github)](https://github.com/ybelov27/FileFusion/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/ybelov27/FileFusion?style=flat)](https://github.com/ybelov27/FileFusion/commits)
[![Top language](https://img.shields.io/github/languages/top/ybelov27/FileFusion?style=flat)](https://github.com/ybelov27/FileFusion)
![Private by design](https://img.shields.io/badge/privacy-100%25%20in--browser-1e8e3e?style=flat&logo=letsencrypt&logoColor=white)
![Sign in with Google](https://img.shields.io/badge/auth-Google%20Identity%20Services-4285F4?style=flat&logo=google&logoColor=white)

![File Fusion converter](ui/mockup.png)

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
