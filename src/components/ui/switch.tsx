"use client";

/** Accessible on/off switch (role="switch"). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40 ${
        checked ? "bg-brand" : "bg-muted"
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}
