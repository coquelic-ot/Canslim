// ============================================================
//  stock.js — CAN SLIM 銘柄チェッカー
// ============================================================

// ── STATE ───────────────────────────────────────────────────
const app = {
  apiKey:      localStorage.getItem('canslim-api-key') || '',
  marketTrend: localStorage.getItem('canslim-market')  || '',
  top50Image:  null,
  top50Mime:   null,
  stocks:      [],       // {rank, ticker, companyName, compositeRating, selected}
  analyses:    {},       // {[ticker]: analysisObj}
  history:     JSON.parse(localStorage.getItem('canslim-history') || '[]'),
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

// ── CLAUDE API ───────────────────────────────────────────────
async function callClaude(base64, mimeType, prompt) {
  if (!app.apiKey) throw new Error('APIキーが設定されていません。⚙から設定してください。');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': app.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text',  text: prompt },
        ]
      }]
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

const TOP50_PROMPT = `この画像はIBD (Investor's Business Daily) のTop 50またはスクリーナーリストです。
表示されているすべての銘柄を抽出し、以下のJSON形式のみで返してください（説明文不要）:
{"stocks":[{"rank":1,"ticker":"NVDA","companyName":"Nvidia Corp","compositeRating":99,"epsRating":99,"rsRating":97,"smrRating":"A","adRating":"A"}]}
- tickerは大文字、ratingは数値またはnull、smrRating/adRatingはA-Eの文字またはnull`;

function makeStockPrompt(ticker) {
  return `この画像はIBDの${ticker}の銘柄分析ページです。
表示されているすべての指標を抽出し、以下のJSON形式のみで返してください（説明文不要）:
{"ticker":"${ticker}","compositeRating":null,"epsRating":null,"rsRating":null,"smrRating":null,"adRating":null,"qEpsGrowth":null,"annualEpsGrowth":null,"roe":null,"salesGrowth":null,"upDownVolRatio":null,"instOwnershipPct":null,"instCountChange":null,"floatShares":null}
- qEpsGrowth: 直近四半期EPS成長率(%)、annualEpsGrowth: 年間EPS成長率(%)、roe: 自己資本利益率(%)
- salesGrowth: 直近売上成長率(%)、upDownVolRatio: 出来高比率(数値)
- instOwnershipPct: 機関投資家保有比率(%)、instCountChange: 機関投資家数の変化(正=増加/負=減少)
- floatShares: 浮動株数(百万株)、各値はnullが許容`;
}

async function ocrTop50(base64, mimeType) {
  const text = await callClaude(base64, mimeType, TOP50_PROMPT);
  const json = extractJson(text);
  return json.stocks || [];
}

async function ocrStockPage(base64, mimeType, ticker) {
  const text = await callClaude(base64, mimeType, makeStockPrompt(ticker));
  return extractJson(text);
}

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('JSONの抽出に失敗しました');
  return JSON.parse(m[0]);
}

// ── FILE HANDLING ────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── DEFAULT ANALYSIS OBJECT ──────────────────────────────────
function newAnalysis(ticker, companyName='', rank=null) {
  return {
    ticker, companyName, ibdRank: rank,
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
  const hasStocks = app.stocks.length > 0;
  const selCount  = app.stocks.filter(s => s.selected).length;

  panel.innerHTML = `
    <div class="section">
      <div class="section-header">
        <h2>Step 1 — IBD Top 50 インポート</h2>
        <p>IBD Top 50 またはスクリーナーのスクリーンショットをアップロードしてください</p>
      </div>

      <div class="upload-zone" id="top50-zone">
        <div class="upload-icon">📸</div>
        <p class="upload-text">クリックまたはドラッグ＆ドロップ</p>
        <p class="upload-hint">IBD Top 50 / スクリーナー スクリーンショット（PNG / JPG）</p>
        <input type="file" id="top50-file" accept="image/*" class="file-input" />
      </div>

      ${app.top50Image ? `
        <div class="preview-wrap" style="margin-top:12px;">
          <img src="${app.top50Image}" class="image-preview" />
          <div class="preview-label">アップロード済みスクリーンショット</div>
        </div>
      ` : ''}

      <div id="import-processing"></div>

      ${hasStocks ? `
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
              <label class="stock-item">
                <input type="checkbox" data-ticker="${s.ticker}" ${s.selected ? 'checked' : ''} />
                <span class="stock-rank">#${s.rank}</span>
                <span class="stock-ticker">${esc(s.ticker)}</span>
                <span class="stock-name">${esc(s.companyName)}</span>
                ${s.compositeRating != null ? `<span class="stock-cr ${s.compositeRating>=90?'high':''}">${s.compositeRating}</span>` : ''}
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
      ` : ''}
    </div>
  `;

  // Upload zone
  const zone = document.getElementById('top50-zone');
  const fileInput = document.getElementById('top50-file');

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', async e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) await handleTop50Upload(file);
  });
  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (file) await handleTop50Upload(file);
  });

  if (hasStocks) {
    document.getElementById('sel-all').addEventListener('click', () => {
      app.stocks.forEach(s => s.selected = true);
      renderImport();
    });
    document.getElementById('sel-none').addEventListener('click', () => {
      app.stocks.forEach(s => s.selected = false);
      renderImport();
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
      });
    });
    document.getElementById('go-analyze')?.addEventListener('click', () => {
      const sel = app.stocks.filter(s => s.selected);
      sel.forEach(s => {
        if (!app.analyses[s.ticker]) {
          app.analyses[s.ticker] = newAnalysis(s.ticker, s.companyName, s.rank);
          // Pre-fill IBD ratings from Top50 OCR if available
          const a = app.analyses[s.ticker];
          if (s.compositeRating != null) a.compositeRating = s.compositeRating;
          if (s.epsRating != null)       a.epsRating        = s.epsRating;
          if (s.rsRating  != null)       a.rsRating         = s.rsRating;
          if (s.smrRating != null)       a.smrRating        = s.smrRating;
          if (s.adRating  != null)       a.adRating         = s.adRating;
        }
      });
      switchTab('analyze');
    });
  }
}

