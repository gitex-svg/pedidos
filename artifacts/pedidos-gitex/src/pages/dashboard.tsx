import { useEffect, useMemo } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDashed, FileCheck2, FileText, PackageCheck, RefreshCw, Send, XCircle } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useGetCurrentUser, getGetCurrentUserQueryKey, useGetDashboardSummary, getGetDashboardSummaryQueryKey, useHealthCheck, getHealthCheckQueryKey } from '@workspace/api-client-react';
import type { DashboardSummary } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';

const statuses = [
  { key: 'draft_count', label: 'Rascunhos', icon: FileText, color: 'hsl(var(--chart-5))', tone: 'muted' },
  { key: 'submitted_count', label: 'Enviados', icon: Send, color: 'hsl(var(--primary))', tone: 'primary' },
  { key: 'approved_count', label: 'Aprovados', icon: CheckCircle2, color: 'hsl(var(--chart-3))', tone: 'green' },
  { key: 'invoiced_count', label: 'Faturados', icon: PackageCheck, color: 'hsl(var(--accent))', tone: 'amber' },
  { key: 'rejected_count', label: 'Rejeitados', icon: XCircle, color: 'hsl(var(--destructive))', tone: 'red' },
] as const;

function number(value: number | undefined) {
  return new Intl.NumberFormat('pt-BR').format(value ?? 0);
}

function SummarySkeleton() {
  return (
    <div className="space-y-5" aria-label="Carregando resumo" data-testid="loading-dashboard">
      <div className="grid gap-5 md:grid-cols-[1.15fr_1fr]">
        <div className="h-[185px] animate-pulse rounded-xl bg-muted" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-[88px] animate-pulse rounded-xl bg-muted" />
          <div className="h-[88px] animate-pulse rounded-xl bg-muted" />
          <div className="h-[88px] animate-pulse rounded-xl bg-muted" />
          <div className="h-[88px] animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
      <div className="h-[280px] animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

function SummaryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/25 bg-card px-6 py-12 text-center" data-testid="status-dashboard-error">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="h-5 w-5" /></div>
      <h2 className="mt-5 font-display text-xl font-semibold tracking-[-0.03em]">Resumo temporariamente indisponível</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Não conseguimos consultar seus dados agora. Nenhum número foi estimado.</p>
      <button type="button" data-testid="button-retry-dashboard" onClick={onRetry} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-bold text-foreground transition-colors hover:border-primary hover:text-primary"><RefreshCw className="h-3.5 w-3.5" /> Tentar novamente</button>
    </div>
  );
}

function StatusRow({ label, value, total, icon: Icon, color, tone }: { label: string; value: number; total: number; icon: typeof FileText; color: string; tone: string }) {
  const width = total > 0 ? `${Math.max((value / total) * 100, value > 0 ? 3 : 0)}%` : '0%';
  const toneClass = tone === 'primary' ? 'text-primary' : tone === 'green' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <div className="grid grid-cols-[minmax(112px,0.8fr)_minmax(100px,1.4fr)_45px] items-center gap-3 py-3.5 sm:grid-cols-[180px_minmax(140px,1fr)_60px] sm:gap-6" data-testid={`row-status-${label.toLowerCase()}`}>
      <div className={`flex items-center gap-2.5 text-xs font-semibold ${toneClass}`}><Icon className="h-4 w-4 shrink-0" /><span>{label}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-700" style={{ width, backgroundColor: color }} /></div>
      <div className="text-right font-mono-brand text-xs font-semibold text-foreground" data-testid={`text-status-count-${label.toLowerCase()}`}>{number(value)}</div>
    </div>
  );
}

