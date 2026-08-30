"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive" | "icon";

export function Button({
  variant = "primary",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      className={classes("qi-button", `qi-button--${variant}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="qi-button__loader" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

type PanelVariant = "standard" | "elevated" | "interactive" | "status" | "empty";

export function Panel({
  variant = "standard",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: PanelVariant }) {
  return <div className={classes("qi-panel", `qi-panel--${variant}`, className)} {...props} />;
}

type FieldProps = {
  label: string;
  helpText?: string;
  error?: string;
  optional?: boolean;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
};

export function Field({ label, helpText, error, optional, children }: FieldProps) {
  const id = useId();
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="qi-field">
      <label className="qi-label" htmlFor={id}>
        {label}
        {optional ? <span>Optional</span> : null}
      </label>
      {children({ id, describedBy })}
      {helpText ? <p id={helpId} className="qi-help">{helpText}</p> : null}
      {error ? <p id={errorId} className="qi-field-error" role="alert">{error}</p> : null}
    </div>
  );
}

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={classes("qi-input", invalid && "qi-input--error", className)} aria-invalid={invalid || undefined} {...props} />;
}

export function Select({ className, invalid, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select className={classes("qi-input", "qi-select", invalid && "qi-input--error", className)} aria-invalid={invalid || undefined} {...props}>{children}</select>;
}

export function Textarea({ className, invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={classes("qi-input", "qi-textarea", invalid && "qi-input--error", className)} aria-invalid={invalid || undefined} {...props} />;
}

type StatusTone = "live" | "ready" | "warning" | "error" | "success" | "inactive";

export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={classes("qi-status", `qi-status--${tone}`)}><span aria-hidden="true" />{children}</span>;
}

export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="qi-dialog" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={onClose} onClose={onClose}>
      <div className="qi-dialog__header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>
        <Button variant="icon" type="button" aria-label="Close dialog" onClick={onClose}>×</Button>
      </div>
      {children ? <div className="qi-dialog__body">{children}</div> : null}
      {footer ? <div className="qi-dialog__footer">{footer}</div> : null}
    </dialog>
  );
}

export function Drawer({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className={classes("qi-drawer", open && "qi-drawer--open")} aria-hidden={!open}>
      <button className="qi-drawer__scrim" type="button" aria-label="Close side panel" onClick={onClose} tabIndex={open ? 0 : -1} />
      <aside className="qi-drawer__panel" aria-label={title}>
        <div className="qi-drawer__header"><h2>{title}</h2><Button variant="icon" type="button" aria-label="Close side panel" onClick={onClose}>×</Button></div>
        <div className="qi-drawer__body">{children}</div>
      </aside>
    </div>
  );
}

export function SegmentedControl({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <div className="qi-segments" role="group" aria-label={label}>
      {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="qi-tooltip" data-tooltip={label}>{children}</span>;
}

export type AlertTone = "info" | "success" | "warning" | "error";

export function Alert({ tone = "info", title, children, className }: { tone?: AlertTone; title?: string; children: ReactNode; className?: string }) {
  return <div className={classes("qi-alert", `qi-alert--${tone}`, className)} role={tone === "error" ? "alert" : "status"}>{title ? <strong>{title}</strong> : null}<div>{children}</div></div>;
}

export function Toast({ tone = "info", children }: { tone?: AlertTone; children: ReactNode }) {
  return <div className={classes("qi-toast", `qi-alert--${tone}`)} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

// Codex pre-launch review, finding #13: window.alert() also blocks the
// whole tab, same problem as window.confirm() above - just one-way instead
// of asking a question. Auto-dismissing after a few seconds rather than
// requiring a click matches how the rest of the app's status messages
// already behave (see e.g. the "Moved to..." status text pattern used
// elsewhere), so a host who's mid-show and doesn't immediately look at the
// screen isn't stuck with something demanding dismissal to unblock the UI.
export function useToastQueue() {
  const [toast, setToast] = useState<{ tone: AlertTone; message: ReactNode } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: ReactNode, tone: AlertTone = "info", durationMs = 5000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ tone, message });
    timerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const toastEl = toast ? <Toast tone={toast.tone}>{toast.message}</Toast> : null;
  return { showToast, toastEl };
}

// Codex #13: replaces window.prompt(), same blocking-dialog problem as
// alert()/confirm() above, for the one call site that needs free-text
// input rather than a yes/no. Returns the entered string, or null if
// cancelled - same contract as window.prompt() itself, so call sites only
// need `await` added.
export type PromptOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; placeholder?: string };

export function usePromptDialog() {
  const [state, setState] = useState<(PromptOptions & { message: ReactNode; defaultValue: string }) | null>(null);
  const [value, setValue] = useState("");
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  const promptDialog = useCallback((message: ReactNode, defaultValue = "", options: PromptOptions = {}): Promise<string | null> => {
    return new Promise<string | null>(resolve => {
      resolverRef.current = resolve;
      setValue(defaultValue);
      setState({ message, defaultValue, ...options });
    });
  }, []);

  const settle = useCallback((result: string | null) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState(null);
  }, []);

  const dialog = state ? (
    <div className="qi-confirm" role="presentation">
      <button className="qi-confirm__scrim" type="button" aria-label="Cancel" onClick={() => settle(null)} />
      <div className="qi-confirm__panel" role="dialog" aria-modal="true" aria-label={state.title || "Enter a value"}>
        {state.title ? <h2>{state.title}</h2> : null}
        <p>{state.message}</p>
        <input
          className="qi-input"
          style={{ marginTop: 12, width: "100%" }}
          value={value}
          placeholder={state.placeholder}
          autoFocus
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") settle(value); if (e.key === "Escape") settle(null); }}
        />
        <div className="qi-confirm__actions">
          <Button variant="secondary" type="button" onClick={() => settle(null)}>{state.cancelLabel || "Cancel"}</Button>
          <Button variant="primary" type="button" onClick={() => settle(value)}>{state.confirmLabel || "Save"}</Button>
        </div>
      </div>
    </div>
  ) : null;

  return { promptDialog, dialog };
}

// Codex pre-launch review, finding #13: window.confirm() blocks the ENTIRE
// browser tab until dismissed - if a host doesn't immediately notice it (a
// second monitor, a moment looking at the venue), the whole app reads as
// frozen with no click going through anywhere, which is exactly what got
// reported as "the platform froze." useConfirmDialog() gives call sites the
// same "ask a yes/no question, get a boolean back" shape as window.confirm
// (just async - `await confirm(...)` instead of a blocking return value),
// backed by an in-page modal that can never block anything outside itself.
export type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; tone?: "default" | "destructive" };

export function useConfirmDialog() {
  const [state, setState] = useState<(ConfirmOptions & { message: ReactNode }) | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((message: ReactNode, options: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve;
      setState({ message, ...options });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState(null);
  }, []);

  const dialog = state ? (
    <div className="qi-confirm" role="presentation">
      <button className="qi-confirm__scrim" type="button" aria-label="Cancel" onClick={() => settle(false)} />
      <div className="qi-confirm__panel" role="alertdialog" aria-modal="true" aria-label={state.title || "Confirm"}>
        {state.title ? <h2>{state.title}</h2> : null}
        <p>{state.message}</p>
        <div className="qi-confirm__actions">
          <Button variant="secondary" type="button" onClick={() => settle(false)}>{state.cancelLabel || "Cancel"}</Button>
          <Button variant={state.tone === "destructive" ? "destructive" : "primary"} type="button" onClick={() => settle(true)} autoFocus>{state.confirmLabel || "Confirm"}</Button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={classes("qi-skeleton", className)} aria-hidden="true" />;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <Panel variant="empty"><div className="qi-empty__mark" aria-hidden="true">QI</div><h2>{title}</h2>{description ? <p>{description}</p> : null}{action}</Panel>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="qi-page-header"><div>{eyebrow ? <p className="qi-eyebrow">{eyebrow}</p> : null}<h1>{title}</h1>{description ? <p className="qi-page-header__description">{description}</p> : null}</div>{action ? <div className="qi-page-header__action">{action}</div> : null}</header>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="qi-section-header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action}</div>;
}

export function BrandLockup({ context, compact = false, align = "center" }: { context?: string; compact?: boolean; align?: "left" | "center" }) {
  return (
    <div className={classes("qi-brand", compact && "qi-brand--compact", align === "left" && "qi-brand--left")} aria-label={context ? `Quiz-It, powered by Mac Entertainment. Tonight at ${context}.` : "Quiz-It, powered by Mac Entertainment."}>
      <div className="qi-brand__name" aria-hidden="true"><span>QUIZ-</span>IT</div>
      <div className="qi-brand__producer" aria-hidden="true">Powered by Mac Entertainment</div>
      {context ? <div className="qi-brand__context" aria-hidden="true">Tonight at {context}</div> : null}
    </div>
  );
}
