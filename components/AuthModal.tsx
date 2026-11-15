'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AuthActionResult } from '@/hooks/use-flashcard-store';
import { LIMITS } from '@/lib/types';

interface AuthModalProps {
  open: boolean;
  neonConfigured: boolean;
  onClose: () => void;
  onLogin: (input: {
    username: string;
    password: string;
  }) => Promise<AuthActionResult>;
  onRegister: (input: {
    username: string;
    password: string;
    displayName?: string;
    importGuestData?: boolean;
  }) => Promise<AuthActionResult>;
}

export function AuthModal({
  open,
  neonConfigured,
  onClose,
  onLogin,
  onRegister,
}: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [importGuestData, setImportGuestData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchTab(next: 'login' | 'register') {
    setTab(next);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanedUsername = username.trim();
    if (
      cleanedUsername.length < LIMITS.USERNAME_MIN ||
      cleanedUsername.length > LIMITS.USERNAME_MAX
    ) {
      setError(
        `Tên đăng nhập phải từ ${LIMITS.USERNAME_MIN} đến ${LIMITS.USERNAME_MAX} ký tự.`
      );
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanedUsername)) {
      setError(
        'Tên đăng nhập chỉ gồm chữ cái không dấu, số, dấu gạch dưới (_), chấm (.) hoặc gạch ngang (-).'
      );
      return;
    }

    if (password.length < LIMITS.PASSWORD_MIN) {
      setError(`Mật khẩu phải có ít nhất ${LIMITS.PASSWORD_MIN} ký tự.`);
      return;
    }

    if (tab === 'register' && password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setSubmitting(true);
    try {
      const res =
        tab === 'login'
          ? await onLogin({ username: cleanedUsername, password })
          : await onRegister({
              username: cleanedUsername,
              password,
              displayName: displayName.trim() || undefined,
              importGuestData,
            });

      if (!res.ok) {
        setError(res.error || 'Có lỗi xảy ra. Vui lòng thử lại.');
        return;
      }

      setPassword('');
      setConfirmPassword('');
      onClose();
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
            aria-labelledby="auth-modal-title"
            className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="auth-modal-title"
                  className="font-display text-xl font-bold text-slate-900 dark:text-slate-100"
                >
                  {tab === 'login' ? 'Đăng nhập tài khoản' : 'Tạo tài khoản mới'}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Lưu bộ thẻ từ vựng và lịch sử luyện tập riêng theo tài khoản của bạn.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng hộp thoại đăng nhập"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-4 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => switchTab('login')}
                className={`min-h-[40px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  tab === 'login'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => switchTab('register')}
                className={`min-h-[40px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  tab === 'register'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Đăng ký
              </button>
            </div>

            {!neonConfigured && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Máy chủ chưa có biến môi trường <code className="font-mono">DATABASE_URL</code> hoặc{' '}
                  <code className="font-mono">POSTGRES_URL</code> của Vercel Neon. Bạn vẫn có thể học ở chế độ khách trên máy này.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
              <div>
                <label
                  htmlFor="auth-username"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Tên đăng nhập
                </label>
                <div className="relative mt-1.5">
                  <User
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="vd: minh_anh_2025"
                    maxLength={LIMITS.USERNAME_MAX}
                    required
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              {tab === 'register' && (
                <div>
                  <label
                    htmlFor="auth-display-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Tên hiển thị (tuỳ chọn)
                  </label>
                  <input
                    id="auth-display-name"
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="vd: Minh Anh"
                    maxLength={LIMITS.DISPLAY_NAME_MAX}
                    className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Mật khẩu
                </label>
                <div className="relative mt-1.5">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={
                      tab === 'login' ? 'current-password' : 'new-password'
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ít nhất 6 ký tự"
                    maxLength={LIMITS.PASSWORD_MAX}
                    required
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-9 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    className="absolute right-1 top-1/2 inline-flex min-h-[38px] min-w-[38px] -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {tab === 'register' && (
                <>
                  <div>
                    <label
                      htmlFor="auth-confirm-password"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Xác nhận mật khẩu
                    </label>
                    <input
                      id="auth-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu"
                      maxLength={LIMITS.PASSWORD_MAX}
                      required
                      className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>

                  <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={importGuestData}
                      onChange={(e) => setImportGuestData(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600 dark:border-slate-700"
                    />
                    <span>
                      Mang theo toàn bộ bộ thẻ và lịch sử hiện tại trên máy vào tài khoản mới
                    </span>
                  </label>
                </>
              )}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{error}</span>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  {tab === 'login' ? (
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>
                    {submitting
                      ? 'Đang xử lý...'
                      : tab === 'login'
                        ? 'Đăng nhập'
                        : 'Tạo tài khoản & Lưu dữ liệu'}
                  </span>
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
