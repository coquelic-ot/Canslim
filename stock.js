// ============================================================
//  stock.js — CAN SLIM 銘柄チェッカー
// ============================================================

// ── STATE ───────────────────────────────────────────────────
const app = {
  marketTrend:   localStorage.getItem('canslim-market')  || '',
  top50Slots:    [null, null, null, null],
  stocks:        [],
  analyses:      {},
  history:       JSON.parse(localStorage.getItem('canslim-history') || '[]'),
  holdings:      new Set(JSON.parse(localStorage.getItem('canslim-holdings') || '[]')),
  holdingsImage: localStorage.getItem('canslim-holdings-image') || null,
  backendData:     {},      // ticker → バックエンドJSON (レーティング+Yahoo+チャート)
  backendMeta:     null,    // { updated: ISO文字列 }
  backendHoldings: [],      // Moomoo保有銘柄リスト
  sellHistory:     [],      // Moomoo売り約定履歴 [{ticker, price, qty, date}]
};

const CRITERIA = ['C','A','N','S','L','I','M'];
const SECTOR_META = {
  'Technology':            { icon: '💻', label: 'テック',     color: '#dbeafe', text: '#1e40af' },
  'Healthcare':            { icon: '🏥', label: 'ヘルス',     color: '#dcfce7', text: '#166534' },
  'Financial Services':    { icon: '🏦', label: '金融',       color: '#fef9c3', text: '#854d0e' },
  'Consumer Cyclical':     { icon: '🛍️', label: '消費財',    color: '#fce7f3', text: '#9d174d' },
  'Consumer Defensive':    { icon: '🛒', label: '生活必需品', color: '#f0fdf4', text: '#14532d' },
  'Energy':                { icon: '⚡', label: 'エネルギー', color: '#fef3c7', text: '#92400e' },
  'Basic Materials':       { icon: '⛏️', label: '素材',      color: '#fdf4ff', text: '#6b21a8' },
  'Industrials':           { icon: '🏭', label: '産業',       color: '#f1f5f9', text: '#334155' },
  'Real Estate':           { icon: '🏠', label: '不動産',     color: '#fff7ed', text: '#9a3412' },
  'Communication Services':{ icon: '📡', label: '通信',       color: '#eff6ff', text: '#1d4ed8' },
  'Utilities':             { icon: '💡', label: '公益',       color: '#fafaf9', text: '#44403c' },
};
// 後方互換: 文字列ラベルだけ欲しい箇所用
const SECTOR_LABEL = Object.fromEntries(Object.entries(SECTOR_META).map(([k,v]) => [k, v.label]));
const CRITERIA_LABELS = {
  C: '直近四半期EPS',
  A: '年間EPS成長率',
  N: '新製品・新経営陣',
  S: '需給',
  L: 'RS（相対強度）',
  I: '機関投資家',
  M: '市場の方向性',
};

// ── SCORING ─────────────────────────────────────────────────

function scoreC(a) {
  const parts = [];
  if (a.epsRating != null)    parts.push({ v: a.epsRating,   w: 0.6 });
  if (a.qEpsGrowth != null)   parts.push({ v: mapEpsGrowth(a.qEpsGrowth), w: 0.25 });
  if (a.salesGrowth != null)  parts.push({ v: mapSalesGrowth(a.salesGrowth), w: 0.15 });
  return wAvg(parts);
}

function scoreA(a) {
  const parts = [];
  if (a.annualEpsGrowth != null) parts.push({ v: mapAnnualEps(a.annualEpsGrowth), w: 0.5 });
  if (a.roe != null)             parts.push({ v: mapRoe(a.roe),   w: 0.3 });
  if (a.consecutiveYears != null) parts.push({ v: mapConsecYears(a.consecutiveYears), w: 0.2 });
  return wAvg(parts);
}

function scoreN(a) {
  const hasAny = a.hasNewProduct || a.hasNewMgmt || a.fromHigh52w != null ||
                 a.chartPatterns?.some(Boolean);
  if (!hasAny) return null;
  let s = 0;
  if (a.hasNewProduct) s += 20;
  if (a.hasNewMgmt)    s += 10;
  if (a.fromHigh52w != null) {
    if      (a.fromHigh52w <= 5)  s += 50;
    else if (a.fromHigh52w <= 15) s += 40;
    else if (a.fromHigh52w <= 25) s += 25;
    else if (a.fromHigh52w <= 35) s += 10;
  }
  if (a.chartPatterns?.some(Boolean)) s += 20;
  return Math.min(100, s);
}

function scoreS(a) {
  const parts = [];
  if (a.adRating != null) {
    const map = { A:100, B:75, C:50, D:25, E:0 };
    parts.push({ v: map[a.adRating] ?? 50, w: 0.5 });
  }
  if (a.upDownVolRatio != null) parts.push({ v: mapVolRatio(a.upDownVolRatio), w: 0.3 });
  if (a.floatShares != null)    parts.push({ v: mapFloat(a.floatShares), w: 0.2 });
  return wAvg(parts);
}

function scoreL(a) {
  const parts = [];
  const rs = a.rsRating ?? a.rsProxy; // rsRating preferred; Yahoo relative-strength proxy as fallback
  if (rs != null)              parts.push({ v: rs,                    w: 0.7 });
  if (a.industryRank != null)  parts.push({ v: Math.max(0,100-a.industryRank), w: 0.3 });
  return wAvg(parts);
}

function scoreI(a) {
  const parts = [];
  if (a.smrRating != null) {
    const map = { A:100, B:75, C:50, D:25, E:0 };
    parts.push({ v: map[a.smrRating] ?? 50, w: 0.3 });
  }
  if (a.instOwnership != null) parts.push({ v: mapInstOwn(a.instOwnership), w: 0.3 });
  if (a.instTrend)             parts.push({ v: mapInstTrend(a.instTrend), w: 0.4 });
  return wAvg(parts);
}

function scoreM(_a) {
  if (!app.marketTrend) return null;
  return { bull:100, neutral:50, bear:0 }[app.marketTrend] ?? null;
}

function calculateScores(a) {
  const s = {
    C: scoreC(a), A: scoreA(a), N: scoreN(a),
    S: scoreS(a), L: scoreL(a), I: scoreI(a),
    M: scoreM(a),
  };
  const vals = Object.values(s).filter(v => v != null);
  if (vals.length < 3) { s.total = null; s._scoredCount = vals.length; return s; }

  const avg = vals.reduce((x,y) => x+y, 0) / vals.length;

  // O'Neil 哲学: 赤（< 40）があると大きく減点 — 弱点ゼロが最重要
  const redPenalty = vals
    .filter(v => v < 40)
    .reduce((sum, v) => sum + (40 - v) * 0.7, 0);

  // 全項目が緑（≥ 70）なら +5 ボーナス
  const allGreen = vals.every(v => v >= 70);

  s.total = Math.min(100, Math.max(0, Math.round(avg - redPenalty + (allGreen ? 5 : 0))));
  s._scoredCount = vals.length;
  return s;
}

// ── Mapping helpers ──────────────────────────────────────────
function mapEpsGrowth(v)  {
  if (v >= 100) return 100; if (v >= 50) return 90; if (v >= 25) return 72;
  if (v >= 10)  return 50;  if (v >= 0)  return 28;  return 8;
}
function mapSalesGrowth(v) {
  if (v >= 25) return 100; if (v >= 15) return 75; if (v >= 5) return 45;
  if (v >= 0)  return 22;  return 5;
}
function mapAnnualEps(v)  {
  if (v >= 35) return 100; if (v >= 25) return 80; if (v >= 15) return 58;
  if (v >= 0)  return 28;  return 8;
}
function mapRoe(v)  {
  if (v >= 25) return 100; if (v >= 17) return 80; if (v >= 12) return 60;
  if (v >= 5)  return 35;  return 10;
}
function mapConsecYears(v) {
  if (v >= 5) return 100; if (v >= 3) return 80; if (v >= 2) return 50;
  if (v >= 1) return 25;  return 0;
}
function mapVolRatio(v)   {
  if (v >= 2.0) return 100; if (v >= 1.5) return 80; if (v >= 1.2) return 60;
  if (v >= 1.0) return 45;  if (v >= 0.8) return 32;  return 18;
}
function mapFloat(v)      {
  // 大型株（浮動株多い）でも極端に低くなりすぎないよう対数スケールに近い設定
  if (v <= 10)   return 100; if (v <= 50)   return 85; if (v <= 150)  return 68;
  if (v <= 500)  return 52;  if (v <= 2000) return 38; return 28;
}
function mapInstOwn(v)    {
  if (v >= 20 && v <= 55) return 90;
  if (v >= 10 && v <= 65) return 70;
  if (v >= 5)              return 40;
  return 15;
}
function mapInstTrend(v)  { return { increasing:100, stable:50, decreasing:0 }[v] ?? 50; }

function wAvg(parts) {
  if (!parts.length) return null;
  const tw = parts.reduce((s,p)=>s+p.w, 0);
  return Math.round(parts.reduce((s,p)=>s+p.v*p.w, 0) / tw);
}

function scoreClass(v) {
  if (v == null) return 'na';
  if (v >= 70)   return 'pass';
  if (v >= 40)   return 'warn';
  return 'fail';
}

// 数値 0-100 を連続的な色強度のインラインスタイルに変換
function scoreColorStyle(v) {
  if (v == null) return 'background:#f1f5f9;color:#94a3b8;';
  if (v >= 70) {
    const d = Math.min(1, (v - 70) / 30);
    const l = Math.round(52 - d * 20);
    const s = Math.round(50 + d * 40);
    return `background:hsl(142,${s}%,${l}%);color:#fff;`;
  }
  if (v >= 40) {
    const d = (v - 40) / 30;
    return `background:hsl(48,${Math.round(65 + d * 25)}%,${Math.round(76 - d * 10)}%);color:#78350f;`;
  }
  const d = v / 40;
  return `background:hsl(0,${Math.round(55 + d * 25)}%,${Math.round(90 - d * 15)}%);color:#991b1b;`;
}

// ── TICKER PARSING ───────────────────────────────────────────
// Moomoo保有銘柄テキスト専用パーサー
// 「大文字2〜5字 → 数字（数量/価格）」の行パターンのみをティッカーと判定
function parseMoomooText(text) {
  const SKIP = new Set([
    'MV','QTY','PL','SG','SGD','USD','HKD','CNY','GBP','EUR','JPY','AUD','CAD','CHF',
    'KRW','TWD','INR','BRL','NZD',
    'ETF','INC','LLC','CORP','LTD','THE','AND','FOR','NYSE','AMEX','NASDAQ','OTC',
    'TECH','TRADE','SEMI','INFR','ENVIR','SERV','TEC',
    'SCR','TOP','CHG','VOL','PRI','EPS','RS','SMR','COMP','YTD','QTR','PCT',
    'AVG','MKT','CAP','SHS','EST','REV','NET','OPR','RANK','DAY','WK','MO','YR',
    'ROE','ROA','DIV','ATH','ATL','IPO','CAN','SLIM','HOLD','SELL','OPEN','CLOSE',
  ]);
  const seen = new Set();
  const result = [];
  // ティッカーの直後にスペース＋数字（数量や価格）が来るパターン
  const re = /(?:^|[\s,])([A-Z]{2,5})\s+[\d,]+\.?\d*/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[1];
    if (!SKIP.has(t) && !seen.has(t)) { seen.add(t); result.push(t); }
  }
  // 見つからなければ汎用パーサーにフォールバック
  if (!result.length) {
    return parseTickerText(text, false).map(s => typeof s === 'object' ? s.ticker : s);
  }
  return result;
}

