// ============================================================
//  app.js — ディクテーションアプリ ロジック
// ============================================================

// ── State ──────────────────────────────────────────────────
const state = {
  mode: 'B',
  currentIndex: 0,
  slowMode: false,
  results: [],
  recognition: null,
  transcript: null,
};

// ── Helpers ─────────────────────────────────────────────────

function currentData() {
  return state.mode === 'B' ? PART_B : PART_C;
}

function currentItem() {
  return currentData()[state.currentIndex];
}

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[.,!?;:'"-]/g, '')
    .trim();
}

function tokenize(str) {
  return str.trim().split(/\s+/).filter(Boolean);
}

// ── Text-to-Speech ──────────────────────────────────────────

function speak(text, rate) {
  if (!window.speechSynthesis) {
    showToast('このブラウザは音声再生に対応していません');
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = rate ?? (state.slowMode ? 0.7 : 1.0);

  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en') && !v.name.includes('Google'));
  if (enVoice) utter.voice = enVoice;

  window.speechSynthesis.speak(utter);
}

function speakCurrent() {
  const item = currentItem();
  const text = state.mode === 'B' ? item.sentence : item.full;
  speak(text);
}

// ── Speech Recognition ───────────────────────────────────────

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function startListening(correctSentence) {
  const SR = getSpeechRecognition();
  if (!SR) {
    showToast('このブラウザは音声認識に対応していません（Chrome推奨）');
    return;
  }

  // Stop any TTS before recording
  window.speechSynthesis && window.speechSynthesis.cancel();

  if (state.recognition) {
    state.recognition.abort();
    state.recognition = null;
  }

  // やり直し時：前の認識テキストと採点ボタンを隠す
  state.transcript = null;
  const recognized = document.getElementById('recognized-text');
  if (recognized) { recognized.textContent = ''; recognized.classList.remove('visible'); }
  const checkBtn = document.getElementById('btn-check');
  if (checkBtn) checkBtn.style.display = 'none';

  const rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  state.recognition = rec;

  const btn = document.getElementById('btn-mic');
  if (btn) {
    btn.textContent = '⏹ 録音中…';
    btn.classList.add('recording');
    btn.onclick = () => { rec.stop(); };
  }

  rec.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    finishListening(transcript, correctSentence);
  };

  rec.onerror = (event) => {
    state.recognition = null;
    resetMicButton(correctSentence);
    if (event.error === 'not-allowed') {
      showToast('マイクの使用を許可してください');
    } else if (event.error === 'no-speech') {
      showToast('音声が聞き取れませんでした。もう一度お試しください');
    } else {
      showToast('認識エラー: ' + event.error);
    }
  };

  // onend は onresult の後に必ず呼ばれる。onresult が来た場合は
  // finishListening 内で既にリセット済みなので、transcript がある場合はスキップ。
  rec.onend = () => {
    state.recognition = null;
    if (!state.transcript) resetMicButton(correctSentence);
  };

  rec.start();
}

function finishListening(transcript, correctSentence) {
  state.recognition = null;
  state.transcript = transcript;
  resetMicButton(correctSentence);

  const recognized = document.getElementById('recognized-text');
  if (recognized) {
    recognized.textContent = '認識: ' + transcript;
    recognized.classList.add('visible');
  }

  const checkBtn = document.getElementById('btn-check');
  if (checkBtn) checkBtn.style.display = 'block';
}

function submitAnswer(correctSentence) {
  if (!state.transcript) {
    showToast('先にマイクで話してください');
    return;
  }

  const { wordResults, pct } = scoreAnswer(state.transcript, correctSentence);
  state.results.push({ pct });
  renderResult(wordResults, pct);

  document.getElementById('btn-check').style.display = 'none';
  document.getElementById('btn-mic').disabled = true;
  document.getElementById('btn-next').style.display = 'block';
  updateProgress();
}

