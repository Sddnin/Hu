'use client';

import { useState } from 'react';
import { Download, RefreshCw, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '@/hooks/use-pwa-install';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Cài đặt offline</span>
        <span className="sm:hidden">Cài app</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-950 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Cài trên iOS</span>
          <span className="sm:hidden">Cài app</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-guide-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          >
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <h3
                  id="ios-pwa-guide-title"
                  className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
                >
                  Cài LexiCard lên iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Đóng hướng dẫn"
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <ol className="mt-3 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="font-mono-tabular font-semibold text-sky-600 dark:text-sky-400">
                    1.
                  </span>
                  <span>
                    Nhấn nút{' '}
                    <strong className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-100">
                      Chia sẻ <Share className="h-3.5 w-3.5" aria-hidden="true" />
                    </strong>{' '}
                    trên thanh công cụ Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono-tabular font-semibold text-sky-600 dark:text-sky-400">
                    2.
                  </span>
                  <span>
                    Cuộn xuống và chọn{' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      Thêm vào MH chính (Add to Home Screen)
                    </strong>
                    .
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono-tabular font-semibold text-sky-600 dark:text-sky-400">
                    3.
                  </span>
                  <span>
                    Mở LexiCard từ màn hình chính để học từ vựng cả khi không có
                    mạng.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 min-h-[44px] w-full rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator({
  pendingSyncCount = 0,
}: {
  pendingSyncCount?: number;
}) {
  const isOnline = useOnlineStatus();

  if (isOnline && pendingSyncCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-20 left-4 z-40 flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-lg md:bottom-4 ${
        !isOnline
          ? 'border border-amber-500/30 bg-amber-600 text-white dark:bg-amber-500 dark:text-slate-950'
          : 'border border-sky-500/30 bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950'
      }`}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Chế độ ngoại tuyến — Đang dùng dữ liệu trên máy
            {pendingSyncCount > 0
              ? ` · ${pendingSyncCount} thay đổi chờ đồng bộ`
              : ''}
          </span>
        </>
      ) : (
        <>
          <RefreshCw
            className="h-3.5 w-3.5 shrink-0 animate-spin"
            aria-hidden="true"
          />
          <span>
            Đang đồng bộ {pendingSyncCount} thay đổi lên tài khoản...
          </span>
        </>
      )}
    </div>
  );
}
