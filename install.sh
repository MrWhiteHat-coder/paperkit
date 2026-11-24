#!/bin/sh
# PaperKit one-line installer for Mac / Linux:
#   curl -fsSL https://raw.githubusercontent.com/MrWhiteHat-coder/paperkit/main/install.sh | sh
# Downloads PaperKit into ~/.paperkit and opens it in your browser. Needs Python 3 or Node.js.
set -e
DIR="${PAPERKIT_DIR:-$HOME/.paperkit}"
PORT="${PAPERKIT_PORT:-4173}"
echo ""
echo "  Installing PaperKit into $DIR ..."
TMP=$(mktemp -d)
curl -fsSL https://github.com/MrWhiteHat-coder/paperkit/archive/refs/heads/main.tar.gz | tar xz -C "$TMP"
rm -rf "$DIR"
mv "$TMP/paperkit-main" "$DIR"
rm -rf "$TMP"
URL="http://localhost:$PORT/"
echo "  PaperKit is running at $URL"
echo "  Your files never leave this computer. Press Ctrl+C to stop."
echo ""
( sleep 1.5; (command -v open >/dev/null 2>&1 && open "$URL") || (command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL") || true ) &
cd "$DIR/public"
if command -v python3 >/dev/null 2>&1; then
  exec python3 -c "import http.server as h; m=h.SimpleHTTPRequestHandler.extensions_map; m.update({'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.webmanifest':'application/manifest+json'}); h.test(HandlerClass=h.SimpleHTTPRequestHandler, port=$PORT, bind='127.0.0.1')"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -s -l "$PORT" .
else
  echo "  Please install Python 3 or Node.js, then run this again."
  exit 1
fi