function resetMicButton(correctSentence) {
  const btn = document.getElementById('btn-mic');
  if (!btn) return;
  btn.textContent = '🎤 マイクで答える';
  btn.classList.remove('recording');
  btn.disabled = false;
  const correct = correctSentence || (state.mode === 'B' ? currentItem().sentence : currentItem().full);
  btn.onclick = () => startListening(correct);
}

// ── Scoring ─────────────────────────────────────────────────

function scoreAnswer(userInput, correctSentence) {
  const userWords    = tokenize(userInput).map(normalize);
  const correctWords = tokenize(correctSentence).map(normalize);
  const wordResults  = [];
  const maxLen = Math.max(userWords.length, correctWords.length);

  for (let i = 0; i < maxLen; i++) {
    const u = userWords[i];
    const c = correctWords[i];

    if (c === undefined) {
      wordResults.push({ display: u, status: 'wrong' });
    } else if (u === undefined) {
      wordResults.push({ display: c, status: 'missing' });
    } else if (u === c) {
      wordResults.push({ display: tokenize(correctSentence)[i], status: 'correct' });
    } else {
      wordResults.push({ display: tokenize(correctSentence)[i], status: 'wrong' });
    }
  }

  const correctCount = wordResults.filter(w => w.status === 'correct').length;
  const pct = correctWords.length > 0
    ? Math.round((correctCount / correctWords.length) * 100)
    : 0;

  return { wordResults, correctCount, totalWords: correctWords.length, pct };
}

// ── Render result ────────────────────────────────────────────

function renderResult(wordResults, pct) {
  const container = document.getElementById('result-words');
  container.innerHTML = '';

  wordResults.forEach(w => {
    const chip = document.createElement('span');
    chip.className = `word-chip ${w.status}`;
    chip.textContent = w.display;
    container.appendChild(chip);
  });

  const summary = document.getElementById('result-summary');
  if (pct === 100) {
    summary.className = 'result-summary all-correct';
    summary.textContent = '完璧です！';
  } else if (pct >= 60) {
    summary.className = 'result-summary partial';
    summary.textContent = `${pct}% 正解 — もう一度聞いて繰り返しましょう`;
  } else {
    summary.className = 'result-summary wrong';
    summary.textContent = `${pct}% 正解 — 答えを確認して練習しましょう`;
  }

  document.getElementById('result-area').classList.add('visible');
}

// ── Progress bar ─────────────────────────────────────────────

function updateProgress() {
  const total = currentData().length;
  const done  = state.results.length;
  const correct = state.results.filter(r => r.pct === 100).length;
  const overallPct = done > 0 ? Math.round((correct / done) * 100) : 0;

  document.getElementById('progress-text').textContent =
    `Q ${state.currentIndex + 1} / ${total}`;
  document.getElementById('progress-score').textContent =
    done > 0 ? `正解率 ${overallPct}%` : '';

  const fillPct = total > 0 ? (state.currentIndex / total) * 100 : 0;
  document.getElementById('progress-bar-fill').style.width = fillPct + '%';
}

// ── Toast ────────────────────────────────────────────────────

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Shared toggles ───────────────────────────────────────────

function toggleAnswer() {
  const box = document.getElementById('answer-box');
  const btn = document.getElementById('btn-reveal');
  const visible = box.classList.toggle('visible');
  btn.textContent = visible ? '答えを隠す' : '答えを見る';
}

function toggleTranslation() {
  const box = document.getElementById('translation-box');
  const btn = document.getElementById('btn-trans');
  const visible = box.classList.toggle('visible');
  btn.textContent = visible ? '訳を隠す' : '訳を見る';
}

function toggleHint() {
  const box = document.getElementById('hint-box');
  const btn = document.getElementById('btn-hint');
  const visible = box.classList.toggle('visible');
  btn.textContent = visible ? 'ヒントを隠す' : 'チャンクヒント';
}

// ── Part B ───────────────────────────────────────────────────

