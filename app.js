// ============================================================
//  app.js — ディクテーションアプリ ロジック
// ============================================================

// ── State ──────────────────────────────────────────────────
const state = {
  mode: 'B',
  currentIndex: 0,
  slowMode: false,
  results: [],       // { pct, item }
  recognition: null,
  transcript: null,
  scored: false,
  reviewMode: false,
  reviewData: [],
};

// ── Helpers ─────────────────────────────────────────────────

function currentData() {
  if (state.reviewMode) return state.reviewData;
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

// ── Azure Config ─────────────────────────────────────────────

function getAzureConfig() {
  return { key: localStorage.getItem('azure_key') || '', region: localStorage.getItem('azure_region') || '' };
}

function hasAzureConfig() {
  const c = getAzureConfig();
  return c.key.length > 0 && c.region.length > 0;
}

// ── Settings modal ───────────────────────────────────────────

function toggleSettings() {
  const overlay = document.getElementById('settings-overlay');
  if (!overlay) return;
  const isOpen = overlay.classList.contains('open');
  if (!isOpen) {
    // Populate inputs with current values before opening
    const cfg = getAzureConfig();
    const keyInput = document.getElementById('azure-key-input');
    const regionInput = document.getElementById('azure-region-input');
    if (keyInput) keyInput.value = cfg.key;
    if (regionInput) regionInput.value = cfg.region;
    updateAzureStatus();
  }
  overlay.classList.toggle('open');
}

function handleOverlayClick(event) {
  if (event.target === event.currentTarget) toggleSettings();
}

function updateAzureStatus() {
  const statusEl = document.getElementById('azure-status');
  if (!statusEl) return;
  if (hasAzureConfig()) {
    statusEl.textContent = '設定済み ✓';
    statusEl.classList.add('configured');
  } else {
    statusEl.textContent = '未設定';
    statusEl.classList.remove('configured');
  }
}

function saveAzureSettings() {
  const key = (document.getElementById('azure-key-input')?.value || '').trim();
  const region = (document.getElementById('azure-region-input')?.value || '').trim();
  if (key) localStorage.setItem('azure_key', key);
  if (region) localStorage.setItem('azure_region', region);
  updateAzureStatus();
  showToast('Azure設定を保存しました');
  const overlay = document.getElementById('settings-overlay');
  if (overlay) overlay.classList.remove('open');
}

function clearAzureSettings() {
  localStorage.removeItem('azure_key');
  localStorage.removeItem('azure_region');
  const keyInput = document.getElementById('azure-key-input');
  const regionInput = document.getElementById('azure-region-input');
  if (keyInput) keyInput.value = '';
  if (regionInput) regionInput.value = '';
  updateAzureStatus();
  showToast('Azure設定をクリアしました');
}

// ── Vowel hint map ────────────────────────────────────────────

const VOWEL_HINTS = {
  AE: { symbol: '/æ/', label: 'American a', hint: '口を横に広げ「エア」— cat, apple, man の a' },
  AA: { symbol: '/ɑː/', label: 'broad a', hint: '口を縦に大きく開け「アー」— father, stop の a/o' },
  EY: { symbol: '/eɪ/', label: 'long a', hint: '「エイ」と二重母音— name, cake の a' },
  IY: { symbol: '/iː/', label: 'long e', hint: '長い「イー」— see, be の e' },
  IH: { symbol: '/ɪ/', label: 'short i', hint: '短く弱い「イ」— sit, bit の i' },
  AH: { symbol: '/ʌ/', label: 'short u', hint: '「ア」を弱く短く— but, cup の u' },
  UW: { symbol: '/uː/', label: 'long u', hint: '唇を丸めて「ウー」— food, true の u' },
  UH: { symbol: '/ʊ/', label: 'short u', hint: '短い「ウ」— book, put の u' },
  OW: { symbol: '/oʊ/', label: 'long o', hint: '「オウ」と二重母音— go, home の o' },
  AO: { symbol: '/ɔː/', label: 'aw sound', hint: '唇を丸めて「オー」— call, fall の a' },
  EH: { symbol: '/ɛ/', label: 'short e', hint: '口を少し開けた「エ」— bed, head の e' },
  AW: { symbol: '/aʊ/', label: 'ow sound', hint: '「アウ」と二重母音— how, now の ow' },
  AY: { symbol: '/aɪ/', label: 'long i', hint: '「アイ」と二重母音— time, like の i' },
};
const VOWEL_PHONEMES = new Set(Object.keys(VOWEL_HINTS));

// ── Azure Speech Assessment ───────────────────────────────────

function assessWithAzure(correctSentence) {
  // Stop any TTS before recording
  window.speechSynthesis && window.speechSynthesis.cancel();

  // Reset state for re-recording
  state.transcript = null;
  const recognized = document.getElementById('recognized-text');
  if (recognized) { recognized.textContent = ''; recognized.classList.remove('visible'); }
  const resultArea = document.getElementById('result-area');
  if (resultArea) resultArea.classList.remove('visible');
  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) nextBtn.style.display = 'none';
  if (state.scored) { state.results.pop(); state.scored = false; }
  const pronFeedback = document.getElementById('pron-feedback');
  if (pronFeedback) pronFeedback.classList.remove('visible');

  try {
    const cfg = getAzureConfig();
    const SpeechSDK = window.SpeechSDK;
    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(cfg.key, cfg.region);
    speechConfig.speechRecognitionLanguage = 'en-US';

    const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

    const pronConfig = new SpeechSDK.PronunciationAssessmentConfig(
      correctSentence,
      SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
      SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
      true // enableMiscue
    );

    const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
    pronConfig.applyTo(recognizer);

    // Set mic button to recording state
    const btn = document.getElementById('btn-mic');
    if (btn) {
      btn.textContent = '🔴 録音中…';
      btn.classList.add('recording');
      btn.disabled = true;
    }

    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close();
        if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const pronResult = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
          finishWithAzureResult(result.text, pronResult, correctSentence);
        } else if (result.reason === SpeechSDK.ResultReason.NoMatch) {
          showToast('音声が聞き取れませんでした。もう一度お試しください');
          resetMicButton(correctSentence);
        } else {
          showToast('認識エラーが発生しました。もう一度お試しください');
          resetMicButton(correctSentence);
        }
      },
      (err) => {
        recognizer.close();
        showToast('認識エラー: ' + err);
        resetMicButton(correctSentence);
      }
    );
  } catch (e) {
    showToast('Azure設定エラー: ' + e.message);
    resetMicButton(correctSentence);
  }
}

