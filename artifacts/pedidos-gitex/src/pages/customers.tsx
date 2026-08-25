import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, MapPin, Users, ChevronLeft, ChevronRight, XCircle } from 'lucide-react';
import { useLocation } from 'wouter';
import { 
  useGetCurrentUser, getGetCurrentUserQueryKey, 
  useListCustomers, getListCustomersQueryKey 
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { useDebounce } from '@/hooks/use-debounce';

function CustomerSkeleton() {
  return (
    <div className="space-y-4" data-testid="loading-customers">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex animate-pulse flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-5 w-48 rounded-md bg-muted" />
            <div className="h-4 w-32 rounded-md bg-muted" />
          </div>
          <div className="flex gap-4">
            <div className="h-8 w-24 rounded-md bg-muted" />
            <div className="h-8 w-24 rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Customers() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const currentUser = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [showInactive, setShowInactive] = useState(false);

  const isAdmin = currentUser.data?.role === 'ADMIN';

  // Reset page when search or filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, showInactive]);

  useEffect(() => {
    if (currentUser.isError && !currentUser.isFetching) {
      queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
      setLocation('/');
    }
  }, [currentUser.isError, currentUser.isFetching, queryClient, setLocation]);

  const customersQuery = useListCustomers(
    { 
      page, 
      limit: 15, 
      search: debouncedSearch || undefined,
      active: isAdmin ? (showInactive ? undefined : true) : true
    }, 
    { 
      query: { 
        enabled: !!currentUser.data,
        queryKey: getListCustomersQueryKey({ 
          page, limit: 15, search: debouncedSearch || undefined, active: isAdmin ? (showInactive ? undefined : true) : true 
        })
      } 
    }
  );

  if (currentUser.isLoading || !currentUser.data) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm">
          <div className="h-10 w-36 animate-pulse rounded-md bg-muted" />
          <div className="mt-10 h-8 w-64 animate-pulse rounded-md bg-muted" />
          <div className="mt-3 h-4 w-80 animate-pulse rounded-md bg-muted" />
          <div className="mt-10 h-48 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  const { data, isLoading, isError } = customersQuery;

  return (
    <AppShell user={currentUser.data}>
      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="animate-rise">
            <div className="font-mono-brand text-[10px] font-semibold uppercase tracking-[0.2em] text-primary" data-testid="text-customers-eyebrow">Carteira de clientes</div>
            <h1 className="mt-3 font-display text-[2.45rem] font-semibold leading-none tracking-[-0.065em] sm:text-5xl" data-testid="heading-customers">Clientes</h1>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-rise animate-rise-delay-1">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome, código ou CNPJ/CPF..."
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm font-medium text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-customers"
            />
          </div>
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input 
                type="checkbox" 
                className="rounded border-input text-primary focus:ring-primary"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                data-testid="checkbox-show-inactive"
              />
              Mostrar inativos
            </label>
          )}
        </div>

        {isError && (
          <div className="rounded-xl border border-destructive/25 bg-card px-6 py-12 text-center" data-testid="status-customers-error">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"><XCircle className="h-5 w-5" /></div>
            <h2 className="mt-5 font-display text-xl font-semibold tracking-[-0.03em]">Não foi possível carregar os clientes</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Ocorreu um erro ao buscar os dados. Tente novamente mais tarde.</p>
            <button type="button" onClick={() => customersQuery.refetch()} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-bold text-foreground transition-colors hover:border-primary hover:text-primary">Tentar novamente</button>
          </div>
        )}

        {!isError && (
          <div className="animate-rise animate-rise-delay-2">
            {isLoading ? (
              <CustomerSkeleton />
            ) : data?.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-20 text-center" data-testid="empty-customers">
                <Users className="h-10 w-10 text-muted-foreground/40 mb-4" />
                <h3 className="font-display text-lg font-semibold text-foreground">Nenhum cliente encontrado</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Não encontramos resultados para a sua busca ou você ainda não possui clientes vinculados.</p>
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="mt-4 text-sm font-semibold text-primary hover:underline">
                    Limpar busca
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-xs md:block">
                  <table className="w-full text-left text-sm" data-testid="table-customers">
                    <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-4">Cliente</th>
                        <th className="px-5 py-4">Código ERP</th>
                        <th className="px-5 py-4">Documento</th>
                        <th className="px-5 py-4">Localização</th>
                        <th className="px-5 py-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data?.items.map((customer) => (
                        <tr key={customer.id} className="transition-colors hover:bg-muted/20" data-testid={`row-customer-${customer.id}`}>
                          <td className="px-5 py-4">
                            <div className="font-semibold text-foreground">{customer.corporate_name}</div>
                            {customer.trade_name && customer.trade_name !== customer.corporate_name && (
                              <div className="mt-0.5 text-xs text-muted-foreground">{customer.trade_name}</div>
                            )}
                          </td>
                          <td className="px-5 py-4 font-mono-brand text-xs">{customer.erp_code}</td>
                          <td className="px-5 py-4 text-xs">{customer.cnpj_cpf || '-'}</td>
                          <td className="px-5 py-4 text-xs">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              {customer.city && customer.state ? `${customer.city}, ${customer.state}` : '-'}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${customer.active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                              {customer.active ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-4 md:hidden" data-testid="list-customers-mobile">
                  {data?.items.map((customer) => (
                    <div key={customer.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-xs" data-testid={`card-customer-${customer.id}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold leading-tight text-foreground">{customer.corporate_name}</h3>
                          {customer.trade_name && customer.trade_name !== customer.corporate_name && (
                            <p className="mt-1 text-xs text-muted-foreground">{customer.trade_name}</p>
                          )}
                        </div>
                        <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${customer.active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                          {customer.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      
                      <div className="mt-2 grid grid-cols-2 gap-y-2 text-xs">
                        <div>
                          <div className="font-mono-brand text-[9px] uppercase tracking-wider text-muted-foreground">Código ERP</div>
                          <div className="mt-0.5 font-medium">{customer.erp_code}</div>
                        </div>
                        <div>
                          <div className="font-mono-brand text-[9px] uppercase tracking-wider text-muted-foreground">Documento</div>
                          <div className="mt-0.5 font-medium">{customer.cnpj_cpf || '-'}</div>
                        </div>
                        <div className="col-span-2">
                          <div className="font-mono-brand text-[9px] uppercase tracking-wider text-muted-foreground">Localização</div>
                          <div className="mt-0.5 flex items-center gap-1.5 font-medium">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {customer.city && customer.state ? `${customer.city}, ${customer.state}` : '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {data && data.total_pages > 1 && (
                  <div className="mt-6 flex items-center justify-between border-t border-border pt-6" data-testid="pagination-customers">
                    <p className="text-xs text-muted-foreground">
                      Página <span className="font-semibold text-foreground">{data.page}</span> de <span className="font-semibold text-foreground">{data.total_pages}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="flex h-8 items-center gap-1 rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:bg-muted disabled:opacity-50"
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                      </button>
                      <button
                        type="button"
                        disabled={page === data.total_pages}
                        onClick={() => setPage((p) => p + 1)}
                        className="flex h-8 items-center gap-1 rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:bg-muted disabled:opacity-50"
                        data-testid="button-next-page"
                      >
                        Próxima <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
