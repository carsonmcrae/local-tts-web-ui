/**
 * Purpose: Popovers and option menus anchored to a trigger (speed menu, voice picker, actions).
 * Scope: Radix Popover with consistent surface styling, and a simple radio-style option list with
 *   keyboard focus and a checked indicator.
 * Does NOT belong: Option data or selection logic.
 */
import { Check } from 'lucide-react';
import { Popover as RadixPopover } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  className?: string;
  label: string;
}

export function Popover({ trigger, children, open, onOpenChange, align = 'center', side = 'top', className, label }: Readonly<PopoverProps>) {
  return (
    <RadixPopover.Root {...(open === undefined ? {} : { open })} {...(onOpenChange ? { onOpenChange } : {})}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          aria-label={label}
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-50 rounded-[var(--radius-lg)] border border-line bg-surface p-1.5 shadow-overlay outline-none',
            className,
          )}
          style={{ animation: 'ltts-fade-in 120ms ease-out' }}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

interface OptionListProps<T extends string | number> {
  options: readonly { value: T; label: ReactNode; hint?: ReactNode }[];
  value: T;
  onSelect: (value: T) => void;
  label: string;
}

export function OptionList<T extends string | number>({ options, value, onSelect, label }: Readonly<OptionListProps<T>>) {
  return (
    <div role="listbox" aria-label={label} className="flex flex-col">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(option.value)}
            className={cn(
              'flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-left text-sm hover:bg-surface-2',
              selected && 'font-medium text-accent-text',
            )}
          >
            <span className="flex w-4 justify-center">{selected ? <Check size={15} /> : null}</span>
            <span className="flex-1">{option.label}</span>
            {option.hint ? <span className="text-xs text-subtle">{option.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