function finishWithAzureResult(transcript, pronResult, correctSentence) {
  state.transcript = transcript;
  resetMicButton(correctSentence);

  const recognized = document.getElementById('recognized-text');
  if (recognized) {
    recognized.textContent = '認識: ' + transcript;
    recognized.classList.add('visible');
  }

  submitAnswer(correctSentence);
  renderPronunciationFeedback(pronResult);
}

function renderPronunciationFeedback(pronResult) {
  try {
    const detailResult = pronResult.detailResult || {};
    const words = detailResult.Words || [];
    const accuracyScore = Math.round(pronResult.accuracyScore || 0);

    const issues = [];
    for (const w of words) {
      if (w.ErrorType === 'Insertion') continue;
      const badVowels = (w.Phonemes || []).filter(p =>
        VOWEL_PHONEMES.has(p.Phoneme) &&
        (p.PronunciationAssessment?.AccuracyScore ?? 100) < 70
      );
      if (badVowels.length) issues.push({ word: w.Word, phonemes: badVowels });
    }

    // Build score badge
    let scoreClass = 'good';
    if (accuracyScore < 80) scoreClass = 'ok';
    if (accuracyScore < 60) scoreClass = 'poor';

    let html = `<div class="pron-score ${scoreClass}">発音スコア: ${accuracyScore}点</div>`;

    if (issues.length === 0) {
      html += `<div class="pron-good">母音の発音 良好 👍</div>`;
    } else {
      for (const issue of issues) {
        const phonemeTags = issue.phonemes.map(p => {
          const hint = VOWEL_HINTS[p.Phoneme];
          if (!hint) return '';
          return `<span class="phoneme-tag"><span class="ph-symbol">${hint.symbol}</span><span class="ph-hint">${hint.hint}</span></span>`;
        }).join('');
        html += `<div class="pron-issue"><span class="pron-word">${issue.word}</span>${phonemeTags}</div>`;
      }
    }

    // Insert or update pron-feedback div after result-area
    let feedbackEl = document.getElementById('pron-feedback');
    if (!feedbackEl) {
      feedbackEl = document.createElement('div');
      feedbackEl.id = 'pron-feedback';
      feedbackEl.className = 'pron-feedback';
      const resultArea = document.getElementById('result-area');
      if (resultArea && resultArea.parentNode) {
        resultArea.parentNode.insertBefore(feedbackEl, resultArea.nextSibling);
      }
    }
    feedbackEl.innerHTML = html;
    feedbackEl.classList.add('visible');
  } catch (e) {
    // Silently fail if pronunciation result parsing fails
  }
}

