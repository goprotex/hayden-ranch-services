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
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
