"use client";

import {
  useEffect,
  useId,
  useRef,
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

type AlertTone = "info" | "success" | "warning" | "error";

export function Alert({ tone = "info", title, children, className }: { tone?: AlertTone; title?: string; children: ReactNode; className?: string }) {
  return <div className={classes("qi-alert", `qi-alert--${tone}`, className)} role={tone === "error" ? "alert" : "status"}>{title ? <strong>{title}</strong> : null}<div>{children}</div></div>;
}

export function Toast({ tone = "info", children }: { tone?: AlertTone; children: ReactNode }) {
  return <div className={classes("qi-toast", `qi-alert--${tone}`)} role={tone === "error" ? "alert" : "status"}>{children}</div>;
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
    <div className={classes("qi-brand", compact && "qi-brand--compact", align === "left" && "qi-brand--left")} aria-label={context ? `Quiz-It, presented by Mac Entertainment. Tonight at ${context}.` : "Quiz-It, presented by Mac Entertainment."}>
      <div className="qi-brand__name" aria-hidden="true"><span>QUIZ-</span>IT</div>
      <div className="qi-brand__producer" aria-hidden="true">Presented by Mac Entertainment</div>
      {context ? <div className="qi-brand__context" aria-hidden="true">Tonight at {context}</div> : null}
    </div>
  );
}
