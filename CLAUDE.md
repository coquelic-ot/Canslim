# CLAUDE.md — Shoko-Tanaka リポジトリ

## プロジェクト概要

このリポジトリには2つのWebアプリが含まれています。

| ファイル | アプリ名 | ブランチ |
|---|---|---|
| `stock.html` / `stock.css` / `stock.js` | CAN SLIM 銘柄チェッカー | `claude/oneill-stock-selector-ID7mD` |
| `index.html` / `style.css` / `app.js` / `data.js` | Dictation Practice | `claude/dictation-app-english-TRQWD` |

## CAN SLIM 銘柄チェッカー

### 技術スタック
- 純粋な静的サイト（HTML / CSS / ES6 JS）
- OCR: **Tesseract.js v5**（CDN、ブラウザ内処理、無料、APIキー不要）
- ホスティング: GitHub Pages（`gh-pages` ブランチ）
- データ保存: `localStorage` のみ（サーバー通信なし）

### ファイル構成
```
stock.html   — UI構造（モーダル・タブ）
stock.css    — スタイル（ライト/クリーンテーマ、CSS変数）
stock.js     — アプリロジック全体
```

### stock.js の主要モジュール
| セクション | 役割 |
|---|---|
| STATE | `app` オブジェクト（stocks, analyses, history, marketTrend） |
| SCORING | `scoreC/A/N/S/L/I/M()` + `calculateScores()` |
| TESSERACT OCR | `runOcr()`, `ocrTop50()`, `ocrStockPage()` |
| PARSING | `parseTop50Text()`, `parseStockPageText()` |
| RENDERING | `renderImport/Analyze/Compare/History()` |
| EVENT HANDLERS | `bindCardEvents()`, `updateField()` |
| STORAGE | `saveSession()`, `loadSession()`, `saveHistory()` |

### gh-pages への反映手順
`stock.html`/`stock.css`/`stock.js` を修正したら、必ず `gh-pages` ブランチにも同期する：
```bash
git checkout gh-pages
git show claude/oneill-stock-selector-ID7mD:stock.html > index.html
git show claude/oneill-stock-selector-ID7mD:stock.css  > stock.css
git show claude/oneill-stock-selector-ID7mD:stock.js   > stock.js
git add . && git commit -m "Sync from feature branch" && git push origin gh-pages
git checkout claude/oneill-stock-selector-ID7mD
```

### CAN SLIM スコアリング方針
- 各項目 0〜100 点、入力値がない項目は `null`（スコア計算から除外）
- 総合スコア = 入力済み項目の加重平均
- 70点以上 → 🟢 買い候補 / 40〜69点 → 🟡 様子見 / 39点以下 → 🔴 見送り

### IBD スクリーンショットの OCR について
- **Top 50リスト**: `parseTop50Text()` が行頭の `"順位 TICKER"` パターンを正規表現で抽出
- **個別銘柄ページ**: `parseStockPageText()` が IBD の各 Rating ラベルをパターンマッチで抽出
- Tesseract.js は初回起動時に英語言語データ（約5MB）をダウンロード・キャッシュする
