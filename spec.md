# spec.md — CAN SLIM 銘柄チェッカー 仕様書

## 概要

William O'Neil の CAN SLIM 手法に基づいて米国株をスコアリングするiPhone対応Webアプリ。

- **URL**: https://coquelic-ot.github.io/Shoko-Tanaka/stock.html
- **対象市場**: 米国株（IBD掲載銘柄）
- **データ入力**: テキスト貼り付け（iOS Live Text / Google Lens）+ Yahoo Finance自動取得 + 手動入力

---

## 画面構成（4タブ）

### 📥 インポートタブ
ティッカーシンボルを入力して銘柄リストを生成する。

- スクショスロット × 4（2×2グリッド）
  - 参考用スクショをアップロード（サムネイル表示）
  - **サムネイルをタップ → ライトボックスで全画面表示**してティッカーを確認できる
  - 🔄 ボタンで個別に差し替え可能
- 各スロット下のテキストエリアにティッカーを直接入力（スペース・カンマ・改行区切り）
- 4スロットの結果をティッカーで重複排除してマージ
- チェックリスト形式で銘柄を選択（全選択 / 解除ボタンあり）
- 「分析へ進む」ボタンで分析タブへ遷移

### 📊 分析タブ
選択銘柄ごとにCAN SLIMスコアを入力・計算する。

各銘柄カードに含まれる要素：
- **📊 Yahoo取得ボタン**: Yahoo Finance から財務データ（EPS成長・売上成長・ROE・浮動株・52週高値比）を自動取得
- IBD個別ページスクショのアップロード（任意、タップで拡大表示可能）
- **📋 IBDテキスト貼り付けで自動入力**: iOS Live Text / Google Lens でコピーしたテキストを貼り付け → EPS/RS/SMR/A/D Rating を自動抽出
- CAN SLIM 7項目のスコアバー（リアルタイム更新）
- 各指標の手動入力フォーム（自動入力後も編集可能）
- チャートパターン確認（6種チェックリスト）
- TradingView 週足チャートへのリンク
- 買いポイント（ピボット価格）入力
- メモ欄
- 総合スコアバッジ（カード右上）

### ⚖ 比較タブ
選択銘柄を横並び比較テーブルで表示。

- 行: C / A / N / S / L / I / M / 総合スコア / 判定
- 列: 各銘柄
- セルをスコアに応じて緑/黄/赤で色分け

### 📋 履歴タブ
過去の分析セッションを保存・復元する。

- 「履歴に保存」ボタンで現在セッションを localStorage に保存
- 最大50件保存
- 保存済みセッションをタップして復元
- 🗑 ボタンで個別削除

---

## CAN SLIM 7項目とスコアリング

| 記号 | 項目 | 主な入力値 | 理想値 |
|---|---|---|---|
| C | 直近四半期EPS | EPS Rating / 四半期EPS成長率% / 売上成長率% | EPS Rating 80+, 成長率25%+ |
| A | 年間EPS成長率 | 年間EPS成長率% / ROE% / 連続増益年数 | 成長率25%+, ROE 17%+, 3年+ |
| N | 新製品・新経営陣 | 新製品チェック / 新経営陣チェック / 52週高値からの下落% | 下落15%以内 |
| S | 需給 | A/D Rating / 出来高比率 / 浮動株数(百万株) | A/D Rating A-B |
| L | 相対強度 | RS Rating (1-99) / 業種内順位% | RS Rating 80+, 上位20%以内 |
| I | 機関投資家 | SMR Rating / 保有比率% / 増減トレンド | 増加中 |
| M | 市場の方向性 | 強気/中立/弱気（全銘柄共通） | 強気相場 |

### スコア計算ルール
- 各項目: 0〜100点（入力なしは `null` = 計算除外）
- 総合スコア = 入力済み項目の加重平均（整数）
- 判定: 70+→🟢買い候補 / 40-69→🟡様子見 / 39-→🔴見送り

### チャートパターン（N項目にボーナス加点）
- カップウィズハンドル
- フラットベース
- ダブルボトム
- スクウェアボックス
- ピボット突破（出来高増）
- ハイタイトフラッグ

---

## 技術仕様

### データ取得フロー

#### ティッカー入力
テキストエリアに直接入力 → `parseTickerText()` でティッカー抽出。
スロット画像はライトボックスで全画面表示してティッカーを確認できる。

#### IBD レーティング（テキスト貼り付け方式）
```
① IBDアプリでスクショを撮影
② スマホ長押し →「テキストをコピー」（iOS Live Text / Google Lens）
③ 分析カードの「📋 IBDテキスト貼り付け」欄に貼り付け → 「解析して自動入力」
→ parseStockPageText() が EPS/RS/SMR/A/D Rating を正規表現で抽出・入力
```

#### 財務データ（Yahoo Finance 自動取得）
```
「📊 Yahoo取得」ボタン → corsproxy.io 経由で Yahoo Finance quoteSummary API へリクエスト
→ qEpsGrowth / salesGrowth / ROE / floatShares / fromHigh52w を自動入力
```

#### Top 50 パース (`parseTickerText`)
行頭パターン `/^#?(\d{1,3})\s+([A-Z]{1,5})\b/` でランク+ティッカーを抽出。
ランクなし入力はカンマ・スペース区切りで自動付番。

#### 個別ページパース (`parseStockPageText`)
IBD固有のラベル（"EPS Rating", "RS Rating", "SMR Rating", "A/D Rating" 等）を
正規表現パターンマッチで数値・文字を抽出。

### データ永続化
- `localStorage['canslim-history']`: 分析セッション配列（JSON）
- `localStorage['canslim-market']`: 市場トレンド設定

### ホスティング
- Feature branch: `claude/oneill-stock-selector-ID7mD`
- Deploy branch: `gh-pages`
  - CAN SLIM チェッカー: `stock.html`（`index.html` には絶対に上書きしない）
  - Dictation Practice: `index.html`
- GitHub Pages で自動公開

---

## 既知の制限

- iOS Live Text / Google Lens の認識精度はスクショの解像度・フォントに依存。読み取り失敗時は手動入力で補完する。
- Yahoo Finance 取得は corsproxy.io 経由のため、プロキシの障害時は取得不可。
- Tesseract.js はモバイルブラウザでの SharedArrayBuffer 制限により使用不可のため廃止。
