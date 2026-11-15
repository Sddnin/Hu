'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  Eye,
  EyeOff,
  FileUp,
  KeyRound,
  User as UserIcon,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AuthActionResult } from '@/hooks/use-flashcard-store';
import { AuthUser, Deck, Flashcard, LIMITS } from '@/lib/types';

export type AccountTab = 'profile' | 'password' | 'backup';

interface AccountModalProps {
  open: boolean;
  initialTab?: AccountTab;
  user: AuthUser;
  decks: Deck[];
  cardsByDeck: Record<string, Flashcard[]>;
  onClose: () => void;
  onUpdateProfile: (input: {
    displayName?: string;
    dailyGoal?: number;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<AuthActionResult>;
  onImportBackup: (
    imported: Array<{
      title: string;
      description?: string;
      category?: string;
      cards: Array<{
        term: string;
        meaning: string;
        phonetic?: string;
        partOfSpeech?: string;
        example?: string;
      }>;
    }>
  ) => Promise<number>;
}

export function AccountModal({
  open,
  initialTab = 'profile',
  user,
  decks,
  cardsByDeck,
  onClose,
  onUpdateProfile,
  onImportBackup,
}: AccountModalProps) {
  const [tab, setTab] = useState<AccountTab>(initialTab);

  // Profile fields
  const [displayName, setDisplayName] = useState(user.displayName);
  const [dailyGoal, setDailyGoal] = useState(String(user.dailyGoal));

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  // Feedback
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function switchTab(next: AccountTab) {
    setTab(next);
    setError(null);
    setSuccessMsg(null);
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('Tên hiển thị không được để trống.');
      return;
    }

    const parsedGoal = Number(dailyGoal);
    const safeGoal = Number.isFinite(parsedGoal)
      ? Math.min(
          LIMITS.DAILY_GOAL_MAX,
          Math.max(LIMITS.DAILY_GOAL_MIN, Math.round(parsedGoal))
        )
      : user.dailyGoal;

    setSubmitting(true);
    try {
      const res = await onUpdateProfile({
        displayName: trimmedName,
        dailyGoal: safeGoal,
      });
      if (!res.ok) {
        setError(res.error || 'Không thể lưu hồ sơ.');
      } else {
        setDailyGoal(String(safeGoal));
        setSuccessMsg('Đã cập nhật thông tin tài khoản.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPassword.length < LIMITS.PASSWORD_MIN) {
      setError(`Mật khẩu mới phải từ ${LIMITS.PASSWORD_MIN} ký tự trở lên.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu mới xác nhận không khớp.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await onUpdateProfile({
        currentPassword,
        newPassword,
      });
      if (!res.ok) {
        setError(res.error || 'Không thể đổi mật khẩu.');
      } else {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setSuccessMsg('Đã đổi mật khẩu thành công.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleExportJson() {
    setError(null);
    setSuccessMsg(null);
    const payload = {
      exportedAt: new Date().toISOString(),
      account: user.username,
      decks: decks.map((d) => ({
        title: d.title,
        description: d.description,
        category: d.category,
        cards: (cardsByDeck[d.id] || []).map((c) => ({
          term: c.term,
          phonetic: c.phonetic,
          partOfSpeech: c.partOfSpeech,
          meaning: c.meaning,
          example: c.example,
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lexicard_${user.username}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSuccessMsg('Đã tải xuống tệp sao lưu JSON.');
  }

  async function handleImportJson(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const deckList = Array.isArray(parsed?.decks) ? parsed.decks : [];
      if (deckList.length === 0) {
        setError('Tệp sao lưu không chứa danh sách bộ thẻ hợp lệ.');
        return;
      }
      const count = await onImportBackup(deckList);
      setSuccessMsg(`Đã khôi phục thành công ${count} bộ thẻ vào tài khoản.`);
    } catch {
      setError('Không thể đọc tệp JSON. Vui lòng kiểm tra lại định dạng.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-modal-title"
            className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="account-modal-title"
                  className="font-display text-xl font-bold text-slate-900 dark:text-slate-100"
                >
                  Cài đặt tài khoản
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  @{user.username} · Dữ liệu đồng bộ riêng theo tài khoản
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => switchTab('profile')}
                className={`min-h-[38px] rounded-md px-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  tab === 'profile'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Hồ sơ
              </button>
              <button
                type="button"
                onClick={() => switchTab('password')}
                className={`min-h-[38px] rounded-md px-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  tab === 'password'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Mật khẩu
              </button>
              <button
                type="button"
                onClick={() => switchTab('backup')}
                className={`min-h-[38px] rounded-md px-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  tab === 'backup'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Sao lưu
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{successMsg}</span>
              </div>
            )}

            {tab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="acc-display-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Tên hiển thị
                  </label>
                  <div className="relative mt-1.5">
                    <UserIcon
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="acc-display-name"
                      type="text"
                      required
                      maxLength={LIMITS.DISPLAY_NAME_MAX}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="acc-daily-goal"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Mục tiêu ôn tập mỗi ngày (lượt từ vựng)
                  </label>
                  <input
                    id="acc-daily-goal"
                    type="number"
                    min={LIMITS.DAILY_GOAL_MIN}
                    max={LIMITS.DAILY_GOAL_MAX}
                    value={dailyGoal}
                    onChange={(e) => setDailyGoal(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono-tabular text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Từ {LIMITS.DAILY_GOAL_MIN} đến {LIMITS.DAILY_GOAL_MAX} lượt mỗi ngày.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>{submitting ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                </button>
              </form>
            )}

            {tab === 'password' && (
              <form onSubmit={handleChangePassword} className="mt-4 space-y-3.5">
                <div>
                  <label
                    htmlFor="acc-cur-pass"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Mật khẩu hiện tại
                  </label>
                  <div className="relative mt-1.5">
                    <KeyRound
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="acc-cur-pass"
                      type={showPasswords ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-9 pr-11 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords((v) => !v)}
                      aria-label={showPasswords ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="absolute right-1 top-1/2 inline-flex min-h-[38px] min-w-[38px] -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 cursor-pointer"
                    >
                      {showPasswords ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="acc-new-pass"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Mật khẩu mới
                  </label>
                  <input
                    id="acc-new-pass"
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={`Tối thiểu ${LIMITS.PASSWORD_MIN} ký tự`}
                    required
                    className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="acc-confirm-pass"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Xác nhận mật khẩu mới
                  </label>
                  <input
                    id="acc-confirm-pass"
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>{submitting ? 'Đang cập nhật...' : 'Đổi mật khẩu'}</span>
                </button>
              </form>
            )}

            {tab === 'backup' && (
              <div className="mt-4 space-y-4">
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Tải về toàn bộ {decks.length} bộ thẻ của bạn dưới dạng JSON hoặc nhập lại từ tệp sao lưu đã lưu trước đó.
                </p>

                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Tải xuống bản sao lưu (.json)</span>
                </button>

                <label className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {submitting ? 'Đang nhập...' : 'Khôi phục từ tệp JSON'}
                  </span>
                  <input
                    type="file"
                    accept="application/json,.json"
                    disabled={submitting}
                    onChange={handleImportJson}
                    className="sr-only"
                  />
                </label>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
