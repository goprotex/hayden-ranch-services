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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased bg-surface-400 text-steel-100">{children}</body>
    </html>
  );
}
