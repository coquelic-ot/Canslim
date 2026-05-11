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
  backendData:   {},      // ticker → バックエンドJSON (IBD+Yahoo+チャート)
  backendMeta:   null,    // { updated: ISO文字列 }
};

const CRITERIA = ['C','A','N','S','L','I','M'];
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
  if (a.rsRating != null)      parts.push({ v: a.rsRating,            w: 0.7 });
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
  s.total = vals.length ? Math.round(vals.reduce((x,y)=>x+y,0)/vals.length) : null;
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
  if (v >= 1.0) return 40;  return 20;
}
function mapFloat(v)      {
  if (v <= 10)  return 100; if (v <= 50)  return 85; if (v <= 150) return 65;
  if (v <= 300) return 45;  return 25;
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

// ── TICKER PARSING ───────────────────────────────────────────
// Moomoo保有銘柄テキスト専用パーサー
// 「大文字2〜5字 → 数字（数量/価格）」の行パターンのみをティッカーと判定
function parseMoomooText(text) {
  const SKIP = new Set([
    'MV','QTY','PL','SG','SGD','USD','HKD','CNY','GBP','EUR','JPY','AUD','CAD','CHF',
    'KRW','TWD','INR','BRL','NZD',
    'ETF','INC','LLC','CORP','LTD','THE','AND','FOR','NYSE','AMEX','NASDAQ','OTC',
    'TECH','TRADE','SEMI','INFR','ENVIR','SERV','TEC',
    'IBD','TOP','CHG','VOL','PRI','EPS','RS','SMR','COMP','YTD','QTR','PCT',
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
    'IBD','TOP','CHG','VOL','PRI','THE','AND','FOR','USD','ETF','INC','LLC',
    'NEW','HIGH','LOW','BUY','PRICE','EPS','RS','SMR','COMP','YTD','QTR',
    'PCT','AVG','MKT','CAP','SHS','EST','REV','NET','OPR','RANK','DAY',
    'WK','MO','YR','ALL','RTG','ADJ','DIV','ROE','ROA','SMA','ATH','ATL',
    'IPO','CEO','CFO','USA','NYSE','AMEX','OTC','ADR','REIT','MLP','SPAC',
    'CAN','SLIM','IBD50','STOCK','SHARE','FUND','HOLD','SELL','OPEN','CLOSE',
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
    ticker, companyName, businessDesc: null, ibdRank: rank,
    // IBD Ratings
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
    industryRank: null,
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
        <p>IBDアプリのスクショを参考に、ティッカーシンボルを入力してください（最大4スロット）</p>
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
            <span class="stock-rank">#${s.rank}</span>
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
        <p>まず「インポート」タブでIBD Top 50を読み込み、銘柄を選択してください。</p>
      </div>`;
    return;
  }

  panel.innerHTML = `
    <div class="section">
      <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2>Step 2 — CAN SLIM 分析</h2>
          <p>各銘柄のIBDスクリーンショットをアップロード、または手動で入力してください</p>
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
        ${a.ibdRank != null ? `<span class="stock-card-rank">#${a.ibdRank}</span>` : ''}
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
                   再アップ<input type="file" accept="image/*" class="ibd-file" data-ticker="${ticker}" style="display:none;" />
                 </label>
               </div>`
            : `<div class="card-upload" id="upload-${ticker}">
                 📸 IBDスクリーンショット（任意）
                 <input type="file" accept="image/*" class="ibd-file" data-ticker="${ticker}" />
               </div>`
          }
          <details class="ocr-paste-box">
            <summary class="ocr-paste-summary">📋 IBDテキスト貼り付けで自動入力</summary>
            <p class="ocr-paste-guide">⚙️ 設定にAPIキーを入れると画像アップロードで自動OCR<br>手動: Google Lensアプリでスクショを開く → テキスト選択 → コピー → ここに貼り付け</p>
            <textarea class="ocr-paste-area" placeholder="EPS Rating: 95&#10;RS Rating: 91&#10;SMR Rating: A&#10;A/D Rating: B&#10;Composite Rating: 97"></textarea>
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
              <label>A/D Rating</label>
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
              <label>RS Rating (1-99)</label>
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
              <label>SMR Rating</label>
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

  // IBD screenshot upload → auto Vision OCR if key is set
  card.querySelectorAll('.ibd-file').forEach(input => {
    input.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dataURL = await fileToDataURL(file);
        a.screenshotThumb = dataURL;
        refreshCard(ticker);
        const usedOcr = await runVisionOcr(ticker, dataURL);
        if (!usedOcr) showToast(`${ticker}: スクリーンショットを保存しました`);
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

  // OCR text paste → parse IBD ratings
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

  if      (name === 'import')  renderImport();
  else if (name === 'analyze') renderAnalyze();
  else if (name === 'compare') renderCompare();
  else if (name === 'history') renderHistory();
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

// IBD個別ページのOCRテキストからレーティングを抽出
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
  // Industry Group Rank (1 to 142) — IBD format: "Industry Group Rank (1 to 142) 8"
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

// Yahoo Finance から財務データを自動取得（複数プロキシでフォールバック）
async function fetchYahooData(ticker) {
  const t = encodeURIComponent(ticker);
  const proxyFns = [
    u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    u => `https://thingproxy.freeboard.io/fetch/${u}`,
  ];

  const sig = AbortSignal.timeout(15000);
  const tryFetch = url => fetch(url, { signal: sig })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });

  // v10 quoteSummary — full financial data
  const modules = 'financialData,defaultKeyStatistics,summaryDetail,incomeStatementHistory,assetProfile';
  const v10Attempts = ['query2', 'query1'].flatMap(h => proxyFns.map(fn => {
    const url = `https://${h}.finance.yahoo.com/v10/finance/quoteSummary/${t}?modules=${modules}`;
    return tryFetch(fn(url)).then(j => {
      const r = j.quoteSummary?.result?.[0];
      if (!r) throw new Error('no v10 data');
      return { src: 'v10', r };
    });
  }));

  // v7 quote — lightweight; returns 52w high + basic metrics
  const v7Attempts = ['query2', 'query1'].flatMap(h => proxyFns.map(fn => {
    const url = `https://${h}.finance.yahoo.com/v7/finance/quote?symbols=${t}`;
    return tryFetch(fn(url)).then(j => {
      const r = j.quoteResponse?.result?.[0];
      if (!r) throw new Error('no v7 data');
      return { src: 'v7', r };
    });
  }));

  // v8 chart — 1y weekly OHLCV; compute 52w high from actual data
  const v8Attempts = ['query2', 'query1'].flatMap(h => proxyFns.map(fn => {
    const url = `https://${h}.finance.yahoo.com/v8/finance/chart/${t}?interval=1wk&range=1y`;
    return tryFetch(fn(url)).then(j => {
      const cr = j.chart?.result?.[0];
      if (!cr) throw new Error('no v8 data');
      return { src: 'v8', r: cr };
    });
  }));

  let result;
  try {
    result = await Promise.any([...v10Attempts, ...v7Attempts, ...v8Attempts]);
  } catch {
    throw new Error('すべてのプロキシで失敗（Yahoo Finance blocked）');
  }

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
    if (fd.earningsGrowth?.raw != null) data.qEpsGrowth  = Math.round(fd.earningsGrowth.raw * 100);
    if (fd.revenueGrowth?.raw  != null) data.salesGrowth = Math.round(fd.revenueGrowth.raw  * 100);
    if (fd.returnOnEquity?.raw != null) data.roe         = Math.round(fd.returnOnEquity.raw  * 100);
    if (ks.floatShares?.raw    != null) data.floatShares = Math.round(ks.floatShares.raw / 1e6);
    if (ks.heldPercentInstitutions?.raw != null)
      data.instOwnership = Math.round(ks.heldPercentInstitutions.raw * 100);
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
          IBDスクショをアップロードすると自動OCRします。<br>
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

  // 前回のワーキングセッションを復元
  if (loadWorkingSession()) {
    renderImport();
    renderAnalyze();
    renderCompare();
    showToast('前回のリストを復元しました');
  } else {
    renderImport();
  }

  // バックエンドJSONを非同期で読み込み（存在する場合のみ）
  loadBackendData();
}