// ── Speech Recognition ───────────────────────────────────────

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function startListening(correctSentence) {
  // Use Azure if configured and SDK is loaded
  if (hasAzureConfig() && typeof SpeechSDK !== 'undefined') {
    assessWithAzure(correctSentence);
    return;
  }

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

  // やり直し時：前の認識テキスト・採点ボタン・結果・次へボタンをリセット
  state.transcript = null;
  const recognized = document.getElementById('recognized-text');
  if (recognized) { recognized.textContent = ''; recognized.classList.remove('visible'); }
  const resultArea = document.getElementById('result-area');
  if (resultArea) resultArea.classList.remove('visible');
  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) nextBtn.style.display = 'none';
  // 前の採点分を results から取り除く（録音し直しは同じ問題の再挑戦）
  if (state.scored) { state.results.pop(); state.scored = false; }
  // Clear any pronunciation feedback from previous attempt
  const pronFeedback = document.getElementById('pron-feedback');
  if (pronFeedback) pronFeedback.classList.remove('visible');

  const rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  state.recognition = rec;

  // recTimeout をボタンの onclick から参照できるよう先に宣言
  let recTimeout;

  const btn = document.getElementById('btn-mic');
  if (btn) {
    btn.textContent = '🔴 録音中… (タップで停止)';
    btn.classList.add('recording');
    btn.disabled = false; // 常に押せる状態を保つ（タップで録音中断）
    btn.onclick = () => {
      clearTimeout(recTimeout);
      if (state.recognition === rec) {
        try { state.recognition.abort(); } catch (_) {}
        state.recognition = null;
      }
      resetMicButton(correctSentence);
    };
  }

  // Timeout fallback: Safari iOS で onend/onresult が発火しない場合にボタンを復帰させる
  recTimeout = setTimeout(() => {
    if (state.recognition === rec) {
      try { rec.abort(); } catch (_) {}
      state.recognition = null;
      if (!state.transcript) {
        resetMicButton(correctSentence);
        showToast('録音がタイムアウトしました。もう一度お試しください');
      }
    }
  }, 15000);

  rec.onresult = (event) => {
    clearTimeout(recTimeout);
    const transcript = event.results[0][0].transcript;
    finishListening(transcript, correctSentence);
  };

  rec.onerror = (event) => {
    clearTimeout(recTimeout);
    state.recognition = null;
    resetMicButton(correctSentence);
    if (event.error === 'aborted') {
      // 意図的な中断なので何も表示しない
    } else if (event.error === 'not-allowed') {
      showToast('マイクの使用を許可してください');
    } else if (event.error === 'no-speech') {
      showToast('音声が聞き取れませんでした。もう一度お試しください');
    } else {
      showToast('認識エラー: ' + event.error);
    }
  };

  // onend では常にボタンをリセット（Safari iOS で onresult の後に onend が来ない場合の保険）
  rec.onend = () => {
    clearTimeout(recTimeout);
    state.recognition = null;
    resetMicButton(correctSentence);
  };

  try {
    rec.start();
  } catch (e) {
    clearTimeout(recTimeout);
    state.recognition = null;
    resetMicButton(correctSentence);
    showToast('マイクの起動に失敗しました。もう一度お試しください');
  }
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

  submitAnswer(correctSentence);
}

