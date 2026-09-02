import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'JobPulse 2.0 — Production Job Discovery & Aggregation Engine',
  description:
    'Discover fresh, verified tech jobs normalized directly from Greenhouse, Lever, Ashby, and Workday employer ATS platforms.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
