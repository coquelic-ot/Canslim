"""IBD Digital scraper — IBD50リストとレーティングを取得"""
import asyncio
import re
from playwright.async_api import async_playwright


IBD50_URL = 'https://www.investors.com/stock-lists/ibd-50/ibd-50-stock-list/'
LOGIN_URL  = 'https://www.investors.com/wp-login.php'


class IBDScraper:
    def __init__(self, email: str, password: str):
        self.email    = email
        self.password = password

    async def get_ibd50(self) -> list[dict]:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            ctx     = await browser.new_context(
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                           'AppleWebKit/537.36 (KHTML, like Gecko) '
                           'Chrome/120.0.0.0 Safari/537.36'
            )
            page = await ctx.new_page()
            await self._login(page)
            stocks = await self._scrape_ibd50(page)
            await browser.close()
            return stocks

    async def _login(self, page):
        await page.goto(LOGIN_URL, wait_until='networkidle')
        await page.fill('#user_login',    self.email)
        await page.fill('#user_pass',     self.password)
        await page.click('#wp-submit')
        await page.wait_for_load_state('networkidle')

    async def _scrape_ibd50(self, page) -> list[dict]:
        await page.goto(IBD50_URL, wait_until='networkidle')
        # ページが完全に描画されるまで待機
        await page.wait_for_timeout(3000)

        stocks = []
        rows = await page.query_selector_all('table tbody tr')

        for row in rows:
            cells = await row.query_selector_all('td')
            if len(cells) < 6:
                continue
            try:
                texts = [await c.inner_text() for c in cells]
                stock = self._parse_row(texts)
                if stock:
                    stocks.append(stock)
            except Exception:
                continue

        # テーブル形式が取れなかった場合はJSONエンドポイントを試みる
        if not stocks:
            stocks = await self._try_json_endpoint(page)

        return stocks

    def _parse_row(self, texts: list[str]) -> dict | None:
        """テーブル行をパース。列順はIBDサイトの構成に依存。"""
        # 列: Rank | Ticker | CompSite | EPS | RS | SMR | A/D | ...
        def clean(s): return s.strip().replace('\n', ' ')
        def to_int(s):
            m = re.search(r'\d+', s)
            return int(m.group()) if m else None

        rank_str   = clean(texts[0]) if len(texts) > 0 else ''
        ticker_raw = clean(texts[1]) if len(texts) > 1 else ''
        comp_str   = clean(texts[2]) if len(texts) > 2 else ''
        eps_str    = clean(texts[3]) if len(texts) > 3 else ''
        rs_str     = clean(texts[4]) if len(texts) > 4 else ''
        smr_str    = clean(texts[5]) if len(texts) > 5 else ''
        ad_str     = clean(texts[6]) if len(texts) > 6 else ''

        rank   = to_int(rank_str)
        ticker = re.sub(r'\s+', '', ticker_raw).upper()

        if not ticker or not re.match(r'^[A-Z]{1,5}$', ticker):
            return None

        return {
            'rank':            rank,
            'ticker':          ticker,
            'compositeRating': to_int(comp_str),
            'epsRating':       to_int(eps_str),
            'rsRating':        to_int(rs_str),
            'smrRating':       smr_str[0].upper() if smr_str else None,
            'adRating':        ad_str[0].upper()  if ad_str  else None,
        }

    async def _try_json_endpoint(self, page) -> list[dict]:
        """IBDサイトが内部JSONエンドポイントを持つ場合のフォールバック"""
        try:
            response = await page.request.get(
                'https://www.investors.com/wp-json/ibd/v1/ibd50',
                headers={'Accept': 'application/json'}
            )
            if response.ok:
                data = await response.json()
                return [self._parse_json_item(item) for item in data if item]
        except Exception:
            pass
        return []

    def _parse_json_item(self, item: dict) -> dict:
        return {
            'rank':            item.get('rank'),
            'ticker':          item.get('symbol', '').upper(),
            'compositeRating': item.get('compositeRating'),
            'epsRating':       item.get('epsRating'),
            'rsRating':        item.get('rsRating'),
            'smrRating':       item.get('smrRating'),
            'adRating':        item.get('accDisRating'),
        }


def get_ibd50(email: str, password: str) -> list[dict]:
    return asyncio.run(IBDScraper(email, password).get_ibd50())