// strictMode=true: ランク+ティッカー行のみ（OCR用）
// strictMode=false: スペース・カンマ区切りも受け入れる（手動入力用）
function parseTickerText(text, strictMode = false) {
  const SKIP = new Set([
    'SCR','TOP','CHG','VOL','PRI','THE','AND','FOR','USD','ETF','INC','LLC',
    'NEW','HIGH','LOW','BUY','PRICE','EPS','RS','SMR','COMP','YTD','QTR',
    'PCT','AVG','MKT','CAP','SHS','EST','REV','NET','OPR','RANK','DAY',
    'WK','MO','YR','ALL','RTG','ADJ','DIV','ROE','ROA','SMA','ATH','ATL',
    'IPO','CEO','CFO','USA','NYSE','AMEX','OTC','ADR','REIT','MLP','SPAC',
    'CAN','SLIM','TOP50','STOCK','SHARE','FUND','HOLD','SELL','OPEN','CLOSE',
    // スクリーナーページでよく出る列ヘッダ・語句
    'SALES','PROFIT','MARGIN','GROWTH','RETURN','RATING','ANNUAL','GROUP',
    'WEEKLY','DAILY','CHART','TRADE','LAST','GAIN','LOSS','TOTAL','SECTOR',
    'FLOAT','INST','MGMT','SPONS','INDUS','CLASS','POINT','SCORE','RANK',
  ]);
  const stocks = [];
  const seen   = new Set();
  let autoRank = 1;

  for (const line of text.split(/[\n\r]+/)) {
    const trimmed = line.trim().toUpperCase();
    if (!trimmed) continue;

    // "1 NVDA" or "#3 AAPL" など: ランク付き形式（OCR・手動両方で使用）
    const rankMatch = trimmed.match(/^#?(\d{1,3})\s+([A-Z]{1,5})\b/);
    if (rankMatch) {
      const r = parseInt(rankMatch[1]);
      const t = rankMatch[2];
      if (r >= 1 && r <= 200 && !SKIP.has(t) && !seen.has(t) && /^[A-Z]{1,5}$/.test(t)) {
        seen.add(t);
        stocks.push({ rank: r, ticker: t, companyName: '', compositeRating: null,
                      epsRating: null, rsRating: null, smrRating: null, adRating: null });
      }
      continue;
    }

    // strictMode=falseのみ: ランクなし・カンマ/スペース区切り（手動入力用）
    if (!strictMode) {
      for (const token of trimmed.split(/[,\s]+/)) {
        const t = token.replace(/[^A-Z]/g, '');
        if (!t || t.length < 1 || t.length > 5) continue;
        if (SKIP.has(t) || seen.has(t)) continue;
        if (!/^[A-Z]{1,5}$/.test(t)) continue;
        seen.add(t);
        stocks.push({ rank: autoRank++, ticker: t, companyName: '', compositeRating: null,
                      epsRating: null, rsRating: null, smrRating: null, adRating: null });
      }
    }
  }

  return stocks.sort((a, b) => a.rank - b.rank);
}

// ── FILE HANDLING ────────────────────────────────────────────
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(dataURL, maxW = 600, quality = 0.72) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width  = Math.round(img.width  * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

// ── DEFAULT ANALYSIS OBJECT ──────────────────────────────────
function newAnalysis(ticker, companyName='', rank=null) {
  return {
    ticker, companyName, businessDesc: null, sector: null, industry: null, listRank: rank,
    // Ratings
    compositeRating: null, epsRating: null, rsRating: null,
    smrRating: null, adRating: null,
    // C
    qEpsGrowth: null, salesGrowth: null,
    // A
    annualEpsGrowth: null, roe: null, consecutiveYears: null,
    // N
    hasNewProduct: false, hasNewMgmt: false, fromHigh52w: null,
    // S
    upDownVolRatio: null, floatShares: null,
    // I
    instOwnership: null, instTrend: '',
    // L
    industryRank: null, rsProxy: null,
    // Chart
    chartPatterns: [false,false,false,false,false,false],
    pivotPrice: null, notes: '',
    // Screenshot thumb
    screenshotThumb: null,
    analyzedAt: new Date().toISOString(),
  };
}

// ── RENDERING: IMPORT TAB ────────────────────────────────────
function renderImport() {
  const panel = document.getElementById('tab-import');

  panel.innerHTML = `
    <div class="section">
      <div class="section-header">
        <h2>Step 1 — 銘柄リスト入力</h2>
        <p>証券会社アプリを参考に、ティッカーシンボルを入力してください（最大4スロット）</p>
      </div>

      <div class="slots-grid">
        ${[0,1,2,3].map(i => {
          const slot = app.top50Slots[i];
          return `
            <div class="slot-cell">
              <div class="slot-label">スクショ ${i+1}</div>
              ${slot?.dataURL ? `
                <div class="slot-filled" id="slot-wrap-${i}">
                  <img src="${slot.dataURL}" class="slot-thumb" data-slot-lightbox="${i}" title="タップで拡大" />
                  <div class="slot-info">
                    <span class="${slot.stocks?.length ? 'slot-count' : 'slot-error'}" id="slot-badge-${i}">
                      ${slot.stocks?.length ? `${slot.stocks.length}銘柄 ✓` : '0件'}
                    </span>
                  </div>
                  <label class="slot-reupload" title="差し替え">
                    🔄
                    <input type="file" accept="image/*" class="file-input slot-file" data-slot="${i}" />
                  </label>
                </div>
              ` : `
                <div class="upload-zone slot-upload" id="slot-zone-${i}">
                  <div class="upload-icon" style="font-size:1.4rem;">📸</div>
                  <p class="upload-text" style="font-size:.75rem;">参考写真（任意）</p>
                  <input type="file" accept="image/*" class="file-input slot-file" data-slot="${i}" />
                </div>
              `}
              <textarea
                class="slot-ticker-area"
                data-slot="${i}"
                placeholder="ティッカーを入力&#10;例: NVDA AAPL MSFT&#10;（スペース・カンマ・改行で区切り）"
                rows="3"
              >${esc(slot?.manualText || '')}</textarea>
            </div>
          `;
        }).join('')}
      </div>

      <div id="stock-list-container">
        ${buildStockListHTML()}
      </div>

      <!-- Moomoo保有銘柄 -->
      <div class="holdings-section">
        <div class="holdings-header" id="holdings-toggle" style="cursor:pointer;display:flex;align-items:center;gap:8px;">
          <span style="font-size:1rem;">${(app.holdings.size > 0 || app.holdingsImage) ? '▼' : '▶'}</span>
          <h3 style="margin:0;font-size:.9rem;">📂 保有銘柄インポート（Moomoo）</h3>
          ${app.holdings.size > 0 ? `<span class="holdings-count">${app.holdings.size}銘柄</span>` : ''}
        </div>
        <div class="holdings-body" id="holdings-body" style="${(app.holdings.size > 0 || app.holdingsImage) ? '' : 'display:none;'}">
          <div class="holdings-upload-row">
            ${app.holdingsImage
              ? `<div class="slot-filled" style="width:80px;flex-shrink:0;">
                   <img src="${app.holdingsImage}" class="slot-thumb" id="holdings-img-thumb" title="タップで拡大" style="width:80px;height:auto;" />
                   <label class="slot-reupload" title="差し替え">🔄
                     <input type="file" accept="image/*" id="holdings-file" style="display:none;" />
                   </label>
                 </div>`
              : `<div class="upload-zone slot-upload" style="width:80px;flex-shrink:0;min-height:80px;padding:8px 4px;">
                   <div class="upload-icon" style="font-size:1.2rem;">📸</div>
                   <p class="upload-text" style="font-size:.65rem;margin:2px 0;">スクショ</p>
                   <input type="file" accept="image/*" id="holdings-file" class="file-input" />
                 </div>`
            }
            <div style="flex:1;min-width:0;">
              <p class="setting-hint" style="margin:0 0 6px;">
                ${localStorage.getItem('canslim-vision-key')
                  ? '📸 スクショをアップロード → Vision OCRで自動抽出'
                  : '📸 スクショをアップロード（OCRキー設定時に自動抽出）<br>またはGoogle Lens / Live Textでコピーして下に貼り付け'}
              </p>
              <textarea id="holdings-paste" class="slot-ticker-area" rows="3" placeholder="テキストを貼り付け&#10;例: STRL TSM NVDA MU"></textarea>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap;">
            <button class="btn btn-sm btn-primary" id="parse-holdings-btn">テキストから解析</button>
            <button class="btn btn-sm btn-ghost" id="clear-holdings-btn">クリア</button>
            <span id="holdings-status" style="font-size:.75rem;color:var(--text-2);"></span>
          </div>
          ${app.holdings.size > 0 ? `
            <div class="holdings-tags">
              ${[...app.holdings].sort().map(t => `<span class="holding-tag">${esc(t)}</span>`).join('')}
            </div>` : ''}
        </div>
      </div>
    </div>
  `;

  bindImportEvents();
}

function buildStockListHTML() {
  const hasStocks = app.stocks.length > 0;
  const selCount  = app.stocks.filter(s => s.selected).length;
  if (!hasStocks) {
    return `<p class="import-hint">↑ 上のテキストボックスにティッカーを入力すると、ここにリストが表示されます</p>`;
  }
  return `
    <div class="stock-checklist" style="margin-top:16px;">
      <div class="checklist-header">
        <h3>銘柄リスト（${app.stocks.length}件）</h3>
        <div class="checklist-controls">
          <button class="btn btn-sm btn-ghost" id="sel-all">すべて選択</button>
          <button class="btn btn-sm btn-ghost" id="sel-none">解除</button>
        </div>
      </div>
      <div class="checklist-grid">
        ${app.stocks.map(s => `
          <label class="stock-item ${app.holdings.has(s.ticker) ? 'stock-item-holding' : ''}">
            <input type="checkbox" data-ticker="${esc(s.ticker)}" ${s.selected ? 'checked' : ''} />
            <span class="stock-rank">${s.rank != null ? '#' + s.rank : ''}</span>
            <span class="stock-ticker">${esc(s.ticker)}</span>
            ${app.holdings.has(s.ticker) ? '<span class="badge-holding">保有中</span>' : ''}
            <span class="stock-name">${esc(s.companyName)}</span>
            ${chartBadge(s.ticker)}
          </label>
        `).join('')}
      </div>
      <div class="action-bar">
        <span class="selected-count">${selCount}銘柄を選択中</span>
        <button class="btn btn-primary" id="go-analyze" ${selCount===0?'disabled':''}>
          分析へ進む →
        </button>
      </div>
    </div>
  `;
}

function refreshStockList() {
  const container = document.getElementById('stock-list-container');
  if (container) {
    container.innerHTML = buildStockListHTML();
    bindChecklistEvents();
  }
}

function bindImportEvents() {
  const panel = document.getElementById('tab-import');

  // Slot file inputs
  panel.querySelectorAll('.slot-file').forEach(input => {
    input.addEventListener('change', async e => {
      const file = e.target.files[0];
      const idx  = parseInt(e.target.dataset.slot);
      if (file && !isNaN(idx)) await handleSlotUpload(file, idx);
    });
  });

  // Drag & drop on empty slots
  [0,1,2,3].forEach(i => {
    const zone = document.getElementById(`slot-zone-${i}`);
    if (!zone) return;
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) await handleSlotUpload(file, i);
    });
  });

  // Textarea ticker input — update stock list without re-rendering slots (preserves focus)
  panel.querySelectorAll('.slot-ticker-area').forEach(textarea => {
    textarea.addEventListener('input', e => {
      const idx = parseInt(e.target.dataset.slot);
      if (!app.top50Slots[idx]) {
        app.top50Slots[idx] = { dataURL: null, stocks: [], manualText: '' };
      }
      const slot = app.top50Slots[idx];
      slot.manualText = e.target.value;
      slot.stocks = parseTickerText(e.target.value);
      mergeSlotStocks();
      const badgeEl = document.getElementById(`slot-badge-${idx}`);
      if (badgeEl) {
        const n = slot.stocks.length;
        badgeEl.className = n > 0 ? 'slot-count' : 'slot-error';
        badgeEl.textContent = n > 0 ? `${n}銘柄 ✓` : '0件';
      }
      refreshStockList();
    });
  });

  // Slot image lightbox (tap to view full screenshot)
  panel.querySelectorAll('[data-slot-lightbox]').forEach(img => {
    img.addEventListener('click', () => {
      const idx = parseInt(img.dataset.slotLightbox);
      const url = app.top50Slots[idx]?.dataURL;
      if (url) showLightbox(url);
    });
  });

  bindChecklistEvents();

  // Holdings toggle
  const holdingsToggle = document.getElementById('holdings-toggle');
  const holdingsBody   = document.getElementById('holdings-body');
  if (holdingsToggle && holdingsBody) {
    holdingsToggle.addEventListener('click', () => {
      const open = holdingsBody.style.display !== 'none';
      holdingsBody.style.display = open ? 'none' : '';
      holdingsToggle.querySelector('span').textContent = open ? '▶' : '▼';
    });
  }

  // Holdings image upload + Vision OCR
  document.getElementById('holdings-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    showToast('保有銘柄スクショを読み込み中...');
    const dataURL = await fileToDataURL(file);
    // 圧縮してlocalStorageに保存
    try {
      const compressed = await compressImage(dataURL, 620, 0.75);
      app.holdingsImage = compressed;
      localStorage.setItem('canslim-holdings-image', compressed);
    } catch { app.holdingsImage = null; }
    renderImport();

    const key = localStorage.getItem('canslim-vision-key');
    if (!key) { showToast('APIキー未設定 — テキストを手動で貼り付けてください'); return; }

    showToast('保有銘柄: Vision OCR解析中...');
    try {
      const base64 = dataURL.includes(',') ? dataURL.split(',')[1] : dataURL;
      const resp = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION' }] }] }) }
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const text = json.responses?.[0]?.fullTextAnnotation?.text || '';
      if (!text) throw new Error('テキスト未検出');
      const tickers = parseMoomooText(text);
      if (!tickers.length) throw new Error('ティッカー未検出');
      app.holdings = new Set(tickers.map(s => typeof s === 'object' ? s.ticker : s));
      localStorage.setItem('canslim-holdings', JSON.stringify([...app.holdings]));
      renderImport();
      renderAnalyze();
      showToast(`✓ ${app.holdings.size}銘柄を自動抽出しました`);
    } catch(err) {
      showToast(`OCR失敗 (${err.message}) — テキストを手動で貼り付けてください`);
    }
  });

  // Holdings image lightbox
  document.getElementById('holdings-img-thumb')?.addEventListener('click', () => {
    if (app.holdingsImage) showLightbox(app.holdingsImage);
  });

  // Holdings parse (text)
  document.getElementById('parse-holdings-btn')?.addEventListener('click', () => {
    const text = document.getElementById('holdings-paste')?.value || '';
    const tickers = parseMoomooText(text);
    if (!tickers.length) { showToast('ティッカーが見つかりませんでした'); return; }
    app.holdings = new Set(tickers);
    localStorage.setItem('canslim-holdings', JSON.stringify([...app.holdings]));
    document.getElementById('holdings-status').textContent = `✓ ${app.holdings.size}銘柄を保存`;
    renderImport();
    renderAnalyze();
  });

  document.getElementById('clear-holdings-btn')?.addEventListener('click', () => {
    app.holdings = new Set();
    app.holdingsImage = null;
    localStorage.removeItem('canslim-holdings');
    localStorage.removeItem('canslim-holdings-image');
    renderImport();
    renderAnalyze();
  });
}

