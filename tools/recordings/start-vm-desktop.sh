#!/usr/bin/env bash
set -euo pipefail
# DISPLAY :99 is private to the guest. Do not use WSLg/host desktop displays.
unset WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS XDG_RUNTIME_DIR
export DISPLAY=:99 LANG=C.UTF-8 GDK_BACKEND=x11 QT_QPA_PLATFORM=xcb
mkdir -p /opt/recording/logs
if ! pgrep -f 'Xvfb :99' >/dev/null; then
  # A stopped disposable VM can leave X11 locks although its server is gone.
  rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
  Xvfb :99 -screen 0 1440x900x24 -nolisten tcp >/opt/recording/logs/display.log 2>&1 &
fi
for attempt in {1..50}; do
  if xdpyinfo -display :99 >/dev/null 2>&1; then break; fi
  sleep 0.2
done
xdpyinfo -display :99 >/dev/null
if ! pgrep -x openbox >/dev/null; then nohup openbox >/opt/recording/logs/desktop.log 2>&1 </dev/null & fi
sleep 0.5
xsetroot -solid '#243343'
if ! curl -fsS http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
  nohup chromium --ozone-platform=x11 --no-sandbox --disable-dev-shm-usage --disable-gpu --no-first-run --no-default-browser-check --disable-features=Translate,TranslateUI --lang=en-US --password-store=basic --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir=/opt/recording/browser --window-position=40,20 --window-size=1360,855 about:blank >/opt/recording/logs/browser.log 2>&1 </dev/null &
fi
for attempt in {1..50}; do
  if curl -fsS http://127.0.0.1:9222/json/version >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -fsS http://127.0.0.1:9222/json/version >/dev/null
if [ "${1:-}" = '--keep-alive' ]; then exec sleep infinity; fi
