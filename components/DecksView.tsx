'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Edit3,
  FileUp,
  Layers,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import {
  Deck,
  Flashcard,
  LIMITS,
  MASTERY_LABELS,
  MasteryLevel,
  PracticeMode,
} from '@/lib/types';

interface DecksViewProps {
  decks: Deck[];
  cardsByDeck: Record<string, Flashcard[]>;
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  onStartPractice: (deckId: string, mode: PracticeMode) => void;
  onCreateDeck: (input: {
    title: string;
    description: string;
    category: string;
  }) => Promise<string>;
  onUpdateDeck: (
    deckId: string,
    input: { title: string; description: string; category: string }
  ) => Promise<void>;
  onDeleteDeck: (deckId: string) => Promise<void>;
  onDuplicateDeck: (deckId: string) => Promise<string | null>;
  onAddCard: (
    deckId: string,
    input: {
      term: string;
      phonetic: string;
      partOfSpeech: string;
      meaning: string;
      example: string;
    }
  ) => Promise<void>;
  onBulkAddCards: (
    deckId: string,
    items: Array<{
      term: string;
      meaning: string;
      phonetic?: string;
      partOfSpeech?: string;
      example?: string;
    }>
  ) => Promise<void>;
  onUpdateCard: (
    card: Flashcard,
    input: {
      term: string;
      phonetic: string;
      partOfSpeech: string;
      meaning: string;
      example: string;
    }
  ) => Promise<void>;
  onDeleteCard: (card: Flashcard) => Promise<void>;
  onToggleStar: (card: Flashcard) => Promise<void>;
}

