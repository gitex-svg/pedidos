import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, LogOut, Menu, PanelLeftClose, X, Users, Package } from 'lucide-react';
import { getGetCurrentUserQueryKey, getGetDashboardSummaryQueryKey, useLogout } from '@workspace/api-client-react';
import type { AuthUser } from '@workspace/api-client-react';
import { GitexMark } from '@/components/gitex-mark';

interface AppShellProps {
  user: AuthUser;
  children: React.ReactNode;
}

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export function AppShell({ user, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
        queryClient.removeQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        setLocation('/');
      },
    });
  };

  return (
    <div className="noise-layer flex min-h-[100dvh] bg-background">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          data-testid="button-close-menu-overlay"
          className="fixed inset-0 z-30 bg-[hsl(var(--foreground)/.38)] md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-200 md:static md:translate-x-0 md:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        data-testid="navigation-sidebar"
      >
        <div className="flex h-[82px] items-center border-b border-sidebar-border px-6">
          <GitexMark />
          <button
            type="button"
            aria-label="Fechar menu"
            data-testid="button-close-menu"
            className="ml-auto rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 pt-8">
          <div className="mb-3 px-3 font-mono-brand text-[10px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/45">Seu espaço</div>
          <Link
            href="/dashboard"
            data-testid="link-dashboard"
            className={`group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors ${
              location === '/dashboard' 
                ? 'bg-sidebar-accent text-sidebar-accent-foreground' 
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            }`}
            onClick={() => setMobileOpen(false)}
          >
            <BarChart3 className={`h-[18px] w-[18px] ${location === '/dashboard' ? 'text-sidebar-primary' : 'text-sidebar-foreground/50'}`} />
            <span>Visão geral</span>
            {location === '/dashboard' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
          </Link>
          <Link
            href="/customers"
            data-testid="link-customers"
            className={`group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors ${
              location.startsWith('/customers') 
                ? 'bg-sidebar-accent text-sidebar-accent-foreground' 
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            }`}
            onClick={() => setMobileOpen(false)}
          >
            <Users className={`h-[18px] w-[18px] ${location.startsWith('/customers') ? 'text-sidebar-primary' : 'text-sidebar-foreground/50'}`} />
            <span>Clientes</span>
            {location.startsWith('/customers') && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
          </Link>
          <Link
            href="/products"
            data-testid="link-products"
            className={`group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors ${
              location.startsWith('/products') 
                ? 'bg-sidebar-accent text-sidebar-accent-foreground' 
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            }`}
            onClick={() => setMobileOpen(false)}
          >
            <Package className={`h-[18px] w-[18px] ${location.startsWith('/products') ? 'text-sidebar-primary' : 'text-sidebar-foreground/50'}`} />
            <span>Produtos</span>
            {location.startsWith('/products') && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
          </Link>
        </div>
        <div className="mt-auto px-6 pb-6">
          <div className="mb-5 h-px bg-sidebar-border" />
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-primary/35 bg-sidebar-primary/15 font-mono-brand text-xs font-semibold text-sidebar-primary" data-testid="avatar-user">
              {initials(user.email)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-sidebar-accent-foreground" data-testid="text-sidebar-user">{user.email}</div>
              <div className="mt-0.5 font-mono-brand text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/45">{user.role === 'REPRESENTATIVE' ? 'Representante' : 'Administrador'}</div>
            </div>
          </div>
          <button
            type="button"
            data-testid="button-logout-sidebar"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="mt-5 flex w-full items-center gap-2 rounded-md px-1 py-2 text-xs font-semibold text-sidebar-foreground/60 transition-colors hover:text-sidebar-primary disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {logout.isPending ? 'Encerrando sessão...' : 'Sair da conta'}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="flex h-[82px] items-center justify-between border-b border-border bg-card/70 px-5 backdrop-blur-sm md:px-10">
          <button
            type="button"
            aria-label="Abrir menu"
            data-testid="button-open-menu"
            className="rounded-lg border border-border bg-background p-2 text-muted-foreground transition-colors hover:text-foreground md:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden items-center gap-2 md:flex">
            <PanelLeftClose className="h-4 w-4 text-muted-foreground/60" />
            <span className="font-mono-brand text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Área autenticada</span>
          </div>
          <div className="ml-auto flex items-center gap-3 md:hidden">
            <GitexMark compact />
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-mono-brand text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Sessão ativa</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}