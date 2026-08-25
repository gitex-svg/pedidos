import { useEffect, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, Server, ShieldCheck } from 'lucide-react';
import { useLogin, useGetCurrentUser, getGetCurrentUserQueryKey, useHealthCheck, getHealthCheckQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { GitexMark } from '@/components/gitex-mark';

function errorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { error?: string } }; message?: string } | undefined;
  return candidate?.response?.data?.error || candidate?.message || 'Não foi possível concluir o acesso. Tente novamente.';
}

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();
  const currentUser = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const health = useHealthCheck({ query: { retry: false, staleTime: 30000, queryKey: getHealthCheckQueryKey() } });

  useEffect(() => {
    if (currentUser.isSuccess && currentUser.data) setLocation('/dashboard');
  }, [currentUser.isSuccess, currentUser.data, setLocation]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || password.length < 8) return;
    login.mutate({ data: { email: email.trim(), password } }, {
      onSuccess: (session) => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), session.user);
        setLocation('/dashboard');
      },
    });
  };

  const healthOnline = health.data?.status === 'ok' || health.data?.status === 'healthy';

  return (
    <div className="noise-layer min-h-[100dvh] overflow-hidden bg-background">
      <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(420px,0.86fr)_minmax(540px,1.14fr)]">
        <section className="relative hidden overflow-hidden bg-sidebar px-12 py-12 text-sidebar-foreground lg:flex lg:flex-col">
          <div className="absolute inset-0 technical-grid opacity-25" />
          <div className="absolute -bottom-36 -left-20 h-[420px] w-[420px] rounded-full border border-sidebar-primary/15" />
          <div className="absolute -bottom-24 -left-8 h-[290px] w-[290px] rounded-full border border-sidebar-primary/15" />
          <div className="relative">
            <GitexMark />
          </div>
          <div className="relative mt-auto max-w-[390px] pb-6">
            <div className="mb-7 flex items-center gap-3 font-mono-brand text-[10px] uppercase tracking-[0.2em] text-sidebar-primary">
              <span className="h-px w-8 bg-sidebar-primary" />
              Operação comercial
            </div>
            <h1 className="font-display text-[clamp(2.7rem,4.2vw,4.25rem)] font-semibold leading-[0.97] tracking-[-0.065em]">
              O próximo pedido começa aqui.
            </h1>
            <p className="mt-7 max-w-[320px] text-sm leading-7 text-sidebar-foreground/63">
              Acompanhe sua operação com a precisão de quem conhece cada metro de fita.
            </p>
          </div>
          <div className="relative mt-10 flex items-center gap-3 font-mono-brand text-[10px] tracking-[0.1em] text-sidebar-foreground/40">
            <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
            Ambiente seguro · Gitex
          </div>
        </section>

        <main className="flex min-h-[100dvh] flex-col px-5 py-7 sm:px-10 sm:py-10 lg:px-[clamp(48px,8vw,132px)]">
          <div className="flex items-center justify-between lg:justify-end">
            <div className="lg:hidden"><GitexMark /></div>
            <div className="flex items-center gap-2 font-mono-brand text-[9px] uppercase tracking-[0.13em] text-muted-foreground" data-testid="status-api">
              <span className={`h-1.5 w-1.5 rounded-full ${health.isPending ? 'animate-pulse-soft bg-muted-foreground/50' : healthOnline ? 'bg-emerald-500' : 'bg-destructive'}`} />
              {health.isPending ? 'Verificando serviço' : healthOnline ? 'Serviço operacional' : 'Serviço indisponível'}
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-12">
            <div className="animate-rise">
              <div className="mb-4 font-mono-brand text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Acesso restrito</div>
              <h2 className="font-display text-4xl font-semibold tracking-[-0.055em] text-foreground sm:text-[2.9rem]">Bem-vindo de volta.</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Entre para consultar o andamento da sua carteira.</p>
            </div>

            <form onSubmit={submit} className="mt-10 animate-rise animate-rise-delay-1">
              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2.5 flex items-center gap-2 text-xs font-bold text-foreground"><Mail className="h-3.5 w-3.5 text-primary" /> E-mail corporativo</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nome@empresa.com.br"
                    autoComplete="email"
                    required
                    data-testid="input-email"
                    className="h-12 w-full rounded-lg border border-input bg-card px-4 text-sm text-foreground shadow-xs transition-all placeholder:text-muted-foreground/55 hover:border-primary/40 focus:border-primary focus:shadow-[0_0_0_3px_hsl(var(--primary)/.12)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-2.5 flex items-center gap-2 text-xs font-bold text-foreground"><LockKeyhole className="h-3.5 w-3.5 text-primary" /> Senha</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Mínimo de 8 caracteres"
                      autoComplete="current-password"
                      minLength={8}
                      required
                      data-testid="input-password"
                      className="h-12 w-full rounded-lg border border-input bg-card px-4 pr-12 text-sm text-foreground shadow-xs transition-all placeholder:text-muted-foreground/55 hover:border-primary/40 focus:border-primary focus:shadow-[0_0_0_3px_hsl(var(--primary)/.12)]"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      data-testid="button-toggle-password"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-primary"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </div>

              {login.isError && (
                <div className="mt-5 flex gap-3 rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3.5 text-xs leading-5 text-destructive" data-testid="status-login-error">
                  <Server className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage(login.error)}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={login.isPending || !email.trim() || password.length < 8}
                data-testid="button-submit-login"
                className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground shadow-[0_5px_0_hsl(var(--primary)/.72)] transition-all hover:-translate-y-0.5 hover:shadow-[0_7px_0_hsl(var(--primary)/.72)] active:translate-y-0 active:shadow-[0_3px_0_hsl(var(--primary)/.72)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
              >
                {login.isPending ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> Validando acesso</>
                ) : 'Entrar no portal'}
              </button>
            </form>
            <div className="mt-8 flex items-start gap-3 border-t border-border pt-6 text-[11px] leading-5 text-muted-foreground animate-rise animate-rise-delay-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Seu acesso é protegido por sessão segura. Em caso de dúvida, fale com o administrador da sua operação.</span>
            </div>
          </div>
          <div className="flex justify-between font-mono-brand text-[9px] uppercase tracking-[0.13em] text-muted-foreground/65">
            <span>Fitas Gitex · 2024</span>
            <span>v1.0.0</span>
          </div>
        </main>
      </div>
    </div>
  );
}