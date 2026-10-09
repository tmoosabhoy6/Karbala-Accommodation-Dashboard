import * as RDialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { STATUS_META, type RoomStatus } from "@/lib/status";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: ReactNode }>(
  function Button({ variant = "secondary", size = "md", icon, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx(
          "press inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium select-none disabled:opacity-45",
          size === "sm" && "h-8 rounded-sm px-2.5 text-[13px]",
          size === "md" && "h-9 rounded-sm px-3.5 text-[13.5px]",
          size === "lg" && "h-11 rounded-md px-5 text-[14.5px]",
          variant === "primary" && "bg-ink-1 text-canvas hover:opacity-90",
          variant === "secondary" && "bg-raised text-ink-1 shadow-lift hover:bg-card",
          variant === "ghost" && "text-ink-2 hover:bg-well hover:text-ink-1",
          variant === "quiet" && "bg-well text-ink-1 hover:bg-rule-strong",
          variant === "danger" && "bg-occupied text-white hover:opacity-90",
          className,
        )}
        {...rest}
      >
        {icon}
        {children}
      </button>
    );
  },
);

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[12px] font-medium text-ink-2">
      {children}
      {hint && <span className="font-normal text-ink-3">{hint}</span>}
    </span>
  );
}

const fieldCls =
  "w-full rounded-sm bg-well px-3 text-[14px] text-ink-1 placeholder:text-ink-4 outline-none ring-1 ring-inset ring-rule transition-shadow focus:ring-2 focus:ring-ink-1 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldCls, "h-10", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldCls, "h-10 appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: CHEVRON }} {...rest}>
      {children}
    </select>
  );
}

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5' fill='none' stroke='%23888' stroke-width='1.5'/%3E%3C/svg%3E")`;

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldCls, "min-h-[72px] py-2.5", className)} {...rest} />;
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  );
}

export function StatusDot({ status, className }: { status: RoomStatus; className?: string }) {
  return (
    <span
      className={cx("inline-block size-2 shrink-0 rounded-full", status === "blocked" && "hatch", className)}
      style={{ background: status === "blocked" ? undefined : STATUS_META[status].color, boxShadow: status === "blocked" ? "inset 0 0 0 1px var(--blocked)" : undefined }}
    />
  );
}

export function StatusPill({ status, children }: { status: RoomStatus; children?: ReactNode }) {
  const c = STATUS_META[status].color;
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium"
      style={{ background: `color-mix(in oklab, ${c} 13%, transparent)`, color: `color-mix(in oklab, ${c} 82%, var(--ink-1))` }}
    >
      <StatusDot status={status} />
      {children ?? STATUS_META[status].label}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "sm" | "md" }) {
  return (
    <div className={cx("inline-flex rounded-sm bg-well p-0.5 ring-1 ring-inset ring-rule", size === "sm" ? "h-8" : "h-9")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "press rounded-[5px] px-3 text-[13px] font-medium",
            value === o.value ? "bg-raised text-ink-1 shadow-lift" : "text-ink-3 hover:text-ink-1",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, dot }: { active?: boolean; onClick?: () => void; children: ReactNode; dot?: RoomStatus }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium",
        active ? "bg-ink-1 text-canvas" : "bg-raised text-ink-2 shadow-lift hover:text-ink-1",
      )}
    >
      {dot && <StatusDot status={dot} />}
      {children}
    </button>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3", className)}>{children}</div>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-md bg-card shadow-lift", className)}>{children}</section>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-well px-1 font-mono text-[11px] text-ink-3 ring-1 ring-inset ring-rule">{children}</kbd>;
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-4">{icon}</div>}
      <div className="text-[15px] font-medium text-ink-1">{title}</div>
      {children && <div className="mt-1 max-w-sm text-[13px] text-ink-3">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; width?: number }) {
  return (
    <RDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-[fade_180ms_ease-out]" />
        <RDialog.Content
          className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-lg bg-raised shadow-lift-high outline-none data-[state=open]:animate-[rise_220ms_cubic-bezier(0.23,1,0.32,1)] sm:inset-x-auto sm:top-[8vh] sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:rounded-lg"
          style={{ width: `min(100vw, ${width}px)` }}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-raised/95 px-5 pt-5 pb-3 backdrop-blur">
            <div>
              <RDialog.Title className="text-[18px] font-semibold tracking-[-0.01em]">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-0.5 text-[13px] text-ink-3">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">Dialog</RDialog.Description>
              )}
            </div>
            <RDialog.Close className="press -mt-1 -mr-1 grid size-9 place-items-center rounded-sm text-ink-3 hover:bg-well hover:text-ink-1" aria-label="Close">
              <X size={18} />
            </RDialog.Close>
          </div>
          <div className="px-5 pb-5">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Meter({ value, max, color = "var(--ink-1)", className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-well", className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
