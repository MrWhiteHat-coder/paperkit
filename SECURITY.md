# Security

PaperKit processes every file inside your browser tab. There is no server code, no analytics, no accounts and no cookies.

## What protects you

- **No uploads, enforced:** a strict Content-Security-Policy only lets the page talk to PaperKit itself and to `cdn.jsdelivr.net/npm/@tesseract.js-data/` (OCR language data downloads; data only, never code). Even a bug could not send your file anywhere else.
- **No third-party code:** every library, including the OCR engine, is self-hosted in `public/vendor/`.
- **No eval:** PDF.js runs with `isEvalSupported: false`. Script eval is blocked by CSP; only WebAssembly is allowed to compile.
- **Clickjacking and sniffing blocked:** `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy`.
- **Passwords:** Protect uses AES-256 through qpdf with a random owner password. Passwords stay in memory for that job only and are never stored.
- **On-device data:** your drawn signature and Exam mode settings stay in this browser's local storage. Use "Forget it on this device", or clear the site data, to remove them.
- **Local server:** `serve.ps1` listens on `localhost` only, rejects other Host names (DNS rebinding) and blocks path traversal. `install.sh` serves on `127.0.0.1` only.

## Known limits

- `heic2any` bundles an older libheif build. It only ever decodes your own photos, inside the browser sandbox.
- The one-line installers download the latest `main` branch over HTTPS. Read [`install.ps1`](install.ps1) / [`install.sh`](install.sh) before running them, or clone a tagged release.

## Reporting a vulnerability

Please use **GitHub → Security → Report a vulnerability** (private) on this repository, or email **anisdev266@gmail.com**. Please don't open a public issue for security problems. We'll reply within a few days.