// ── バックエンドデータ読み込み ────────────────────────────────

const BACKEND_JSON_URL = './data/canslim.json';

async function loadBackendData() {
  try {
    const res = await fetch(BACKEND_JSON_URL + '?_=' + Date.now());
    if (!res.ok) return;
    const json = await res.json();
    app.backendMeta = { updated: json.updated };
    app.backendData = {};
    (json.stocks || []).forEach(s => { app.backendData[s.ticker] = s; });
    // IBD50銘柄を自動インポート
    _applyBackendStocks(json.stocks || []);
    renderImport();
    showToast(`📡 データ更新: ${_formatUpdated(json.updated)}`);
  } catch (_) { /* バックエンドJSONが未作成の場合は無視 */ }
}

function _applyBackendStocks(stocks) {
  const tickers = stocks.map(s => s.ticker);
  if (!tickers.length) return;
  // 既存のapp.stocksにマージ（重複排除）
  const existing = new Set(app.stocks.map(s => s.ticker));
  stocks.forEach(s => {
    if (!existing.has(s.ticker)) {
      app.stocks.push({
        rank: s.rank, ticker: s.ticker,
        companyName: s.companyName || '',
        compositeRating: s.compositeRating || null,
        selected: false,
      });
    }
  });
  // 分析データに反映
  stocks.forEach(s => {
    const a = app.analyses[s.ticker] || newAnalysis(s.ticker, s.companyName || '', s.rank);
    // IBDレーティング
    if (s.epsRating    != null) a.epsRating       = s.epsRating;
    if (s.rsRating     != null) a.rsRating         = s.rsRating;
    if (s.smrRating)            a.smrRating        = s.smrRating;
    if (s.adRating)             a.adRating         = s.adRating;
    if (s.compositeRating != null) a.compositeRating = s.compositeRating;
    // Yahoo財務データ
    if (s.qEpsGrowth    != null) a.qEpsGrowth      = s.qEpsGrowth;
    if (s.annualEpsGrowth != null) a.annualEpsGrowth = s.annualEpsGrowth;
    if (s.salesGrowth   != null) a.salesGrowth     = s.salesGrowth;
    if (s.roe           != null) a.roe              = s.roe;
    if (s.floatShares   != null) a.floatShares      = s.floatShares;
    if (s.fromHigh52w   != null) a.fromHigh52w      = s.fromHigh52w;
    if (s.instOwnership != null) a.instOwnership    = s.instOwnership;
    if (s.companyName)           a.companyName      = s.companyName;
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

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('unload', function(){ saveWorkingSession(); });
window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });
