/** Placeholder shown while a form that reads the URL streams in. */
export function FormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="grid gap-4" aria-hidden>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="grid gap-1.5">
          <div className="h-3 w-20 rounded bg-surface-3" />
          <div className="h-9 rounded-ctl bg-surface-2" />
        </div>
      ))}
      <div className="h-9 rounded-ctl bg-surface-3" />
    </div>
  );
}
