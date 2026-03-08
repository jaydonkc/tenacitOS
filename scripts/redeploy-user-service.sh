#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

npm run build
systemctl --user restart mission-control.service
systemctl --user --no-pager status mission-control.service