function bindChecklistEvents() {
  const panel = document.getElementById('tab-import');
  if (!panel) return;

  document.getElementById('sel-all')?.addEventListener('click', () => {
    app.stocks.forEach(s => s.selected = true);
    refreshStockList();
    scheduleSave();
  });
  document.getElementById('sel-none')?.addEventListener('click', () => {
    app.stocks.forEach(s => s.selected = false);
    refreshStockList();
    scheduleSave();
  });
  panel.querySelectorAll('.stock-item input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', e => {
      const s = app.stocks.find(x => x.ticker === e.target.dataset.ticker);
      if (s) s.selected = e.target.checked;
      const sc = app.stocks.filter(x => x.selected).length;
      const countEl = panel.querySelector('.selected-count');
      const goBtn   = document.getElementById('go-analyze');
      if (countEl) countEl.textContent = `${sc}銘柄を選択中`;
      if (goBtn)   goBtn.disabled = sc === 0;
      scheduleSave();
    });
  });
  document.getElementById('go-analyze')?.addEventListener('click', () => {
    const sel = app.stocks.filter(s => s.selected);
    sel.forEach(s => {
      if (!app.analyses[s.ticker]) {
        app.analyses[s.ticker] = newAnalysis(s.ticker, s.companyName, s.rank);
      }
    });
    switchTab('analyze');
  });
}

async function handleSlotUpload(file, idx) {
  const dataURL = await fileToDataURL(file);
  const existingText = app.top50Slots[idx]?.manualText || '';
  app.top50Slots[idx] = { dataURL, stocks: parseTickerText(existingText), manualText: existingText };
  mergeSlotStocks();
  renderImport();

  const key = localStorage.getItem('canslim-vision-key');
  if (!key) return;

  showToast(`スクショ${idx+1}: OCR解析中...`);
  try {
    const base64 = dataURL.includes(',') ? dataURL.split(',')[1] : dataURL;
    const resp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION' }] }],
        }),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }
    const json = await resp.json();
    const text = json.responses?.[0]?.fullTextAnnotation?.text || '';
    if (!text) { showToast(`スクショ${idx+1}: テキストが検出されませんでした`); return; }

    const stocks = parseTickerText(text, true); // strictMode: ランク+ティッカーのみ
    app.top50Slots[idx].manualText = text;
    app.top50Slots[idx].stocks = stocks;
    mergeSlotStocks();
    renderImport();
    showToast(stocks.length > 0
      ? `スクショ${idx+1}: ${stocks.length}銘柄を読み込みました`
      : `スクショ${idx+1}: 銘柄が検出されませんでした（手動入力してください）`
    );
  } catch(e) {
    showToast(`スクショ${idx+1}: OCR失敗 — ${e.message}`, 'error');
  }
}

function mergeSlotStocks() {
  const seen = new Set();
  const merged = [];
  for (const slot of app.top50Slots) {
    if (!slot?.stocks) continue;
    for (const s of slot.stocks) {
      if (!seen.has(s.ticker)) {
        seen.add(s.ticker);
        const prev = app.stocks.find(x => x.ticker === s.ticker);
        merged.push({ ...s, selected: prev ? prev.selected : false });
      }
    }
  }
  app.stocks = merged;
  scheduleSave();
}

