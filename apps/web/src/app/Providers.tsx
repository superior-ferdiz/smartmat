import { useState, type ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast/Toast';
import { createQueryClient } from './queryClient';

/** App-wide providers. Kept separate from main.tsx so tests can render pages with the same setup. */
export function Providers({
  children,
  queryClient: given,
}: {
  children: ReactNode;
  /** Tests pass their own client (with a session already in it). */
  queryClient?: QueryClient | undefined;
}) {
  const [queryClient] = useState(() => given ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