async function handleTop50Upload(file) {
  const proc = document.getElementById('import-processing');
  if (!proc) return;
  proc.innerHTML = `<div class="processing-banner"><div class="spinner"></div>Claude Vision OCR 処理中…</div>`;

  try {
    const [base64, dataURL] = await Promise.all([fileToBase64(file), fileToDataURL(file)]);
    app.top50Image = dataURL;
    app.top50Mime  = file.type || 'image/jpeg';

    const stocks = await ocrTop50(base64, app.top50Mime);
    app.stocks = stocks.map(s => ({ ...s, selected: true }));
    showToast(`${stocks.length}銘柄を読み込みました`);
  } catch(e) {
    showToast('OCR失敗: ' + e.message, 'error');
  }
  renderImport();
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
        <span class="stock-card-name">${esc(a.companyName)}</span>
        <div class="total-badge ${scoreClass(scores.total)}" id="badge-${ticker}">
          ${scores.total != null ? scores.total : '-'}
        </div>
      </div>

      <div class="stock-card-body">
        <!-- IBD Screenshot Upload -->
        <div>
          ${a.screenshotThumb
            ? `<div class="card-upload-preview" id="upload-${ticker}">
                 <img src="${a.screenshotThumb}" style="height:32px;border-radius:4px;object-fit:contain;" />
                 <span>IBD画面読み込み済 ✓</span>
                 <label style="cursor:pointer;color:#2563eb;font-size:.75rem;text-decoration:underline;">
                   再アップ<input type="file" accept="image/*" class="ibd-file" data-ticker="${ticker}" style="display:none;" />
                 </label>
               </div>`
            : `<div class="card-upload" id="upload-${ticker}">
                 📸 IBDの銘柄ページをアップ（自動入力）
                 <input type="file" accept="image/*" class="ibd-file" data-ticker="${ticker}" />
               </div>`
          }
          <div class="upload-proc" id="proc-${ticker}"></div>
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

  // IBD screenshot upload
  card.querySelectorAll('.ibd-file').forEach(input => {
    input.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const proc = document.getElementById(`proc-${ticker}`);
      if (proc) proc.innerHTML = `<div class="processing-banner"><div class="spinner"></div>IBDページ OCR中…</div>`;
      try {
        const [base64, dataURL] = await Promise.all([fileToBase64(file), fileToDataURL(file)]);
        const metrics = await ocrStockPage(base64, file.type || 'image/jpeg', ticker);
        mergeOcrMetrics(a, metrics);
        a.screenshotThumb = dataURL;
        showToast(`${ticker}: IBD指標を自動入力しました`);
      } catch(ex) {
        showToast('OCR失敗: ' + ex.message, 'error');
      }
      if (proc) proc.innerHTML = '';
      refreshCard(ticker);
    });
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

function mergeOcrMetrics(a, m) {
  const map = {
    compositeRating: 'compositeRating', epsRating: 'epsRating', rsRating: 'rsRating',
    smrRating: 'smrRating', adRating: 'adRating',
    qEpsGrowth: 'qEpsGrowth', annualEpsGrowth: 'annualEpsGrowth',
    roe: 'roe', salesGrowth: 'salesGrowth',
    upDownVolRatio: 'upDownVolRatio', floatShares: 'floatShares',
    instOwnershipPct: 'instOwnership',
  };
  for (const [src, dst] of Object.entries(map)) {
    if (m[src] != null) a[dst] = m[src];
  }
  if (m.instCountChange != null) {
    a.instTrend = m.instCountChange > 0 ? 'increasing' : m.instCountChange < 0 ? 'decreasing' : 'stable';
  }
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

// ── INIT ─────────────────────────────────────────────────────
function init() {
  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Settings modal
  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('api-key-input').value = app.apiKey;
    document.getElementById('api-status').textContent = '';
    document.getElementById('settings-modal').classList.remove('hidden');
  });
  document.getElementById('close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
  });
  document.getElementById('settings-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
  document.getElementById('save-api-key').addEventListener('click', () => {
    const key = document.getElementById('api-key-input').value.trim();
    const status = document.getElementById('api-status');
    if (!key) { status.className='api-status err'; status.textContent='APIキーを入力してください'; return; }
    app.apiKey = key;
    localStorage.setItem('canslim-api-key', key);
    status.className='api-status ok'; status.textContent='✓ 保存しました';
    setTimeout(() => document.getElementById('settings-modal').classList.add('hidden'), 800);
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

  updateMarketUI();
  renderImport();
}

document.addEventListener('DOMContentLoaded', init);
