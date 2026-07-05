#!/bin/bash
# CAN SLIM バックエンド 実行スクリプト
# Mac の crontab に登録: 0 7 * * 1-5 /path/to/backend/run.sh
# （平日 朝7時実行）

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Python仮想環境（初回: python3 -m venv .venv && pip install -r requirements.txt）
source .venv/bin/activate

# Playwright ブラウザ（初回: playwright install chromium）
export PLAYWRIGHT_BROWSERS_PATH="$DIR/.playwright"

python main.py config.yaml >> "$DIR/logs/run.log" 2>&1
