/**
 * Purpose: The frame shared by the voice-creation wizards: progress header and footer buttons.
 * Scope: `Stepper` (one bar per step, the current step's label) and `WizardFooter` (Back, then
 *   Continue, the step's action such as "Create voice", or Done on the last step).
 * Does NOT belong: Step content or wizard state.
 */
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export function Stepper({ steps, step }: Readonly<{ steps: readonly string[]; step: number }>) {
  return (
    <ol
      className="mb-6 grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      aria-label="Progress"
    >
      {steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === step ? 'step' : undefined}
          className="flex flex-col gap-1.5"
        >
          <span className={cn('h-1 rounded-full', index <= step ? 'bg-accent' : 'bg-surface-3')} />
          <span
            className={cn(
              'hidden text-xs sm:block',
              index === step ? 'font-medium text-text' : 'text-subtle',
            )}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export interface WizardAction {
  label: string;
  icon: ReactNode;
  run: () => void;
}

/** Back, then Continue — or this step's action when it has one — or Done on the last step. */
export function WizardFooter({
  step,
  last,
  action,
  canContinue,
  pending,
  onBack,
  onNext,
  onDone,
}: Readonly<{
  step: number;
  last: number;
  action: WizardAction | undefined;
  canContinue: boolean | undefined;
  pending: boolean;
  onBack: () => void;
  onNext: () => void;
  onDone: () => void;
}>) {
  if (step === last) {
    return (
      <Button variant="primary" onClick={onDone}>
        Done
      </Button>
    );
  }
  return (
    <>
      {step > 0 ? (
        <Button icon={<ArrowLeft size={15} />} onClick={onBack} disabled={pending}>
          Back
        </Button>
      ) : null}
      <Button
        variant="primary"
        icon={action?.icon}
        onClick={action ? action.run : onNext}
        disabled={!canContinue}
        loading={pending}
      >
        {action ? action.label : 'Continue'}
        {action ? null : <ArrowRight size={15} />}
      </Button>
    </>
  );
}