// ── RENDERING: ANALYZE TAB ───────────────────────────────────
function renderAnalyze() {
  const panel = document.getElementById('tab-analyze');
  const selected = app.stocks.filter(s => s.selected);

  if (!selected.length) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📥</div>
        <p>まず「インポート」タブでウォッチリストを読み込み、銘柄を選択してください。</p>
      </div>`;
    return;
  }

  panel.innerHTML = `
    <div class="section">
      <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2>Step 2 — CAN SLIM 分析</h2>
          <p>各銘柄のスクリーンショットをアップロード、または手動で入力してください</p>
        </div>
        <button class="btn btn-success btn-sm" id="save-session-btn">💾 履歴に保存</button>
      </div>
      <div class="analyze-grid" id="analyze-grid">
        ${selected.map(s => renderStockCard(s.ticker)).join('')}
      </div>
    </div>
  `;

  selected.forEach(s => bindCardEvents(s.ticker));
  document.getElementById('save-session-btn')?.addEventListener('click', saveSession);
}

function renderStockCard(ticker) {
  const a = app.analyses[ticker] || newAnalysis(ticker);
  const scores = calculateScores(a);

  return `
    <div class="stock-card" id="card-${ticker}">
      <div class="stock-card-header">
        ${a.listRank != null ? `<span class="stock-card-rank">#${a.listRank}</span>` : ''}
        <span class="stock-card-ticker">${esc(ticker)}</span>
        ${app.holdings.has(ticker) ? '<span class="badge-holding">保有中</span>' : ''}
        <div class="stock-card-name-block">
          <span class="stock-card-name">${esc(a.companyName)}</span>
          ${a.businessDesc ? `<span class="stock-card-desc">${esc(a.businessDesc)}</span>` : ''}
        </div>
        <button class="btn-fetch" data-fetch="${esc(ticker)}" title="Yahoo Financeから財務データを自動取得">📊 Yahoo取得</button>
        <div class="total-badge ${scoreClass(scores.total)}" id="badge-${ticker}">
          ${scores.total != null ? scores.total : '-'}
        </div>
      </div>

      <div class="stock-card-body">
        <!-- データ自動入力 -->
        <div class="autofill-section">
          ${a.screenshotThumb
            ? `<div class="card-upload-preview" id="upload-${ticker}">
                 <img src="${a.screenshotThumb}" class="card-ss-thumb" data-card-lightbox="1" title="タップで拡大" />
                 <span>スクリーンショット保存済 ✓</span>
                 <label style="cursor:pointer;color:#2563eb;font-size:.75rem;text-decoration:underline;">
                   再アップ<input type="file" accept="image/*" class="ss-file" data-ticker="${ticker}" style="display:none;" />
                 </label>
               </div>`
            : `<div class="card-upload" id="upload-${ticker}">
                 📸 スクリーンショット（任意）
                 <input type="file" accept="image/*" class="ss-file" data-ticker="${ticker}" />
               </div>`
          }
          <details class="ocr-paste-box">
            <summary class="ocr-paste-summary">📋 レーティングテキスト貼り付けで自動入力</summary>
            <p class="ocr-paste-guide">⚙️ 設定にAPIキーを入れると画像アップロードで自動OCR<br>手動: Google Lensアプリでスクショを開く → テキスト選択 → コピー → ここに貼り付け</p>
            <textarea class="ocr-paste-area" placeholder="EPS Rating: 95&#10;RS Rating: 91&#10;SMR Rating: A&#10;Acc/Dis Rating: B&#10;Composite Rating: 97"></textarea>
            <button class="btn btn-sm btn-primary" data-parse-ocr="${esc(ticker)}">解析して自動入力</button>
          </details>
        </div>

        <!-- CAN SLIM Scores mini bar -->
        <div class="criteria-section">
          <h4>CAN SLIM スコア</h4>
          ${CRITERIA.map(c => {
            const v = scores[c];
            return `
              <div class="criteria-row">
                <div class="crit-letter">${c}</div>
                <span class="crit-label">${CRITERIA_LABELS[c]}</span>
                <div class="crit-bar-track"><div class="crit-bar-fill ${scoreClass(v)}" style="width:${v??0}%"></div></div>
                <span class="crit-score ${scoreClass(v)}">${v!=null?v:'-'}</span>
              </div>`;
          }).join('')}
        </div>

        <hr class="divider" />

        <!-- C+A: Earnings -->
        <div>
          <h4 class="criteria-section" style="font-size:.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">C / A — 業績</h4>
          <div class="field-grid col3">
            <div class="fg">
              <label>EPS Rating</label>
              <input type="number" min="1" max="99" data-field="epsRating" value="${a.epsRating??''}" placeholder="1-99" />
              <span class="hint">理想: 80+</span>
            </div>
            <div class="fg">
              <label>四半期EPS成長 %</label>
              <input type="number" data-field="qEpsGrowth" value="${a.qEpsGrowth??''}" placeholder="例: 50" />
              <span class="hint">理想: 25%+</span>
            </div>
            <div class="fg">
              <label>売上成長 %</label>
              <input type="number" data-field="salesGrowth" value="${a.salesGrowth??''}" placeholder="例: 20" />
            </div>
            <div class="fg">
              <label>年間EPS成長 %</label>
              <input type="number" data-field="annualEpsGrowth" value="${a.annualEpsGrowth??''}" placeholder="例: 30" />
              <span class="hint">理想: 25%+</span>
            </div>
            <div class="fg">
              <label>ROE %</label>
              <input type="number" data-field="roe" value="${a.roe??''}" placeholder="例: 17" />
              <span class="hint">理想: 17%+</span>
            </div>
            <div class="fg">
              <label>連続増益年数</label>
              <input type="number" min="0" data-field="consecutiveYears" value="${a.consecutiveYears??''}" placeholder="例: 3" />
              <span class="hint">理想: 3年+</span>
            </div>
          </div>
        </div>

        <!-- N: New -->
        <div>
          <h4 class="criteria-section" style="font-size:.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">N — 新製品・新高値</h4>
          <div class="field-grid">
            <div class="fg check-group">
              <label class="check-label">
                <input type="checkbox" data-field="hasNewProduct" ${a.hasNewProduct?'checked':''} />
                新製品・新サービスあり
              </label>
              <label class="check-label">
                <input type="checkbox" data-field="hasNewMgmt" ${a.hasNewMgmt?'checked':''} />
                新経営陣あり
              </label>
            </div>
            <div class="fg">
              <label>52週高値からの下落 %</label>
              <input type="number" min="0" max="100" data-field="fromHigh52w" value="${a.fromHigh52w??''}" placeholder="例: 5" />
              <span class="hint">理想: 15%以内</span>
            </div>
          </div>
        </div>

        <!-- S: Supply & Demand -->
        <div>
          <h4 class="criteria-section" style="font-size:.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">S — 需給</h4>
          <div class="field-grid col3">
            <div class="fg">
              <label>需給評価 (A〜E)</label>
              <select data-field="adRating">
                <option value="">-</option>
                ${['A','B','C','D','E'].map(v=>`<option value="${v}" ${a.adRating===v?'selected':''}>${v}</option>`).join('')}
              </select>
              <span class="hint">理想: A/B</span>
            </div>
            <div class="fg">
              <label>出来高比率 (Up/Dn)</label>
              <input type="number" step="0.1" data-field="upDownVolRatio" value="${a.upDownVolRatio??''}" placeholder="例: 1.5" />
              <span class="hint">理想: 1.0+</span>
            </div>
            <div class="fg">
              <label>浮動株 (百万株)</label>
              <input type="number" data-field="floatShares" value="${a.floatShares??''}" placeholder="例: 50" />
              <span class="hint">少ないほど◎</span>
            </div>
          </div>
        </div>

        <!-- L: Leader -->
        <div>
          <h4 class="criteria-section" style="font-size:.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">L — 相対強度</h4>
          <div class="field-grid">
            <div class="fg">
              <label>相対強度スコア (1-99)</label>
              <input type="number" min="1" max="99" data-field="rsRating" value="${a.rsRating??''}" placeholder="例: 85" />
              <span class="hint">理想: 80+</span>
            </div>
            <div class="fg">
              <label>業種内順位 %上位</label>
              <input type="number" min="1" max="100" data-field="industryRank" value="${a.industryRank??''}" placeholder="例: 15" />
              <span class="hint">理想: 20以内</span>
            </div>
          </div>
        </div>

        <!-- I: Institutional -->
        <div>
          <h4 class="criteria-section" style="font-size:.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">I — 機関投資家</h4>
          <div class="field-grid col3">
            <div class="fg">
              <label>財務評価 (A〜E)</label>
              <select data-field="smrRating">
                <option value="">-</option>
                ${['A','B','C','D','E'].map(v=>`<option value="${v}" ${a.smrRating===v?'selected':''}>${v}</option>`).join('')}
              </select>
              <span class="hint">理想: A/B</span>
            </div>
            <div class="fg">
              <label>機関投資家保有 %</label>
              <input type="number" min="0" max="100" data-field="instOwnership" value="${a.instOwnership??''}" placeholder="例: 25" />
            </div>
            <div class="fg">
              <label>機関投資家数の変化</label>
              <select data-field="instTrend">
                <option value="">-</option>
                <option value="increasing" ${a.instTrend==='increasing'?'selected':''}>増加 ▲</option>
                <option value="stable"     ${a.instTrend==='stable'    ?'selected':''}>横ばい →</option>
                <option value="decreasing" ${a.instTrend==='decreasing'?'selected':''}>減少 ▼</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Chart Patterns -->
        <div class="chart-section">
          <h4>チャートパターン確認</h4>
          <a class="tv-btn" href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}" target="_blank" rel="noopener">
            📈 TradingView で週足チャートを確認
          </a>
          <div class="pattern-grid">
            ${[
              'カップウィズハンドル',
              'フラットベース',
              'ダブルボトム',
              'スクウェアボックス',
              'ピボット突破（出来高増）',
              'ハイタイトフラッグ',
            ].map((p,i) => `
              <label class="pattern-check">
                <input type="checkbox" data-pattern="${i}" ${a.chartPatterns?.[i]?'checked':''} />
                ${esc(p)}
              </label>
            `).join('')}
          </div>
          <div class="fg" style="margin-top:8px;">
            <label>買いポイント（ピボット価格）$</label>
            <input type="number" step="0.01" data-field="pivotPrice" value="${a.pivotPrice??''}" placeholder="例: 150.50" />
          </div>
        </div>

        <!-- Notes -->
        <div class="fg">
          <label>メモ</label>
          <textarea class="notes-area" data-field="notes" placeholder="気づきや判断理由を記入…">${esc(a.notes||'')}</textarea>
        </div>
      </div>

      <div class="card-footer">
        <button class="btn btn-ghost btn-sm" data-remove="${ticker}">除外</button>
      </div>
    </div>
  `;
}

function bindCardEvents(ticker) {
  const card = document.getElementById(`card-${ticker}`);
  if (!card) return;
  const a = app.analyses[ticker];
  if (!a) return;

  // screenshot upload → auto Vision OCR if key is set
  card.querySelectorAll('.ss-file').forEach(input => {
    input.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dataURL = await fileToDataURL(file);
        a.screenshotThumb = dataURL;
        refreshCard(ticker);
        const usedOcr = await runVisionOcr(ticker, dataURL);
        if (!usedOcr) await runTesseractOcr(ticker, dataURL);
      } catch(ex) {
        showToast('アップロード失敗: ' + ex.message, 'error');
      }
    });
  });

  // Yahoo Finance auto-fetch
  card.querySelector('[data-fetch]')?.addEventListener('click', async () => {
    const btn = card.querySelector('[data-fetch]');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳…';
    try {
      const data = await fetchYahooData(ticker);
      const filled = applyFetchedData(ticker, data);
      refreshCard(ticker);
      showToast(filled > 0 ? `${ticker}: ${filled}項目を取得しました` : `${ticker}: データが見つかりませんでした`);
    } catch (e) {
      showToast(`${ticker}: 取得失敗 — ${e.message}`, 'error');
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  });

  // OCR text paste → parse ratings
  card.querySelector('[data-parse-ocr]')?.addEventListener('click', () => {
    const area = card.querySelector('.ocr-paste-area');
    const text = area?.value || '';
    if (!text.trim()) { showToast('テキストを貼り付けてください'); return; }
    const filled = applyOcrText(ticker, text);
    refreshCard(ticker);
    showToast(filled > 0 ? `${ticker}: ${filled}項目を自動入力しました` : `${ticker}: レーティングが検出されませんでした`);
  });

  // Screenshot lightbox
  card.querySelector('[data-card-lightbox]')?.addEventListener('click', () => {
    const url = app.analyses[ticker]?.screenshotThumb;
    if (url) showLightbox(url);
  });

  // Numeric / text inputs
  card.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('input',  e => updateField(ticker, e));
    el.addEventListener('change', e => updateField(ticker, e));
  });

  // Pattern checkboxes
  card.querySelectorAll('[data-pattern]').forEach(cb => {
    cb.addEventListener('change', e => {
      const i = parseInt(e.target.dataset.pattern);
      if (!a.chartPatterns) a.chartPatterns = [];
      a.chartPatterns[i] = e.target.checked;
      updateScoreDisplay(ticker);
    });
  });

  // Remove button
  card.querySelector('[data-remove]')?.addEventListener('click', () => {
    const s = app.stocks.find(x => x.ticker === ticker);
    if (s) s.selected = false;
    renderAnalyze();
    renderCompare();
  });
}

function updateField(ticker, e) {
  const a = app.analyses[ticker];
  if (!a) return;
  const field = e.target.dataset.field;
  let val = e.target.value;

  if (e.target.type === 'checkbox') {
    a[field] = e.target.checked;
  } else if (e.target.type === 'number') {
    a[field] = val === '' ? null : parseFloat(val);
  } else {
    a[field] = val || null;
  }
  updateScoreDisplay(ticker);
  scheduleSave();
}

function updateScoreDisplay(ticker) {
  const a = app.analyses[ticker];
  if (!a) return;
  const scores = calculateScores(a);

  // Update total badge
  const badge = document.getElementById(`badge-${ticker}`);
  if (badge) {
    badge.textContent = scores.total != null ? scores.total : '-';
    badge.className = `total-badge ${scoreClass(scores.total)}`;
  }

  // Update criteria bars in this card
  const card = document.getElementById(`card-${ticker}`);
  if (!card) return;
  CRITERIA.forEach(c => {
    const v = scores[c];
    card.querySelectorAll('.criteria-row').forEach(row => {
      const letter = row.querySelector('.crit-letter')?.textContent?.trim();
      if (letter !== c) return;
      const bar   = row.querySelector('.crit-bar-fill');
      const score = row.querySelector('.crit-score');
      if (bar)   { bar.style.width = `${v??0}%`; bar.className = `crit-bar-fill ${scoreClass(v)}`; }
      if (score) { score.textContent = v != null ? v : '-'; score.className = `crit-score ${scoreClass(v)}`; }
    });
  });
}

function refreshCard(ticker) {
  const card = document.getElementById(`card-${ticker}`);
  if (!card) return;
  card.outerHTML = renderStockCard(ticker);
  // Re-get the new card element and bind events
  bindCardEvents(ticker);
}


// ── RENDERING: COMPARE TAB ───────────────────────────────────
function renderCompare() {
  const panel = document.getElementById('tab-compare');
  const tickers = app.stocks.filter(s => s.selected).map(s => s.ticker);

  if (!tickers.length) {
    panel.innerHTML = `<div class="compare-empty"><div class="empty-icon">⚖️</div><p>分析タブで銘柄を選択してください。</p></div>`;
    return;
  }

  const allScores = {};
  tickers.forEach(t => { allScores[t] = calculateScores(app.analyses[t] || newAnalysis(t)); });

  panel.innerHTML = `
    <div class="section">
      <div class="section-header">
        <h2>Step 3 — 銘柄比較</h2>
        <p>選択中の${tickers.length}銘柄の CAN SLIM スコアを比較します</p>
      </div>
      <div class="compare-wrap card">
        <table class="compare-table">
          <thead>
            <tr>
              <th>基準</th>
              ${tickers.map(t => `
                <th>
                  <div class="ticker-th">
                    <strong>${esc(t)}</strong>
                    <small>${esc(app.analyses[t]?.companyName||'')}</small>
                  </div>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${CRITERIA.map(c => `
              <tr>
                <td><span class="crit-letter" style="display:inline-flex;width:24px;height:24px;font-size:.75rem;">${c}</span> ${CRITERIA_LABELS[c]}</td>
                ${tickers.map(t => {
                  const v = allScores[t][c];
                  return `<td><span class="cell-score ${scoreClass(v)}">${v!=null?v:'-'}</span></td>`;
                }).join('')}
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>📊 総合スコア</td>
              ${tickers.map(t => {
                const v = allScores[t].total;
                return `<td><span class="cell-score ${scoreClass(v)}" style="width:48px;height:34px;font-size:.9rem;">${v!=null?v:'-'}</span></td>`;
              }).join('')}
            </tr>
            <tr>
              <td>判定</td>
              ${tickers.map(t => {
                const v = allScores[t].total;
                const { label, cls } = verdict(v);
                return `<td><span class="badge badge-blue" style="${verdictStyle(cls)}">${label}</span></td>`;
              }).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function verdict(v) {
  if (v == null) return { label: '-', cls: 'na' };
  if (v >= 70)   return { label: '🟢 買い候補', cls: 'pass' };
  if (v >= 40)   return { label: '🟡 様子見',   cls: 'warn' };
  return               { label: '🔴 見送り',    cls: 'fail' };
}
function verdictStyle(cls) {
  const m = { pass:'background:#dcfce7;color:#16a34a', warn:'background:#fef3c7;color:#d97706', fail:'background:#fee2e2;color:#dc2626', na:'background:#f1f5f9;color:#94a3b8' };
  return m[cls] || '';
}

// ── RENDERING: HISTORY TAB ───────────────────────────────────
function renderHistory() {
  const panel = document.getElementById('tab-history');

  if (!app.history.length) {
    panel.innerHTML = `<div class="history-empty"><div class="empty-icon">📋</div><p>保存された分析はありません。<br>分析タブの「履歴に保存」ボタンで保存できます。</p></div>`;
    return;
  }

  panel.innerHTML = `
    <div class="section">
      <div class="section-header">
        <h2>分析履歴</h2>
        <p>${app.history.length}件の保存済み分析</p>
      </div>
      <div class="history-list">
        ${app.history.map((h, i) => `
          <div class="history-item" data-idx="${i}">
            <span class="history-date">${fmtDate(h.savedAt)}</span>
            <div class="history-tickers">
              ${h.tickers.map(t => `<span class="h-ticker-chip">${esc(t)}</span>`).join('')}
            </div>
            <span class="history-score">${h.avgScore != null ? h.avgScore + '点' : '-'}</span>
            <button class="history-del" data-del="${i}" title="削除">🗑</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  panel.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.dataset.del) return;
      loadSession(parseInt(item.dataset.idx));
    });
  });
  panel.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      app.history.splice(parseInt(btn.dataset.del), 1);
      saveHistory();
      renderHistory();
    });
  });
}

// ── SESSION SAVE / LOAD ──────────────────────────────────────
function saveSession() {
  const tickers = app.stocks.filter(s => s.selected).map(s => s.ticker);
  if (!tickers.length) { showToast('保存する銘柄がありません'); return; }

  const allScores = tickers.map(t => calculateScores(app.analyses[t]||newAnalysis(t)).total).filter(v=>v!=null);
  const avg = allScores.length ? Math.round(allScores.reduce((a,b)=>a+b,0)/allScores.length) : null;

  const session = {
    savedAt:  new Date().toISOString(),
    tickers,
    avgScore: avg,
    stocks:   JSON.parse(JSON.stringify(app.stocks)),
    analyses: JSON.parse(JSON.stringify(app.analyses)),
    market:   app.marketTrend,
  };
  app.history.unshift(session);
  if (app.history.length > 50) app.history.length = 50;
  saveHistory();
  showToast('履歴に保存しました');
}

function loadSession(idx) {
  const h = app.history[idx];
  if (!h) return;
  app.stocks       = h.stocks;
  app.analyses     = h.analyses;
  app.marketTrend  = h.market || '';
  app.top50Slots   = h.top50Slots || [null,null,null,null];
  updateMarketUI();
  renderImport();
  renderAnalyze();
  renderCompare();
  switchTab('analyze');
  showToast('セッションを復元しました');
}

function saveHistory() {
  localStorage.setItem('canslim-history', JSON.stringify(app.history));
}

// ── WORKING SESSION AUTO-SAVE ────────────────────────────────
let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveWorkingSession, 1500);
}

function saveWorkingSession() {
  try {
    const analysesClean = {};
    for (const [t, a] of Object.entries(app.analyses)) {
      analysesClean[t] = { ...a, screenshotThumb: null };
    }
    localStorage.setItem('canslim-working', JSON.stringify({
      stocks:    app.stocks,
      slotTexts: app.top50Slots.map(s => s?.manualText || ''),
      analyses:  analysesClean,
    }));
  } catch (e) { /* quota exceeded — skip */ }
}

function loadWorkingSession() {
  try {
    const raw = localStorage.getItem('canslim-working');
    if (!raw) return false;
    const h = JSON.parse(raw);
    if (!h.stocks?.length) return false;
    app.stocks = h.stocks;
    (h.slotTexts || []).forEach((text, i) => {
      if (text) app.top50Slots[i] = { dataURL: null, stocks: parseTickerText(text), manualText: text };
    });
    app.analyses = h.analyses || {};
    return true;
  } catch (e) { return false; }
}

// ── TAB SWITCHING ────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  app.currentTab = name;

  if      (name === 'import')   renderImport();
  else if (name === 'analyze')  renderAnalyze();
  else if (name === 'screener') renderScreener();
  else if (name === 'compare')  renderCompare();
  else if (name === 'history')  renderHistory();
}

