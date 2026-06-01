import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { displayFont, labelFont } from '@/fonts';
import { COLORS } from '@/theme';

export const metadata: Metadata = {
  title: 'golazo',
  description: 'Local browse-and-play UI for golazo highlight episodes',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${labelFont.variable}`}>
      <body
        style={{
          background: COLORS.background,
          color: COLORS.foreground,
          margin: 0,
          fontFamily: 'var(--font-label)',
        }}
      >
        {children}
      </body>
    </html>
  );
}
