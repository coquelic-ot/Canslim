// ============================================================
//  data.js — 教材データ（01_ディクテーション練習）
//  スライドのスクリーンショットから抽出。残りは追加予定。
// ============================================================

const PART_B = [
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
  }
];

const PART_C = [
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
  }
];