// ── SCREENER TAB ─────────────────────────────────────────────
function renderScreener() {
  const panel = document.getElementById('tab-screener');
  const stocks = Object.values(app.backendData);

  if (!stocks.length) {
    const isFile = location.protocol === 'file:';
    panel.innerHTML = `
      <div class="screener-empty">
        <div class="empty-icon">🔍</div>
        <h3 style="font-size:.95rem;font-weight:700;margin-bottom:8px;">スクリーナーデータがありません</h3>
        ${isFile ? `
        <div class="screener-empty-card screener-empty-warn">
          <b>⚠️ file:// で開いています</b><br>
          ブラウザのセキュリティ制限により、ローカルファイルから JSON を読み込めません。<br>
          以下のいずれかで開き直してください。
          <div class="screener-empty-steps">
            <div class="screener-empty-step">
              <b>① GitHub Pages で開く（推奨）</b><br>
              <a href="https://coquelic-ot.github.io/Canslim/stock.html" target="_blank" class="screener-empty-link">
                coquelic-ot.github.io/Canslim/stock.html
              </a>
            </div>
            <div class="screener-empty-step">
              <b>② ローカル HTTP サーバーで開く</b><br>
              <code>cd ~/Canslim &amp;&amp; python3 -m http.server 8080</code><br>
              → <a href="http://localhost:8080/stock.html" target="_blank" class="screener-empty-link">localhost:8080/stock.html</a>
            </div>
          </div>
        </div>` : `
        <div class="screener-empty-card">
          <b>📡 データ取得に失敗しました</b><br>
          <code>data/canslim.json</code> が見つかりません。<br>
          Moomoo OpenD を起動してから「▶ バックエンド実行」を押してください。
          <div class="screener-empty-steps">
            <div class="screener-empty-step">
              <b>① Moomoo OpenD を起動</b>（ポート 11111）
            </div>
            <div class="screener-empty-step">
              <b>② APIサーバーを起動（初回のみ）</b><br>
              <code>cd ~/Canslim/backend &amp;&amp; source .venv/bin/activate &amp;&amp; python server.py</code>
            </div>
          </div>
        </div>`}
        <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">
          <button class="btn btn-primary" id="scr-run-btn-empty">▶ バックエンド実行</button>
          <button class="btn btn-ghost" id="screener-reload">🔄 再読み込み</button>
        </div>
        <div class="scr-run-panel" id="scr-run-panel" style="display:none;max-width:480px;margin:12px auto 0">
          <div class="scr-run-header">
            <span class="scr-run-status" id="scr-run-status">待機中</span>
            <button class="scr-run-close" id="scr-run-close">✕</button>
          </div>
          <pre class="scr-run-log" id="scr-run-log"></pre>
        </div>
      </div>`;
    panel.querySelector('#screener-reload').addEventListener('click', async () => {
      await loadBackendData();
    });
    panel.querySelector('#scr-run-btn-empty').addEventListener('click', () => _runBackend());
    panel.querySelector('#scr-run-close').addEventListener('click', () => {
      document.getElementById('scr-run-panel').style.display = 'none';
    });
    return;
  }

  const updated = app.backendMeta?.updated ? _formatUpdated(app.backendMeta.updated) : '—';

  const SECTIONS = [
    { key: 'in_buy_zone', label: '🟢 買いゾーン内',             cls: 'sit-buy'  },
    { key: 'approaching', label: '🟡 ピボット接近中（-10%以内）', cls: 'sit-near' },
    { key: 'forming',     label: '⬜ ベース形成中',              cls: 'sit-form' },
    { key: 'extended',    label: '🔴 買いゾーン超過',            cls: 'sit-ext'  },
    { key: 'downtrend',   label: '⛔ 圏外（下降トレンド）',      cls: 'sit-down' },
  ];

  const grouped = {};
  SECTIONS.forEach(s => { grouped[s.key] = []; });
  stocks.forEach(s => {
    const ch = s.chart || {};
    if (ch.maStatus === 'below_50') { grouped['downtrend'].push(s); return; }
    const sit = ch.buySituation;
    if (sit && grouped[sit]) grouped[sit].push(s);
  });

  grouped['in_buy_zone'].sort((a, b) => (a.chart?.priceVsPivotPct ?? 999) - (b.chart?.priceVsPivotPct ?? 999));
  grouped['approaching'].sort((a, b) => (b.chart?.priceVsPivotPct ?? -999) - (a.chart?.priceVsPivotPct ?? -999));
  grouped['forming'].sort((a, b) => (b.chart?.priceVsPivotPct ?? -999) - (a.chart?.priceVsPivotPct ?? -999));

  function rowHtml(s) {
    const ch     = s.chart || {};
    const price  = s.price != null ? `$${s.price.toFixed(2)}` : '—';
    const pivot  = ch.pivot != null ? `$${ch.pivot.toFixed(2)}` : '—';
    const raw    = ch.priceVsPivotPct;
    const pct    = raw != null ? `${raw >= 0 ? '+' : ''}${raw.toFixed(1)}%` : '—';
    const pctCls = raw == null ? '' : raw >= 0 ? 'scr-pct-pos' : raw >= -3 ? 'scr-pct-near' : 'scr-pct-neg';
    const pat    = ch.patternJp ? `<span class="scr-pat">${esc(ch.patternJp)}</span>` : '';
    const weeks  = ch.baseWeeks != null ? `<span class="scr-weeks">${ch.baseWeeks}週</span>` : '';
    const held    = s.holding      ? `<span class="scr-held">保有</span>` : '';
    const top50Badge   = s.top50Current ? `<span class="scr-top50">Top50</span>` : '';
    const listRank = s.top50Current && s.top50Rank != null ? `<span class="scr-top50-rank">#${s.top50Rank}</span>` : '';
    const closes  = s.weeklyCloses || [];
    const mini    = closes.length ? `<span class="scr-mini">${_makeSparkline(closes, ch.pivot, s.price, ch.buySituation)}</span>` : '';
    const ana     = app.analyses[s.ticker];
    const scores  = ana ? calculateScores(ana) : null;
    const total   = scores?.total;
    const scoreBadge  = total != null ? `<span class="scr-score-badge" style="${scoreColorStyle(total)}">${total}</span>` : '';
    const critBar = `<span class="scr-crit-bar">${CRITERIA.map(c => {
      const v = scores ? scores[c] : null;
      return `<span class="scr-crit-dot" style="${scoreColorStyle(v)}" title="${CRITERIA_LABELS[c]}: ${v ?? '—'}">${c}</span>`;
    }).join('')}</span>`;
    const cname   = ana?.companyName || '';
    const sectorM   = ana?.sector ? (SECTOR_META[ana.sector] || null) : null;
    const sectorChip = sectorM
      ? `<span class="scr-sector" style="background:${sectorM.color};color:${sectorM.text}" title="${esc(ana.sector)}">${sectorM.icon} ${sectorM.label}</span>`
      : '';
    return `
      <div class="scr-row" data-ticker="${esc(s.ticker)}">
        ${scoreBadge}
        <span class="scr-ticker">${esc(s.ticker)}</span>
        ${mini}
        ${pat}${weeks}
        ${sectorChip}
        ${cname ? `<span class="scr-cname">${esc(cname)}</span>` : ''}
        ${top50Badge}${listRank}${held}
        <span class="scr-spacer"></span>
        ${critBar}
        <span class="scr-price">${price}</span>
        <span class="scr-arrow">▶</span>
        <span class="scr-pivot">${pivot}</span>
        <span class="scr-pct ${pctCls}">${pct}</span>
      </div>`;
  }

  function holdingsHtml() {
    const list = app.backendHoldings;
    if (!list.length) return '';
    const rows = list.map(h => {
      const pl = h.plRatio;
      const plStr  = pl != null ? `${pl >= 0 ? '+' : ''}${pl.toFixed(1)}%` : '—';
      const plCls  = pl == null ? '' : pl >= 0 ? 'scr-pct-pos' : 'scr-pct-neg';
      const price  = h.price != null ? `$${h.price.toFixed(2)}` : '—';
      const cost   = h.costPrice != null ? `$${h.costPrice.toFixed(2)}` : '—';
      const mktVal = h.marketVal != null ? `$${(h.marketVal / 1000).toFixed(1)}k` : '—';
      const bd     = app.backendData[h.ticker];
      const sit    = bd?.chart?.buySituation;
      const closes  = bd?.weeklyCloses || [];
      const ch      = bd?.chart || {};
      const mini    = closes.length ? `<span class="scr-mini">${_makeSparkline(closes, ch.pivot, h.price, sit)}</span>` : '';
      const hAna    = app.analyses[h.ticker];
      const hScores = hAna ? calculateScores(hAna) : null;
      const hTotal  = hScores?.total;
      const hScoreBadge = hTotal != null ? `<span class="scr-score-badge" style="${scoreColorStyle(hTotal)}">${hTotal}</span>` : '';
      const hCritBar = `<span class="scr-crit-bar">${CRITERIA.map(c => {
        const v = hScores ? hScores[c] : null;
        return `<span class="scr-crit-dot" style="${scoreColorStyle(v)}" title="${CRITERIA_LABELS[c]}: ${v ?? '—'}">${c}</span>`;
      }).join('')}</span>`;
      return `
        <div class="scr-row scr-holding-row" data-ticker="${esc(h.ticker)}">
          ${hScoreBadge}
          ${mini}
          <span class="scr-ticker">${esc(h.ticker)}</span>
          <span class="scr-qty">${h.qty > 0 ? h.qty.toFixed(0) + '株' : ''}</span>
          <span class="scr-spacer"></span>
          ${hCritBar}
          <span class="scr-label">コスト</span><span class="scr-cost">${cost}</span>
          <span class="scr-label">現値</span><span class="scr-price">${price}</span>
          <span class="scr-pct ${plCls}">${plStr}</span>
          <span class="scr-label">評価</span><span class="scr-mktval">${h.qty > 0 ? mktVal : ''}</span>
        </div>`;
    }).join('');
    return `
      <div class="scr-section scr-section-holdings">
        <div class="scr-section-hd">
          <span>📂 保有銘柄（Moomoo）</span>
          <span class="scr-cnt">${list.length}銘柄</span>
        </div>
        <div class="scr-rows">${rows}</div>
      </div>`;
  }

  const sectionsHtml = SECTIONS.map(sec => {
    const list = grouped[sec.key];
    if (!list.length) return '';
    return `
      <div class="scr-section ${sec.cls}">
        <div class="scr-section-hd">
          <span>${sec.label}</span>
          <span class="scr-cnt">${list.length}銘柄</span>
        </div>
        <div class="scr-rows">${list.map(rowHtml).join('')}</div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="section">
      <div class="scr-meta">
        <span class="scr-updated">📡 更新: ${updated}</span>
        <button class="btn btn-ghost btn-sm" id="scr-refresh">🔄 再読み込み</button>
        <button class="btn btn-primary btn-sm" id="scr-run-btn">▶ バックエンド実行</button>
      </div>
      <div class="scr-run-panel" id="scr-run-panel" style="display:none">
        <div class="scr-run-header">
          <span class="scr-run-status" id="scr-run-status">待機中</span>
          <button class="scr-run-close" id="scr-run-close">✕</button>
        </div>
        <pre class="scr-run-log" id="scr-run-log"></pre>
      </div>
      ${holdingsHtml()}
      ${sectionsHtml || '<p style="padding:24px;color:var(--text-2)">パターン検出銘柄なし</p>'}
    </div>`;

  panel.querySelector('#scr-refresh').addEventListener('click', async () => {
    await loadBackendData();
  });

  panel.querySelector('#scr-run-btn').addEventListener('click', () => _runBackend());
  panel.querySelector('#scr-run-close').addEventListener('click', () => {
    document.getElementById('scr-run-panel').style.display = 'none';
  });

  // チャートツールチップ（body直下に1つだけ・毎回HTML更新）
  document.getElementById('scr-tip')?.remove();
  {
    const tip = document.createElement('div');
    tip.id = 'scr-tip';
    tip.className = 'scr-tip scr-tip-hidden';
    tip.innerHTML = `
      <div class="scr-tip-hd">
        <span class="scr-tip-ticker"></span>
        <span class="scr-tip-top50" style="display:none"></span>
        <span class="scr-tip-pat"></span>
        <span class="scr-tip-total" style="display:none"></span>
      </div>
      <div class="scr-tip-cname"></div>
      <div class="scr-tip-desc"></div>
      <div class="scr-tip-svg"></div>
      <div class="scr-tip-info">
        <span>現値 <b class="scr-tip-price"></b></span>
        <span>pivot <b class="scr-tip-pivot"></b></span>
        <b class="scr-tip-pct"></b>
      </div>
      <div class="scr-tip-canslim" style="display:none"></div>
      <div class="scr-tip-ratings">
        <span>総合 <b class="scr-tip-comp"></b></span>
        <span>EPS <b class="scr-tip-eps"></b></span>
        <span>RS <b class="scr-tip-rs"></b></span>
        <span>財務 <b class="scr-tip-smr"></b></span>
        <span>需給 <b class="scr-tip-ad"></b></span>
      </div>`;
    document.body.appendChild(tip);
  }
  const tip = document.getElementById('scr-tip');

  panel.querySelectorAll('.scr-row').forEach(row => {
    row.addEventListener('mouseenter', () => {
      const ticker = row.dataset.ticker;
      const bd = app.backendData[ticker];
      const ch = (bd || {}).chart || {};

      const price = bd?.price;
      const pct   = ch.priceVsPivotPct;
      tip.querySelector('.scr-tip-ticker').textContent = ticker;
      tip.querySelector('.scr-tip-pat').textContent    = ch.patternJp || '';
      const ana0tip = app.analyses[ticker] || {};
      const cnameEl = tip.querySelector('.scr-tip-cname');
      const descEl  = tip.querySelector('.scr-tip-desc');
      if (ana0tip.companyName) {
        const sM   = ana0tip.sector ? SECTOR_META[ana0tip.sector] : null;
        const sTag = sM ? ` ${sM.icon} ${sM.label}` : (ana0tip.sector ? ` [${ana0tip.sector}]` : '');
        cnameEl.textContent = ana0tip.companyName + sTag;
        cnameEl.style.display = '';
      } else {
        cnameEl.style.display = 'none';
      }
      if (ana0tip.businessDesc) {
        descEl.textContent = ana0tip.businessDesc;
        descEl.style.display = '';
      } else {
        descEl.style.display = 'none';
      }
      tip.querySelector('.scr-tip-price').textContent  = price != null ? `$${price.toFixed(2)}` : '—';
      tip.querySelector('.scr-tip-pivot').textContent  = ch.pivot != null ? `$${ch.pivot.toFixed(2)}` : '—';
      const pctEl = tip.querySelector('.scr-tip-pct');
      pctEl.textContent = pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '';
      pctEl.className   = 'scr-tip-pct ' + (pct == null ? '' : pct >= 0 ? 'scr-pct-pos' : pct >= -3 ? 'scr-pct-near' : 'scr-pct-neg');

      // Top50バッジ
      const top50El = tip.querySelector('.scr-tip-top50');
      if (bd?.top50Current) {
        top50El.textContent   = bd.top50Rank != null ? `Top50 #${bd.top50Rank}` : 'Top50';
        top50El.style.display = '';
      } else {
        top50El.style.display = 'none';
      }

      // レーティング（常に表示 — app.analysesから取得）
      const ana0 = app.analyses[ticker] || {};
      const ratingsEl = tip.querySelector('.scr-tip-ratings');
      const comp = ana0.compositeRating, eps = ana0.epsRating, rs = ana0.rsRating;
      const smr = ana0.smrRating, ad = ana0.adRating;
      tip.querySelector('.scr-tip-comp').innerHTML = comp != null ? `<b style="${scoreColorStyle(comp)};padding:1px 4px;border-radius:3px;">${comp}</b>` : '—';
      tip.querySelector('.scr-tip-eps').innerHTML  = eps  != null ? `<b style="${scoreColorStyle(eps)};padding:1px 4px;border-radius:3px;">${eps}</b>`   : '—';
      tip.querySelector('.scr-tip-rs').innerHTML   = rs   != null ? `<b style="${scoreColorStyle(rs)};padding:1px 4px;border-radius:3px;">${rs}</b>`     : '—';
      tip.querySelector('.scr-tip-smr').textContent = smr ?? '—';
      tip.querySelector('.scr-tip-ad').textContent  = ad  ?? '—';
      ratingsEl.style.display = '';

      // CAN SLIM スコア（常に全7項目を表示）
      const ana       = app.analyses[ticker];
      const scr       = ana ? calculateScores(ana) : null;
      const canslimEl = tip.querySelector('.scr-tip-canslim');
      const totalEl   = tip.querySelector('.scr-tip-total');
      canslimEl.innerHTML = CRITERIA.map(c => {
        const v = scr ? scr[c] : null;
        return `<span class="scr-tip-crit"><b class="scr-tip-crit-lbl" style="${scoreColorStyle(v)}">${c}</b><small>${v != null ? v : '—'}</small></span>`;
      }).join('');
      canslimEl.style.display = '';
      if (scr && scr.total != null) {
        totalEl.textContent    = scr.total;
        totalEl.style.cssText  = scoreColorStyle(scr.total) + 'margin-left:auto;font-size:.72rem;font-weight:800;padding:2px 7px;border-radius:20px;';
        totalEl.style.display  = '';
      } else {
        totalEl.style.display = 'none';
      }

      const holding    = app.backendHoldings.find(h => h.ticker === ticker);
      const costPrice  = holding?.costPrice ?? null;
      const sellPrices = app.sellHistory.filter(s => s.ticker === ticker).map(s => s.price);
      const closes = bd?.weeklyCloses || [];
      tip.querySelector('.scr-tip-svg').innerHTML = closes.length
        ? _makeChartSvg(closes, ch.pivot, price, ch.buySituation, costPrice, sellPrices)
        : '';

      tip.classList.remove('scr-tip-hidden');
      _positionTip(tip);
    });

    row.addEventListener('mouseleave', () => tip.classList.add('scr-tip-hidden'));

    row.addEventListener('click', () => {
      tip.classList.add('scr-tip-hidden');
      const ticker = row.dataset.ticker;
      // 分析タブに遷移する前に selected=true にしてカードが表示されるようにする
      const s = app.stocks.find(x => x.ticker === ticker);
      if (s) {
        s.selected = true;
      } else {
        // app.stocks にない場合（バックエンド専用銘柄）は追加
        const autoRank = Math.max(0, ...app.stocks.map(x => x.rank || 0)) + 1;
        app.stocks.push({ rank: autoRank, ticker, companyName: app.analyses[ticker]?.companyName || '', selected: true });
      }
      if (!app.analyses[ticker]) app.analyses[ticker] = newAnalysis(ticker);
      switchTab('analyze');
      setTimeout(() => {
        document.getElementById(`card-${ticker}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    });
  });
}

function _positionTip(tip) {
  const TW = tip.offsetWidth  || 320;
  const TH = tip.offsetHeight || 240;
  tip.style.left = Math.round((window.innerWidth  - TW) / 2) + 'px';
  tip.style.top  = Math.round((window.innerHeight - TH) / 2) + 'px';
}

function _makeSparkline(closes, pivot, currentPrice, buySituation) {
  const W = 64, H = 26, PX = 2, PY = 3;
  const n = closes.length;
  if (!n) return '';
  const allPrices = [...closes];
  if (pivot) allPrices.push(pivot, pivot * 1.05);
  if (currentPrice) allPrices.push(currentPrice);
  const lo = Math.min(...allPrices) * 0.985;
  const hi = Math.max(...allPrices) * 1.015;
  const rng = hi - lo || 1;
  const cx = i => PX + (i / Math.max(n - 1, 1)) * (W - PX * 2);
  const cy = p => PY + (1 - (p - lo) / rng) * (H - PY * 2);
  const pts = closes.map((c, i) => `${cx(i).toFixed(1)},${cy(c).toFixed(1)}`).join(' ');
  let buyBand = '';
  if (pivot) {
    const py  = cy(pivot).toFixed(1);
    const bzy = cy(pivot * 1.05).toFixed(1);
    const bh  = Math.abs(Number(py) - Number(bzy));
    const by  = Math.min(Number(py), Number(bzy));
    buyBand = `<rect x="${PX}" y="${by.toFixed(1)}" width="${W - PX * 2}" height="${bh.toFixed(1)}" fill="#dcfce7" opacity=".65"/>`;
  }
  const lineColor = { in_buy_zone: '#16a34a', approaching: '#d97706', extended: '#dc2626' }[buySituation] || '#64748b';
  const lastX = cx(n - 1), lastY = cy(closes[n - 1]);
  const dot = `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2" fill="${lineColor}" stroke="#fff" stroke-width="1"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${buyBand}<polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>${dot}</svg>`;
}

function _makeChartSvg(closes, pivot, currentPrice, buySituation, costPrice, sellPrices) {
  const W = 288, H = 130, PX = 8, PY = 10;
  const n = closes.length;
  if (!n) return '';

  const allPrices = [...closes];
  if (pivot)        allPrices.push(pivot, pivot * 1.05);
  if (currentPrice) allPrices.push(currentPrice);
  if (costPrice)    allPrices.push(costPrice);
  (sellPrices || []).forEach(p => allPrices.push(p));
  const lo = Math.min(...allPrices) * 0.985;
  const hi = Math.max(...allPrices) * 1.015;
  const rng = hi - lo || 1;

  const cx = i => PX + (i / Math.max(n - 1, 1)) * (W - PX * 2);
  const cy = p => PY + (1 - (p - lo) / rng) * (H - PY * 2);

  const pts   = closes.map((c, i) => `${cx(i).toFixed(1)},${cy(c).toFixed(1)}`).join(' ');
  const lastX = cx(n - 1), lastY = cy(closes[n - 1]);

  let pivotLine = '', buyBand = '', priceDot = '';
  if (pivot) {
    const py  = cy(pivot).toFixed(1);
    const bzy = cy(pivot * 1.05).toFixed(1);
    const bh  = Math.abs(Number(py) - Number(bzy));
    const by  = Math.min(Number(py), Number(bzy));
    buyBand   = `<rect x="${PX}" y="${by.toFixed(1)}" width="${(W - PX * 2).toFixed(1)}" height="${bh.toFixed(1)}" fill="#dcfce7" opacity=".55"/>`;
    pivotLine = `<line x1="${PX}" y1="${py}" x2="${W - PX}" y2="${py}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="5,3"/>`;
  }
  const dotColor = { in_buy_zone:'#16a34a', approaching:'#d97706', extended:'#dc2626' }[buySituation] || '#64748b';
  priceDot = `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.5" fill="${dotColor}" stroke="#fff" stroke-width="1.5"/>`;

  // 個人の買値B・損切S — Moomoo風の左端フラグ + 実線
  let personalLines = '';
  if (costPrice) {
    const bY = cy(costPrice);
    const bTagW = 58;

    // 買値B（青実線 + 左端フラグ）
    personalLines += `<line x1="${bTagW + 7}" y1="${bY.toFixed(1)}" x2="${W - PX}" y2="${bY.toFixed(1)}" stroke="#2563eb" stroke-width="1.5"/>`;
    personalLines += `<rect x="1" y="${(bY - 8).toFixed(1)}" width="${bTagW}" height="16" rx="3" fill="#2563eb"/>`;
    personalLines += `<polygon points="${bTagW + 1},${(bY - 5).toFixed(1)} ${bTagW + 7},${bY.toFixed(1)} ${bTagW + 1},${(bY + 5).toFixed(1)}" fill="#2563eb"/>`;
    personalLines += `<text x="${(1 + bTagW / 2).toFixed(1)}" y="${bY.toFixed(1)}" fill="#fff" font-size="8.5" font-weight="700" text-anchor="middle" dominant-baseline="middle">B $${costPrice.toFixed(1)}</text>`;

  }

  // 実際の売却S（Moomoo約定履歴）— 赤実線 + 左端フラグ
  (sellPrices || []).forEach((sp, i) => {
    const sY = cy(sp);
    const sTagW = 52;
    personalLines += `<line x1="${sTagW + 7}" y1="${sY.toFixed(1)}" x2="${W - PX}" y2="${sY.toFixed(1)}" stroke="#dc2626" stroke-width="1.2"/>`;
    personalLines += `<rect x="1" y="${(sY - 7).toFixed(1)}" width="${sTagW}" height="14" rx="3" fill="#dc2626"/>`;
    personalLines += `<polygon points="${sTagW + 1},${(sY - 4).toFixed(1)} ${sTagW + 7},${sY.toFixed(1)} ${sTagW + 1},${(sY + 4).toFixed(1)}" fill="#dc2626"/>`;
    personalLines += `<text x="${(1 + sTagW / 2).toFixed(1)}" y="${sY.toFixed(1)}" fill="#fff" font-size="8" font-weight="700" text-anchor="middle" dominant-baseline="middle">S $${sp.toFixed(1)}</text>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${buyBand}
    ${personalLines}
    <polyline points="${pts}" fill="none" stroke="#1e3a5f" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pivotLine}
    ${priceDot}
  </svg>`;
}

// ── MARKET UI ────────────────────────────────────────────────
function updateMarketUI() {
  const indicator = document.getElementById('market-indicator');
  const label     = document.getElementById('market-label');
  if (!indicator || !label) return;
  const map = { bull:['🟢','強気相場'], neutral:['🟡','中立'], bear:['🔴','弱気相場'] };
  const [icon, text] = map[app.marketTrend] || ['📊','市場設定'];
  indicator.textContent = icon;
  label.textContent = text;
  document.querySelectorAll('[name="market"]').forEach(r => { r.checked = r.value === app.marketTrend; });
}

// ── TOAST ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type='ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2800);
}

// ── UTILITY ─────────────────────────────────────────────────
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

// ── LIGHTBOX ─────────────────────────────────────────────────
function showLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.remove('hidden');
}
function hideLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.getElementById('lightbox-img').src = '';
}

// ── OCR + DATA FETCH ─────────────────────────────────────────

// OCRテキストからレーティングを抽出
function parseStockPageText(text) {
  const result = {};
  // EPS Rating (1-99)
  let m = text.match(/EPS\s+RATING[^\d]*(\d{1,2})/i);
  if (m) result.epsRating = Math.min(99, Math.max(1, parseInt(m[1])));
  // RS / Relative Strength Rating (1-99)
  m = text.match(/RELATIVE\s+STRENGTH\s+RATING[^\d]*(\d{1,2})/i);
  if (!m) m = text.match(/RS\s+RATING[^\d]*(\d{1,2})/i);
  if (!m) m = text.match(/RELATIVE\s+STRENGTH[^\d]*(\d{1,2})/i);
  if (m) result.rsRating = Math.min(99, Math.max(1, parseInt(m[1])));
  // Composite Rating
  m = text.match(/COMPOSITE\s+RATING[^\d]*(\d{1,3})/i);
  if (m) result.compositeRating = Math.min(99, parseInt(m[1]));
  // SMR® Rating (letter grade A-E) — handle ® symbol
  m = text.match(/SMR[^A-Za-z]*RATING[^A-Ea-e]*([A-Ea-e])/i);
  if (m) result.smrRating = m[1].toUpperCase();
  // A/D (Acc/Dis) Rating — capture A/A+/B/B- etc., store first letter
  m = text.match(/(?:ACC(?:UMULATION)?[\/\s]+DIS(?:TRIBUTION)?|ACC\/DIS|A\/D)\s*RATING[^A-Ea-e]*([A-Ea-e])/i);
  if (!m) m = text.match(/A\/D\s*[:\-]\s*([A-Ea-e])/i);
  if (m) result.adRating = m[1].toUpperCase();
  // Industry Group Rank (1 to 142) — "Industry Group Rank (1 to 142) 8"
  m = text.match(/Industry\s+Group\s+Rank\s*\([^)]*\)\s*(\d{1,3})/i);
  if (!m) m = text.match(/Industry\s+Group\s+Rank[^\d]*(\d{1,3})/i);
  if (m) result.industryRank = Math.min(197, Math.max(1, parseInt(m[1])));
  return result;
}

function applyOcrText(ticker, text) {
  const parsed = parseStockPageText(text);
  const a = app.analyses[ticker];
  if (!a) return 0;
  let filled = 0;
  for (const [k, v] of Object.entries(parsed)) {
    if (v != null) { a[k] = v; filled++; }
  }
  if (filled) scheduleSave();
  return filled;
}

// Google Cloud Vision API を使ったOCR
async function runVisionOcr(ticker, dataURL) {
  const key = localStorage.getItem('canslim-vision-key');
  if (!key) return false; // キーなしはスキップ

  showToast(`${ticker}: Google Vision OCR中...`);
  try {
    const base64 = dataURL.includes(',') ? dataURL.split(',')[1] : dataURL;
    const resp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION' }] }],
        }),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }
    const json = await resp.json();
    const text = json.responses?.[0]?.fullTextAnnotation?.text || '';
    if (!text) { showToast(`${ticker}: テキストが検出されませんでした`); return true; }
    const filled = applyOcrText(ticker, text);
    refreshCard(ticker);
    showToast(filled > 0 ? `${ticker}: OCRで${filled}項目を自動入力しました` : `${ticker}: レーティングが検出されませんでした`);
    return true;
  } catch (e) {
    showToast(`${ticker}: Vision OCR失敗 — ${e.message}`, 'error');
    return true;
  }
}

// Tesseract.js を使ったブラウザ内OCR（Google Visionキーがない場合のフォールバック）
async function runTesseractOcr(ticker, dataURL) {
  if (typeof Tesseract === 'undefined') {
    showToast(`${ticker}: スクリーンショットを保存しました`);
    return false;
  }
  showToast(`${ticker}: Tesseract OCR中...`);
  try {
    const result = await Tesseract.recognize(dataURL, 'eng');
    const text = result.data.text;
    if (!text.trim()) { showToast(`${ticker}: テキストが検出されませんでした`); return true; }
    const filled = applyOcrText(ticker, text);
    refreshCard(ticker);
    showToast(filled > 0 ? `${ticker}: OCRで${filled}項目を自動入力しました` : `${ticker}: レーティングが検出されませんでした`);
    return true;
  } catch (e) {
    showToast(`${ticker}: OCR失敗 — ${e.message}`, 'error');
    return false;
  }
}

// Yahoo Finance から財務データを自動取得（複数プロキシでフォールバック）
async function fetchYahooData(ticker) {
  const t = encodeURIComponent(ticker);
  const proxyFns = [
    u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    u => `https://thingproxy.freeboard.io/fetch/${u}`,
  ];

  // AbortSignalは1リクエストごとに作成（共有するとタイムアウト時に全部中断される）
  const tryFetch = url => fetch(url, { signal: AbortSignal.timeout(12000) })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });

  // URLリストを順番に試し、最初に成功したものを返す
  async function tryUrls(urlAttempts) {
    for (const { url, parse } of urlAttempts) {
      for (const fn of proxyFns) {
        try {
          const j = await tryFetch(fn(url));
          const r = parse(j);
          if (r) return r;
        } catch (_) { /* 次のプロキシへ */ }
      }
    }
    return null;
  }

  const modules = 'financialData,defaultKeyStatistics,summaryDetail,incomeStatementHistory,assetProfile';
  const urlAttempts = [
    {
      url: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${t}?modules=${modules}`,
      parse: j => { const r = j.quoteSummary?.result?.[0]; return r ? { src: 'v10', r } : null; },
    },
    {
      url: `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${t}?modules=${modules}`,
      parse: j => { const r = j.quoteSummary?.result?.[0]; return r ? { src: 'v10', r } : null; },
    },
    {
      url: `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${t}`,
      parse: j => { const r = j.quoteResponse?.result?.[0]; return r ? { src: 'v7', r } : null; },
    },
    {
      url: `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${t}`,
      parse: j => { const r = j.quoteResponse?.result?.[0]; return r ? { src: 'v7', r } : null; },
    },
    {
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1wk&range=1y`,
      parse: j => { const r = j.chart?.result?.[0]; return r ? { src: 'v8', r } : null; },
    },
  ];

  const result = await tryUrls(urlAttempts);
  if (!result) throw new Error('すべてのプロキシで失敗（Yahoo Finance blocked）');

  const data = {};

  if (result.src === 'v10') {
    const { r } = result;
    const fd  = r.financialData || {};
    const ks  = r.defaultKeyStatistics || {};
    const sd  = r.summaryDetail || {};
    const ap  = r.assetProfile || {};
    const isl = r.incomeStatementHistory?.incomeStatementHistory || [];

    const name = ap.longName || ap.shortName || '';
    if (name) data.companyName = name;
    if (ap.longBusinessSummary) {
      const s = ap.longBusinessSummary;
      const cut = s.indexOf('. ', 40);
      data.businessDesc = cut > 0 ? s.slice(0, cut + 1) : s.slice(0, 120) + (s.length > 120 ? '…' : '');
    }
    // C: quarterly EPS growth (defaultKeyStatistics is more accurate than financialData)
    if (ks.earningsQuarterlyGrowth?.raw != null) data.qEpsGrowth = Math.round(ks.earningsQuarterlyGrowth.raw * 100);
    else if (fd.earningsGrowth?.raw != null)     data.qEpsGrowth = Math.round(fd.earningsGrowth.raw * 100);
    if (fd.revenueGrowth?.raw  != null) data.salesGrowth = Math.round(fd.revenueGrowth.raw  * 100);
    if (fd.returnOnEquity?.raw != null) data.roe         = Math.round(fd.returnOnEquity.raw  * 100);
    if (ks.floatShares?.raw    != null) data.floatShares = Math.round(ks.floatShares.raw / 1e6);
    if (ks.heldPercentInstitutions?.raw != null)
      data.instOwnership = Math.round(ks.heldPercentInstitutions.raw * 100);
    // L: RS proxy — stock's 52w return vs S&P 52w return → mapped to 1-99 scale
    const stock52w = ks['52WeekChange']?.raw;
    const sp52w    = ks['SandP52WeekChange']?.raw;
    if (stock52w != null && sp52w != null) {
      const delta = stock52w - sp52w; // outperformance in decimal (e.g. 0.20 = 20pp ahead)
      data.rsProxy = Math.min(99, Math.max(1, Math.round(50 + delta * 100)));
    }
    // S: up/down volume ratio proxy — 10-day avg vs 3-month avg
    const vol10d = sd.averageVolume10days?.raw;
    const vol3m  = sd.averageVolume?.raw;
    if (vol10d != null && vol3m != null && vol3m > 0)
      data.upDownVolRatio = +(vol10d / vol3m).toFixed(2);
    if (isl.length >= 2) {
      const recent = isl[0]?.netIncome?.raw;
      const oldest = isl[isl.length - 1]?.netIncome?.raw;
      const years  = isl.length - 1;
      if (recent && oldest && oldest > 0)
        data.annualEpsGrowth = Math.round((Math.pow(recent / oldest, 1 / years) - 1) * 100);
      let streak = 0;
      for (const s of isl) { if ((s.netIncome?.raw || 0) > 0) streak++; else break; }
      if (streak > 0) data.consecutiveYears = streak;
    }
    const price  = fd.currentPrice?.raw;
    const high52 = sd.fiftyTwoWeekHigh?.raw;
    if (price && high52 && high52 > 0)
      data.fromHigh52w = Math.max(0, Math.round((high52 - price) / high52 * 100));

  } else if (result.src === 'v7') {
    const { r } = result;
    const name = r.longName || r.shortName || '';
    if (name) data.companyName = name;
    const price  = r.regularMarketPrice;
    const high52 = r.fiftyTwoWeekHigh;
    if (price && high52 && high52 > 0)
      data.fromHigh52w = Math.max(0, Math.round((high52 - price) / high52 * 100));
    if (r.floatShares != null) data.floatShares = Math.round(r.floatShares / 1e6);
    // L: RS proxy
    const s52 = r.fiftyTwoWeekChangePercent ?? r['52WeekChange'];
    const p52 = r.SandP52WeekChange;
    if (s52 != null && p52 != null)
      data.rsProxy = Math.min(99, Math.max(1, Math.round(50 + (s52 - p52) * 100)));
    // S: volume ratio proxy
    const v10 = r.averageVolume10days ?? r.averageDailyVolume10Day;
    const v3m = r.averageDailyVolume3Month ?? r.averageVolume;
    if (v10 != null && v3m != null && v3m > 0)
      data.upDownVolRatio = +(v10 / v3m).toFixed(2);

  } else { // v8 chart
    const { r } = result;
    const price  = r.meta?.regularMarketPrice;
    const highs  = (r.indicators?.quote?.[0]?.high || []).filter(h => h != null);
    if (price && highs.length > 0) {
      const high52 = Math.max(...highs);
      data.fromHigh52w = Math.max(0, Math.round((high52 - price) / high52 * 100));
    }
  }

  if (Object.keys(data).length === 0) throw new Error('データを取得できませんでした');
  return data;
}

function applyFetchedData(ticker, data) {
  const a = app.analyses[ticker];
  if (!a) return 0;
  let filled = 0;
  for (const [k, v] of Object.entries(data)) {
    if (v != null) {
      a[k] = v;
      filled++;
      if (k === 'companyName') {
        const s = app.stocks.find(x => x.ticker === ticker);
        if (s) s.companyName = v;
      }
    }
  }
  if (filled) scheduleSave();
  return filled;
}

// ── INIT ─────────────────────────────────────────────────────
function init() {
  // モーダルをJSで描画（HTMLキャッシュに依存しないため）
  document.getElementById('settings-modal').innerHTML = `
    <div class="modal modal-sm">
      <h2>⚙️ 設定</h2>
      <div class="setting-block">
        <label class="setting-label">Google Cloud Vision APIキー（OCR用・任意）</label>
        <p class="setting-hint">
          スクリーンショットをアップロードすると自動OCRします。<br>
          <a href="https://console.cloud.google.com/apis/library/vision.googleapis.com" target="_blank" rel="noopener">Google Cloud Console</a> で無料取得（1,000回/月）
        </p>
        <div style="display:flex;gap:6px;align-items:center;">
          <input type="password" id="vision-key-input" class="setting-input" placeholder="AIza..." autocomplete="off" style="flex:1;min-width:0;" />
          <button class="btn btn-sm" id="toggle-vision-key" title="表示/非表示" style="flex-shrink:0;">👁</button>
          <button class="btn btn-sm" id="copy-vision-key" title="クリップボードにコピー" style="flex-shrink:0;">📋</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px;align-items:center;">
          <button class="btn btn-sm btn-primary" id="save-vision-key">保存</button>
          <span class="setting-status" id="vision-key-status"></span>
        </div>
        <p class="setting-hint" style="color:#b45309;margin-top:4px;">⚠️ Safariのキャッシュクリア前に📋でコピーしておくと再入力不要です</p>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:12px 0;" />
      <p class="modal-desc" style="font-size:.72rem;color:var(--text-3);">
        CAN SLIM 銘柄チェッカー — William O'Neil 式スコアリングツール<br>
        データ保存: localStorage のみ（サーバー通信なし）
      </p>
      <div class="modal-actions">
        <button class="btn btn-primary" id="close-settings">閉じる</button>
      </div>
    </div>
  `;
  document.getElementById('market-modal').innerHTML = `
    <div class="modal modal-sm">
      <h2>市場トレンド（M）</h2>
      <p class="modal-desc">全銘柄共通のスコアに反映されます。</p>
      <div class="radio-group">
        <label class="radio-card">
          <input type="radio" name="market" value="bull" />
          <span class="radio-icon">🟢</span>
          <span class="radio-text"><strong>強気相場</strong><small>上昇トレンド継続中</small></span>
        </label>
        <label class="radio-card">
          <input type="radio" name="market" value="neutral" />
          <span class="radio-icon">🟡</span>
          <span class="radio-text"><strong>中立・調整中</strong><small>方向感なし</small></span>
        </label>
        <label class="radio-card">
          <input type="radio" name="market" value="bear" />
          <span class="radio-icon">🔴</span>
          <span class="radio-text"><strong>弱気相場</strong><small>下降トレンド</small></span>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="save-market">設定</button>
        <button class="btn btn-ghost" id="close-market">キャンセル</button>
      </div>
    </div>
  `;

  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Settings modal
  document.getElementById('settings-btn').addEventListener('click', () => {
    const saved = localStorage.getItem('canslim-vision-key') || '';
    const inp = document.getElementById('vision-key-input');
    inp.type = 'password';
    inp.value = saved || '';
    document.getElementById('vision-key-status').textContent = saved ? '✓ 設定済' : '';
    document.getElementById('settings-modal').classList.remove('hidden');
  });
  document.getElementById('close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
  });
  document.getElementById('settings-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
  document.getElementById('save-vision-key').addEventListener('click', () => {
    const val = document.getElementById('vision-key-input').value.trim();
    if (val) {
      localStorage.setItem('canslim-vision-key', val);
      document.getElementById('vision-key-status').textContent = '✓ 保存しました';
    } else {
      localStorage.removeItem('canslim-vision-key');
      document.getElementById('vision-key-status').textContent = '削除しました';
    }
  });
  document.getElementById('toggle-vision-key').addEventListener('click', () => {
    const inp = document.getElementById('vision-key-input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('copy-vision-key').addEventListener('click', () => {
    const val = localStorage.getItem('canslim-vision-key') || document.getElementById('vision-key-input').value;
    if (!val) { showToast('キーが未設定です'); return; }
    navigator.clipboard.writeText(val).then(() => {
      document.getElementById('vision-key-status').textContent = '📋 コピーしました';
    }).catch(() => {
      document.getElementById('vision-key-input').type = 'text';
      document.getElementById('vision-key-input').select();
      showToast('テキストを選択しました — 長押しでコピー');
    });
  });

  // Market modal
  document.getElementById('market-btn').addEventListener('click', () => {
    updateMarketUI();
    document.getElementById('market-modal').classList.remove('hidden');
  });
  document.getElementById('close-market').addEventListener('click', () => {
    document.getElementById('market-modal').classList.add('hidden');
  });
  document.getElementById('market-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
  document.getElementById('save-market').addEventListener('click', () => {
    const v = document.querySelector('[name="market"]:checked')?.value;
    if (v) {
      app.marketTrend = v;
      localStorage.setItem('canslim-market', v);
      updateMarketUI();
      // Refresh scores for all analyzed tickers
      Object.keys(app.analyses).forEach(t => updateScoreDisplay(t));
    }
    document.getElementById('market-modal').classList.add('hidden');
    renderCompare();
    showToast('市場トレンドを設定しました');
  });

  // Lightbox
  document.getElementById('lightbox-bg').addEventListener('click', hideLightbox);
  document.getElementById('lightbox-close').addEventListener('click', hideLightbox);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideLightbox(); });

  updateMarketUI();

  // 初期タブ: スクリーナー
  switchTab('screener');

  // 前回のワーキングセッションを復元（バックグラウンドで）
  if (loadWorkingSession()) {
    renderImport();
    renderAnalyze();
    renderCompare();
    showToast('前回のリストを復元しました');
  }

  // バックエンドJSONを非同期で読み込み（存在する場合のみ）
  loadBackendData();
}

// ── バックエンドデータ読み込み ────────────────────────────────

const BACKEND_JSON_URL = './data/canslim.json';

async function loadBackendData() {
  try {
    console.log('[backend] fetch start:', BACKEND_JSON_URL);
    const res = await fetch(BACKEND_JSON_URL + '?_=' + Date.now());
    console.log('[backend] fetch status:', res.status, res.ok);
    if (!res.ok) { console.warn('[backend] fetch failed, status', res.status); return; }
    const json = await res.json();
    console.log('[backend] stocks:', json.stocks?.length, 'holdings:', json.holdings?.length);
    app.backendMeta     = { updated: json.updated };
    app.backendData     = {};
    app.backendHoldings = json.holdings    || [];
    app.sellHistory     = json.sellHistory || [];
    (json.stocks || []).forEach(s => { app.backendData[s.ticker] = s; });
    _applyBackendStocks(json.stocks || []);
    renderImport();
    if (app.currentTab === 'screener') renderScreener();
    showToast(`📡 データ更新: ${_formatUpdated(json.updated)}`);
    // Yahoo自動取得はPythonバックエンド(update_yahoo.py)が担当 — ブラウザCORSでは不可
  } catch (e) { console.error('[backend] error:', e); }
}

async function _autoFetchYahooForBackend() {
  // 主要データが未取得の銘柄を対象（qEpsGrowth/rsProxy/upDownVolRatioのいずれか欠損）
  const allKeys = Object.keys(app.backendData);
  const need = allKeys.filter(t => {
    const a = app.analyses[t];
    // バックエンドJSON経由でrsProxyが既に入っている場合はスキップ
    return a && a.rsProxy == null && a.qEpsGrowth == null;
  });
  if (!need.length) return;

  showToast(`📊 Yahoo財務データ取得中 (${need.length}銘柄)...`);
  let ok = 0, fail = 0;
  for (const ticker of need) {
    try {
      const data = await fetchYahooData(ticker);
      const a = app.analyses[ticker];
      if (a) Object.assign(a, data);
      ok++;
    } catch (e) {
      fail++;
      console.warn(`Yahoo取得失敗 [${ticker}]:`, e.message);
    }
    await new Promise(r => setTimeout(r, 400));
  }
  saveSession();
  if (app.currentTab === 'screener') renderScreener();
  if (ok > 0)   showToast(`✅ Yahoo取得: ${ok}/${need.length}銘柄 完了`);
  else if (fail) showToast(`⚠️ Yahoo取得失敗 (${fail}銘柄) — プロキシがブロック中の可能性`, 'error');
}

function _applyBackendStocks(stocks) {
  const tickers = stocks.map(s => s.ticker);
  if (!tickers.length) return;
  // 既存のapp.stocksにマージ（重複排除）
  const existing = new Set(app.stocks.map(s => s.ticker));
  let autoRank = Math.max(0, ...app.stocks.map(s => s.rank || 0)) + 1;
  stocks.forEach(s => {
    if (!existing.has(s.ticker)) {
      app.stocks.push({
        rank: s.top50Rank ?? autoRank++,
        ticker: s.ticker,
        companyName: s.companyName || '',
        compositeRating: s.compositeRating || null,
        selected: false,
      });
    }
  });
  // 分析データに反映
  stocks.forEach(s => {
    const a = app.analyses[s.ticker] || (app.analyses[s.ticker] = newAnalysis(s.ticker, s.companyName || '', s.rank));
    // レーティング
    if (s.epsRating    != null) a.epsRating       = s.epsRating;
    if (s.rsRating     != null) a.rsRating         = s.rsRating;
    if (s.smrRating)            a.smrRating        = s.smrRating;
    if (s.adRating)             a.adRating         = s.adRating;
    if (s.compositeRating != null) a.compositeRating = s.compositeRating;
    // Yahoo財務データ（バックエンドが取得済みの場合はそのまま使用）
    const yahooFields = ['qEpsGrowth', 'annualEpsGrowth', 'consecutiveYears',
                         'salesGrowth', 'roe', 'floatShares', 'upDownVolRatio',
                         'instOwnership', 'rsProxy', 'companyName', 'businessDesc',
                         'sector', 'industry'];
    for (const f of yahooFields) {
      if (s[f] != null) a[f] = s[f];
    }
    if (s.fromHigh52w != null) {
      a.fromHigh52w = s.fromHigh52w;
    } else if (s.weeklyCloses?.length) {
      const recent = s.weeklyCloses.slice(-52);
      const high52 = Math.max(...recent);
      const cur    = recent[recent.length - 1];
      if (high52 > 0) a.fromHigh52w = Math.max(0, Math.round((high52 - cur) / high52 * 100));
    }
    if (s.businessDesc)          a.businessDesc     = s.businessDesc;
    // チャート → ピボット価格・パターン自動入力
    const ch = s.chart || {};
    if (ch.pivot != null) a.pivotPrice = ch.pivot;
    if (ch.pattern) {
      const PAT_MAP = {
        cup_with_handle: 0,
        flat_base:       1,
        double_bottom:   2,
        high_tight_flag: 5,
      };
      const idx = PAT_MAP[ch.pattern];
      if (idx !== undefined) {
        a.chartPatterns = a.chartPatterns || [false,false,false,false,false,false];
        a.chartPatterns[idx] = true;
      }
    }
    app.analyses[s.ticker] = a;
  });
  saveSession();
}

function _formatUpdated(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// インポートタブのチャート情報バッジ
function chartBadge(ticker) {
  const bd = app.backendData[ticker];
  if (!bd) return '';
  const ch = bd.chart || {};
  const sit = ch.buySituation;
  if (!sit || sit === 'no_pattern') return '';
  const icons = { in_buy_zone: '🟢', approaching: '🟡', forming: '⬜', extended: '🔴' };
  const icon = icons[sit] || '';
  const pat  = ch.patternJp ? `${ch.patternJp} ` : '';
  const piv  = ch.pivot ? `$${ch.pivot}` : '';
  const pct  = ch.priceVsPivotPct != null
    ? (ch.priceVsPivotPct >= 0 ? `+${ch.priceVsPivotPct}%` : `${ch.priceVsPivotPct}%`)
    : '';
  return `<span class="chart-badge chart-badge-${sit}">${icon} ${pat}${piv}${pct ? ' ('+pct+')' : ''}</span>`;
}

// ── バックエンド実行 API ─────────────────────────────────────────
const BACKEND_API = 'http://localhost:8888';

async function _runBackend() {
  const panel  = document.getElementById('scr-run-panel');
  const status = document.getElementById('scr-run-status');
  const log    = document.getElementById('scr-run-log');
  const btn    = document.getElementById('scr-run-btn');

  if (!panel) return;
  panel.style.display = '';
  log.textContent = '';

  // サーバー疎通確認
  try {
    await fetch(`${BACKEND_API}/api/status`, { signal: AbortSignal.timeout(1500) });
  } catch {
    status.textContent = '❌ サーバー未起動';
    status.className = 'scr-run-status scr-run-err';
    log.textContent = '以下のコマンドでサーバーを起動してください:\n\ncd ~/Canslim/backend\nsource .venv/bin/activate\npython server.py';
    return;
  }

  // 実行開始
  try {
    const r = await fetch(`${BACKEND_API}/api/run`, { method: 'POST', signal: AbortSignal.timeout(3000) });
    if (r.status === 409) {
      status.textContent = '⏳ 実行中...';
      status.className = 'scr-run-status scr-run-running';
    } else if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    } else {
      status.textContent = '⏳ 実行中...';
      status.className = 'scr-run-status scr-run-running';
      btn.disabled = true;
    }
  } catch (e) {
    status.textContent = `❌ 実行失敗: ${e.message}`;
    status.className = 'scr-run-status scr-run-err';
    return;
  }

  // ポーリングでログを取得
  let lastLen = 0;
  const poll = setInterval(async () => {
    try {
      const r = await fetch(`${BACKEND_API}/api/status`, { signal: AbortSignal.timeout(3000) });
      const s = await r.json();

      // ログ差分を追記
      const lines = s.log || [];
      if (lines.length > lastLen) {
        log.textContent += lines.slice(lastLen).join('\n') + '\n';
        log.scrollTop = log.scrollHeight;
        lastLen = lines.length;
      }

      if (!s.running) {
        clearInterval(poll);
        btn.disabled = false;
        if (s.exitCode === 0) {
          status.textContent = `✅ 完了（${s.stocks}銘柄）`;
          status.className = 'scr-run-status scr-run-ok';
          // JSON を再読み込みしてスクリーナーを更新
          await loadBackendData();
        } else {
          status.textContent = `❌ エラー (exit ${s.exitCode})`;
          status.className = 'scr-run-status scr-run-err';
        }
      }
    } catch (_) { /* ネットワーク一時エラーは無視 */ }
  }, 1500);
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('unload', function(){ saveWorkingSession(); });
window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });
