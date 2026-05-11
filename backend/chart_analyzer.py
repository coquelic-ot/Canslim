"""O'Neil式チャートパターン検出 & 買いポイント算出"""
import numpy as np
import pandas as pd


PATTERN_JP = {
    'cup_with_handle': 'カップウィズハンドル',
    'flat_base':       'フラットベース',
    'double_bottom':   'ダブルボトム',
    'high_tight_flag': 'ハイタイトフラッグ',
}


def analyze(weekly_ohlcv: list[dict], benchmark_closes: pd.Series = None) -> dict:
    """
    週足OHLCVリストからO'Nilパターンを検出し、買いポイントを返す。
    """
    if not weekly_ohlcv or len(weekly_ohlcv) < 10:
        return _empty()

    df = pd.DataFrame(weekly_ohlcv)
    closes  = df['close'].values.astype(float)
    highs   = df['high'].values.astype(float)
    lows    = df['low'].values.astype(float)
    volumes = df['volume'].values.astype(float)

    avg_vol_50 = np.mean(volumes[-50:]) if len(volumes) >= 50 else np.mean(volumes)

    for fn in (_cup_with_handle, _flat_base, _double_bottom, _high_tight_flag):
        result = fn(closes, highs, lows, volumes, avg_vol_50)
        if result:
            _add_derived(result, closes, highs, lows, volumes, benchmark_closes)
            return result

    return _add_derived(_empty(), closes, highs, lows, volumes, benchmark_closes)


# ── パターン検出 ──────────────────────────────────────────────

