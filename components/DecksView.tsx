'use client';

import { FormEvent, KeyboardEvent, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
  Tag,
  Trash2,
  UploadCloud,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { BulkImportModal } from '@/components/BulkImportModal';
import { PracticePoolFilter } from '@/components/PracticeArena';
import { downloadDeckCsv } from '@/lib/import-export';
import { speakEnglish } from '@/lib/speech';
import {
  AuthUser,
  CommunityCardItem,
  CommunityDeck,
  Deck,
  Flashcard,
  LIMITS,
  MASTERY_LABELS,
  MasteryLevel,
  PracticeMode,
  normalizeTags,
} from '@/lib/types';

interface DecksViewProps {
  user: AuthUser | null;
  decks: Deck[];
  cardsByDeck: Record<string, Flashcard[]>;
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  onStartPractice: (
    deckId: string,
    mode: PracticeMode,
    filter?: PracticePoolFilter,
    tag?: string
  ) => void;
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
  onResetDeck: (deckId: string) => Promise<void>;
  onDuplicateDeck: (deckId: string) => Promise<string | null>;
  onAddCard: (
    deckId: string,
    input: {
      term: string;
      phonetic: string;
      partOfSpeech: string;
      meaning: string;
      example: string;
      tags?: string[];
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
      tags?: string[] | string;
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
      tags?: string[];
    }
  ) => Promise<void>;
  onDeleteCard: (card: Flashcard) => Promise<void>;
  onToggleStar: (card: Flashcard) => Promise<void>;
  onPublishDeckToCommunity: (input: {
    sourceDeckId?: string | null;
    title: string;
    description: string;
    category: string;
    cards: CommunityCardItem[];
  }) => Promise<{ ok: boolean; error?: string; deck?: CommunityDeck }>;
  onGoToCommunity: () => void;
  onOpenAuth: () => void;
}

export function DecksView({
  user,
  decks,
  cardsByDeck,
  selectedDeckId,
  onSelectDeck,
  onStartPractice,
  onCreateDeck,
  onUpdateDeck,
  onDeleteDeck,
  onResetDeck,
  onDuplicateDeck,
  onAddCard,
  onBulkAddCards,
  onUpdateCard,
  onDeleteCard,
  onToggleStar,
  onPublishDeckToCommunity,
  onGoToCommunity,
  onOpenAuth,
}: DecksViewProps) {
  const activeDeck =
    decks.find((d) => d.id === selectedDeckId) || decks[0] || null;
  const activeCards = useMemo(
    () => (activeDeck ? cardsByDeck[activeDeck.id] || [] : []),
    [activeDeck, cardsByDeck]
  );

  const [publishingDeckId, setPublishingDeckId] = useState<string | null>(null);
  const [publishFeedback, setPublishFeedback] = useState<{
    deckId: string;
    ok: boolean;
    message: string;
  } | null>(null);
  const [publishModalData, setPublishModalData] = useState<{
    title: string;
    category: string;
    description: string;
  } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [masteryFilter, setMasteryFilter] = useState<
    'all' | MasteryLevel | 'starred' | 'weak'
  >('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');

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
  const [confirmResetDeckId, setConfirmResetDeckId] = useState<string | null>(
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
  const [cardTags, setCardTags] = useState<string[]>([]);
  const [cardTagInput, setCardTagInput] = useState('');

  // Bulk import modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const deckTags = useMemo(() => {
    const counts = new Map<string, { tag: string; count: number }>();
    for (const card of activeCards) {
      for (const rawTag of card.tags || []) {
        const key = rawTag.toLowerCase();
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { tag: rawTag, count: 1 });
        }
      }
    }
    return Array.from(counts.values()).sort(
      (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'vi')
    );
  }, [activeCards]);

  const effectiveTagFilter = useMemo(() => {
    if (!selectedTag || selectedTag === 'all') return 'all';
    const match = deckTags.find(
      (t) => t.tag.toLowerCase() === selectedTag.toLowerCase()
    );
    return match ? match.tag : 'all';
  }, [selectedTag, deckTags]);

  const allLibraryTags = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const t of deckTags) {
      const k = t.tag.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        list.push(t.tag);
      }
    }
    for (const deckCardList of Object.values(cardsByDeck)) {
      for (const c of deckCardList) {
        for (const rawTag of c.tags || []) {
          const k = rawTag.toLowerCase();
          if (!seen.has(k)) {
            seen.add(k);
            list.push(rawTag);
          }
        }
      }
    }
    return list.slice(0, 16);
  }, [deckTags, cardsByDeck]);

  const tagScopedCards = useMemo(() => {
    if (effectiveTagFilter === 'all') return activeCards;
    const target = effectiveTagFilter.toLowerCase();
    return activeCards.filter((c) =>
      (c.tags || []).some((t) => t.toLowerCase() === target)
    );
  }, [activeCards, effectiveTagFilter]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tagScopedCards.filter((card) => {
      if (masteryFilter === 'starred') {
        if (!card.starred) return false;
      } else if (masteryFilter === 'weak') {
        if (
          card.reviewCount === 0 ||
          card.correctCount / card.reviewCount >= 0.7
        ) {
          return false;
        }
      } else if (masteryFilter !== 'all' && card.mastery !== masteryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        card.term.toLowerCase().includes(q) ||
        card.meaning.toLowerCase().includes(q) ||
        card.example.toLowerCase().includes(q) ||
        (card.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [tagScopedCards, searchQuery, masteryFilter]);

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
    setCardTags(effectiveTagFilter !== 'all' ? [effectiveTagFilter] : []);
    setCardTagInput('');
    setCardModalOpen(true);
  }

  function openEditCard(card: Flashcard) {
    setEditingCard(card);
    setTerm(card.term);
    setPhonetic(card.phonetic);
    setPartOfSpeech(card.partOfSpeech || 'noun');
    setMeaning(card.meaning);
    setExample(card.example);
    setCardTags(card.tags || []);
    setCardTagInput('');
    setCardModalOpen(true);
  }

  function commitCardTagInput(rawValue = cardTagInput) {
    const additions = normalizeTags(rawValue);
    if (additions.length === 0) return;
    setCardTags((prev) => normalizeTags([...prev, ...additions]));
    setCardTagInput('');
  }

  function handleTagInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitCardTagInput();
    }
  }

  function removeCardTag(tagToRemove: string) {
    setCardTags((prev) =>
      prev.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase())
    );
  }

  async function handleSaveCard(e: FormEvent) {
    e.preventDefault();
    if (!activeDeck || !term.trim() || !meaning.trim()) return;
    const finalTags = normalizeTags([...cardTags, cardTagInput]);
    if (editingCard) {
      await onUpdateCard(editingCard, {
        term,
        phonetic,
        partOfSpeech,
        meaning,
        example,
        tags: finalTags,
      });
    } else {
      await onAddCard(activeDeck.id, {
        term,
        phonetic,
        partOfSpeech,
        meaning,
        example,
        tags: finalTags,
      });
    }
    setCardModalOpen(false);
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
  const starredCount = tagScopedCards.filter((c) => c.starred).length;
  const weakCount = tagScopedCards.filter(
    (c) => c.reviewCount > 0 && c.correctCount / c.reviewCount < 0.7
  ).length;
  const priorityCount = tagScopedCards.filter(
    (c) =>
      c.mastery !== 'mastered' ||
      c.starred ||
      (c.reviewCount > 0 && c.correctCount / c.reviewCount < 0.7)
  ).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Page Header */}
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {user && (
            <p className="text-xs font-medium text-sky-600 dark:text-sky-400">
              Xin chào, {user.displayName} · @{user.username}
            </p>
          )}
          <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl text-balance">
            Thư viện Bộ thẻ Từ vựng
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {decks.length} bộ thẻ · {totalCards} từ vựng · {totalMastered} từ đã thành thạo ·{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {user
                ? `Lưu riêng cho tài khoản @${user.username}`
                : 'Lưu trực tiếp trên máy này'}
            </span>
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
                      disabled={
                        activeCards.length === 0 ||
                        publishingDeckId === activeDeck.id
                      }
                      onClick={() => {
                        if (!user) {
                          onOpenAuth();
                          return;
                        }
                        setPublishFeedback(null);
                        setPublishModalData({
                          title: activeDeck.title,
                          category: activeDeck.category,
                          description: activeDeck.description,
                        });
                      }}
                      title="Đăng tải bộ thẻ này lên Kho thẻ để mọi người cùng học"
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-40 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/70 whitespace-nowrap cursor-pointer"
                    >
                      <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {publishingDeckId === activeDeck.id
                          ? 'Đang đăng...'
                          : 'Đăng Kho thẻ'}
                      </span>
                    </button>

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
                      onClick={() => downloadDeckCsv(activeDeck.title, activeCards)}
                      title="Xuất file CSV (mở được trong Excel, kèm nhãn chủ đề)"
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Xuất CSV</span>
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

                    {activeCards.length > 0 && (
                      <>
                        {confirmResetDeckId === activeDeck.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await onResetDeck(activeDeck.id);
                                setConfirmResetDeckId(null);
                              }}
                              className="min-h-[38px] rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer whitespace-nowrap"
                            >
                              Đặt lại tiến độ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmResetDeckId(null)}
                              className="min-h-[38px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteDeckId(null);
                              setConfirmResetDeckId(activeDeck.id);
                            }}
                            title="Đặt lại tiến độ bộ thẻ về Mới"
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">Đặt lại</span>
                          </button>
                        )}
                      </>
                    )}

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
                            onClick={() => {
                              setConfirmResetDeckId(null);
                              setConfirmDeleteDeckId(activeDeck.id);
                            }}
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

                {publishFeedback && publishFeedback.deckId === activeDeck.id && (
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                      publishFeedback.ok
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                    }`}
                  >
                    <span>{publishFeedback.message}</span>
                    {publishFeedback.ok && (
                      <button
                        type="button"
                        onClick={onGoToCommunity}
                        className="font-semibold underline hover:no-underline cursor-pointer"
                      >
                        Mở Kho thẻ ngay
                      </button>
                    )}
                  </div>
                )}

                {/* Quick Priority Practice Banner Button */}
                <div className="flex flex-col gap-2.5 rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 dark:border-sky-900/60 dark:bg-sky-950/25 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {effectiveTagFilter !== 'all'
                        ? `Luyện chủ đề #${effectiveTagFilter} (${tagScopedCards.length} thẻ)`
                        : 'Học ngay các thẻ ưu tiên cao'}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {effectiveTagFilter !== 'all'
                        ? `Đang lọc theo nhãn #${effectiveTagFilter} · Chọn bất kỳ chế độ bên dưới để luyện riêng chủ đề này.`
                        : priorityCount > 0
                          ? `Ưu tiên ${priorityCount} thẻ mới, hay sai & chưa thuộc với Xáo trộn thông minh.`
                          : `Tất cả ${activeCards.length} thẻ đã thuộc — bắt đầu ôn lại nhanh ngay.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={tagScopedCards.length === 0}
                    onClick={() =>
                      onStartPractice(
                        activeDeck.id,
                        'learn',
                        'priority',
                        effectiveTagFilter
                      )
                    }
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Zap className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {effectiveTagFilter !== 'all'
                        ? `Luyện #${effectiveTagFilter}`
                        : 'Luyện tập nhanh'}
                    </span>
                  </button>
                </div>

                {/* Practice Modes & Mini-Games Launcher Grid */}
                <div className="pt-1">
                  <div className="mb-2.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Chọn chế độ học, trò chơi & kiểm tra
                    {effectiveTagFilter !== 'all'
                      ? ` (theo chủ đề #${effectiveTagFilter})`
                      : ''}
                    :
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {/* Grouped 2-in-1 Card: Học & Trắc nghiệm */}
                    <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          Học & Trắc nghiệm
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          2 chế độ kết hợp
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {(
                          [
                            {
                              id: 'learn' as const,
                              label: 'Học thông minh',
                              hint: 'Lặp đến khi thuộc',
                            },
                            {
                              id: 'quiz' as const,
                              label: 'Trắc nghiệm',
                              hint: '4 đáp án nhanh',
                            },
                          ] as const
                        ).map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            disabled={tagScopedCards.length === 0}
                            onClick={() =>
                              onStartPractice(
                                activeDeck.id,
                                sub.id,
                                'all',
                                effectiveTagFilter
                              )
                            }
                            className="group min-h-[54px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-sky-600 hover:bg-sky-50/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-500 dark:hover:bg-sky-950/30 cursor-pointer"
                          >
                            <div className="text-xs font-semibold text-slate-900 group-hover:text-sky-700 dark:text-slate-100 dark:group-hover:text-sky-400 sm:text-sm whitespace-nowrap">
                              {sub.label}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {sub.hint}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={tagScopedCards.length === 0}
                      onClick={() =>
                        onStartPractice(
                          activeDeck.id,
                          'flip',
                          'all',
                          effectiveTagFilter
                        )
                      }
                      className="group flex min-h-[60px] flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-sky-600 hover:bg-sky-50/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-sky-500 dark:hover:bg-sky-950/30 cursor-pointer"
                    >
                      <div className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 dark:text-slate-100 dark:group-hover:text-sky-400 whitespace-nowrap">
                        Lật thẻ 3D
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                        Tự chạy & vuốt thẻ
                      </div>
                    </button>

                    {/* Grouped 2-in-1 Card: Điền từ & Nghe viết */}
                    <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          Điền từ & Nghe viết
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          2 chế độ gõ từ
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {(
                          [
                            {
                              id: 'fill' as const,
                              label: 'Điền từ',
                              hint: 'Theo câu ví dụ',
                            },
                            {
                              id: 'spell' as const,
                              label: 'Nghe & Viết',
                              hint: 'Chính tả & phát âm',
                            },
                          ] as const
                        ).map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            disabled={tagScopedCards.length === 0}
                            onClick={() =>
                              onStartPractice(
                                activeDeck.id,
                                sub.id,
                                'all',
                                effectiveTagFilter
                              )
                            }
                            className="group min-h-[54px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-sky-600 hover:bg-sky-50/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-500 dark:hover:bg-sky-950/30 cursor-pointer"
                          >
                            <div className="text-xs font-semibold text-slate-900 group-hover:text-sky-700 dark:text-slate-100 dark:group-hover:text-sky-400 sm:text-sm whitespace-nowrap">
                              {sub.label}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {sub.hint}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {(
                      [
                        { id: 'match', label: 'Nối & Ghép thẻ', hint: 'Nối 2 cột · 4×3 · 4×4' },
                        { id: 'speak', label: 'Luyện nói AI', hint: 'Đọc & đặt câu do AI chấm' },
                        { id: 'blast', label: 'Xếp khối Blast', hint: 'Lưới 8×8 ăn điểm BXH' },
                        { id: 'meteor', label: 'Bắn thiên thạch', hint: 'Súng laser vũ trụ BXH' },
                        { id: 'tank', label: 'Xe tăng 3D', hint: 'Lái tăng 390 húc cổng' },
                        { id: 'test', label: 'Kiểm tra', hint: 'Đề thi tổng hợp hẹn giờ' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={tagScopedCards.length === 0}
                        onClick={() =>
                          onStartPractice(
                            activeDeck.id,
                            m.id,
                            'all',
                            effectiveTagFilter
                          )
                        }
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
                      <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Nhập CSV / Excel</span>
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

                {/* Filter Segmented Strip & Quick Filtered Review */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
                    {(
                      [
                        { id: 'all', label: `Tất cả (${tagScopedCards.length})` },
                        { id: 'new', label: 'Mới' },
                        { id: 'learning', label: 'Đang học' },
                        { id: 'mastered', label: 'Đã thuộc' },
                        { id: 'starred', label: `Gắn sao (${starredCount})` },
                        { id: 'weak', label: `Hay sai (${weakCount})` },
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

                  {(starredCount > 0 || weakCount > 0) && (
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      {starredCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            onStartPractice(
                              activeDeck.id,
                              'flip',
                              'starred',
                              effectiveTagFilter
                            )
                          }
                          className="font-semibold text-amber-600 hover:underline dark:text-amber-400 whitespace-nowrap cursor-pointer"
                        >
                          Ôn {starredCount} từ gắn sao
                        </button>
                      )}
                      {weakCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            onStartPractice(
                              activeDeck.id,
                              'learn',
                              'weak',
                              effectiveTagFilter
                            )
                          }
                          className="font-semibold text-sky-600 hover:underline dark:text-sky-400 whitespace-nowrap cursor-pointer"
                        >
                          Ôn {weakCount} từ hay sai
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Topic Tag Filter Strip */}
                {deckTags.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
                        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Chủ đề:</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedTag('all')}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          effectiveTagFilter === 'all'
                            ? 'border-slate-900 bg-slate-900 text-white dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                      >
                        Tất cả ({activeCards.length})
                      </button>
                      {deckTags.map((t) => {
                        const active =
                          effectiveTagFilter.toLowerCase() === t.tag.toLowerCase();
                        return (
                          <button
                            key={t.tag}
                            type="button"
                            onClick={() =>
                              setSelectedTag(active ? 'all' : t.tag)
                            }
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                              active
                                ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                          >
                            #{t.tag} ({t.count})
                          </button>
                        );
                      })}
                    </div>

                    {effectiveTagFilter !== 'all' && tagScopedCards.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          onStartPractice(
                            activeDeck.id,
                            'learn',
                            'all',
                            effectiveTagFilter
                          )
                        }
                        className="text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400 whitespace-nowrap cursor-pointer"
                      >
                        Luyện {tagScopedCards.length} thẻ #{effectiveTagFilter} →
                      </button>
                    )}
                  </div>
                )}
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
                        {card.reviewCount > 0 && (
                          <span className="font-mono-tabular text-xs text-slate-400 dark:text-slate-500">
                            · {Math.round((card.correctCount / card.reviewCount) * 100)}% đúng
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {card.meaning}
                      </p>

                      {card.example && (
                        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                          “{card.example}”
                        </p>
                      )}

                      {card.tags && card.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {card.tags.map((tag) => {
                            const active =
                              effectiveTagFilter.toLowerCase() ===
                              tag.toLowerCase();
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() =>
                                  setSelectedTag(active ? 'all' : tag)
                                }
                                title={`Lọc theo chủ đề #${tag}`}
                                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                                  active
                                    ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/50 dark:text-sky-300'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-sky-400 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:text-sky-300'
                                }`}
                              >
                                #{tag}
                              </button>
                            );
                          })}
                        </div>
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

              <div>
                <label
                  htmlFor="card-tags-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Nhãn chủ đề (nhập rồi nhấn Enter hoặc dấu phẩy)
                </label>
                {cardTags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {cardTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
                      >
                        <span>#{tag}</span>
                        <button
                          type="button"
                          onClick={() => removeCardTag(tag)}
                          aria-label={`Xóa nhãn ${tag}`}
                          className="rounded hover:text-red-600 cursor-pointer"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="card-tags-input"
                    type="text"
                    value={cardTagInput}
                    onChange={(e) => setCardTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    placeholder="Ví dụ: công việc, du lịch..."
                    className="min-h-[40px] flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => commitCardTagInput()}
                    disabled={!cardTagInput.trim()}
                    className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Thêm nhãn
                  </button>
                </div>
                {allLibraryTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Gợi ý:
                    </span>
                    {allLibraryTags
                      .filter(
                        (t) =>
                          !cardTags.some(
                            (existing) =>
                              existing.toLowerCase() === t.toLowerCase()
                          )
                      )
                      .slice(0, 8)
                      .map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setCardTags((prev) => normalizeTags([...prev, t]))
                          }
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-sky-400 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                        >
                          +{t}
                        </button>
                      ))}
                  </div>
                )}
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

      {/* CSV / Excel & Text Bulk Import Modal */}
      {activeDeck && (
        <BulkImportModal
          open={bulkModalOpen}
          deckTitle={activeDeck.title}
          existingTags={allLibraryTags}
          onClose={() => setBulkModalOpen(false)}
          onImportCards={(items) => onBulkAddCards(activeDeck.id, items)}
        />
      )}

      {/* Publish to Community Modal (with editable Description) */}
      {publishModalData && activeDeck && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deck-publish-modal-title"
        >
          <div className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
            <div className="flex items-center justify-between">
              <h3
                id="deck-publish-modal-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                Đăng bộ thẻ lên Kho thẻ
              </h3>
              <button
                type="button"
                onClick={() => setPublishModalData(null)}
                aria-label="Đóng"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!publishModalData.title.trim()) return;
                setPublishingDeckId(activeDeck.id);
                setPublishFeedback(null);
                const result = await onPublishDeckToCommunity({
                  sourceDeckId: activeDeck.id,
                  title: publishModalData.title.trim(),
                  description: publishModalData.description.trim(),
                  category: publishModalData.category.trim() || 'Chung',
                  cards: activeCards.map((c) => ({
                    term: c.term,
                    phonetic: c.phonetic,
                    partOfSpeech: c.partOfSpeech,
                    meaning: c.meaning,
                    example: c.example,
                    ...(c.tags && c.tags.length > 0 ? { tags: c.tags } : {}),
                  })),
                });
                setPublishingDeckId(null);
                setPublishModalData(null);
                setPublishFeedback({
                  deckId: activeDeck.id,
                  ok: result.ok,
                  message: result.ok
                    ? 'Đã đăng bộ thẻ lên Kho thẻ cộng đồng!'
                    : result.error || 'Không thể đăng tải bộ thẻ.',
                });
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tên bộ thẻ ({activeCards.length} thẻ)
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.TITLE_MAX}
                  value={publishModalData.title}
                  onChange={(e) =>
                    setPublishModalData((prev) =>
                      prev ? { ...prev, title: e.target.value } : null
                    )
                  }
                  className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Chủ đề
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.CATEGORY_MAX}
                  value={publishModalData.category}
                  onChange={(e) =>
                    setPublishModalData((prev) =>
                      prev ? { ...prev, category: e.target.value } : null
                    )
                  }
                  className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Mô tả bộ thẻ
                </label>
                <textarea
                  rows={3}
                  maxLength={LIMITS.DESC_MAX}
                  value={publishModalData.description}
                  onChange={(e) =>
                    setPublishModalData((prev) =>
                      prev ? { ...prev, description: e.target.value } : null
                    )
                  }
                  placeholder="Giới thiệu nội dung, trình độ hoặc mẹo ghi nhớ bộ thẻ này cho cộng đồng..."
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPublishModalData(null)}
                  className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={publishingDeckId === activeDeck.id}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {publishingDeckId === activeDeck.id
                      ? 'Đang đăng...'
                      : 'Đăng lên Kho thẻ'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
