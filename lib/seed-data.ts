import { Deck, Flashcard } from './types';

interface StarterCardInput {
  id: string;
  term: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  example: string;
}

interface StarterDeckInput {
  id: string;
  title: string;
  description: string;
  category: string;
  cards: StarterCardInput[];
}

const STARTER_DECKS_RAW: StarterDeckInput[] = [
  {
    id: 'deck_ielts_core',
    title: 'IELTS Academic Core',
    description: 'Từ vựng học thuật thiết yếu thường gặp trong bài đọc và viết IELTS Band 7.0+.',
    category: 'Học thuật',
    cards: [
      {
        id: 'card_ielts_1',
        term: 'ubiquitous',
        phonetic: '/juːˈbɪk.wɪ.təs/',
        partOfSpeech: 'adj',
        meaning: 'có mặt ở khắp mọi nơi, phổ biến',
        example: 'Smartphones have become ubiquitous in modern daily life.',
      },
      {
        id: 'card_ielts_2',
        term: 'mitigate',
        phonetic: '/ˈmɪt.ɪ.ɡeɪt/',
        partOfSpeech: 'verb',
        meaning: 'giảm nhẹ, làm dịu bớt tác động',
        example: 'Green spaces help mitigate the urban heat island effect.',
      },
      {
        id: 'card_ielts_3',
        term: 'paradigm',
        phonetic: '/ˈpær.ə.daɪm/',
        partOfSpeech: 'noun',
        meaning: 'mô hình chuẩn, hệ tư tưởng mẫu',
        example: 'Remote work created a new paradigm for office culture.',
      },
      {
        id: 'card_ielts_4',
        term: 'resilient',
        phonetic: '/rɪˈzɪl.jənt/',
        partOfSpeech: 'adj',
        meaning: 'kiên cường, nhanh chóng phục hồi',
        example: 'Local communities proved remarkably resilient after the storm.',
      },
      {
        id: 'card_ielts_5',
        term: 'exacerbate',
        phonetic: '/ɪɡˈzæs.ə.beɪt/',
        partOfSpeech: 'verb',
        meaning: 'làm trầm trọng thêm',
        example: 'Rising fuel costs can exacerbate supply chain delays.',
      },
      {
        id: 'card_ielts_6',
        term: 'pragmatic',
        phonetic: '/præɡˈmæt.ɪk/',
        partOfSpeech: 'adj',
        meaning: 'thực tế, thực dụng, chú trọng hiệu quả',
        example: 'The committee adopted a pragmatic approach to budget reform.',
      },
      {
        id: 'card_ielts_7',
        term: 'scrutinize',
        phonetic: '/ˈskruː.tɪ.naɪz/',
        partOfSpeech: 'verb',
        meaning: 'xem xét kỹ lưỡng, soi xét cẩn thận',
        example: 'Auditors will scrutinize every expense report before approval.',
      },
      {
        id: 'card_ielts_8',
        term: 'catalyst',
        phonetic: '/ˈkæt.əl.ɪst/',
        partOfSpeech: 'noun',
        meaning: 'chất xúc tác, nhân tố thúc đẩy thay đổi',
        example: 'Public investment served as a catalyst for clean energy growth.',
      },
    ],
  },
  {
    id: 'deck_business_comm',
    title: 'Giao tiếp Công sở',
    description: 'Từ vựng và diễn đạt chuyên nghiệp dùng trong họp nhóm, email và đàm phán.',
    category: 'Công việc',
    cards: [
      {
        id: 'card_biz_1',
        term: 'consensus',
        phonetic: '/kənˈsen.səs/',
        partOfSpeech: 'noun',
        meaning: 'sự đồng thuận chung của tập thể',
        example: 'After two hours of debate, the team reached a consensus.',
      },
      {
        id: 'card_biz_2',
        term: 'delegate',
        phonetic: '/ˈdel.ɪ.ɡeɪt/',
        partOfSpeech: 'verb',
        meaning: 'ủy quyền, phân công nhiệm vụ',
        example: 'Effective leaders know how to delegate routine tasks wisely.',
      },
      {
        id: 'card_biz_3',
        term: 'deliverable',
        phonetic: '/dɪˈlɪv.ər.ə.bəl/',
        partOfSpeech: 'noun',
        meaning: 'sản phẩm đầu ra, hạng mục bàn giao',
        example: 'The design prototype is our key deliverable for Friday.',
      },
      {
        id: 'card_biz_4',
        term: 'leverage',
        phonetic: '/ˈlev.ər.ɪdʒ/',
        partOfSpeech: 'verb',
        meaning: 'tận dụng tối đa lợi thế hoặc nguồn lực',
        example: 'We can leverage customer feedback to improve onboarding.',
      },
      {
        id: 'card_biz_5',
        term: 'streamline',
        phonetic: '/ˈstriːm.laɪn/',
        partOfSpeech: 'verb',
        meaning: 'tinh gọn quy trình, tối ưu hóa',
        example: 'Automation helped streamline our monthly invoicing workflow.',
      },
      {
        id: 'card_biz_6',
        term: 'stakeholder',
        phonetic: '/ˈsteɪkˌhəʊl.dər/',
        partOfSpeech: 'noun',
        meaning: 'các bên liên quan, người có quyền lợi liên đới',
        example: 'Every stakeholder received an updated project timeline.',
      },
      {
        id: 'card_biz_7',
        term: 'feasible',
        phonetic: '/ˈfiː.zə.bəl/',
        partOfSpeech: 'adj',
        meaning: 'khả thi, có thể thực hiện được',
        example: 'Launching the beta version next month looks completely feasible.',
      },
      {
        id: 'card_biz_8',
        term: 'benchmark',
        phonetic: '/ˈbentʃ.mɑːk/',
        partOfSpeech: 'noun',
        meaning: 'tiêu chuẩn đối chiếu, cột mốc chuẩn',
        example: 'This release sets a new benchmark for application speed.',
      },
    ],
  },
  {
    id: 'deck_tech_eng',
    title: 'Công nghệ & Lập trình',
    description: 'Thuật ngữ cốt lõi trong phát triển phần mềm, kiến trúc hệ thống và sản phẩm số.',
    category: 'Công nghệ',
    cards: [
      {
        id: 'card_tech_1',
        term: 'latency',
        phonetic: '/ˈleɪ.tən.si/',
        partOfSpeech: 'noun',
        meaning: 'độ trễ phản hồi của hệ thống mạng',
        example: 'Edge caching significantly reduced API latency for users.',
      },
      {
        id: 'card_tech_2',
        term: 'idempotent',
        phonetic: '/ˌaɪ.dəmˈpəʊ.tənt/',
        partOfSpeech: 'adj',
        meaning: 'lũy đẳng (thực hiện nhiều lần vẫn cho một kết quả)',
        example: 'Payment retry endpoints should always be idempotent.',
      },
      {
        id: 'card_tech_3',
        term: 'deprecated',
        phonetic: '/ˈdep.rə.keɪ.tɪd/',
        partOfSpeech: 'adj',
        meaning: 'lỗi thời, không còn được khuyến nghị sử dụng',
        example: 'Please migrate away from the deprecated authentication method.',
      },
      {
        id: 'card_tech_4',
        term: 'throughput',
        phonetic: '/ˈθruː.pʊt/',
        partOfSpeech: 'noun',
        meaning: 'thông lượng xử lý dữ liệu trong một đơn vị thời gian',
        example: 'Upgrading the queue workers doubled our message throughput.',
      },
      {
        id: 'card_tech_5',
        term: 'scalable',
        phonetic: '/ˈskeɪ.lə.bəl/',
        partOfSpeech: 'adj',
        meaning: 'có khả năng mở rộng quy mô linh hoạt',
        example: 'Stateless services make the backend architecture more scalable.',
      },
      {
        id: 'card_tech_6',
        term: 'encapsulate',
        phonetic: '/ɪnˈkæp.sjʊ.leɪt/',
        partOfSpeech: 'verb',
        meaning: 'đóng gói, che giấu chi tiết triển khai bên trong',
        example: 'Custom hooks help encapsulate complex data fetching logic.',
      },
      {
        id: 'card_tech_7',
        term: 'immutable',
        phonetic: '/ɪˈmjuː.tə.bəl/',
        partOfSpeech: 'adj',
        meaning: 'bất biến, không thể thay đổi sau khi tạo',
        example: 'Audit logs must remain immutable for compliance reasons.',
      },
      {
        id: 'card_tech_8',
        term: 'bottleneck',
        phonetic: '/ˈbɒt.əl.nek/',
        partOfSpeech: 'noun',
        meaning: 'điểm nghẽn cổ chai làm chậm toàn hệ thống',
        example: 'Unindexed database queries became our primary performance bottleneck.',
      },
    ],
  },
  {
    id: 'deck_phrasal_verbs',
    title: 'Cụm động từ Thông dụng',
    description: 'Những cụm động từ tiếng Anh tự nhiên dùng hằng ngày trong giao tiếp và bài thi.',
    category: 'Giao tiếp',
    cards: [
      {
        id: 'card_pv_1',
        term: 'figure out',
        phonetic: '/ˈfɪɡ.ər aʊt/',
        partOfSpeech: 'phrasal verb',
        meaning: 'tìm ra cách giải quyết, hiểu ra vấn đề',
        example: 'It took us an hour to figure out the root cause of the bug.',
      },
      {
        id: 'card_pv_2',
        term: 'carry out',
        phonetic: '/ˈkær.i aʊt/',
        partOfSpeech: 'phrasal verb',
        meaning: 'tiến hành, thực hiện một kế hoạch hoặc nghiên cứu',
        example: 'Researchers will carry out a survey across five universities.',
      },
      {
        id: 'card_pv_3',
        term: 'bring up',
        phonetic: '/brɪŋ ʌp/',
        partOfSpeech: 'phrasal verb',
        meaning: 'đề cập đến một chủ đề trong cuộc trò chuyện',
        example: 'She decided to bring up the timeline issue during the meeting.',
      },
      {
        id: 'card_pv_4',
        term: 'call off',
        phonetic: '/kɔːl ɒf/',
        partOfSpeech: 'phrasal verb',
        meaning: 'hủy bỏ một sự kiện hoặc kế hoạch đã định',
        example: 'Organizers had to call off the outdoor concert due to rain.',
      },
      {
        id: 'card_pv_5',
        term: 'keep up with',
        phonetic: '/kiːp ʌp wɪð/',
        partOfSpeech: 'phrasal verb',
        meaning: 'theo kịp tiến độ hoặc xu hướng mới',
        example: 'Reading weekly digests helps me keep up with industry news.',
      },
      {
        id: 'card_pv_6',
        term: 'turn down',
        phonetic: '/tɜːn daʊn/',
        partOfSpeech: 'phrasal verb',
        meaning: 'từ chối lời đề nghị hoặc giảm âm lượng',
        example: 'He had to turn down the job offer because of relocation.',
      },
      {
        id: 'card_pv_7',
        term: 'look into',
        phonetic: '/lʊk ˈɪn.tuː/',
        partOfSpeech: 'phrasal verb',
        meaning: 'điều tra, xem xét kỹ một sự việc',
        example: 'Support promised to look into the billing discrepancy today.',
      },
      {
        id: 'card_pv_8',
        term: 'put off',
        phonetic: '/pʊt ɒf/',
        partOfSpeech: 'phrasal verb',
        meaning: 'trì hoãn, dời lại sang lúc khác',
        example: 'Never put off reviewing difficult cards until the last minute.',
      },
    ],
  },
];

