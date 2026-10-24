import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClinicProvider } from '@/components/ClinicProvider';
import { Shell } from '@/components/Shell';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'AI Front Desk',
  description: 'What the AI front desk handled for your clinic today.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClinicProvider>
          <Shell>{children}</Shell>
        </ClinicProvider>
      </body>
    </html>
  );
}
