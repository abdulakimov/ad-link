import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Onest } from 'next/font/google';
import { GeistMono } from 'geist/font/mono';

const onest = Onest({ subsets: ['latin'], variable: '--font-onest' });
import { I18nProvider } from '@/components/i18n-provider';
import { QueryProvider } from '@/components/query-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'AdLink — ad spend meets real revenue',
  description: 'Join Meta Ads to your CRM and see which creative actually makes money.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${onest.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-dvh font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            <QueryProvider>{children}</QueryProvider>
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
