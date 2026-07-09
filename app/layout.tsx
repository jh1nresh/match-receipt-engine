import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Match Receipt Settlement Engine',
  description:
    'Proof-gated settlement demo: TxLINE World Cup events become verifiable receipts that deterministically resolve simulated escrowed prediction markets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-mono antialiased">{children}</body>
    </html>
  );
}
