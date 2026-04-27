// ============================================================
//  data.js — 教材データ
//  Google Drive の実際の文に差し替える場合は、
//  PART_B / PART_C の配列の内容を編集してください。
// ============================================================

const PART_B = [
  {
    id: 1,
    sentence: "She was offered a promotion after completing the project ahead of schedule.",
    translation: "彼女はプロジェクトを予定より早く完成させた後、昇進を打診された。"
  },
  {
    id: 2,
    sentence: "The new policy requires all employees to submit their reports by Friday.",
    translation: "新しい方針では、全従業員が金曜日までに報告書を提出することが求められている。"
  },
  {
    id: 3,
    sentence: "Despite the heavy rain, the outdoor event was not canceled.",
    translation: "激しい雨にもかかわらず、屋外イベントは中止されなかった。"
  },
  {
    id: 4,
    sentence: "The committee has decided to review the budget proposal next month.",
    translation: "委員会は来月、予算案を再検討することを決定した。"
  },
  {
    id: 5,
    sentence: "He was asked to give a presentation on the latest research findings.",
    translation: "彼は最新の研究成果についてプレゼンテーションを行うよう求められた。"
  },
  {
    id: 6,
    sentence: "The library will be closed for renovations starting next Monday.",
    translation: "図書館は来週月曜日から改装のため閉館します。"
  },
  {
    id: 7,
    sentence: "All participants are encouraged to ask questions at the end of the session.",
    translation: "すべての参加者は、セッション終了後に質問することが奨励されています。"
  },
  {
    id: 8,
    sentence: "The manager reminded the team to double-check their work before submitting.",
    translation: "マネージャーはチームに提出前に仕事を再確認するよう念を押した。"
  },
  {
    id: 9,
    sentence: "The survey results showed that most customers were satisfied with the service.",
    translation: "アンケート結果は、ほとんどの顧客がサービスに満足していることを示した。"
  },
  {
    id: 10,
    sentence: "She has been working on the proposal for three weeks and will finish it soon.",
    translation: "彼女は3週間提案書に取り組んでおり、もうすぐ完成する。"
  },
  {
    id: 11,
    sentence: "The conference will be held at the Grand Hotel on the first weekend of June.",
    translation: "会議は6月の最初の週末にグランドホテルで開催される。"
  },
  {
    id: 12,
    sentence: "Applicants who meet the requirements will be contacted within two weeks.",
    translation: "条件を満たした応募者には2週間以内に連絡が入ります。"
  }
];

const PART_C = [
  {
    id: 1,
    chunks: [
      "In recent years,",
      "many companies",
      "have introduced",
      "remote work policies",
      "to improve employee satisfaction."
    ],
    full: "In recent years, many companies have introduced remote work policies to improve employee satisfaction.",
    translation: "近年、従業員の満足度を高めるために、在宅勤務制度を導入する企業が増えている。"
  },
  {
    id: 2,
    chunks: [
      "One of the most important skills",
      "in the modern workplace",
      "is the ability",
      "to communicate clearly",
      "with people from different backgrounds."
    ],
    full: "One of the most important skills in the modern workplace is the ability to communicate clearly with people from different backgrounds.",
    translation: "現代の職場で最も重要なスキルの一つは、異なる背景を持つ人々と明確にコミュニケーションをとる能力だ。"
  },
  {
    id: 3,
    chunks: [
      "The program",
      "was designed",
      "to help young people",
      "develop practical skills",
      "before entering the workforce."
    ],
    full: "The program was designed to help young people develop practical skills before entering the workforce.",
    translation: "そのプログラムは、若者が社会に出る前に実践的なスキルを身につけるために設計された。"
  },
  {
    id: 4,
    chunks: [
      "As a result of the merger,",
      "the two companies",
      "will be able to offer",
      "a wider range of services",
      "to their customers."
    ],
    full: "As a result of the merger, the two companies will be able to offer a wider range of services to their customers.",
    translation: "合併の結果、両社は顧客により幅広いサービスを提供できるようになる。"
  },
  {
    id: 5,
    chunks: [
      "It is essential",
      "that all team members",
      "understand",
      "their roles and responsibilities",
      "before the project begins."
    ],
    full: "It is essential that all team members understand their roles and responsibilities before the project begins.",
    translation: "プロジェクトが始まる前に、すべてのチームメンバーが自分の役割と責任を理解しておくことが不可欠だ。"
  },
  {
    id: 6,
    chunks: [
      "The research suggests",
      "that regular exercise",
      "not only improves physical health",
      "but also has a positive effect",
      "on mental well-being."
    ],
    full: "The research suggests that regular exercise not only improves physical health but also has a positive effect on mental well-being.",
    translation: "研究によると、定期的な運動は身体的健康を改善するだけでなく、精神的健康にも良い影響を与える。"
  },
  {
    id: 7,
    chunks: [
      "Despite facing several challenges,",
      "the team managed",
      "to complete the project",
      "on time",
      "and within the budget."
    ],
    full: "Despite facing several challenges, the team managed to complete the project on time and within the budget.",
    translation: "いくつかの困難に直面しながらも、チームはプロジェクトを期限内、予算内で完了させた。"
  },
  {
    id: 8,
    chunks: [
      "Customers are advised",
      "to keep their receipts",
      "in case they need",
      "to return or exchange",
      "any items they have purchased."
    ],
    full: "Customers are advised to keep their receipts in case they need to return or exchange any items they have purchased.",
    translation: "購入した商品を返品または交換する必要がある場合に備えて、レシートを保管しておくことをお勧めします。"
  },
  {
    id: 9,
    chunks: [
      "The new technology",
      "is expected to reduce",
      "the time and cost",
      "involved in processing",
      "large amounts of data."
    ],
    full: "The new technology is expected to reduce the time and cost involved in processing large amounts of data.",
    translation: "その新技術は、大量のデータ処理にかかる時間とコストを削減することが期待されている。"
  },
  {
    id: 10,
    chunks: [
      "In order to succeed",
      "in a competitive market,",
      "businesses must constantly",
      "adapt to changing",
      "consumer needs and preferences."
    ],
    full: "In order to succeed in a competitive market, businesses must constantly adapt to changing consumer needs and preferences.",
    translation: "競争の激しい市場で成功するためには、企業は常に変化する消費者のニーズや嗜好に適応しなければならない。"
  },
  {
    id: 11,
    chunks: [
      "The organization",
      "announced that it would invest",
      "a significant amount",
      "in environmental initiatives",
      "over the next five years."
    ],
    full: "The organization announced that it would invest a significant amount in environmental initiatives over the next five years.",
    translation: "その組織は今後5年間、環境への取り組みに多額の投資を行うと発表した。"
  },
  {
    id: 12,
    chunks: [
      "She explained",
      "that the delay",
      "was caused by",
      "an unexpected shortage",
      "of raw materials."
    ],
    full: "She explained that the delay was caused by an unexpected shortage of raw materials.",
    translation: "彼女は、遅延が原材料の予期しない不足によって引き起こされたと説明した。"
  }
];
