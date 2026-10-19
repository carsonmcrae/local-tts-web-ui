/**
 * Purpose: Lightweight toast notifications for completed or failed background actions.
 * Scope: A provider with an `aria-live` region, auto-dismiss (8 s success/info, persistent errors
 *   until dismissed) and a `useToast()` hook. No third-party dependency.
 * Does NOT belong: Inline validation or page-level errors (use Banner).
 */
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { IconButton } from './Button';

type ToastTone = 'success' | 'info' | 'error';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string | undefined;
}

interface ToastApi {
  notify: (tone: ToastTone, title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const AUTO_DISMISS_MS = 8000;

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={18} className="text-success" />,
  info: <Info size={18} className="text-accent-text" />,
  error: <XCircle size={18} className="text-danger" />,
};

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setItems((current) => current.filter((item) => item.id !== id)),
    [],
  );

  const notify = useCallback<ToastApi['notify']>(
    (tone, title, description) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { id, tone, title, description }]);
      if (tone !== 'error') window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:top-auto sm:right-4 sm:bottom-28 sm:left-auto sm:items-end"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-3.5 shadow-raised"
            style={{ animation: 'ltts-fade-in 160ms ease-out' }}
          >
            <span className="mt-0.5">{ICONS[item.tone]}</span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{item.title}</p>
              {item.description ? <p className="mt-0.5 text-muted">{item.description}</p> : null}
            </div>
            <IconButton
              label="Dismiss notification"
              icon={<X size={16} />}
              size="sm"
              onClick={() => dismiss(item.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
