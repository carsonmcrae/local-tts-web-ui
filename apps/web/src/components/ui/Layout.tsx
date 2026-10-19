/**
 * Purpose: Page-level layout primitives shared by every screen.
 * Scope: `PageHeader` (title, description, actions; sets document.title), `Section` (titled card
 *   group used in Settings and Studio) and `Panel` (bordered surface).
 * Does NOT belong: Navigation chrome (AppShell).
 */
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { cn } from '@/lib/cn';

export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Local TTS` : 'Local TTS';
  }, [title]);
}

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}

export function PageHeader({ title, description, actions, eyebrow }: Readonly<PageHeaderProps>) {
  usePageTitle(title);
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[13px] font-medium text-muted">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

function Panel({
  children,
  className,
  as: Tag = 'div',
}: Readonly<{
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}>) {
  return (
    <Tag
      className={cn(
        'rounded-[var(--radius-lg)] border border-line bg-surface shadow-soft',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

interface SectionProps {
  id?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}

export function Section({ id, title, description, children, actions }: Readonly<SectionProps>) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-6">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2
            id={id ? `${id}-title` : undefined}
            className="text-base font-semibold tracking-tight"
          >
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
      <Panel className="p-4 sm:p-5">{children}</Panel>
    </section>
  );
}
