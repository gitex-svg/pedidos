import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, XCircle, PackageOpen } from 'lucide-react';
import { useLocation } from 'wouter';
import { 
  useGetCurrentUser, getGetCurrentUserQueryKey, 
  useListProducts, getListProductsQueryKey 
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { useDebounce } from '@/hooks/use-debounce';

function ProductSkeleton() {
  return (
    <div className="space-y-4" data-testid="loading-products">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex animate-pulse flex-col rounded-xl border border-border bg-card p-5">
            <div className="h-4 w-12 rounded-md bg-muted mb-3" />
            <div className="h-5 w-full rounded-md bg-muted mb-2" />
            <div className="h-4 w-3/4 rounded-md bg-muted mb-6" />
            <div className="grid grid-cols-2 gap-3 mt-auto">
              <div className="h-8 rounded-md bg-muted" />
              <div className="h-8 rounded-md bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Products() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const currentUser = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });

  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 400);
  const [page, setPage] = useState(1);
  const [showInactive, setShowInactive] = useState(false);
  
  // Desktop filters
  const [groupCode, setGroupCode] = useState('');
  const debouncedGroup = useDebounce(groupCode, 400);
  const [typeCode, setTypeCode] = useState('');
  const debouncedType = useDebounce(typeCode, 400);
  const [productCode, setProductCode] = useState('');
  const debouncedProduct = useDebounce(productCode, 400);
  const [referenceCode, setReferenceCode] = useState('');
  const debouncedRef = useDebounce(referenceCode, 400);
  const [description, setDescription] = useState('');
  const debouncedDesc = useDebounce(description, 400);

  const isAdmin = currentUser.data?.role === 'ADMIN';

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, showInactive, debouncedGroup, debouncedType, debouncedProduct, debouncedRef, debouncedDesc]);

  useEffect(() => {
    if (currentUser.isError && !currentUser.isFetching) {
      queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
      setLocation('/');
    }
  }, [currentUser.isError, currentUser.isFetching, queryClient, setLocation]);

  const limit = 24;
  const productsQuery = useListProducts(
    { 
      page, 
      limit, 
      q: debouncedQ || undefined,
      active: isAdmin ? (showInactive ? undefined : true) : true,
      group_code: debouncedGroup || undefined,
      type_code: debouncedType || undefined,
      product_code: debouncedProduct || undefined,
      reference_code: debouncedRef || undefined,
      description: debouncedDesc || undefined
    }, 
    { 
      query: { 
        enabled: !!currentUser.data,
        queryKey: getListProductsQueryKey({ 
          page, limit, q: debouncedQ || undefined, active: isAdmin ? (showInactive ? undefined : true) : true,
          group_code: debouncedGroup || undefined, type_code: debouncedType || undefined,
          product_code: debouncedProduct || undefined, reference_code: debouncedRef || undefined, description: debouncedDesc || undefined
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

  const { data, isLoading, isError } = productsQuery;

  return (
    <AppShell user={currentUser.data}>
      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="animate-rise">
            <div className="font-mono-brand text-[10px] font-semibold uppercase tracking-[0.2em] text-primary" data-testid="text-products-eyebrow">Catálogo digital</div>
            <h1 className="mt-3 font-display text-[2.45rem] font-semibold leading-none tracking-[-0.065em] sm:text-5xl" data-testid="heading-products">Produtos</h1>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-4 animate-rise animate-rise-delay-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Busca rápida..."
                className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm font-medium text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="input-search-products"
              />
            </div>
            
            <div className="hidden flex-wrap items-center gap-3 sm:flex">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Grupo"
                  className="h-10 w-[70px] rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={groupCode}
                  onChange={(e) => setGroupCode(e.target.value)}
                  maxLength={2}
                  data-testid="input-filter-group"
                />
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Tipo"
                  className="h-10 w-[70px] rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={typeCode}
                  onChange={(e) => setTypeCode(e.target.value)}
                  maxLength={2}
                  data-testid="input-filter-type"
                />
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Produto"
                  className="h-10 w-[80px] rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  maxLength={4}
                  data-testid="input-filter-product"
                />
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Referência"
                  className="h-10 w-[110px] rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={referenceCode}
                  onChange={(e) => setReferenceCode(e.target.value)}
                  maxLength={8}
                  data-testid="input-filter-reference"
                />
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Descrição"
                  className="h-10 w-[160px] rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="input-filter-description"
                />
              </div>
              
              {isAdmin && (
                <label className="ml-1 flex shrink-0 items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="rounded border-input text-primary focus:ring-primary"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    data-testid="checkbox-show-inactive-products"
                  />
                  Inativos
                </label>
              )}
            </div>
          </div>
          
          {/* Mobile filters toggles could go here if needed, but keeping simple as requested */}
        </div>

        {isError && (
          <div className="rounded-xl border border-destructive/25 bg-card px-6 py-12 text-center" data-testid="status-products-error">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"><XCircle className="h-5 w-5" /></div>
            <h2 className="mt-5 font-display text-xl font-semibold tracking-[-0.03em]">Não foi possível carregar os produtos</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Ocorreu um erro ao buscar o catálogo. Tente novamente mais tarde.</p>
            <button type="button" onClick={() => productsQuery.refetch()} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-bold text-foreground transition-colors hover:border-primary hover:text-primary">Tentar novamente</button>
          </div>
        )}

        {!isError && (
          <div className="animate-rise animate-rise-delay-2">
            {isLoading ? (
              <ProductSkeleton />
            ) : data?.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-20 text-center" data-testid="empty-products">
                <PackageOpen className="h-10 w-10 text-muted-foreground/40 mb-4" />
                <h3 className="font-display text-lg font-semibold text-foreground">Nenhum produto encontrado</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Revise os filtros aplicados ou sua busca.</p>
                {(q || groupCode || typeCode || productCode || referenceCode || description) && (
                  <button 
                    type="button" 
                    onClick={() => { setQ(''); setGroupCode(''); setTypeCode(''); setProductCode(''); setReferenceCode(''); setDescription(''); }} 
                    className="mt-4 text-sm font-semibold text-primary hover:underline"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="grid-products">
                  {data?.items.map((product) => (
                    <div key={product.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md" data-testid={`card-product-${product.id}`}>
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono-brand text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                            {product.code}
                          </span>
                          {!product.active && (
                            <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-destructive">
                              Inativo
                            </span>
                          )}
                        </div>
                        
                        <h3 className="mt-2 text-sm font-semibold leading-tight text-foreground line-clamp-2" title={product.description}>
                          {product.description}
                        </h3>
                        
                        <div className="mt-auto pt-5">
                          <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                            <div>
                              <div className="text-[10px] font-medium text-muted-foreground">Cor</div>
                              <div className="mt-0.5 text-xs font-semibold text-foreground truncate">{product.color || '-'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-medium text-muted-foreground">Largura</div>
                              <div className="mt-0.5 text-xs font-semibold text-foreground truncate">{product.width || '-'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-medium text-muted-foreground">Embalagem</div>
                              <div className="mt-0.5 text-xs font-semibold text-foreground truncate">{product.packaging || '-'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-medium text-muted-foreground">Coleção</div>
                              <div className="mt-0.5 text-xs font-semibold text-foreground truncate">{product.collection || '-'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="border-t border-border bg-muted/20 px-5 py-3">
                        <div className="flex items-center justify-between font-mono-brand text-[9px] uppercase tracking-wider text-muted-foreground">
                          <span>Ref: {product.reference_code}</span>
                          <span>Grp: {product.group_code} • Tip: {product.type_code} • Prd: {product.product_code}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {data && data.total_pages > 1 && (
                  <div className="mt-8 flex items-center justify-between border-t border-border pt-6" data-testid="pagination-products">
                    <p className="text-xs text-muted-foreground">
                      Mostrando <span className="font-semibold text-foreground">{(page - 1) * limit + 1}</span> a <span className="font-semibold text-foreground">{Math.min(page * limit, data.total)}</span> de <span className="font-semibold text-foreground">{data.total}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="flex h-8 items-center gap-1 rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:bg-muted disabled:opacity-50"
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Anterior</span>
                      </button>
                      <button
                        type="button"
                        disabled={page === data.total_pages}
                        onClick={() => setPage((p) => p + 1)}
                        className="flex h-8 items-center gap-1 rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:bg-muted disabled:opacity-50"
                        data-testid="button-next-page"
                      >
                        <span className="hidden sm:inline">Próxima</span> <ChevronRight className="h-3.5 w-3.5" />
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
