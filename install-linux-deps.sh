#!/usr/bin/env sh

set -eu

if ! command -v apt >/dev/null 2>&1; then
  printf 'This script currently supports apt-based Linux distributions only.\n' >&2
  exit 1
fi

printf 'Updating apt package index...\n'
sudo apt update

printf 'Installing Tauri Linux system dependencies...\n'
sudo apt install -y \
  build-essential \
  curl \
  file \
  libayatana-appindicator3-dev \
  libglib2.0-dev \
  librsvg2-dev \
  libssl-dev \
  libwebkit2gtk-4.1-dev \
  libxdo-dev \
  patchelf \
  pkg-config \
  wget

if ! command -v cargo >/dev/null 2>&1; then
  printf 'Rust was not found. Installing rustup and the stable toolchain...\n'
  curl https://sh.rustup.rs -sSf | sh -s -- -y
fi

if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.cargo/env"
fi

printf '\nDone.\n'
printf 'You can now run:\n'
printf '  npm run tauri dev\n'
printf 'from the project directory.\n'
