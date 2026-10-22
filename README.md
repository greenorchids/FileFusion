```text
 _____ _ _        _____          _
|  ___(_) | ___  |  ___|   _ ___(_) ___  _ __
| |_  | | |/ _ \ | |_ | | | / __| |/ _ \| '_ \
|  _| | | |  __/ |  _|| |_| \__ \ | (_) | | | |
|_|   |_|_|\___| |_|   \__,_|___/_|\___/|_| |_|
```

# File Fusion

This repository contains the core logic for a modular file conversion system, named File Fusion.

It also contains a static UI mockup to visualize the planned user interface.

## UI Mockup

To view the UI mockup locally, you can use Python's built-in HTTP server.

1. Navigate to the `ui` directory:
   ```bash
   cd ui
   ```

2. Start a local web server:
   ```bash
   python -m http.server 8000
   ```

3. Open your web browser and navigate to:
   * Landing Page: `http://localhost:8000/landing.html`
   * App UI: `http://localhost:8000/index.html`

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
