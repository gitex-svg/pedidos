export function GitexMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" data-testid="brand-gitex">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-accent text-accent-foreground shadow-sm">
        <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none">
          <path d="M5 5.5h14M5 11.5h9M5 17.5h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
          <path d="m16 9 3 2.5-3 2.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
        <span className="absolute -right-3 -top-3 h-7 w-7 rotate-45 bg-white/20" />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="font-display text-[1.1rem] font-bold tracking-[-0.04em]">Fitas Gitex</div>
          <div className="mt-1 font-mono-brand text-[9px] uppercase tracking-[0.22em] opacity-65">portal comercial</div>
        </div>
      )}
    </div>
  );
}