def _cup_with_handle(closes, highs, lows, volumes, avg_vol):
    n = len(closes)
    # カップ幅: 7〜65週
    for cup_len in range(min(50, n - 4), 6, -1):
        s = n - cup_len
        c = closes[s:]; h = highs[s:]; lo = lows[s:]

        # 左ピーク: 最初の1/4
        q = max(2, cup_len // 4)
        left_peak = np.max(h[:q])
        if left_peak == 0:
            continue

        # カップ底
        bottom = np.min(lo)
        depth  = (left_peak - bottom) / left_peak

        # 深さ: 12〜35%
        if not (0.12 <= depth <= 0.35):
            continue

        # 右側の回復: 底からの回復率 ≥ 85%
        right_high = np.max(h[-q:])
        recovery   = (right_high - bottom) / (left_peak - bottom)
        if recovery < 0.85:
            continue

        # ハンドル: 最後の1〜6週、深さ≤15%
        hl = min(6, q)
        handle_high = np.max(h[-hl:])
        handle_low  = np.min(lo[-hl:])
        handle_depth = (handle_high - handle_low) / handle_high if handle_high else 0
        if handle_depth > 0.15:
            continue

        pivot = round(handle_high + 0.10, 2)
        return _result('cup_with_handle', pivot, cup_len, round(depth * 100, 1),
                       volumes[-1] / avg_vol if avg_vol else 1)
    return None


def _flat_base(closes, highs, lows, volumes, avg_vol):
    n = len(closes)
    # 最長のフラット期間を探す（最低5週）
    for start in range(max(0, n - 20), n - 5):
        ph = np.max(highs[start:])
        pl = np.min(lows[start:])
        if ph == 0:
            continue
        depth = (ph - pl) / ph
        weeks = n - start
        if depth <= 0.15 and weeks >= 5:
            pivot = round(ph + 0.10, 2)
            return _result('flat_base', pivot, weeks, round(depth * 100, 1),
                           volumes[-1] / avg_vol if avg_vol else 1)
    return None


def _double_bottom(closes, highs, lows, volumes, avg_vol):
    n = min(26, len(closes))
    half = n // 2
    if half < 3:
        return None

    lo1 = np.min(lows[-n:-half])
    lo2 = np.min(lows[-half:])
    if lo1 == 0 or lo2 == 0:
        return None

    # 2つの底の差 ≤ 3%
    if abs(lo1 - lo2) / lo1 > 0.03:
        return None

    # 中間ピーク
    mid_peak = np.max(highs[-n + np.argmin(lows[-n:-half]):-half + np.argmin(lows[-half:])] or highs[-n:-half])
    depth = (mid_peak - min(lo1, lo2)) / mid_peak if mid_peak else 0
    pivot = round(mid_peak + 0.10, 2)
    return _result('double_bottom', pivot, n, round(depth * 100, 1),
                   volumes[-1] / avg_vol if avg_vol else 1)


def _high_tight_flag(closes, highs, lows, volumes, avg_vol):
    n = len(closes)
    if n < 12:
        return None
    # 直近8週で100%以上の上昇があるか
    for flag_start in range(max(8, n - 13), n - 3):
        run_low  = np.min(closes[flag_start - 8:flag_start])
        run_high = np.max(highs[flag_start - 8:flag_start])
        if run_low == 0 or (run_high - run_low) / run_low < 1.0:
            continue

        # フラッグ: 3〜5週、10〜25%押し
        flag_low = np.min(lows[flag_start:])
        pullback = (run_high - flag_low) / run_high
        if 0.10 <= pullback <= 0.25:
            pivot = round(run_high + 0.10, 2)
            return _result('high_tight_flag', pivot, n - flag_start,
                           round(pullback * 100, 1),
                           volumes[-1] / avg_vol if avg_vol else 1)
    return None


# ── ヘルパー ─────────────────────────────────────────────────

def _result(pattern, pivot, base_weeks, depth_pct, vol_ratio):
    return {
        'pattern':               pattern,
        'patternJp':             PATTERN_JP[pattern],
        'pivot':                 pivot,
        'buyZoneLow':            pivot,
        'buyZoneHigh':           round(pivot * 1.05, 2),
        'baseWeeks':             base_weeks,
        'baseDepthPct':          depth_pct,
        'breakoutVolumeRatio':   round(vol_ratio, 2),
    }


def _empty():
    return {
        'pattern': None, 'patternJp': None,
        'pivot': None, 'buyZoneLow': None, 'buyZoneHigh': None,
        'baseWeeks': None, 'baseDepthPct': None, 'breakoutVolumeRatio': None,
        'maStatus': None, 'rsLineTrend': None, 'priceVsPivotPct': None,
        'buySituation': None,
    }


def _add_derived(result, closes, highs, lows, volumes, benchmark):
    """MA状況・RSライン・現値vsピボット・買い状況を追加"""
    n = len(closes)
    cur = closes[-1]

    # 移動平均
    ma50  = float(np.mean(closes[-50:])) if n >= 50 else None
    ma200 = float(np.mean(closes[-200:])) if n >= 200 else None
    if ma50 and ma200:
        if cur > ma50 > ma200:
            result['maStatus'] = 'above_both'
        elif cur > ma50:
            result['maStatus'] = 'above_50'
        elif cur < ma50:
            result['maStatus'] = 'below_50'

    # RSラインのトレンド（直近4週 vs 直近12週の傾き）
    if benchmark is not None and len(benchmark) >= 12 and n >= 12:
        try:
            rs_vals = np.array(closes[-12:]) / benchmark.values[-12:]
            recent4 = np.polyfit(range(4), rs_vals[-4:], 1)[0]
            result['rsLineTrend'] = 'rising' if recent4 > 0 else 'falling'
        except Exception:
            pass

    # 現値 vs ピボット
    pivot = result.get('pivot')
    if pivot and pivot > 0:
        pct = round((cur - pivot) / pivot * 100, 1)
        result['priceVsPivotPct'] = pct
        if -10 <= pct < 0:
            result['buySituation'] = 'approaching'  # ピボットまであと少し
        elif 0 <= pct <= 5:
            result['buySituation'] = 'in_buy_zone'  # 買いゾーン内 ✅
        elif pct > 5:
            result['buySituation'] = 'extended'     # 買いゾーン超過
        else:
            result['buySituation'] = 'forming'      # ベース形成中
    else:
        result['priceVsPivotPct'] = None
        result['buySituation']    = 'no_pattern'

    return result
