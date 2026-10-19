/**
 * Purpose: Application chrome shared by every route.
 * Scope: Skip link, desktop sidebar (with privacy note and engine status), phone tab bar, the routed
 *   page area, and the docked player that persists across navigation.
 * Does NOT belong: Page content or player logic.
 */
import { AudioLines, BookOpen, Mic, Settings, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useEngines } from '@/api/queries';
import { cn } from '@/lib/cn';
import { PlayerBar } from '@/features/player/PlayerBar';

const NAV: readonly { to: string; label: string; icon: ReactNode }[] = [
  { to: '/library', label: 'Library', icon: <BookOpen size={19} /> },
  { to: '/voices', label: 'Voices', icon: <AudioLines size={19} /> },
  { to: '/studio', label: 'Voice Studio', icon: <Mic size={19} /> },
  { to: '/settings', label: 'Settings', icon: <Settings size={19} /> },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="/favicon.svg" alt="" className="size-8" />
      <div className="leading-tight">
        <p className="text-[15px] font-semibold tracking-tight">Local TTS</p>
        <p className="text-xs text-muted">Reader &amp; voice studio</p>
      </div>
    </div>
  );
}

function EngineStatus() {
  const engines = useEngines();
  const kokoro = engines.data?.find((engine) => engine.id === 'kokoro');
  const ready = kokoro?.status === 'ready';
  const label = engines.isError ? 'Server offline' : ready ? 'Voices ready' : kokoro?.status === 'installing' ? 'Installing voices…' : 'Voices not installed';
  return (
    <NavLink to="/settings#engines" className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-xs text-muted hover:bg-surface-2">
      <span className={cn('size-2 rounded-full', ready ? 'bg-success' : engines.isError ? 'bg-danger' : 'bg-warning')} aria-hidden="true" />
      {label}
    </NavLink>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-10 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-medium transition-colors',
    isActive ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-text',
  );

export function AppShell() {
  return (
    <div className="flex h-dvh overflow-hidden">
      <a href="#main" className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-line bg-surface px-3 py-5 md:flex">
        <Brand />
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-text">
              <ShieldCheck size={14} className="text-success" /> Private by design
            </p>
            Documents, voices and audio never leave this computer.
          </div>
          <EngineStatus />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main" tabIndex={-1} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto focus:outline-none">
          <Outlet />
        </main>
        <PlayerBar />
        <nav aria-label="Main" className="grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-accent-text' : 'text-muted')
              }
            >
              {item.icon}
              {item.label.replace('Voice Studio', 'Studio')}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
