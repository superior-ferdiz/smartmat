import { createContext, useContext } from 'react';
import type { AlertVariant } from '../Alert/Alert';

export interface ToastOptions {
  message: string;
  variant?: AlertVariant;
}

export type ShowToast = (options: ToastOptions) => void;

export const ToastContext = createContext<{ show: ShowToast } | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
