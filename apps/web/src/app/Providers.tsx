import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast/Toast';
import { createQueryClient } from './queryClient';

/** App-wide providers. Kept separate from main.tsx so tests can render pages with the same setup. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
