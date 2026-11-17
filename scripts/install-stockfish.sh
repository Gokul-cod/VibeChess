#!/usr/bin/env bash
# Installs the Stockfish release binary used by the review engine.
# Stockfish 19 (Sep 2026) is the current stable release. Override with SF_VERSION=sf_19.
set -euo pipefail

VERSION="${SF_VERSION:-sf_19}"
TARGET="${STOCKFISH_DIR:-$HOME/stockfish}"

case "$(uname -s)" in
  Linux) OS="linux" ;;
  Darwin) OS="macos" ;;
  *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

if [ "$OS" = "linux" ]; then
  case "$(uname -m)" in
    x86_64 | amd64) ARCH="x86-64" ;;
    aarch64 | arm64) ARCH="arm64" ;;
    riscv64) ARCH="riscv64" ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  ASSET="stockfish-${OS}-${ARCH}-universal.tar.gz"
else
  ASSET="stockfish-${OS}-universal.tar.gz"
fi

URL="https://github.com/official-stockfish/Stockfish/releases/download/${VERSION}/${ASSET}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $URL"
curl -fL --retry 3 --progress-bar -o "$TMP/sf.tar.gz" "$URL"
tar xzf "$TMP/sf.tar.gz" -C "$TMP"

mkdir -p "$TARGET"
BIN="$(find "$TMP" -type f -name 'stockfish-*' ! -name '*.sh' ! -name '*.md' ! -name '*.txt' | head -1)"
if [ -z "$BIN" ]; then
  echo "Could not find the stockfish binary in the archive." >&2
  exit 1
fi
cp "$BIN" "$TARGET/stockfish"
chmod +x "$TARGET/stockfish"

echo "Installed $("$TARGET/stockfish" <<< 'quit' | head -1) at $TARGET/stockfish"
