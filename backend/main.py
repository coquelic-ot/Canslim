"""
CAN SLIM バックエンド — メインスクリプト
毎朝実行: IBD50取得 → Yahoo Finance → チャート分析 → JSON出力
"""
import json
import sys
import time
import base64
import requests
from datetime import datetime
from pathlib import Path

import yaml

from ibd_scraper   import get_ibd50
from yahoo_fetcher import fetch_stock, fetch_benchmark
import chart_analyzer


def load_config(path='config.yaml') -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def run(config: dict):
    print(f'=== CAN SLIM バックエンド {datetime.now().strftime("%Y-%m-%d %H:%M")} ===')

    # ① IBD50 取得
    print('\n① IBD50 取得中...')
    ibd_stocks = get_ibd50(
        config['ibd']['email'],
        config['ibd']['password'],
    )
    print(f'   {len(ibd_stocks)} 銘柄取得')

    # ② S&P500 週足（RSライン計算用）
    print('\n② ベンチマーク取得中...')
    benchmark = fetch_benchmark(config['settings']['history_weeks'])

    # ③ 各銘柄: Yahoo Finance + チャート分析
    print('\n③ 銘柄データ取得・分析中...')
    results = []
    for stock in ibd_stocks:
        ticker = stock['ticker']
        print(f'   {ticker}...', end=' ', flush=True)

        yahoo = fetch_stock(ticker, config['settings']['history_weeks'])
        chart = chart_analyzer.analyze(yahoo.pop('weekly_ohlcv', []), benchmark)

        entry = {
            **stock,
            **{k: v for k, v in yahoo.items() if k != 'weekly_ohlcv'},
            'chart': chart,
        }
        results.append(entry)
        print(_status_icon(chart))
        time.sleep(0.5)  # レート制限対策

    # ④ ランキング（compositeRating 優先、なければ chart buySituation）
    results.sort(key=_sort_key, reverse=True)

    # ⑤ 出力
    payload = {
        'updated':  datetime.now().isoformat(),
        'stocks':   results,
    }

    out_path = Path(__file__).parent / 'output' / 'canslim.json'
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f'\n④ JSON 保存: {out_path}')

    # ⑥ GitHub へアップロード
    gh = config.get('github', {})
    if gh.get('token') and gh['token'] != 'ghp_xxxxxxxxxxxxxxxxxxxx':
        print('\n⑤ GitHub へアップロード中...')
        _upload_to_github(payload, gh)
    else:
        print('\n⑤ GitHub トークン未設定 — ローカル保存のみ')

    print('\n=== 完了 ===')
    _print_summary(results)


# ── ヘルパー ─────────────────────────────────────────────────

def _sort_key(s: dict) -> tuple:
    situation = s.get('chart', {}).get('buySituation', '')
    priority  = {'in_buy_zone': 3, 'approaching': 2, 'forming': 1}.get(situation, 0)
    comp      = s.get('compositeRating') or 0
    return (priority, comp)


def _status_icon(chart: dict) -> str:
    sit = chart.get('buySituation', '')
    if sit == 'in_buy_zone':  return '🟢 買いゾーン'
    if sit == 'approaching':  return '🟡 接近中'
    if sit == 'forming':      return '⬜ 形成中'
    if sit == 'extended':     return '🔴 超過'
    return '—'


def _print_summary(results: list[dict]):
    print('\n【結果サマリー】')
    print(f'{"#":<4} {"Ticker":<8} {"パターン":<20} {"ピボット":>8} {"状況":<12}')
    print('-' * 60)
    for i, s in enumerate(results[:10], 1):
        ch   = s.get('chart', {})
        pat  = ch.get('patternJp') or '—'
        piv  = f"${ch['pivot']:.2f}" if ch.get('pivot') else '—'
        sit  = _status_icon(ch)
        print(f"{i:<4} {s['ticker']:<8} {pat:<20} {piv:>8} {sit}")


def _upload_to_github(payload: dict, gh: dict):
    api  = f"https://api.github.com/repos/{gh['owner']}/{gh['repo']}/contents/{gh['output_path']}"
    hdrs = {'Authorization': f"token {gh['token']}", 'Accept': 'application/vnd.github.v3+json'}

    # 既存ファイルのSHAを取得
    sha = None
    r   = requests.get(api, headers=hdrs)
    if r.status_code == 200:
        sha = r.json().get('sha')

    content = base64.b64encode(
        json.dumps(payload, ensure_ascii=False, indent=2).encode()
    ).decode()

    body = {
        'message': f'Auto-update CAN SLIM data {datetime.now().strftime("%Y-%m-%d")}',
        'content': content,
        'branch':  gh['branch'],
    }
    if sha:
        body['sha'] = sha

    r = requests.put(api, headers=hdrs, json=body)
    if r.status_code in (200, 201):
        print('   ✅ アップロード成功')
    else:
        print(f'   ❌ アップロード失敗: {r.status_code} {r.text[:200]}')


if __name__ == '__main__':
    cfg_path = sys.argv[1] if len(sys.argv) > 1 else 'config.yaml'
    run(load_config(cfg_path))