function renderPartB() {
  const item   = currentItem();
  const total  = PART_B.length;
  const isLast = state.currentIndex === total - 1;

  document.getElementById('partb-panel').innerHTML = `
    <div class="progress-section">
      <div class="progress-meta">
        <span id="progress-text">Q ${state.currentIndex + 1} / ${total}</span>
        <span class="progress-score" id="progress-score"></span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="progress-bar-fill" style="width:0%"></div>
      </div>
    </div>

    <div class="card">
      <div class="play-controls">
        <button class="btn btn-play" onclick="speakCurrent()">▶ 再生</button>
        <button class="btn btn-slow ${state.slowMode ? 'active' : ''}" id="btn-slow" onclick="toggleSlow()">
          ${state.slowMode ? '🐢 スロー ON' : '🐢 スロー'}
        </button>
      </div>

      <button class="btn btn-mic" id="btn-mic" onclick="startListening('${item.sentence.replace(/'/g, "\\'")}')">
        🎤 マイクで答える
      </button>

      <div class="recognized-text" id="recognized-text"></div>

      <button class="btn btn-check" id="btn-check" style="display:none"
        onclick="submitAnswer('${item.sentence.replace(/'/g, "\\'")}')">採点する</button>

      <div class="action-row" style="margin-top:12px;">
        <button class="btn btn-secondary" id="btn-reveal" onclick="toggleAnswer()">答えを見る</button>
        <button class="btn btn-secondary" id="btn-trans" onclick="toggleTranslation()">訳を見る</button>
      </div>

      <div class="answer-box" id="answer-box">${item.sentence}</div>
      <div class="translation-box" id="translation-box">${item.translation}</div>

      <div class="result-area" id="result-area">
        <div class="result-label">採点結果</div>
        <div class="result-words" id="result-words"></div>
        <div class="result-summary" id="result-summary"></div>
      </div>

      <button class="btn btn-next" id="btn-next" style="display:none"
        onclick="${isLast ? 'showCompletedB()' : 'nextQuestionB()'}">
        ${isLast ? '結果を見る 🎉' : '次の問題へ →'}
      </button>
    </div>
  `;

  updateProgress();
}

function nextQuestionB() {
  state.currentIndex++;
  renderPartB();
}

function showCompletedB() {
  const correct = state.results.filter(r => r.pct === 100).length;
  const total   = state.results.length;
  const pct     = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('partb-panel').innerHTML = `
    <div class="card completed-card">
      <div style="font-size:2.5rem;">🎉</div>
      <div class="big-score">${pct}%</div>
      <div class="score-label">${correct} / ${total} 問 正解</div>
      <p style="font-size:0.9rem;color:#666;margin-bottom:24px;">
        お疲れ様でした！苦手だった問題は繰り返し練習しましょう。
      </p>
      <button class="btn-restart" onclick="restartMode('B')">もう一度挑戦する</button>
    </div>
  `;
}

// ── Part C ───────────────────────────────────────────────────

