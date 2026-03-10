import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hayden Ranch Services',
  description: 'Metal Roofing Cut Lists, Material Pricing & Fencing Bid Tool',
  keywords: ['metal roofing', 'standing seam', 'fencing', 'ranch services', 'cut list'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Babylonica&family=Carattere&family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased bg-black text-steel-50">{children}</body>
    </html>
  );
}
