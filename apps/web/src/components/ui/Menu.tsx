/**
 * Purpose: Popovers and option menus anchored to a trigger (speed menu, voice picker, actions).
 * Scope: Radix Popover with consistent surface styling, and a single-choice option list built from
 *   native radio inputs (arrow-key selection, visible focus ring, checked indicator).
 * Does NOT belong: Option data or selection logic.
 */
import { Check } from 'lucide-react';
import { Popover as RadixPopover } from 'radix-ui';
import type { ReactNode } from 'react';
import { useId } from 'react';
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

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'center',
  side = 'top',
  className,
  label,
}: Readonly<PopoverProps>) {
  return (
    <RadixPopover.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
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

/** A single-choice list built from native radio buttons (arrow keys move and select). */
export function OptionList<T extends string | number>({
  options,
  value,
  onSelect,
  label,
}: Readonly<OptionListProps<T>>) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={String(option.value)}
            className={cn(
              'flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-left text-sm hover:bg-surface-2',
              'has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent',
              selected && 'font-medium text-accent-text',
            )}
          >
            <input
              type="radio"
              name={name}
              value={String(option.value)}
              checked={selected}
              onChange={() => onSelect(option.value)}
              className="sr-only"
            />
            <span className="flex w-4 justify-center" aria-hidden="true">
              {selected ? <Check size={15} /> : null}
            </span>
            <span className="flex-1">{option.label}</span>
            {/* The space keeps label and hint apart in the radio's accessible name. */}
            {option.hint ? (
              <>
                {' '}
                <span className="text-xs text-subtle">{option.hint}</span>
              </>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}
