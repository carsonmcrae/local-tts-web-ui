// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Labelled form controls with consistent styling and accessible hints/errors.
 * Scope: `Field` (label + hint + error wiring via ids), `Input`, `Textarea`, `Select` (native, for
 *   reliable mobile behaviour), `Checkbox` and `Switch` (Radix).
 * Does NOT belong: Form state management.
 */
import { Check } from 'lucide-react';
import { Checkbox as RadixCheckbox, Switch as RadixSwitch } from 'radix-ui';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { forwardRef, useId } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-[var(--radius-md)] border border-line-strong bg-surface px-3 text-sm text-text shadow-soft placeholder:text-subtle ' +
  'transition-colors hover:border-subtle focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 disabled:opacity-60';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className }: Readonly<FieldProps>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-[13px] leading-snug text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(CONTROL, 'h-10', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(CONTROL, 'min-h-28 py-2.5 leading-relaxed', className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(CONTROL, 'h-10 cursor-pointer appearance-auto pr-8', className)}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  id?: string;
}

export function Checkbox({ checked, onCheckedChange, label, id }: Readonly<CheckboxProps>) {
  const fallback = useId();
  const controlId = id ?? fallback;
  return (
    <div className="flex items-start gap-3">
      <RadixCheckbox.Root
        id={controlId}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-line-strong bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent"
      >
        <RadixCheckbox.Indicator>
          <Check size={14} className="text-accent-fg" strokeWidth={3} />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <label htmlFor={controlId} className="cursor-pointer text-sm leading-relaxed">
        {label}
      </label>
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export function Switch({ checked, onCheckedChange, label, description }: Readonly<SwitchProps>) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description ? <p className="text-[13px] text-muted">{description}</p> : null}
      </div>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-11 shrink-0 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-accent"
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-soft transition-transform data-[state=checked]:translate-x-[22px]" />
      </RadixSwitch.Root>
    </div>
  );
}
