// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Root component: providers and routes.
 * Scope: QueryClient defaults, toast and player providers, the route table (lazy-loaded pages) and
 *   the not-found page. Applies the saved theme.
 * Does NOT belong: Page implementations.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Compass } from 'lucide-react';
import type { ReactNode } from 'react';
import { lazy, Suspense, useState } from 'react';
import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router';
import { ApiError } from '@/api/client';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState, StatusRegion } from '@/components/ui/Feedback';
import { Spinner } from '@/components/ui/Spinner';
import { ToastProvider } from '@/components/ui/Toast';
import { PlayerProvider } from '@/features/player/PlayerProvider';
import { useTheme } from '@/lib/theme';
import { AppShell } from './AppShell';

const LibraryPage = lazy(() => import('@/features/library/LibraryPage'));
const ReaderPage = lazy(() => import('@/features/reader/ReaderPage'));
const VoiceLibraryPage = lazy(() => import('@/features/voices/VoiceLibraryPage'));
const VoiceStudioPage = lazy(() => import('@/features/studio/VoiceStudioPage'));
const ExportsPage = lazy(() => import('@/features/exports/ExportsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

function Page({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense
      fallback={
        <StatusRegion
          label="Loading page"
          className="flex h-full items-center justify-center text-muted"
        >
          <Spinner size={24} />
        </StatusRegion>
      }
    >
      {children}
    </Suspense>
  );
}

function NotFound() {
  return (
    <EmptyState
      icon={<Compass size={26} />}
      title="This page doesn't exist"
      actions={
        <Link to="/library" className={buttonClasses('primary')}>
          Go to your library
        </Link>
      }
    >
      The link may be out of date, or the document was deleted.
    </EmptyState>
  );
}

function createRouter() {
  return createBrowserRouter([
    {
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate to="/library" replace /> },
        {
          path: 'library',
          element: (
            <Page>
              <LibraryPage />
            </Page>
          ),
        },
        {
          path: 'read/:documentId',
          element: (
            <Page>
              <ReaderPage />
            </Page>
          ),
        },
        {
          path: 'voices',
          element: (
            <Page>
              <VoiceLibraryPage />
            </Page>
          ),
        },
        {
          path: 'studio',
          element: (
            <Page>
              <VoiceStudioPage />
            </Page>
          ),
        },
        {
          path: 'exports',
          element: (
            <Page>
              <ExportsPage />
            </Page>
          ),
        },
        {
          path: 'settings',
          element: (
            <Page>
              <SettingsPage />
            </Page>
          ),
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ]);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) =>
          count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
        refetchOnWindowFocus: false,
      },
    },
  });
}

function Providers({ client, children }: Readonly<{ client: QueryClient; children: ReactNode }>) {
  useTheme();
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PlayerProvider>{children}</PlayerProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export function App() {
  const [client] = useState(createQueryClient);
  const [router] = useState(createRouter);
  return (
    <Providers client={client}>
      <RouterProvider router={router} />
    </Providers>
  );
}
