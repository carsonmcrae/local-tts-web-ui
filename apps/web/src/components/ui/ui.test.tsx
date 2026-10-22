// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Behavioural tests for the shared UI primitives.
 * Scope: Button busy/active states, dialogs and confirmations, banners and other status feedback,
 *   form fields with hints and errors, page layout, the radio option list, popovers, sliders and
 *   toast notifications (auto-dismiss, dismissal, misuse outside the provider).
 * Does NOT belong: Feature screens (src/test/*, src/features/**).
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from './Button';
import { closeOnly, ConfirmDialog, Dialog } from './Dialog';
import { Badge, Banner, EmptyState, ProgressBar, StatusRegion } from './Feedback';
import { Checkbox, Field, Input, Switch } from './Field';
import { PageHeader, Section, usePageTitle } from './Layout';
import { OptionList, Popover } from './Menu';
import { Slider } from './Slider';
import { ToastProvider, useToast } from './Toast';

afterEach(() => vi.useRealTimers());

describe('Button', () => {
  it('is disabled and announced busy while loading', () => {
    render(
      <Button size="sm" loading>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('labels icon buttons and can show them as active', () => {
    render(<IconButton label="Bold" icon={<b>B</b>} active />);
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveClass('text-accent-text');
  });
});

describe('Dialog', () => {
  it('a dialog without a trigger can only be closed through onOpenChange', () => {
    const close = vi.fn();
    const onOpenChange = closeOnly(close);
    onOpenChange(true);
    expect(close).not.toHaveBeenCalled();
    onOpenChange(false);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('uses the title as the description when none is given, and shows the footer', () => {
    render(
      <Dialog open onOpenChange={() => undefined} title="Rename" footer={<button>Save</button>}>
        Body
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Rename' })).toHaveAccessibleDescription('Rename');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('confirms or cancels a non-destructive action', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Start over?"
        description="Your draft is kept."
        confirmLabel="Start over"
        onConfirm={onConfirm}
        destructive={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    expect(onConfirm).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Feedback', () => {
  it('announces non-error banners politely and errors as alerts', () => {
    render(
      <>
        <Banner>Saved on this computer.</Banner>
        <Banner tone="error" title="Upload failed" action={<button>Retry</button>} />
      </>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saved on this computer.');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('names loading regions and renders minimal empty states and badges', () => {
    render(
      <>
        <StatusRegion label="Loading voices">…</StatusRegion>
        <EmptyState icon={<span />} title="Nothing here" />
        <Badge tone="danger">Broken</Badge>
      </>,
    );
    expect(screen.getByRole('status', { name: 'Loading voices' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.getByText('Broken')).toBeInTheDocument();
  });

  it('clamps progress to 0–100 %', () => {
    render(
      <>
        <ProgressBar value={1.7} label="Over" />
        <ProgressBar value={-0.2} label="Under" />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: 'Over' })).toHaveAttribute('value', '100');
    expect(screen.getByRole('progressbar', { name: 'Under' })).toHaveAttribute('value', '0');
  });
});

describe('Field', () => {
  it('links the hint and the error to the control', () => {
    render(
      <Field label="Name" hint="Shown in lists." error="Required.">
        {({ id, describedBy, invalid }) => (
          <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>,
    );
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAccessibleDescription('Shown in lists. Required.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('toggles checkboxes with an explicit id and switches without a description', async () => {
    const user = userEvent.setup();
    function Controls() {
      const [checked, setChecked] = useState(false);
      const [on, setOn] = useState(false);
      return (
        <>
          <Checkbox id="agree" checked={checked} onCheckedChange={setChecked} label="I agree" />
          <Switch checked={on} onCheckedChange={setOn} label="Follow along" />
        </>
      );
    }
    render(<Controls />);
    await user.click(screen.getByLabelText('I agree'));
    expect(screen.getByRole('checkbox', { name: 'I agree' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'I agree' })).toHaveAttribute('id', 'agree');
    await user.click(screen.getByRole('switch', { name: 'Follow along' }));
    expect(screen.getByRole('switch', { name: 'Follow along' })).toBeChecked();
  });
});

describe('Layout', () => {
  it('sets the document title and shows an eyebrow', () => {
    render(<PageHeader title="Voices" eyebrow="Library" />);
    expect(document.title).toBe('Voices · TTSNative');
    expect(screen.getByText('Library')).toBeInTheDocument();
    renderHook(() => usePageTitle(''));
    expect(document.title).toBe('TTSNative');
  });

  it('labels a section by its heading when it has an id', () => {
    render(
      <Section id="storage" title="Storage" description="Disk use">
        Rows
      </Section>,
    );
    expect(screen.getByRole('region', { name: 'Storage' })).toHaveTextContent('Disk use');
  });
});

describe('OptionList', () => {
  it('is a radio group that selects with the arrow keys', async () => {
    const user = userEvent.setup();
    function Speeds() {
      const [value, setValue] = useState(1);
      return (
        <OptionList
          label="Speed"
          value={value}
          onSelect={setValue}
          options={[
            { value: 1, label: '1×', hint: 'Normal' },
            { value: 1.5, label: '1.5×' },
          ]}
        />
      );
    }
    render(<Speeds />);
    expect(screen.getByRole('group', { name: 'Speed' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1× Normal' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: '1× Normal' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: '1.5×' })).toBeChecked();
  });
});

describe('Popover', () => {
  it('opens from its trigger when uncontrolled', async () => {
    const user = userEvent.setup();
    render(
      <Popover label="Details" trigger={<button>More</button>}>
        Extra
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('dialog', { name: 'Details' })).toHaveTextContent('Extra');
  });
});

describe('Slider', () => {
  it('reports changes and commits from the keyboard with a spoken value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <Slider
        label="Pace"
        min={0}
        max={10}
        value={5}
        valueText={(value) => `${value} of 10`}
        onChange={onChange}
        onCommit={onCommit}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Pace' });
    expect(slider).toHaveAttribute('aria-valuetext', '5 of 10');
    act(() => slider.focus());
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith(6);
    expect(onCommit).toHaveBeenCalledWith(6);
  });
});

function Notifier() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.notify('success', 'Saved', 'All good.')}>Notify</button>
      <button onClick={() => toast.notify('error', 'Failed')}>Fail</button>
    </>
  );
}

describe('Toast', () => {
  it('dismisses success toasts automatically and keeps errors until dismissed', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Notifier />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Notify' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }));
    expect(screen.getByRole('status')).toHaveTextContent('SavedAll good.');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows at most four toasts at once', () => {
    render(
      <ToastProvider>
        <Notifier />
      </ToastProvider>,
    );
    for (let i = 0; i < 6; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Fail' }));
    expect(screen.getAllByRole('alert')).toHaveLength(4);
  });

  it('must be used inside its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useToast())).toThrow(/inside <ToastProvider>/);
  });
});