function renderPartC() {
  const item   = currentItem();
  const total  = PART_C.length;
  const isLast = state.currentIndex === total - 1;

  const chunkButtons = item.chunks.map((chunk, i) => `
    <button class="btn-chunk" onclick="speakChunk(${i})">
      <span class="chunk-num">${i + 1}</span>${chunk}
    </button>
  `).join('');

  document.getElementById('partc-panel').innerHTML = `
    <div class="progress-section">
      <div class="progress-meta">
        <span id="progress-text">Q ${state.currentIndex + 1} / ${total}</span>
        <span class="progress-score" id="progress-score"></span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="progress-bar-fill" style="width:0%"></div>
      </div>
    </div>

    <div class="card">
      <div class="play-controls">
        <button class="btn btn-play" onclick="speakCurrent()">▶ 全文再生</button>
        <button class="btn btn-slow ${state.slowMode ? 'active' : ''}" id="btn-slow" onclick="toggleSlow()">
          ${state.slowMode ? '🐢 スロー ON' : '🐢 スロー'}
        </button>
      </div>

      <div class="chunk-section">
        <div class="chunk-label">チャンク再生</div>
        <div class="chunk-buttons">${chunkButtons}</div>
      </div>

      <button class="btn btn-mic" id="btn-mic" onclick="startListening('${item.full.replace(/'/g, "\\'")}')">
        🎤 マイクで答える
      </button>

      <div class="recognized-text" id="recognized-text"></div>

      <button class="btn btn-check" id="btn-check" style="display:none"
        onclick="submitAnswer('${item.full.replace(/'/g, "\\'")}')">採点する</button>

      <div class="action-row" style="margin-top:12px;">
        <button class="btn btn-secondary" id="btn-hint" onclick="toggleHint()">チャンクヒント</button>
        <button class="btn btn-secondary" id="btn-reveal" onclick="toggleAnswer()">答えを見る</button>
        <button class="btn btn-secondary" id="btn-trans" onclick="toggleTranslation()">訳を見る</button>
      </div>

      <div class="hint-box" id="hint-box">
        <strong>チャンクの区切り：</strong>
        <div class="hint-chunks">
          ${item.chunks.map(c => `<span class="hint-chunk-pill">${c}</span>`).join('')}
        </div>
      </div>
      <div class="answer-box" id="answer-box">${item.full}</div>
      <div class="translation-box" id="translation-box">${item.translation}</div>

      <div class="result-area" id="result-area">
        <div class="result-label">採点結果</div>
        <div class="result-words" id="result-words"></div>
        <div class="result-summary" id="result-summary"></div>
      </div>

      <button class="btn btn-next" id="btn-next" style="display:none"
        onclick="${isLast ? 'showCompletedC()' : 'nextQuestionC()'}">
        ${isLast ? '結果を見る 🎉' : '次の問題へ →'}
      </button>
    </div>
  `;

  updateProgress();
}

function speakChunk(index) {
  speak(currentItem().chunks[index]);
}

function nextQuestionC() {
  state.currentIndex++;
  renderPartC();
}

function showCompletedC() {
  const correct = state.results.filter(r => r.pct === 100).length;
  const total   = state.results.length;
  const pct     = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('partc-panel').innerHTML = `
    <div class="card completed-card">
      <div style="font-size:2.5rem;">🎉</div>
      <div class="big-score">${pct}%</div>
      <div class="score-label">${correct} / ${total} 問 正解</div>
      <p style="font-size:0.9rem;color:#666;margin-bottom:24px;">
        お疲れ様でした！チャンクを意識して何度も繰り返しましょう。
      </p>
      <button class="btn-restart" onclick="restartMode('C')">もう一度挑戦する</button>
    </div>
  `;
}

// ── Restart ──────────────────────────────────────────────────

function restartMode(mode) {
  state.currentIndex = 0;
  state.results = [];
  state.slowMode = false;
  state.transcript = null;
  if (mode === 'B') renderPartB();
  else renderPartC();
}

// ── Tab switching ────────────────────────────────────────────

function switchTab(mode) {
  state.mode = mode;
  state.currentIndex = 0;
  state.results = [];
  state.slowMode = false;

  if (state.recognition) {
    state.recognition.abort();
    state.recognition = null;
  }
  state.transcript = null;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `part${mode.toLowerCase()}-panel`);
  });

  window.speechSynthesis && window.speechSynthesis.cancel();

  if (mode === 'B') renderPartB();
  else renderPartC();
}

// ── Slow toggle ──────────────────────────────────────────────

function toggleSlow() {
  state.slowMode = !state.slowMode;
  const btn = document.getElementById('btn-slow');
  if (btn) {
    btn.textContent = state.slowMode ? '🐢 スロー ON' : '🐢 スロー';
    btn.classList.toggle('active', state.slowMode);
  }
  showToast(state.slowMode ? 'スロー再生 ON (×0.7)' : '通常速度に戻しました');
}

// ── Init ─────────────────────────────────────────────────────

if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

window.addEventListener('DOMContentLoaded', () => {
  switchTab('B');
});
