"""
CAN SLIM バックエンド HTTP サーバー
ポート 8888 で待ち受け、Webアプリから /api/run でmain.pyを起動する

起動方法:
  cd ~/Canslim/backend
  source .venv/bin/activate
  python server.py
"""
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT    = 8888
BACKEND = Path(__file__).parent

# ── 実行状態管理 ──────────────────────────────────────────────
state = {
    'running':   False,
    'log':       [],
    'exit_code': None,
    'stocks':    0,
    'started_at': None,
}
state_lock = threading.Lock()


def _run_main():
    """main.py をサブプロセスで実行し、出力をstateに蓄積する"""
    with state_lock:
        state['running']  = True
        state['log']      = []
        state['exit_code'] = None
        state['stocks']   = 0
        state['started_at'] = time.time()

    python = sys.executable
    proc = subprocess.Popen(
        [python, str(BACKEND / 'main.py'), str(BACKEND / 'config.yaml')],
        cwd=str(BACKEND),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    for line in proc.stdout:
        line = line.rstrip()
        with state_lock:
            state['log'].append(line)
        # 銘柄数を抽出
        if '銘柄取得' in line or '=== 完了 ===' in line:
            pass
        if line.startswith('=== 完了'):
            pass

    proc.wait()

    with state_lock:
        state['running']   = False
        state['exit_code'] = proc.returncode
        # 出力から銘柄数を抽出
        for l in reversed(state['log']):
            if '銘柄取得' in l:
                try:
                    state['stocks'] = int(l.split()[1].replace('銘柄', ''))
                except Exception:
                    pass
                break


# ── HTTP ハンドラ ─────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # アクセスログを抑制

    def _send_json(self, code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type',  'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/status'):
            with state_lock:
                data = dict(state)
            self._send_json(200, data)
        else:
            self._send_json(404, {'error': 'not found'})

    def do_POST(self):
        if self.path.startswith('/api/run'):
            with state_lock:
                already = state['running']

            if already:
                self._send_json(409, {'error': 'already running'})
                return

            t = threading.Thread(target=_run_main, daemon=True)
            t.start()
            self._send_json(200, {'status': 'started'})
        else:
            self._send_json(404, {'error': 'not found'})


# ── エントリポイント ──────────────────────────────────────────
if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    print(f'CAN SLIM バックエンドサーバー起動: http://localhost:{PORT}')
    print('停止: Ctrl+C')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n停止しました')
