import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const ibmMono = IBM_Plex_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#0284c7',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'LexiCard — Flashcard & Luyện tập Từ vựng',
  description:
    'Website học từ vựng Flashcard với giao diện sáng/tối, luyện tập đa dạng (lật thẻ, trắc nghiệm, điền từ, nối thẻ) và lưu lịch sử theo dõi tiến độ.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LexiCard',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'LexiCard — Flashcard & Luyện tập Từ vựng',
    description:
      'Website học từ vựng Flashcard với giao diện sáng/tối, luyện tập đa dạng và lưu lịch sử theo dõi tiến độ.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LexiCard — Flashcard & Luyện tập Từ vựng',
    description:
      'Website học từ vựng Flashcard với giao diện sáng/tối, luyện tập đa dạng và lưu lịch sử theo dõi tiến độ.',
  },
};

const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('lexicard_theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      className={`${bricolage.variable} ${jakarta.variable} ${ibmMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-sky-100 selection:text-sky-900 dark:bg-slate-950 dark:text-slate-100 dark:selection:bg-sky-900/50 dark:selection:text-sky-100 transition-colors duration-150"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
