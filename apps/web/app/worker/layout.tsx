'use client';

import React, { Suspense } from 'react';
import { WorkerProvider } from '@/components/worker/WorkerContext';
import { WorkerNav } from '@/components/worker/WorkerNav';

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-app)',
            color: 'var(--text-muted)',
            fontSize: '0.875rem',
          }}
        >
          Loading Worker Portal...
        </div>
      }
    >
      <WorkerProvider>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg-app)',
          }}
        >
          <WorkerNav />
          <main
            style={{
              flex: 1,
              maxWidth: '1280px',
              width: '100%',
              margin: '0 auto',
              padding: '24px 20px 48px',
            }}
          >
            {children}
          </main>
        </div>
      </WorkerProvider>
    </Suspense>
  );
}
