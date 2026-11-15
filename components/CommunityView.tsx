'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Globe,
  Layers,
  Play,
  Plus,
  Search,
  Trash2,
  Trophy,
  UploadCloud,
  Volume2,
  X,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import {
  AuthUser,
  CommunityCardItem,
  CommunityDeck,
  Deck,
  Flashcard,
  LEADERBOARD_MODE_LABELS,
  LeaderboardEntry,
  PracticeMode,
} from '@/lib/types';

interface CommunityViewProps {
  user: AuthUser | null;
  neonConfigured: boolean;
  communityDecks: CommunityDeck[];
  myDecks: Deck[];
  myCardsByDeck: Record<string, Flashcard[]>;
  leaderboardEntries: LeaderboardEntry[];
  onPublishDeck: (input: {
    sourceDeckId?: string | null;
    title: string;
    description: string;
    category: string;
    cards: CommunityCardItem[];
  }) => Promise<{ ok: boolean; error?: string; deck?: CommunityDeck }>;
  onUnpublishDeck: (communityDeckId: string) => Promise<void>;
  onImportDeck: (deck: CommunityDeck) => Promise<string>;
  onStartPracticeDeck: (deckId: string, mode?: PracticeMode) => void;
  onOpenAuth: () => void;
}

export function CommunityView({
  user,
  neonConfigured,
  communityDecks,
  myDecks,
  myCardsByDeck,
  leaderboardEntries,
  onPublishDeck,
  onUnpublishDeck,
  onImportDeck,
  onStartPracticeDeck,
  onOpenAuth,
}: CommunityViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'downloads'>('recent');
  const [selectedId, setSelectedId] = useState<string>('');
  const [previewSubTab, setPreviewSubTab] = useState<'cards' | 'leaderboard'>(
    'cards'
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Publish modal state
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<'existing' | 'new'>('existing');
  const [sourceDeckId, setSourceDeckId] = useState<string>(myDecks[0]?.id || '');
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customCategory, setCustomCategory] = useState('Học thuật');
  const [customBulkText, setCustomBulkText] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const d of communityDecks) {
      if (d.category) set.add(d.category);
    }
    return ['all', ...Array.from(set)];
  }, [communityDecks]);

  const filteredDecks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = communityDecks.filter((d) => {
      if (categoryFilter !== 'all' && d.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.authorName.toLowerCase().includes(q) ||
        d.cards.some(
          (c) =>
            c.term.toLowerCase().includes(q) ||
            c.meaning.toLowerCase().includes(q)
        )
      );
    });
    return [...list].sort((a, b) =>
      sortBy === 'downloads'
        ? b.downloadsCount - a.downloadsCount || b.publishedAt - a.publishedAt
        : b.publishedAt - a.publishedAt
    );
  }, [communityDecks, searchQuery, categoryFilter, sortBy]);

  const activeCommunityDeck = useMemo(
    () =>
      filteredDecks.find((d) => d.id === selectedId) ||
      filteredDecks[0] ||
      null,
    [filteredDecks, selectedId]
  );

  const activeDeckLeaderboard = useMemo(() => {
    if (!activeCommunityDeck) return [];
    const matchedIds = new Set(
      [activeCommunityDeck.id, activeCommunityDeck.sourceDeckId].filter(
        Boolean
      ) as string[]
    );
    return leaderboardEntries
      .filter(
        (e) =>
          matchedIds.has(e.deckId) ||
          e.deckTitle.toLowerCase() === activeCommunityDeck.title.toLowerCase()
      )
      .slice(0, 15);
  }, [activeCommunityDeck, leaderboardEntries]);

  function openPublishModal() {
    setPublishError(null);
    setPublishMode(myDecks.length > 0 ? 'existing' : 'new');
    setSourceDeckId(myDecks[0]?.id || '');
    setPublishOpen(true);
  }

  async function handlePublishSubmit(e: FormEvent) {
    e.preventDefault();
    setPublishError(null);

    if (neonConfigured && !user) {
      setPublishOpen(false);
      onOpenAuth();
      return;
    }

    setPublishing(true);
    try {
      if (publishMode === 'existing') {
        const deck = myDecks.find((d) => d.id === sourceDeckId);
        if (!deck) {
          setPublishError('Vui lòng chọn một bộ thẻ hợp lệ.');
          return;
        }
        const deckCards = myCardsByDeck[deck.id] || [];
        if (deckCards.length === 0) {
          setPublishError('Bộ thẻ này chưa có thẻ từ vựng nào.');
          return;
        }
        const res = await onPublishDeck({
          sourceDeckId: deck.id,
          title: deck.title,
          description: deck.description,
          category: deck.category,
          cards: deckCards.map((c) => ({
            term: c.term,
            phonetic: c.phonetic,
            partOfSpeech: c.partOfSpeech,
            meaning: c.meaning,
            example: c.example,
          })),
        });
        if (!res.ok) {
          setPublishError(res.error || 'Không thể đăng tải bộ thẻ.');
          return;
        }
        if (res.deck) setSelectedId(res.deck.id);
        setNotice(`Đã đăng bộ thẻ “${deck.title}” lên Kho thẻ.`);
        setPublishOpen(false);
      } else {
        const lines = customBulkText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const parsed: CommunityCardItem[] = [];
        for (const line of lines) {
          const parts = line
            .split(/\t|::|—| - /)
            .map((p) => p.trim())
            .filter(Boolean);
          if (parts.length >= 2) {
            parsed.push({
              term: parts[0],
              meaning: parts[1],
              phonetic: parts[2] || '',
              partOfSpeech: '',
              example: '',
            });
          }
        }
        if (!customTitle.trim() || parsed.length === 0) {
          setPublishError(
            'Nhập tiêu đề và ít nhất 1 dòng từ vựng theo dạng: Từ tiếng Anh - Nghĩa tiếng Việt.'
          );
          return;
        }
        const res = await onPublishDeck({
          sourceDeckId: null,
          title: customTitle.trim(),
          description: customDesc.trim(),
          category: customCategory.trim() || 'Cộng đồng',
          cards: parsed,
        });
        if (!res.ok) {
          setPublishError(res.error || 'Không thể đăng tải bộ thẻ.');
          return;
        }
        if (res.deck) setSelectedId(res.deck.id);
        setCustomTitle('');
        setCustomDesc('');
        setCustomBulkText('');
        setNotice('Đã đăng tải bộ thẻ mới lên Kho thẻ.');
        setPublishOpen(false);
      }
    } finally {
      setPublishing(false);
    }
  }

  async function handleSaveToMyDecks(deck: CommunityDeck, startAfter = false) {
    setBusyId(deck.id);
    try {
      const createdDeckId = await onImportDeck(deck);
      if (startAfter) {
        onStartPracticeDeck(createdDeckId, 'flip');
      } else {
        setNotice(`Đã lưu “${deck.title}” vào tab Bộ thẻ của bạn.`);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400">
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span>KHO THẺ CỘNG ĐỒNG</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Khám phá & Chia sẻ Bộ thẻ
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Đăng tải bộ thẻ của bạn, xem trước từ vựng, lưu về học hoặc so điểm trên bảng xếp hạng.
          </p>
        </div>

        <button
          type="button"
          onClick={openPublishModal}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <UploadCloud className="h-4 w-4" aria-hidden="true" />
          <span>Đăng tải bộ thẻ</span>
        </button>
      </div>

      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Đóng thông báo"
            className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm bộ thẻ, tác giả hoặc từ vựng..."
            className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`min-h-[36px] rounded-lg border px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === cat
                    ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                }`}
              >
                {cat === 'all' ? 'Tất cả chủ đề' : cat}
              </button>
            ))}
          </div>

          <select
            aria-label="Sắp xếp kho thẻ"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'recent' | 'downloads')}
            className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-sky-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="recent">Mới đăng nhất</option>
            <option value="downloads">Nhiều lượt lưu</option>
          </select>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left List of Community Decks */}
        <div className="space-y-3 lg:col-span-5">
          {filteredDecks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Không tìm thấy bộ thẻ nào khớp bộ lọc. Hãy thử từ khóa khác hoặc đăng tải bộ thẻ đầu tiên!
            </div>
          ) : (
            filteredDecks.map((deck) => {
              const isSelected = activeCommunityDeck?.id === deck.id;
              return (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => setSelectedId(deck.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-sky-600 bg-sky-50/60 dark:border-sky-500 dark:bg-sky-950/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                        {deck.category}
                      </div>
                      <h2 className="mt-0.5 truncate font-display text-base font-bold text-slate-900 dark:text-slate-100">
                        {deck.title}
                      </h2>
                    </div>
                    <span className="font-mono-tabular text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                      {deck.cardCount} thẻ
                    </span>
                  </div>

                  {deck.description && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                      {deck.description}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Đăng bởi: {deck.authorName}</span>
                    <span className="font-mono-tabular">
                      {deck.downloadsCount} lượt lưu
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Detail Preview & Leaderboard */}
        <div className="lg:col-span-7">
          {activeCommunityDeck ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                    {activeCommunityDeck.category} · {activeCommunityDeck.authorName}
                  </div>
                  <h2 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
                    {activeCommunityDeck.title}
                  </h2>
                  {activeCommunityDeck.description && (
                    <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                      {activeCommunityDeck.description}
                    </p>
                  )}
                </div>

                {user &&
                  activeCommunityDeck.authorId === user.id && (
                    <button
                      type="button"
                      onClick={() => onUnpublishDeck(activeCommunityDeck.id)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Gỡ bài đăng</span>
                    </button>
                  )}
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={busyId === activeCommunityDeck.id}
                  onClick={() => handleSaveToMyDecks(activeCommunityDeck, true)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer sm:text-sm"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>Lưu & Luyện tập ngay</span>
                </button>

                <button
                  type="button"
                  disabled={busyId === activeCommunityDeck.id}
                  onClick={() => handleSaveToMyDecks(activeCommunityDeck, false)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer sm:text-sm"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Lưu về Bộ thẻ</span>
                </button>
              </div>

              {/* Preview Sub-Tabs: Cards vs Leaderboard */}
              <div className="mt-5 flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPreviewSubTab('cards')}
                  className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    previewSubTab === 'cards'
                      ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Danh sách thẻ ({activeCommunityDeck.cards.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSubTab('leaderboard')}
                  className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    previewSubTab === 'leaderboard'
                      ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Bảng xếp hạng ({activeDeckLeaderboard.length})</span>
                </button>
              </div>

              {previewSubTab === 'cards' ? (
                <div className="mt-4 max-h-[420px] divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
                  {activeCommunityDeck.cards.map((card, idx) => (
                    <div
                      key={`${card.term}_${idx}`}
                      className="flex items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                            {card.term}
                          </span>
                          {card.phonetic && (
                            <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                              {card.phonetic}
                            </span>
                          )}
                          {card.partOfSpeech && (
                            <span className="text-[11px] italic text-slate-400">
                              {card.partOfSpeech}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
                          {card.meaning}
                        </p>
                        {card.example && (
                          <p className="mt-0.5 text-xs italic text-slate-500 dark:text-slate-400">
                            “{card.example}”
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => speakEnglish(card.term)}
                        aria-label={`Phát âm ${card.term}`}
                        className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                      >
                        <Volume2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : activeDeckLeaderboard.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  Chưa có điểm xếp hạng nào cho bộ thẻ này. Hãy lưu về và chơi ngay để lập kỷ lục đầu tiên!
                </div>
              ) : (
                <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
                  {activeDeckLeaderboard.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-6 text-center font-mono-tabular text-xs font-bold ${
                            idx === 0
                              ? 'text-amber-500'
                              : idx === 1
                                ? 'text-slate-400'
                                : idx === 2
                                  ? 'text-amber-700 dark:text-amber-600'
                                  : 'text-slate-400'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                            {entry.playerName}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {LEADERBOARD_MODE_LABELS[entry.mode] || entry.mode} ·{' '}
                            {entry.accuracy}%
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono-tabular text-sm font-bold text-sky-600 dark:text-sky-400">
                        {entry.score} đ
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Publish Deck Modal */}
      {publishOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="publish-modal-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                Đăng tải bộ thẻ lên Kho thẻ
              </h2>
              <button
                type="button"
                onClick={() => setPublishOpen(false)}
                aria-label="Đóng"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {neonConfigured && !user && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                Bạn cần đăng nhập tài khoản để bộ thẻ được lưu công khai cho mọi người trên Neon.
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPublishMode('existing')}
                disabled={myDecks.length === 0}
                className={`flex-1 min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  publishMode === 'existing'
                    ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                    : 'border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400'
                }`}
              >
                Chọn từ Bộ thẻ của tôi
              </button>
              <button
                type="button"
                onClick={() => setPublishMode('new')}
                className={`flex-1 min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  publishMode === 'new'
                    ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                    : 'border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400'
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Tạo nhanh & Đăng
                </span>
              </button>
            </div>

            <form onSubmit={handlePublishSubmit} className="mt-4 space-y-3">
              {publishMode === 'existing' ? (
                <div>
                  <label
                    htmlFor="publish-source-deck"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Chọn bộ thẻ muốn chia sẻ
                  </label>
                  <select
                    id="publish-source-deck"
                    value={sourceDeckId}
                    onChange={(e) => setSourceDeckId(e.target.value)}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {myDecks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title} ({(myCardsByDeck[d.id] || []).length} thẻ)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Tiêu đề bộ thẻ
                    </label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Ví dụ: 15 từ vựng Công nghệ AI"
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Chủ đề
                      </label>
                      <input
                        type="text"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Mô tả ngắn
                      </label>
                      <input
                        type="text"
                        value={customDesc}
                        onChange={(e) => setCustomDesc(e.target.value)}
                        className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Danh sách thẻ (mỗi dòng: Từ - Nghĩa)
                    </label>
                    <textarea
                      rows={5}
                      value={customBulkText}
                      onChange={(e) => setCustomBulkText(e.target.value)}
                      placeholder={'Generate - tạo ra\nNegotiate - thương lượng\nPerspective - góc nhìn'}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-mono-tabular text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                </>
              )}

              {publishError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {publishError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPublishOpen(false)}
                  className="min-h-[40px] rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={publishing}
                  className="min-h-[40px] rounded-xl bg-sky-600 px-4 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60 cursor-pointer"
                >
                  {publishing
                    ? 'Đang đăng tải...'
                    : neonConfigured && !user
                      ? 'Đăng nhập để đăng tải'
                      : 'Đăng lên Kho thẻ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
