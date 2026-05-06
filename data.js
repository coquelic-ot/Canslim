// ============================================================
//  data.js — 教材データ
//  01〜03_ディクテーション練習 から抽出
// ============================================================

const PART_B = [
  // ── 01_ディクテーション練習 ──────────────────────────────
  {
    id: 1,
    sentence: "When did you call her?",
    translation: "あなたはいつ彼女に電話しましたか？"
  },
  {
    id: 2,
    sentence: "It's been quite a while since I've seen such a great show.",
    translation: "こんなに素晴らしいショーを見たのは久しぶりです。"
  },
  {
    id: 3,
    sentence: "You can purchase this fabric online by the yard.",
    translation: "この布はオンラインでヤード単位で購入できます。"
  },
  {
    id: 4,
    sentence: "We shouldn't be talking about this right now.",
    translation: "私たちは今この話をするべきではありません。"
  },
  {
    id: 5,
    sentence: "Technology is changing the way people exchange ideas.",
    translation: "テクノロジーは人々がアイデアを交換する方法を変えている。"
  },
  {
    id: 6,
    sentence: "We have a corporate discount program for those interested in bulk purchasing.",
    translation: "バルク購入に興味のある方向けに法人割引プログラムをご用意しております。"
  },
  {
    id: 7,
    sentence: "Did you remember to pick up your shirt from the cleaner's?",
    translation: "クリーニング店からシャツを受け取るのを覚えていましたか？"
  },
  {
    id: 8,
    sentence: "The interest rates will be lowered considerably.",
    translation: "金利はかなり引き下げられる見込みです。"
  },
  // ── 02_ディクテーション練習 ──────────────────────────────
  {
    id: 9,
    sentence: "You need to be patient when you go fishing.",
    translation: "釣りをするときは忍耐強くなる必要があります。"
  },
  {
    id: 10,
    sentence: "I need to finish a report by tomorrow morning.",
    translation: "明日の朝までにレポートを終わらせなければなりません。"
  },
  {
    id: 11,
    sentence: "Why is the cost of electricity going up?",
    translation: "なぜ電気料金が上がっているのですか？"
  },
  {
    id: 12,
    sentence: "Large farms have the resources to deal with poor weather.",
    translation: "大規模農場は悪天候に対処するための資源を持っています。"
  },
  {
    id: 13,
    sentence: "I have to find some literature about the subject.",
    translation: "その件について文献を探さなければなりません。"
  },
  {
    id: 14,
    sentence: "What do you want to have for dinner?",
    translation: "夕食は何が食べたいですか？"
  },
  {
    id: 15,
    sentence: "Small stores are disappearing across the United States.",
    translation: "小規模な店舗がアメリカ全土で姿を消している。"
  },
  {
    id: 16,
    sentence: "My schedule is fully booked until next Thursday.",
    translation: "来週木曜日まで予定がびっしり詰まっています。"
  },
  // ── 03_ディクテーション練習 ──────────────────────────────
  {
    id: 17,
    sentence: "Let's sort this out when I get back.",
    translation: "私が戻ったときにこれを整理しましょう。"
  },
  {
    id: 18,
    sentence: "Tickets for tonight's show are still available at the ticket booth.",
    translation: "今夜のショーのチケットは、まだチケット売り場で購入できます。"
  },
  {
    id: 19,
    sentence: "My mother doesn't care much for spicy food.",
    translation: "私の母は辛い食べ物があまり好きではありません。"
  },
  {
    id: 20,
    sentence: "It's great you're done with the task.",
    translation: "この作業を終えたなんて素晴らしいですね。"
  },
  // ── 03_ディクテーション練習 (2) ──────────────────────────────
  {
    id: 21,
    sentence: "I wasn't aware that there are many earthquakes in this area.",
    translation: "この地域には地震が多いことを知りませんでした。"
  },
  {
    id: 22,
    sentence: "Could you explain that again for Hannah?",
    translation: "ハンナのためにもう一度説明していただけますか？"
  },
  {
    id: 23,
    sentence: "It would be much faster to travel by plane.",
    translation: "飛行機で移動したほうがずっと早いでしょう。"
  },
  {
    id: 24,
    sentence: "Are you planning on visiting your parents this weekend?",
    translation: "今週末、ご両親を訪ねる予定はありますか？"
  },
  // ── 04_ディクテーション練習 ──────────────────────────────
  {
    id: 25,
    sentence: "I didn't think the beach would be so crowded today.",
    translation: "今日はビーチがこんなに混むとは思っていませんでした。"
  },
  {
    id: 26,
    sentence: "Careless driving is usually the cause of an accident.",
    translation: "不注意な運転が事故の原因になることが多いです。"
  },
  {
    id: 27,
    sentence: "There will be an area designated for children to enjoy the summer festival.",
    translation: "子どもたちが夏祭りを楽しめる専用エリアが設けられます。"
  },
  {
    id: 28,
    sentence: "Didn't we sell a lot of new products in the European market?",
    translation: "私たちはヨーロッパ市場で新商品をたくさん売りませんでしたっけ？"
  },
  {
    id: 29,
    sentence: "The mother taught her children the content with confidence.",
    translation: "お母さんは自信を持って子どもたちにその内容を教えました。"
  },
  {
    id: 30,
    sentence: "The students enjoyed watching the movie.",
    translation: "学生たちは映画鑑賞を楽しみました。"
  },
  {
    id: 31,
    sentence: "Guests will be admitted on a first-come, first-served basis.",
    translation: "ゲストは先着順でご入場いただけます。"
  },
  {
    id: 32,
    sentence: "The new exchange student said he is feeling homesick.",
    translation: "新しい交換留学生はホームシックを感じていると言いました。"
  }
];