export function DecksView({
  decks,
  cardsByDeck,
  selectedDeckId,
  onSelectDeck,
  onStartPractice,
  onCreateDeck,
  onUpdateDeck,
  onDeleteDeck,
  onDuplicateDeck,
  onAddCard,
  onBulkAddCards,
  onUpdateCard,
  onDeleteCard,
  onToggleStar,
}: DecksViewProps) {
  const activeDeck =
    decks.find((d) => d.id === selectedDeckId) || decks[0] || null;
  const activeCards = useMemo(
    () => (activeDeck ? cardsByDeck[activeDeck.id] || [] : []),
    [activeDeck, cardsByDeck]
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [masteryFilter, setMasteryFilter] = useState<
    'all' | MasteryLevel | 'starred'
  >('all');

  // Deck Modal state
  const [deckModalMode, setDeckModalMode] = useState<'create' | 'edit' | null>(
    null
  );
  const [deckTitle, setDeckTitle] = useState('');
  const [deckDesc, setDeckDesc] = useState('');
  const [deckCategory, setDeckCategory] = useState('Học thuật');
  const [confirmDeleteDeckId, setConfirmDeleteDeckId] = useState<string | null>(
    null
  );

  // Card Modal state
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [term, setTerm] = useState('');
  const [phonetic, setPhonetic] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('noun');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');

  // Bulk import modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeCards.filter((card) => {
      if (masteryFilter === 'starred') {
        if (!card.starred) return false;
      } else if (masteryFilter !== 'all' && card.mastery !== masteryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        card.term.toLowerCase().includes(q) ||
        card.meaning.toLowerCase().includes(q) ||
        card.example.toLowerCase().includes(q)
      );
    });
  }, [activeCards, searchQuery, masteryFilter]);

  function openCreateDeck() {
    setDeckModalMode('create');
    setDeckTitle('');
    setDeckDesc('');
    setDeckCategory('Cá nhân');
  }

  function openEditDeck(deck: Deck) {
    setDeckModalMode('edit');
    setDeckTitle(deck.title);
    setDeckDesc(deck.description);
    setDeckCategory(deck.category);
  }

  async function handleSaveDeck(e: FormEvent) {
    e.preventDefault();
    if (!deckTitle.trim()) return;
    if (deckModalMode === 'create') {
      const newId = await onCreateDeck({
        title: deckTitle,
        description: deckDesc,
        category: deckCategory,
      });
      onSelectDeck(newId);
    } else if (deckModalMode === 'edit' && activeDeck) {
      await onUpdateDeck(activeDeck.id, {
        title: deckTitle,
        description: deckDesc,
        category: deckCategory,
      });
    }
    setDeckModalMode(null);
  }

  function openNewCard() {
    setEditingCard(null);
    setTerm('');
    setPhonetic('');
    setPartOfSpeech('noun');
    setMeaning('');
    setExample('');
    setCardModalOpen(true);
  }

  function openEditCard(card: Flashcard) {
    setEditingCard(card);
    setTerm(card.term);
    setPhonetic(card.phonetic);
    setPartOfSpeech(card.partOfSpeech || 'noun');
    setMeaning(card.meaning);
    setExample(card.example);
    setCardModalOpen(true);
  }

  async function handleSaveCard(e: FormEvent) {
    e.preventDefault();
    if (!activeDeck || !term.trim() || !meaning.trim()) return;
    if (editingCard) {
      await onUpdateCard(editingCard, {
        term,
        phonetic,
        partOfSpeech,
        meaning,
        example,
      });
    } else {
      await onAddCard(activeDeck.id, {
        term,
        phonetic,
        partOfSpeech,
        meaning,
        example,
      });
    }
    setCardModalOpen(false);
  }

  async function handleBulkImport(e: FormEvent) {
    e.preventDefault();
    if (!activeDeck) return;
    setBulkError(null);

    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: Array<{
      term: string;
      meaning: string;
      phonetic?: string;
      partOfSpeech?: string;
      example?: string;
    }> = [];

    for (const line of lines) {
      const parts = line.includes('|')
        ? line.split('|')
        : line.includes('\t')
          ? line.split('\t')
          : line.split(' - ');
      const cleaned = parts.map((p) => p.trim());
      if (cleaned.length >= 2 && cleaned[0] && cleaned[1]) {
        parsed.push({
          term: cleaned[0],
          meaning: cleaned[1],
          phonetic: cleaned[2] || '',
          example: cleaned[3] || '',
        });
      }
    }

    if (parsed.length === 0) {
      setBulkError(
        'Chưa nhận diện được thẻ hợp lệ. Dùng định dạng: từ | nghĩa | phiên âm | ví dụ'
      );
      return;
    }

    await onBulkAddCards(activeDeck.id, parsed);
    setBulkText('');
    setBulkModalOpen(false);
  }

  function handleExportDeck() {
    if (!activeDeck || activeCards.length === 0) return;
    const lines = activeCards.map((c) =>
      [c.term, c.meaning, c.phonetic, c.example].filter(Boolean).join(' | ')
    );
    const blob = new Blob([lines.join('\n')], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDeck.title.toLowerCase().replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalCards = decks.reduce((sum, d) => sum + d.cardCount, 0);
  const totalMastered = decks.reduce((sum, d) => sum + d.masteredCount, 0);
  const starredCount = activeCards.filter((c) => c.starred).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Page Header */}
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl text-balance">
            Thư viện Bộ thẻ Từ vựng
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {decks.length} bộ thẻ · {totalCards} từ vựng · {totalMastered} từ đã thành thạo
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateDeck}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Tạo bộ thẻ mới</span>
        </button>
      </div>

      {/* Mobile Horizontal Deck Switcher Strip (< lg) */}
      <div className="mb-5 lg:hidden" aria-label="Chọn nhanh bộ thẻ">
        <div className="flex gap-2.5 overflow-x-auto pb-2 snap-x">
          {decks.map((deck) => {
            const isSelected = activeDeck?.id === deck.id;
            const pct =
              deck.cardCount > 0
                ? Math.round((deck.masteredCount / deck.cardCount) * 100)
                : 0;
            return (
              <button
                key={deck.id}
                type="button"
                onClick={() => onSelectDeck(deck.id)}
                className={`snap-start min-w-[205px] max-w-[230px] shrink-0 rounded-xl border p-3.5 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-sky-600 bg-white shadow-sm dark:border-sky-500 dark:bg-slate-900'
                    : 'border-slate-200 bg-white/75 dark:border-slate-800 dark:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400 truncate">
                    {deck.category} · {deck.cardCount} thẻ
                  </span>
                  <span className="font-mono-tabular font-semibold text-sky-600 dark:text-sky-400 shrink-0">
                    {pct}%
                  </span>
                </div>
                <div className="mt-1 truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  {deck.title}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Two-Zone Layout: Sidebar (1/3) + Active Deck Stage (2/3) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        <aside
          className="hidden lg:block lg:col-span-4 space-y-3"
          aria-label="Danh sách bộ thẻ"
        >
          {decks.map((deck) => {
            const isSelected = activeDeck?.id === deck.id;
            const progressPct =
              deck.cardCount > 0
                ? Math.round((deck.masteredCount / deck.cardCount) * 100)
                : 0;

            return (
              <button
                key={deck.id}
                type="button"
                onClick={() => onSelectDeck(deck.id)}
                className={`w-full rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-sky-600 bg-white shadow-sm dark:border-sky-500 dark:bg-slate-900'
                    : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {deck.category} · {deck.cardCount} thẻ
                    </div>
                    <h2 className="mt-1 truncate font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                      {deck.title}
                    </h2>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-sky-600 dark:text-sky-400 shrink-0">
                    {progressPct}%
                  </span>
                </div>

                {deck.description && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {deck.description}
                  </p>
                )}

                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-sky-600 transition-all duration-300 dark:bg-sky-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </button>
            );
          })}

          {decks.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
              <Layers
                className="mx-auto h-7 w-7 text-slate-400"
                aria-hidden="true"
              />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                Chưa có bộ thẻ nào
              </p>
              <button
                type="button"
                onClick={openCreateDeck}
                className="mt-3 text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400 cursor-pointer"
              >
                Tạo bộ thẻ đầu tiên
              </button>
            </div>
          )}
        </aside>

        {/* Right Zone: Active Deck Workspace */}
        <section className="lg:col-span-8">
          {activeDeck ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              {/* Deck Summary & Actions */}
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {activeDeck.category} · {activeCards.length} từ vựng ·{' '}
                      {activeCards.filter((c) => c.mastery === 'mastered').length}{' '}
                      đã thuộc · {starredCount} gắn sao
                    </div>
                    <h2 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
                      {activeDeck.title}
                    </h2>
                    {activeDeck.description && (
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {activeDeck.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditDeck(activeDeck)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Sửa</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const newId = await onDuplicateDeck(activeDeck.id);
                        if (newId) onSelectDeck(newId);
                      }}
                      title="Nhân bản bộ thẻ"
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Nhân bản</span>
                    </button>

                    <button
                      type="button"
                      disabled={activeCards.length === 0}
                      onClick={handleExportDeck}
                      title="Xuất danh sách từ vựng (.txt)"
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Xuất TXT</span>
                    </button>

                    {decks.length > 1 && (
                      <>
                        {confirmDeleteDeckId === activeDeck.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteDeck(activeDeck.id);
                                setConfirmDeleteDeckId(null);
                              }}
                              className="min-h-[38px] rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer whitespace-nowrap"
                            >
                              Xác nhận xóa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteDeckId(null)}
                              className="min-h-[38px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDeckId(activeDeck.id)}
                            aria-label="Xóa bộ thẻ"
                            className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* 7 Practice Modes Launcher Grid (Quizlet + OpenQuiz) */}
                <div className="pt-1">
                  <div className="mb-2.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Chọn chế độ học & kiểm tra:
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                    {(
                      [
                        { id: 'flip', label: 'Lật thẻ 3D', hint: 'Tự chạy & vuốt thẻ' },
                        { id: 'learn', label: 'Học thông minh', hint: 'Lặp đến khi thuộc' },
                        { id: 'quiz', label: 'Trắc nghiệm', hint: '4 đáp án nhanh' },
                        { id: 'fill', label: 'Điền từ', hint: 'Theo câu ví dụ' },
                        { id: 'match', label: 'Nối thẻ', hint: 'Ghép cặp Anh–Việt' },
                        { id: 'spell', label: 'Nghe & Viết', hint: 'Chính tả & phát âm' },
                        { id: 'test', label: 'Kiểm tra', hint: 'Đề thi hẹn giờ' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={activeCards.length === 0}
                        onClick={() => onStartPractice(activeDeck.id, m.id)}
                        className="group min-h-[60px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-sky-600 hover:bg-sky-50/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-sky-500 dark:hover:bg-sky-950/30 cursor-pointer"
                      >
                        <div className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 dark:text-slate-100 dark:group-hover:text-sky-400 whitespace-nowrap">
                          {m.label}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                          {m.hint}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Vocabulary Filter & Action Bar */}
              <div className="mt-5 flex flex-col gap-3">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm từ vựng, nghĩa hoặc ví dụ..."
                      className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-900"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setBulkModalOpen(true)}
                      className="inline-flex min-h-[42px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                    >
                      <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Nhập nhanh</span>
                    </button>

                    <button
                      type="button"
                      onClick={openNewCard}
                      className="inline-flex min-h-[42px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Thêm thẻ</span>
                    </button>
                  </div>
                </div>

                {/* Filter Segmented Strip (Scrollable on small mobile) */}
                <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
                  {(
                    [
                      { id: 'all', label: `Tất cả (${activeCards.length})` },
                      { id: 'new', label: 'Mới' },
                      { id: 'learning', label: 'Đang học' },
                      { id: 'mastered', label: 'Đã thuộc' },
                      { id: 'starred', label: `Gắn sao (${starredCount})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setMasteryFilter(f.id)}
                      className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        masteryFilter === f.id
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cards List */}
              <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
                {filteredCards.map((card) => (
                  <div
                    key={card.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                          {card.term}
                        </span>
                        {card.phonetic && (
                          <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                            {card.phonetic}
                          </span>
                        )}
                        {card.partOfSpeech && (
                          <span className="text-xs italic text-slate-500 dark:text-slate-400">
                            ({card.partOfSpeech})
                          </span>
                        )}
                        <span
                          aria-hidden="true"
                          className="text-slate-300 dark:text-slate-700"
                        >
                          ·
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            card.mastery === 'mastered'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : card.mastery === 'learning'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {MASTERY_LABELS[card.mastery]}
                        </span>
                      </div>

                      <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {card.meaning}
                      </p>

                      {card.example && (
                        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                          “{card.example}”
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleStar(card)}
                        title={card.starred ? 'Bỏ gắn sao' : 'Gắn sao từ này'}
                        aria-label={
                          card.starred
                            ? `Bỏ gắn sao ${card.term}`
                            : `Gắn sao ${card.term}`
                        }
                        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors cursor-pointer ${
                          card.starred
                            ? 'text-amber-500 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Star
                          className={`h-4 w-4 ${card.starred ? 'fill-current' : ''}`}
                          aria-hidden="true"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => speakEnglish(card.term)}
                        title="Nghe phát âm"
                        aria-label={`Nghe phát âm ${card.term}`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-400 cursor-pointer"
                      >
                        <Volume2 className="h-4 w-4" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditCard(card)}
                        title="Sửa thẻ"
                        aria-label={`Sửa ${card.term}`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteCard(card)}
                        title="Xóa thẻ"
                        aria-label={`Xóa ${card.term}`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}

                {filteredCards.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {activeCards.length === 0
                        ? 'Bộ thẻ này chưa có từ vựng nào. Hãy nhấn "Thêm thẻ" hoặc "Nhập nhanh" để bắt đầu.'
                        : 'Không tìm thấy thẻ nào khớp với bộ lọc hiện tại.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* Create / Edit Deck Modal (Bottom Sheet on Mobile, Centered Dialog on PC) */}
      {deckModalMode && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deck-modal-title"
        >
          <div className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
            <div className="flex items-center justify-between">
              <h3
                id="deck-modal-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                {deckModalMode === 'create' ? 'Tạo bộ thẻ mới' : 'Chỉnh sửa bộ thẻ'}
              </h3>
              <button
                type="button"
                onClick={() => setDeckModalMode(null)}
                aria-label="Đóng"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDeck} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="deck-title-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Tên bộ thẻ
                </label>
                <input
                  id="deck-title-input"
                  type="text"
                  required
                  maxLength={LIMITS.TITLE_MAX}
                  value={deckTitle}
                  onChange={(e) => setDeckTitle(e.target.value)}
                  placeholder="Ví dụ: Từ vựng TOEIC 750+"
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="deck-category-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Chủ đề
                </label>
                <input
                  id="deck-category-input"
                  type="text"
                  required
                  maxLength={LIMITS.CATEGORY_MAX}
                  value={deckCategory}
                  onChange={(e) => setDeckCategory(e.target.value)}
                  placeholder="Học thuật, Công việc, Giao tiếp..."
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="deck-desc-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Mô tả ngắn
                </label>
                <textarea
                  id="deck-desc-input"
                  rows={3}
                  maxLength={LIMITS.DESC_MAX}
                  value={deckDesc}
                  onChange={(e) => setDeckDesc(e.target.value)}
                  placeholder="Ghi chú mục tiêu hoặc nội dung bộ thẻ..."
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeckModalMode(null)}
                  className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>Lưu bộ thẻ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Card Modal */}
      {cardModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
            <div className="flex items-center justify-between">
              <h3
                id="card-modal-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                {editingCard ? 'Chỉnh sửa thẻ từ vựng' : 'Thêm thẻ từ vựng mới'}
              </h3>
              <button
                type="button"
                onClick={() => setCardModalOpen(false)}
                aria-label="Đóng"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="card-term-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Từ vựng (Tiếng Anh) *
                  </label>
                  <input
                    id="card-term-input"
                    type="text"
                    required
                    maxLength={LIMITS.TERM_MAX}
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="ubiquitous"
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="card-phonetic-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Phiên âm (IPA)
                  </label>
                  <input
                    id="card-phonetic-input"
                    type="text"
                    maxLength={LIMITS.PHONETIC_MAX}
                    value={phonetic}
                    onChange={(e) => setPhonetic(e.target.value)}
                    placeholder="/juːˈbɪk.wɪ.təs/"
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="card-pos-select"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Từ loại
                  </label>
                  <select
                    id="card-pos-select"
                    value={partOfSpeech}
                    onChange={(e) => setPartOfSpeech(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="noun">Danh từ (noun)</option>
                    <option value="verb">Động từ (verb)</option>
                    <option value="adj">Tính từ (adj)</option>
                    <option value="adv">Trạng từ (adv)</option>
                    <option value="phrasal verb">Cụm động từ</option>
                    <option value="idiom">Thành ngữ</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="card-meaning-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Nghĩa tiếng Việt *
                  </label>
                  <input
                    id="card-meaning-input"
                    type="text"
                    required
                    maxLength={LIMITS.MEANING_MAX}
                    value={meaning}
                    onChange={(e) => setMeaning(e.target.value)}
                    placeholder="có mặt ở khắp mọi nơi"
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="card-example-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Câu ví dụ (dùng cho chế độ Điền từ vào chỗ trống)
                </label>
                <textarea
                  id="card-example-input"
                  rows={2}
                  maxLength={LIMITS.EXAMPLE_MAX}
                  value={example}
                  onChange={(e) => setExample(e.target.value)}
                  placeholder="Smartphones have become ubiquitous in modern daily life."
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCardModalOpen(false)}
                  className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>{editingCard ? 'Cập nhật' : 'Thêm thẻ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {bulkModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-modal-title"
        >
          <div className="w-full max-w-lg rounded-t-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
            <div className="flex items-center justify-between">
              <h3
                id="bulk-modal-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                Nhập nhanh nhiều thẻ từ vựng
              </h3>
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                aria-label="Đóng"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Mỗi dòng một thẻ theo mẫu: <code className="font-mono-tabular">từ | nghĩa | phiên âm | ví dụ</code> (phiên âm và ví dụ là tùy chọn).
            </p>

            <form onSubmit={handleBulkImport} className="mt-4 space-y-4">
              <textarea
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  'ephemeral | ngắn ngủi, chóng tàn | /ɪˈfem.ər.əl/ | Fame can be ephemeral.\neloquent | hùng biện, lưu loát | /ˈel.ə.kwənt/ | She gave an eloquent speech.'
                }
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono-tabular text-xs text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              {bulkError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {bulkError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  Nhập thẻ vào bộ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