function DashboardContent({ summary }: { summary: DashboardSummary }) {
  const total = summary.draft_count + summary.submitted_count + summary.approved_count + summary.invoiced_count + summary.rejected_count;
  const completed = summary.approved_count + summary.invoiced_count;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const currentLabel = useMemo(() => {
    if (!total) return 'Sem movimentações';
    if (summary.invoiced_count > 0) return 'Operação em andamento';
    if (summary.approved_count > 0) return 'Pedidos aprovados';
    if (summary.submitted_count > 0) return 'Aguardando retorno';
    return 'Carteira em preparação';
  }, [summary, total]);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-[1.15fr_1fr]">
        <section className="relative overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground shadow-sm sm:p-7" data-testid="card-total-orders">
          <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full border border-primary-foreground/10" />
          <div className="absolute -right-1 -top-11 h-40 w-40 rounded-full border border-primary-foreground/10" />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono-brand text-[10px] uppercase tracking-[0.18em] text-primary-foreground/60">Carteira total</div>
                <div className="mt-4 font-display text-6xl font-semibold tracking-[-0.08em] sm:text-7xl" data-testid="text-total-orders">{number(total)}</div>
              </div>
              <CircleDashed className="h-6 w-6 text-accent" />
            </div>
            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">{currentLabel}</div>
                <div className="mt-1 text-xs text-primary-foreground/60">Pedidos acompanhados nesta conta</div>
              </div>
              <div className="text-right">
                <div className="font-mono-brand text-2xl font-semibold text-accent">{completionRate}%</div>
                <div className="mt-1 text-[10px] text-primary-foreground/60">concluídos</div>
              </div>
            </div>
          </div>
        </section>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm" data-testid="card-approved-orders">
            <div className="flex items-center justify-between"><CheckCircle2 className="h-4 w-4 text-emerald-700" /><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50" /></div>
            <div className="mt-6 font-display text-3xl font-semibold tracking-[-0.06em]" data-testid="text-approved-orders">{number(summary.approved_count)}</div>
            <div className="mt-1 text-xs font-semibold text-muted-foreground">Aprovados</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm" data-testid="card-invoiced-orders">
            <div className="flex items-center justify-between"><PackageCheck className="h-4 w-4 text-amber-700" /><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50" /></div>
            <div className="mt-6 font-display text-3xl font-semibold tracking-[-0.06em]" data-testid="text-invoiced-orders">{number(summary.invoiced_count)}</div>
            <div className="mt-1 text-xs font-semibold text-muted-foreground">Faturados</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm" data-testid="card-submitted-orders">
            <div className="flex items-center justify-between"><Send className="h-4 w-4 text-primary" /><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50" /></div>
            <div className="mt-6 font-display text-3xl font-semibold tracking-[-0.06em]" data-testid="text-submitted-orders">{number(summary.submitted_count)}</div>
            <div className="mt-1 text-xs font-semibold text-muted-foreground">Enviados</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm" data-testid="card-rejected-orders">
            <div className="flex items-center justify-between"><XCircle className="h-4 w-4 text-destructive" /><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50" /></div>
            <div className="mt-6 font-display text-3xl font-semibold tracking-[-0.06em]" data-testid="text-rejected-orders">{number(summary.rejected_count)}</div>
            <div className="mt-1 text-xs font-semibold text-muted-foreground">Rejeitados</div>
          </div>
        </div>
      </div>
      <section className="rounded-xl border border-border bg-card px-5 py-5 shadow-xs sm:px-7 sm:py-6" data-testid="card-status-distribution">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div><div className="font-mono-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Leitura da carteira</div><h2 className="mt-2 font-display text-xl font-semibold tracking-[-0.04em]">Distribuição por status</h2></div>
          <div className="hidden items-center gap-2 rounded-md bg-muted px-2.5 py-1.5 font-mono-brand text-[10px] text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Dados atuais</div>
        </div>
        <div className="divide-y divide-border">
          {statuses.map((item) => <StatusRow key={item.key} label={item.label} value={summary[item.key]} total={total} icon={item.icon} color={item.color} tone={item.tone} />)}
        </div>
        {!total && <div className="border-t border-border pt-5 text-center text-xs text-muted-foreground" data-testid="empty-dashboard">Ainda não há pedidos para exibir. Quando sua carteira receber movimentação, ela aparecerá aqui.</div>}
      </section>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const currentUser = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const summary = useGetDashboardSummary({ query: { enabled: !!currentUser.data, retry: false, queryKey: getGetDashboardSummaryQueryKey() } });
  const health = useHealthCheck({ query: { retry: false, staleTime: 30000, queryKey: getHealthCheckQueryKey() } });

  useEffect(() => {
    if (currentUser.isError && !currentUser.isFetching) setLocation('/');
  }, [currentUser.isError, currentUser.isFetching, setLocation]);

  if (currentUser.isLoading || !currentUser.data) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm" data-testid="loading-auth-session">
          <div className="h-10 w-36 animate-pulse rounded-md bg-muted" />
          <div className="mt-10 h-8 w-64 animate-pulse rounded-md bg-muted" />
          <div className="mt-3 h-4 w-80 animate-pulse rounded-md bg-muted" />
          <div className="mt-10 h-48 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <AppShell user={currentUser.data}>
      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="animate-rise">
            <div className="font-mono-brand text-[10px] font-semibold uppercase tracking-[0.2em] text-primary" data-testid="text-dashboard-eyebrow">Resumo operacional</div>
            <h1 className="mt-3 font-display text-[2.45rem] font-semibold leading-none tracking-[-0.065em] sm:text-5xl" data-testid="heading-dashboard">Visão geral</h1>
            <p className="mt-3 text-sm text-muted-foreground">Acompanhe o ritmo da sua carteira em um só lugar.</p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3 py-2.5 shadow-xs sm:self-end" data-testid="status-dashboard-health">
            <span className={`h-2 w-2 rounded-full ${health.isPending ? 'animate-pulse-soft bg-muted-foreground/50' : health.data?.status === 'ok' || health.data?.status === 'healthy' ? 'bg-emerald-500' : 'bg-destructive'}`} />
            <span className="font-mono-brand text-[10px] uppercase tracking-[0.11em] text-muted-foreground">{health.isPending ? 'Checando conexão' : health.data?.status === 'ok' || health.data?.status === 'healthy' ? 'Sincronizado agora' : 'Conexão instável'}</span>
          </div>
        </div>
        {summary.isLoading ? <SummarySkeleton /> : summary.isError ? <SummaryError onRetry={() => summary.refetch()} /> : summary.data ? <DashboardContent summary={summary.data} /> : <SummaryError onRetry={() => summary.refetch()} />}
      </div>
    </AppShell>
  );
}