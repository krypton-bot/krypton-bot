export function SettingsCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
