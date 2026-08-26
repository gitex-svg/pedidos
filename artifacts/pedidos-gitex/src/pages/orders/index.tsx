import { useState, useEffect } from 'react';
import { useListOrders, ListOrdersStatus, getGetCurrentUserQueryKey, getListOrdersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useGetCurrentUser } from '@workspace/api-client-react';
import { formatMoney, formatNumberBR } from '@/lib/format';
import { Link, useLocation } from 'wouter';
import { Search, Plus, Filter, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Orders() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const currentUser = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });

  const [page, setPage] = useState(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [numberSearch, setNumberSearch] = useState('');
  const [status, setStatus] = useState<ListOrdersStatus | 'ALL'>('ALL');

  useEffect(() => {
    if (currentUser.isError && !currentUser.isFetching) {
      queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
      setLocation('/');
    }
  }, [currentUser.isError, currentUser.isFetching, queryClient, setLocation]);

  const { data: ordersPage, isLoading, isError } = useListOrders(
    {
      page,
      pageSize: 20,
      ...(customerSearch ? { customer: customerSearch } : {}),
      ...(numberSearch && !isNaN(Number(numberSearch)) ? { number: Number(numberSearch) } : {}),
      ...(status !== 'ALL' ? { status } : {})
    },
    {
      query: {
        enabled: !!currentUser.data,
        keepPreviousData: true,
        queryKey: getListOrdersQueryKey({
          page,
          pageSize: 20,
          ...(customerSearch ? { customer: customerSearch } : {}),
          ...(numberSearch && !isNaN(Number(numberSearch)) ? { number: Number(numberSearch) } : {}),
          ...(status !== 'ALL' ? { status } : {})
        })
      } as any
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

  const user = currentUser.data;

  return (
    <AppShell user={user}>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0">
          <div>
            <h2 className="text-3xl font-bold tracking-tight font-display text-foreground">Orçamentos</h2>
            <p className="text-muted-foreground mt-1 font-sans">
              Gerencie orçamentos e pedidos de venda.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button onClick={() => setLocation('/orders/new')} data-testid="button-new-order" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Orçamento
            </Button>
          </div>
        </div>

        <Card className="p-4 bg-card/70 border-card-border backdrop-blur-sm shadow-sm">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente..."
                className="pl-9 bg-background/50"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setPage(1);
                }}
                data-testid="input-search-customer-orders"
              />
            </div>
            <div className="w-full sm:w-48 relative">
              <FileText className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Número..."
                className="pl-9 bg-background/50"
                value={numberSearch}
                onChange={(e) => {
                  setNumberSearch(e.target.value);
                  setPage(1);
                }}
                data-testid="input-search-number-orders"
              />
            </div>
            <div className="w-full sm:w-48">
              <Select
                value={status}
                onValueChange={(val) => {
                  setStatus(val as any);
                  setPage(1);
                }}
              >
                <SelectTrigger className="bg-background/50" data-testid="select-status-filter">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os status</SelectItem>
                  <SelectItem value="DRAFT">Rascunho</SelectItem>
                  <SelectItem value="SUBMITTED">Enviado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card hidden md:block">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[100px] font-mono-brand text-xs uppercase tracking-wider">Número</TableHead>
                  <TableHead className="font-mono-brand text-xs uppercase tracking-wider">Cliente</TableHead>
                  <TableHead className="font-mono-brand text-xs uppercase tracking-wider">Data</TableHead>
                  <TableHead className="font-mono-brand text-xs uppercase tracking-wider text-right">Líquido</TableHead>
                  <TableHead className="font-mono-brand text-xs uppercase tracking-wider">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Carregando orçamentos...
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-destructive">
                      Erro ao carregar orçamentos.
                    </TableCell>
                  </TableRow>
                ) : !ordersPage?.items.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Nenhum orçamento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  ordersPage.items.map((order) => (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setLocation(`/orders/${order.id}`)}
                      data-testid={`row-order-${order.id}`}
                    >
                      <TableCell className="font-mono-brand font-medium">#{order.internalNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{order.customerName}</div>
                        <div className="text-xs text-muted-foreground">{order.customerErpCode}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(order.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(order.netTotal)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.internalStatus === 'SUBMITTED' ? 'default' : 'secondary'}>
                          {order.internalStatus === 'SUBMITTED' ? 'Enviado' : 'Rascunho'}
                        </Badge>
                        {order.erpStatus && (
                          <Badge variant="outline" className="ml-2 bg-transparent text-[10px]">
                            {order.erpStatus}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-1 gap-4 md:hidden">
            {isLoading ? (
              <div className="h-24 flex items-center justify-center text-muted-foreground border border-border rounded-md bg-card">
                Carregando orçamentos...
              </div>
            ) : isError ? (
              <div className="h-24 flex items-center justify-center text-destructive border border-border rounded-md bg-card">
                Erro ao carregar orçamentos.
              </div>
            ) : !ordersPage?.items.length ? (
              <div className="h-24 flex items-center justify-center text-muted-foreground border border-border rounded-md bg-card">
                Nenhum orçamento encontrado.
              </div>
            ) : (
              ordersPage.items.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setLocation(`/orders/${order.id}`)}
                  data-testid={`card-order-${order.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono-brand font-medium">#{order.internalNumber}</span>
                      <div className="mt-1 font-medium text-foreground">{order.customerName}</div>
                      <div className="text-xs text-muted-foreground">{order.customerErpCode}</div>
                    </div>
                    <Badge variant={order.internalStatus === 'SUBMITTED' ? 'default' : 'secondary'}>
                      {order.internalStatus === 'SUBMITTED' ? 'Enviado' : 'Rascunho'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {format(new Date(order.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                    <span className="font-medium text-primary">
                      {formatMoney(order.netTotal)}
                    </span>
                  </div>
                  {order.erpStatus && (
                    <div className="pt-2 border-t border-border mt-1">
                      <Badge variant="outline" className="bg-transparent text-[10px]">
                        {order.erpStatus}
                      </Badge>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {ordersPage && ordersPage.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground font-mono-brand">
                Página {ordersPage.page} de {ordersPage.totalPages}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(ordersPage.totalPages, p + 1))}
                  disabled={page === ordersPage.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
