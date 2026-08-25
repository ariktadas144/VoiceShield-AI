import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';
import AppShell from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'VoiceShield AI — Real-Time Voice Cloning & Impersonation Prevention',
  description: 'Enterprise active defense against AI voice deepfakes and real-time social engineering.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
