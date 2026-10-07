#!/usr/bin/env bash
set -euo pipefail
# Run inside a disposable Debian/Ubuntu VM, never on the host desktop.
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends ca-certificates curl xz-utils xvfb openbox xterm geany chromium ffmpeg xdotool fonts-noto-cjk dbus-x11 xclip tint2 x11-xserver-utils
mkdir -p /etc/chromium/policies/managed
printf '{"TranslateEnabled":false}\n' > /etc/chromium/policies/managed/recording.json
mkdir -p /opt/recording
curl -fsSL https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.xz -o /opt/recording/node.tar.xz
tar -xJf /opt/recording/node.tar.xz -C /opt/recording
ln -sf /opt/recording/node-v22.22.0-linux-x64/bin/node /usr/local/bin/node
ln -sf /opt/recording/node-v22.22.0-linux-x64/bin/npm /usr/local/bin/npm
ln -sf /opt/recording/node-v22.22.0-linux-x64/bin/npx /usr/local/bin/npx
mkdir -p /root/.config/geany
if [ ! -f /root/.config/geany/geany.conf ]; then
  printf "[geany]\neditor_font=Monospace 16\nline_wrapping=true\n" > /root/.config/geany/geany.conf
fi
