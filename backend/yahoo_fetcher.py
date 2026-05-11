"""Yahoo Finance からOHLCV・財務データを取得"""
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


def fetch_stock(ticker: str, weeks: int = 52) -> dict:
    """1銘柄分の全データを取得して返す"""
    try:
        t = yf.Ticker(ticker)
        weekly = _fetch_weekly(t, weeks)
        financials = _fetch_financials(t)
        price_info = _fetch_price(t)
        return {**price_info, **financials, 'weekly_ohlcv': weekly}
    except Exception as e:
        print(f'[Yahoo] {ticker}: {e}')
        return {}


def fetch_benchmark(weeks: int = 52) -> pd.Series:
    """S&P500週足終値を返す（RS計算用）"""
    try:
        sp = yf.Ticker('^GSPC')
        df = sp.history(period=f'{weeks + 4}wk', interval='1wk')
        return df['Close'].dropna()
    except Exception:
        return pd.Series(dtype=float)


def _fetch_weekly(t: yf.Ticker, weeks: int) -> list[dict]:
    df = t.history(period=f'{weeks + 4}wk', interval='1wk')
    if df.empty:
        return []
    df = df.dropna(subset=['Close'])
    return [
        {
            'date':   str(idx.date()),
            'open':   round(float(row['Open']),   2),
            'high':   round(float(row['High']),   2),
            'low':    round(float(row['Low']),    2),
            'close':  round(float(row['Close']),  2),
            'volume': int(row['Volume']),
        }
        for idx, row in df.iterrows()
    ]


def _fetch_financials(t: yf.Ticker) -> dict:
    result = {}
    try:
        info = t.info
        # 企業情報
        result['companyName'] = info.get('longName') or info.get('shortName', '')
        result['businessDesc'] = _trim_desc(info.get('longBusinessSummary', ''))

        # 財務指標
        if (v := info.get('earningsGrowth')) is not None:
            result['qEpsGrowth'] = round(v * 100)
        if (v := info.get('revenueGrowth')) is not None:
            result['salesGrowth'] = round(v * 100)
        if (v := info.get('returnOnEquity')) is not None:
            result['roe'] = round(v * 100)
        if (v := info.get('floatShares')) is not None:
            result['floatShares'] = round(v / 1e6)
        if (v := info.get('heldPercentInstitutions')) is not None:
            result['instOwnership'] = round(v * 100)

        # 52週高値比
        price  = info.get('currentPrice') or info.get('regularMarketPrice')
        high52 = info.get('fiftyTwoWeekHigh')
        if price and high52 and high52 > 0:
            result['fromHigh52w'] = max(0, round((high52 - price) / high52 * 100))

        # 年間EPS成長率（収益履歴から計算）
        _add_annual_eps(t, result)

    except Exception as e:
        print(f'[Yahoo financials] {e}')
    return result


def _add_annual_eps(t: yf.Ticker, result: dict):
    try:
        history = t.income_stmt
        if history is None or history.empty:
            return
        net = history.loc['Net Income'] if 'Net Income' in history.index else None
        if net is None:
            return
        vals = net.dropna().values
        if len(vals) >= 2 and vals[-1] > 0:
            years = len(vals) - 1
            cagr = (vals[0] / vals[-1]) ** (1 / years) - 1
            result['annualEpsGrowth'] = round(cagr * 100)
            streak = sum(1 for v in vals if v > 0)
            result['consecutiveYears'] = streak
    except Exception:
        pass


def _fetch_price(t: yf.Ticker) -> dict:
    try:
        info = t.info
        price = info.get('currentPrice') or info.get('regularMarketPrice')
        return {'currentPrice': round(float(price), 2) if price else None}
    except Exception:
        return {}


def _trim_desc(text: str) -> str:
    if not text:
        return ''
    cut = text.find('. ', 40)
    return text[:cut + 1] if cut > 0 else text[:120] + ('…' if len(text) > 120 else '')
