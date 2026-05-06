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
`stock.html`/`stock.css`/`stock.js` を修正したら、必ず `gh-pages` ブランチにも同期する。
**注意: `index.html` は Dictation Practice アプリのため絶対に上書きしないこと。**
CAN SLIM は `stock.html` としてデプロイする。

```bash
git checkout gh-pages
git show claude/oneill-stock-selector-ID7mD:stock.html > stock.html
git show claude/oneill-stock-selector-ID7mD:stock.css  > stock.css
git show claude/oneill-stock-selector-ID7mD:stock.js   > stock.js
git add stock.html stock.css stock.js && git commit -m "Sync CAN SLIM from feature branch" && git push origin gh-pages
git checkout claude/oneill-stock-selector-ID7mD
```

### URL
- CAN SLIM 銘柄チェッカー: `https://coquelic-ot.github.io/Shoko-Tanaka/stock.html`
- Dictation Practice: `https://coquelic-ot.github.io/Shoko-Tanaka/`

### CAN SLIM スコアリング方針
- 各項目 0〜100 点、入力値がない項目は `null`（スコア計算から除外）
- 総合スコア = 入力済み項目の加重平均
- 70点以上 → 🟢 買い候補 / 40〜69点 → 🟡 様子見 / 39点以下 → 🔴 見送り

### データ入力方法
- **ティッカー入力**: インポートタブのテキストボックスに直接入力（スロット画像はタップで拡大表示可能）
- **IBD レーティング**: 分析カードの「📋 IBDテキスト貼り付けで自動入力」に iOS Live Text / Google Lens でコピーしたテキストを貼り付け → `parseStockPageText()` が EPS/RS/SMR/A/D Rating を正規表現で抽出
- **財務データ**: 分析カードの「📊 Yahoo取得」ボタン → Yahoo Finance API から qEpsGrowth / salesGrowth / ROE / floatShares / fromHigh52w を自動取得