const PART_C = [
  // ── 01_ディクテーション練習 ──────────────────────────────
  {
    id: 1,
    chunks: ["When did you", "call her?"],
    full: "When did you call her?",
    translation: "あなたはいつ彼女に電話しましたか？"
  },
  {
    id: 2,
    chunks: ["It's been quite a while", "since I've seen", "such a great show."],
    full: "It's been quite a while since I've seen such a great show.",
    translation: "こんなに素晴らしいショーを見たのは久しぶりです。"
  },
  {
    id: 3,
    chunks: ["You can purchase", "this fabric online", "by the yard."],
    full: "You can purchase this fabric online by the yard.",
    translation: "この布はオンラインでヤード単位で購入できます。"
  },
  {
    id: 4,
    chunks: ["We shouldn't be talking", "about this", "right now."],
    full: "We shouldn't be talking about this right now.",
    translation: "私たちは今この話をするべきではありません。"
  },
  {
    id: 5,
    chunks: ["Technology is changing", "the way people", "exchange ideas."],
    full: "Technology is changing the way people exchange ideas.",
    translation: "テクノロジーは人々がアイデアを交換する方法を変えている。"
  },
  {
    id: 6,
    chunks: ["We have a corporate discount program", "for those interested", "in bulk purchasing."],
    full: "We have a corporate discount program for those interested in bulk purchasing.",
    translation: "バルク購入に興味のある方向けに法人割引プログラムをご用意しております。"
  },
  {
    id: 7,
    chunks: ["Did you remember", "to pick up your shirt", "from the cleaner's?"],
    full: "Did you remember to pick up your shirt from the cleaner's?",
    translation: "クリーニング店からシャツを受け取るのを覚えていましたか？"
  },
  {
    id: 8,
    chunks: ["The interest rates", "will be lowered", "considerably."],
    full: "The interest rates will be lowered considerably.",
    translation: "金利はかなり引き下げられる見込みです。"
  },
  // ── 02_ディクテーション練習 ──────────────────────────────
  {
    id: 9,
    chunks: ["You need to be patient", "when you go fishing."],
    full: "You need to be patient when you go fishing.",
    translation: "釣りをするときは忍耐強くなる必要があります。"
  },
  {
    id: 10,
    chunks: ["I need to finish a report", "by tomorrow morning."],
    full: "I need to finish a report by tomorrow morning.",
    translation: "明日の朝までにレポートを終わらせなければなりません。"
  },
  {
    id: 11,
    chunks: ["Why is the cost of electricity", "going up?"],
    full: "Why is the cost of electricity going up?",
    translation: "なぜ電気料金が上がっているのですか？"
  },
  {
    id: 12,
    chunks: ["Large farms have the resources", "to deal with", "poor weather."],
    full: "Large farms have the resources to deal with poor weather.",
    translation: "大規模農場は悪天候に対処するための資源を持っています。"
  },
  {
    id: 13,
    chunks: ["I have to find", "some literature", "about the subject."],
    full: "I have to find some literature about the subject.",
    translation: "その件について文献を探さなければなりません。"
  },
  {
    id: 14,
    chunks: ["What do you want", "to have for dinner?"],
    full: "What do you want to have for dinner?",
    translation: "夕食は何が食べたいですか？"
  },
  {
    id: 15,
    chunks: ["Small stores are disappearing", "across the United States."],
    full: "Small stores are disappearing across the United States.",
    translation: "小規模な店舗がアメリカ全土で姿を消している。"
  },
  {
    id: 16,
    chunks: ["My schedule is fully booked", "until next Thursday."],
    full: "My schedule is fully booked until next Thursday.",
    translation: "来週木曜日まで予定がびっしり詰まっています。"
  },
  // ── 03_ディクテーション練習 ──────────────────────────────
  {
    id: 17,
    chunks: ["Let's sort this out", "when I get back."],
    full: "Let's sort this out when I get back.",
    translation: "私が戻ったときにこれを整理しましょう。"
  },
  {
    id: 18,
    chunks: ["Tickets for tonight's show", "are still available", "at the ticket booth."],
    full: "Tickets for tonight's show are still available at the ticket booth.",
    translation: "今夜のショーのチケットは、まだチケット売り場で購入できます。"
  },
  {
    id: 19,
    chunks: ["My mother doesn't care much", "for spicy food."],
    full: "My mother doesn't care much for spicy food.",
    translation: "私の母は辛い食べ物があまり好きではありません。"
  },
  {
    id: 20,
    chunks: ["It's great", "you're done with the task."],
    full: "It's great you're done with the task.",
    translation: "この作業を終えたなんて素晴らしいですね。"
  },
  // ── 03_ディクテーション練習 (2) ──────────────────────────────
  {
    id: 21,
    chunks: ["I wasn't aware", "that there are many earthquakes", "in this area."],
    full: "I wasn't aware that there are many earthquakes in this area.",
    translation: "この地域には地震が多いことを知りませんでした。"
  },
  {
    id: 22,
    chunks: ["Could you explain", "that again", "for Hannah?"],
    full: "Could you explain that again for Hannah?",
    translation: "ハンナのためにもう一度説明していただけますか？"
  },
  {
    id: 23,
    chunks: ["It would be much faster", "to travel by plane."],
    full: "It would be much faster to travel by plane.",
    translation: "飛行機で移動したほうがずっと早いでしょう。"
  },
  {
    id: 24,
    chunks: ["Are you planning", "on visiting your parents", "this weekend?"],
    full: "Are you planning on visiting your parents this weekend?",
    translation: "今週末、ご両親を訪ねる予定はありますか？"
  },
  // ── 04_ディクテーション練習 ──────────────────────────────
  {
    id: 25,
    chunks: ["I didn't think", "the beach would be", "so crowded today."],
    full: "I didn't think the beach would be so crowded today.",
    translation: "今日はビーチがこんなに混むとは思っていませんでした。"
  },
  {
    id: 26,
    chunks: ["Careless driving", "is usually the cause", "of an accident."],
    full: "Careless driving is usually the cause of an accident.",
    translation: "不注意な運転が事故の原因になることが多いです。"
  },
  {
    id: 27,
    chunks: ["There will be an area", "designated for children", "to enjoy the summer festival."],
    full: "There will be an area designated for children to enjoy the summer festival.",
    translation: "子どもたちが夏祭りを楽しめる専用エリアが設けられます。"
  },
  {
    id: 28,
    chunks: ["Didn't we sell", "a lot of new products", "in the European market?"],
    full: "Didn't we sell a lot of new products in the European market?",
    translation: "私たちはヨーロッパ市場で新商品をたくさん売りませんでしたっけ？"
  },
  {
    id: 29,
    chunks: ["The mother taught", "her children the content", "with confidence."],
    full: "The mother taught her children the content with confidence.",
    translation: "お母さんは自信を持って子どもたちにその内容を教えました。"
  },
  {
    id: 30,
    chunks: ["The students enjoyed", "watching the movie."],
    full: "The students enjoyed watching the movie.",
    translation: "学生たちは映画鑑賞を楽しみました。"
  },
  {
    id: 31,
    chunks: ["Guests will be admitted", "on a first-come, first-served basis."],
    full: "Guests will be admitted on a first-come, first-served basis.",
    translation: "ゲストは先着順でご入場いただけます。"
  },
  {
    id: 32,
    chunks: ["The new exchange student", "said he is feeling homesick."],
    full: "The new exchange student said he is feeling homesick.",
    translation: "新しい交換留学生はホームシックを感じていると言いました。"
  }
];