export function buildStarterData(ownerId = 'local'): {
  decks: Deck[];
  cards: Flashcard[];
} {
  const now = Date.now();
  const decks: Deck[] = [];
  const cards: Flashcard[] = [];

  STARTER_DECKS_RAW.forEach((rawDeck, deckIndex) => {
    const deckTs = now - (STARTER_DECKS_RAW.length - deckIndex) * 1000;
    decks.push({
      id: rawDeck.id,
      ownerId,
      title: rawDeck.title,
      description: rawDeck.description,
      category: rawDeck.category,
      cardCount: rawDeck.cards.length,
      masteredCount: 0,
      createdAt: deckTs,
      updatedAt: deckTs,
    });

    rawDeck.cards.forEach((rawCard, cardIndex) => {
      cards.push({
        id: rawCard.id,
        deckId: rawDeck.id,
        ownerId,
        term: rawCard.term,
        phonetic: rawCard.phonetic,
        partOfSpeech: rawCard.partOfSpeech,
        meaning: rawCard.meaning,
        example: rawCard.example,
        mastery: 'new',
        reviewCount: 0,
        correctCount: 0,
        starred: false,
        createdAt: deckTs + cardIndex,
        updatedAt: deckTs + cardIndex,
      });
    });
  });

  return { decks, cards };
}