function submitAnswer(correctSentence) {
  const { wordResults, pct } = scoreAnswer(state.transcript, correctSentence);
  state.results.push({ pct, item: currentItem() });
  state.scored = true;
  renderResult(wordResults, pct);

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
    state.reviewMode
      ? `復習 ${state.currentIndex + 1} / ${total}`
      : `Q ${state.currentIndex + 1} / ${total}`;
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
  state.transcript = null;
  state.scored = false;
  renderPartB();
}

function showCompletedB() {
  const correct  = state.results.filter(r => r.pct === 100).length;
  const total    = state.results.length;
  const pct      = total > 0 ? Math.round((correct / total) * 100) : 0;
  const hasWrong = state.results.some(r => r.pct < 100);
  const label    = state.reviewMode ? '復習' : '';

  document.getElementById('partb-panel').innerHTML = `
    <div class="card completed-card">
      <div style="font-size:2.5rem;">${pct === 100 ? '🏆' : '🎉'}</div>
      <div class="big-score">${pct}%</div>
      <div class="score-label">${correct} / ${total} 問 正解${label}</div>
      <p style="font-size:0.9rem;color:#666;margin-bottom:24px;">
        ${pct === 100 ? '全問正解！素晴らしい！' : 'お疲れ様でした！'}
      </p>
      ${hasWrong ? `<button class="btn btn-next" style="margin-bottom:12px;width:100%;" onclick="startReview('B')">間違えた問題を復習する（${total - correct}問）</button>` : ''}
      <button class="btn-restart" onclick="restartMode('B')">最初からやり直す</button>
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
  state.transcript = null;
  state.scored = false;
  renderPartC();
}

function showCompletedC() {
  const correct  = state.results.filter(r => r.pct === 100).length;
  const total    = state.results.length;
  const pct      = total > 0 ? Math.round((correct / total) * 100) : 0;
  const hasWrong = state.results.some(r => r.pct < 100);
  const label    = state.reviewMode ? '復習' : '';

  document.getElementById('partc-panel').innerHTML = `
    <div class="card completed-card">
      <div style="font-size:2.5rem;">${pct === 100 ? '🏆' : '🎉'}</div>
      <div class="big-score">${pct}%</div>
      <div class="score-label">${correct} / ${total} 問 正解${label}</div>
      <p style="font-size:0.9rem;color:#666;margin-bottom:24px;">
        ${pct === 100 ? '全問正解！素晴らしい！' : 'お疲れ様でした！'}
      </p>
      ${hasWrong ? `<button class="btn btn-next" style="margin-bottom:12px;width:100%;" onclick="startReview('C')">間違えた問題を復習する（${total - correct}問）</button>` : ''}
      <button class="btn-restart" onclick="restartMode('C')">最初からやり直す</button>
    </div>
  `;
}

// ── Review ───────────────────────────────────────────────────

function startReview(mode) {
  const wrongItems = state.results.filter(r => r.pct < 100).map(r => r.item);
  state.mode        = mode;
  state.currentIndex = 0;
  state.results     = [];
  state.slowMode    = false;
  state.transcript  = null;
  state.scored      = false;
  state.reviewMode  = true;
  state.reviewData  = wrongItems;
  if (mode === 'B') renderPartB();
  else renderPartC();
}

// ── Restart ──────────────────────────────────────────────────

function restartMode(mode) {
  state.currentIndex = 0;
  state.results      = [];
  state.slowMode     = false;
  state.transcript   = null;
  state.scored       = false;
  state.reviewMode   = false;
  state.reviewData   = [];
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
  state.transcript  = null;
  state.scored      = false;
  state.reviewMode  = false;
  state.reviewData  = [];

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
  updateAzureStatus();
  switchTab('B');
});
