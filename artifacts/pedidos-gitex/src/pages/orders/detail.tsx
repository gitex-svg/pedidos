import { useState, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  useGetOrder,
  useUpdateOrder,
  useSubmitOrder,
  useAddOrderItem,
  useUpdateOrderItem,
  useDeleteOrderItem,
  useListProducts,
  getListProductsQueryKey,
  useResolvePrice,
  useListCustomers,
  getListCustomersQueryKey,
  useListPaymentTerms,
  useListCarriers,
  OrderInternalStatus,
  Product,
  OrderItem,
  Customer
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatMoney, formatUnitPrice, formatNumberBR, subtractMoney, validateAndFormatQuantity, validateAndFormatUnitPrice } from '@/lib/format';
import { Loader2, ArrowLeft, Search, Plus, Save, Trash2, Edit2, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDashboardSummaryQueryKey, getGetOrderQueryKey, getResolvePriceQueryKey, getListOrdersQueryKey } from '@workspace/api-client-react';
import { ErpStatusBadge, ErpDateDisplay, getErpStatusConfig } from '@/components/erp-status-badge';
import { getOrderErrorMessage } from '@/lib/order-error';
import { SubmissionLock } from '@/lib/submission-lock';

export default function OrderDetail() {
  const params = useParams();
  const id = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentUser = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });

  useEffect(() => {
    if (currentUser.isError && !currentUser.isFetching) {
      queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
      setLocation('/');
    }
  }, [currentUser.isError, currentUser.isFetching, queryClient, setLocation]);

  const { data: order, isLoading: isLoadingOrder, isError: isErrorOrder } = useGetOrder(id!, { query: { enabled: !!id && !!currentUser.data, queryKey: getGetOrderQueryKey(id!) } });

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
  const isDraft = order?.internalStatus === 'DRAFT';
  const canEdit = isDraft && user?.role === 'REPRESENTATIVE';

  if (isLoadingOrder) {
    return (
      <AppShell user={user}>
        <div className="flex h-[80vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (isErrorOrder || !order) {
    return (
      <AppShell user={user}>
        <div className="flex h-[80vh] flex-col items-center justify-center p-8 text-center animate-rise">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-xl font-bold font-display">Orçamento não encontrado</h3>
          <p className="text-muted-foreground mt-2 mb-6">Não foi possível carregar os detalhes do orçamento.</p>
          <Button variant="outline" onClick={() => setLocation('/orders')}>
            Voltar para lista
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-6xl mx-auto animate-rise">
        <div className="flex items-center gap-4 mb-2">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/orders')} className="gap-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight font-display text-foreground">
                Orçamento #{order.internalNumber}
              </h2>
              <Badge variant={order.internalStatus === 'SUBMITTED' ? 'default' : 'secondary'} className="text-xs">
                {order.internalStatus === 'SUBMITTED' ? 'Enviado' : 'Rascunho'}
              </Badge>
              <ErpStatusBadge status={order.erpStatus} />
            </div>
            <div className="text-muted-foreground mt-1 text-sm font-sans flex items-center gap-4">
              <span>{order.customerName}</span>
              <span className="font-mono-brand text-xs opacity-70">Cód: {order.customerErpCode}</span>
            </div>
            {order.erpOrderNumber && (
              <div className="mt-2 text-sm text-foreground bg-muted/30 border border-border inline-flex px-2 py-1 rounded font-mono-brand">
                Pedido ERP: {order.erpOrderNumber}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-4 mr-4 bg-card px-3 py-1.5 rounded-md border text-left hidden md:flex">
              <ErpDateDisplay date={order.createdAt} label="Criado" />
              <div className="h-6 w-px bg-border"></div>
              <ErpDateDisplay date={order.submittedAt} label="Enviado" />
              <div className="h-6 w-px bg-border"></div>
              <ErpDateDisplay date={order.erpSyncedAt} label="Integração" />
            </div>
            {canEdit && <SubmitOrderButton orderId={order.id} version={order.version} />}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm pt-2 md:hidden">
            <ErpDateDisplay date={order.createdAt} label="Criado" />
            <ErpDateDisplay date={order.submittedAt} label="Enviado" />
            <ErpDateDisplay date={order.erpSyncedAt} label="Integração" className="col-span-2" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <OrderItemsSection order={order} canEdit={canEdit} />
          </div>
          <div className="lg:col-span-1 space-y-6">
            <OrderTotalsSection order={order} />
            <OrderHeaderSection order={order} canEdit={canEdit} />
            <OrderHistorySection order={order} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function SubmitOrderButton({ orderId, version }: { orderId: string, version: number }) {
  const submitOrder = useSubmitOrder();
  const submitLock = useRef(new SubmissionLock()).current;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = () => {
    if (submitOrder.isPending || !submitLock.acquire()) return;
    submitOrder.mutate(
      { id: orderId, data: { version } },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          toast({ title: "Pedido finalizado com sucesso!" });
          queryClient.setQueryData(getGetOrderQueryKey(orderId), updated);
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Não foi possível finalizar o pedido", description: getOrderErrorMessage(err), variant: "destructive" });
        },
        onSettled: () => { submitLock.release(); },
      }
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button data-testid="button-submit-order" className="gap-2">
          Finalizar Pedido
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finalizar Pedido?</DialogTitle>
          <DialogDescription>Confirme a finalização deste pedido.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>Após a finalização, o pedido não poderá mais ser alterado e ficará disponível para integração.</p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitOrder.isPending} data-testid="button-confirm-submit">
            {submitOrder.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderTotalsSection({ order }: { order: any }) {
  return (
    <Card className="bg-card/70 border-card-border backdrop-blur-sm shadow-sm">
      <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
        <CardTitle className="text-lg">Resumo</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Total Bruto</span>
          <span className="font-mono-brand">{formatMoney(order.grossTotal)}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Descontos Globais</span>
          <span className="font-mono-brand text-destructive">
            - {formatMoney(subtractMoney(order.grossTotal, order.netTotal))}
          </span>
        </div>
        <div className="h-px bg-border my-2" />
        <div className="flex justify-between items-center font-bold text-lg">
          <span>Total Líquido</span>
          <span className="font-mono-brand text-primary">{formatMoney(order.netTotal)}</span>
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground space-y-1">
          <div><span className="font-semibold text-foreground">Cond. Pagto:</span> {order.paymentTermDescription}</div>
          <div><span className="font-semibold text-foreground">Transportadora:</span> {order.carrierName || 'Não informada'}</div>
        </div>
      </CardContent>
    </Card>
  );
}

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function OrderHistorySection({ order }: { order: any }) {
  const history = order.statusHistory || [];

  if (history.length === 0) return null;

  return (
    <Card className="bg-card/70 border-card-border backdrop-blur-sm shadow-sm">
      <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
        <CardTitle className="text-lg">Histórico de Status</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
          {history.map((entry: any, index: number) => (
            <div key={entry.id || index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-5 h-5 rounded-full border border-primary/30 bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow flex-col gap-1 ring-4 ring-background">
                <div className="h-1.5 w-1.5 bg-primary rounded-full"></div>
              </div>
              <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] bg-card border border-border p-3 rounded-lg shadow-sm">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-mono-brand mb-1">
                    <span>{format(new Date(entry.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                    <span className="text-[10px] uppercase opacity-70">{entry.source || 'SISTEMA'}</span>
                  </div>
                  <div className="flex items-center flex-wrap gap-2 text-sm font-medium">
                     {entry.previousStatus && (
                       <span className="line-through text-muted-foreground/60">{statusHistoryLabel(entry.previousStatus)}</span>
                    )}
                    {entry.previousStatus && <span className="text-muted-foreground/60">→</span>}
                     <span className="text-foreground">{statusHistoryLabel(entry.newStatus || entry.statusType)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function statusHistoryLabel(status: string) {
  if (status === 'DRAFT') return 'Rascunho';
  if (status === 'SUBMITTED') return 'Pedido finalizado';
  return getErpStatusConfig(status).label;
}

function OrderHeaderSection({ order, canEdit }: { order: any, canEdit: boolean }) {
  const updateOrder = useUpdateOrder();
  const updateLock = useRef(new SubmissionLock()).current;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState(order.notes || '');
  const [d1, setD1] = useState(order.discount1);
  const [d2, setD2] = useState(order.discount2);
  const [d3, setD3] = useState(order.discount3);
  const [d4, setD4] = useState(order.discount4);

  const [customerId, setCustomerId] = useState(order.customerId);
  const [paymentTermId, setPaymentTermId] = useState(order.paymentTermId);
  const [carrierId, setCarrierId] = useState(order.carrierId || "none");

  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomerSearch(customerSearch), 500);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const { data: customersPage, isLoading: isLoadingCustomers } = useListCustomers(
    { pageSize: 10, search: debouncedCustomerSearch, active: true },
    { query: { enabled: customerDialogOpen && canEdit, queryKey: getListCustomersQueryKey({ pageSize: 10, search: debouncedCustomerSearch, active: true }) } }
  );

  const { data: paymentTermsPage } = useListPaymentTerms({ pageSize: 100, active: true });
  const { data: carriersPage } = useListCarriers({ pageSize: 100, active: true });

  // Sync state if order changes externally
  useEffect(() => {
    setNotes(order.notes || '');
    setD1(order.discount1);
    setD2(order.discount2);
    setD3(order.discount3);
    setD4(order.discount4);
    setCustomerId(order.customerId);
    setPaymentTermId(order.paymentTermId);
    setCarrierId(order.carrierId || "none");
    setSelectedCustomer(null); // Reset to rely on order data display when synced
  }, [order]);

  const hasChanges = notes !== (order.notes || '') ||
                     d1 !== order.discount1 ||
                     d2 !== order.discount2 ||
                     d3 !== order.discount3 ||
                     d4 !== order.discount4 ||
                     customerId !== order.customerId ||
                     paymentTermId !== order.paymentTermId ||
                     (carrierId === "none" ? null : carrierId) !== order.carrierId;

  const normalizeDiscount = (v: string) => v ? v.replace(',', '.') : "0";

  const handleSave = () => {
    if (!canEdit || updateOrder.isPending || !updateLock.acquire()) return;
    updateOrder.mutate(
      {
        id: order.id,
        data: {
          version: order.version,
          customerId,
          paymentTermId,
          carrierId: carrierId === "none" ? null : carrierId,
          notes: notes || null,
          discount1: normalizeDiscount(d1),
          discount2: normalizeDiscount(d2),
          discount3: normalizeDiscount(d3),
          discount4: normalizeDiscount(d4),
        }
      },
      {
        onSuccess: (updated) => {
          toast({ title: "Cabeçalho atualizado." });
          queryClient.setQueryData(getGetOrderQueryKey(order.id), updated);
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Não foi possível salvar as alterações", description: getOrderErrorMessage(err), variant: "destructive" });
        },
        onSettled: () => { updateLock.release(); },
      }
    );
  };

  return (
    <Card className="bg-card/70 border-card-border backdrop-blur-sm shadow-sm">
      <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
        <CardTitle className="text-lg">Dados do Pedido</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">

        {canEdit ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-customer" className="text-xs text-muted-foreground uppercase">Cliente</Label>
              <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    id="edit-customer"
                    aria-label="Selecionar cliente"
                    className="w-full justify-between bg-background mt-1"
                  >
                    <span className="truncate">
                      {selectedCustomer ? `${selectedCustomer.erp_code} - ${selectedCustomer.corporate_name}` : `${order.customerErpCode} - ${order.customerName}`}
                    </span>
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Buscar Cliente</DialogTitle>
                          <DialogDescription>Pesquise e selecione o cliente para este orçamento.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                      <Input
                        id="edit-customer-search"
                        aria-label="Buscar cliente"
                      placeholder="Nome, CNPJ ou código..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="bg-background"
                      autoFocus
                    />
                    <div className="max-h-[300px] overflow-y-auto space-y-2">
                      {isLoadingCustomers && <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>}
                      {!isLoadingCustomers && customersPage?.items.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground text-sm">Nenhum cliente encontrado.</div>
                      )}
                      {customersPage?.items.map(c => (
                        <button
                          type="button"
                          key={c.id}
                          className="w-full p-3 rounded-lg border border-border bg-card text-left hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerId(c.id);
                            setCustomerDialogOpen(false);
                          }}
                        >
                          <div className="font-semibold text-sm">{c.corporate_name}</div>
                          <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                            <span className="font-mono-brand">Cód: {c.erp_code}</span>
                            <span>{c.cnpj_cpf}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground uppercase">Condição de Pagamento</Label>
              <Select value={paymentTermId} onValueChange={setPaymentTermId}>
                <SelectTrigger className="bg-background mt-1" aria-label="Condição de pagamento">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {paymentTermsPage?.items.map(pt => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground uppercase">Transportadora (Opcional)</Label>
              <Select value={carrierId} onValueChange={setCarrierId}>
                <SelectTrigger className="bg-background mt-1" aria-label="Transportadora">
                  <SelectValue placeholder="Sem transportadora" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem transportadora</SelectItem>
                  {carriersPage?.items.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-px bg-border my-2" />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="edit-d1" className="text-xs text-muted-foreground uppercase">Desc 1 (%)</Label>
            <Input
              value={d1} onChange={e => setD1(e.target.value)} disabled={!canEdit}
              id="edit-d1"
              className="mt-1 font-mono-brand bg-background/50 h-8"
              data-testid="input-edit-d1"
            />
          </div>
          <div>
            <Label htmlFor="edit-d2" className="text-xs text-muted-foreground uppercase">Desc 2 (%)</Label>
            <Input
              value={d2} onChange={e => setD2(e.target.value)} disabled={!canEdit}
              id="edit-d2"
              className="mt-1 font-mono-brand bg-background/50 h-8"
              data-testid="input-edit-d2"
            />
          </div>
          <div>
            <Label htmlFor="edit-d3" className="text-xs text-muted-foreground uppercase">Desc 3 (%)</Label>
            <Input
              value={d3} onChange={e => setD3(e.target.value)} disabled={!canEdit}
              id="edit-d3"
              className="mt-1 font-mono-brand bg-background/50 h-8"
              data-testid="input-edit-d3"
            />
          </div>
          <div>
            <Label htmlFor="edit-d4" className="text-xs text-muted-foreground uppercase">Desc 4 (%)</Label>
            <Input
              value={d4} onChange={e => setD4(e.target.value)} disabled={!canEdit}
              id="edit-d4"
              className="mt-1 font-mono-brand bg-background/50 h-8"
              data-testid="input-edit-d4"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="edit-notes" className="text-xs text-muted-foreground uppercase">Observações</Label>
          <Textarea
            value={notes} onChange={e => setNotes(e.target.value)} disabled={!canEdit}
            id="edit-notes"
            className="mt-1 bg-background/50 resize-none h-20"
            data-testid="input-edit-notes"
          />
        </div>

        {canEdit && hasChanges && (
          <Button onClick={handleSave} disabled={updateOrder.isPending} className="w-full gap-2" size="sm" data-testid="button-save-header">
            {updateOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Alterações
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function OrderItemsSection({ order, canEdit }: { order: any, canEdit: boolean }) {
  return (
    <Card className="bg-card/70 border-card-border backdrop-blur-sm shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <CardTitle className="text-lg">Itens do Orçamento ({order.items?.length || 0})</CardTitle>
        {canEdit && (
          <AddItemDialog order={order} />
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {!order.items?.length ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p>Nenhum produto adicionado.</p>
            {canEdit && <p className="text-sm mt-1">Clique em "Adicionar Produto" para começar.</p>}
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader className="bg-muted/10 sticky top-0 z-10 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="font-mono-brand text-xs uppercase">Produto</TableHead>
                    <TableHead className="font-mono-brand text-xs uppercase text-right">Qtd</TableHead>
                    <TableHead className="font-mono-brand text-xs uppercase text-right">V. Unit Líq</TableHead>
                    <TableHead className="font-mono-brand text-xs uppercase text-right">Total Líq</TableHead>
                    {canEdit && <TableHead className="w-[80px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item: OrderItem) => (
                    <TableRow key={item.id} className="group" data-testid={`row-item-${item.id}`}>
                      <TableCell>
                        <div className="font-medium text-sm leading-tight text-foreground">{item.descriptionSnapshot}</div>
                        <div className="text-xs text-muted-foreground font-mono-brand mt-0.5">
                          {item.productCodeSnapshot}
                          {item.isSpecialPrice && (
                             <Badge variant="outline" className="ml-2 bg-destructive/10 text-destructive text-[9px] border-destructive/20 uppercase tracking-wider py-0 px-1">Especial</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono-brand text-sm">
                        {formatNumberBR(item.quantity, 4)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono-brand text-sm">{formatUnitPrice(item.netUnitPrice)}</div>
                        {item.isSpecialPrice && (
                          <div className="text-[10px] text-muted-foreground line-through decoration-muted-foreground/50">
                            {formatUnitPrice(item.effectiveUnitPrice)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono-brand font-medium text-primary">
                        {formatMoney(item.netTotal)}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                            <EditItemDialog order={order} item={item} />
                            <DeleteItemButton orderId={order.id} itemId={item.id} version={order.version} />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden grid grid-cols-1 gap-4 p-4">
              {order.items.map((item: OrderItem) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm relative">
                  <div>
                    <div className="font-medium text-sm leading-tight text-foreground pr-10">{item.descriptionSnapshot}</div>
                    <div className="text-xs text-muted-foreground font-mono-brand mt-1">
                      Cód: {item.productCodeSnapshot}
                      {item.isSpecialPrice && (
                         <Badge variant="outline" className="ml-2 bg-destructive/10 text-destructive text-[9px] border-destructive/20 uppercase tracking-wider py-0 px-1">Especial</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-border pt-3 mt-1">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase font-mono-brand">Qtd</span>
                      <span className="font-mono-brand font-medium">{formatNumberBR(item.quantity, 4)}</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-[10px] text-muted-foreground uppercase font-mono-brand">Unit Líq</span>
                      <span className="font-mono-brand">
                        {formatUnitPrice(item.netUnitPrice)}
                        {item.isSpecialPrice && (
                          <span className="block text-[10px] text-muted-foreground line-through decoration-muted-foreground/50">
                            {formatUnitPrice(item.effectiveUnitPrice)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-[10px] text-muted-foreground uppercase font-mono-brand">Total Líq</span>
                      <span className="font-mono-brand font-medium text-primary">{formatMoney(item.netTotal)}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-md shadow-sm border border-border">
                      <EditItemDialog order={order} item={item} />
                      <DeleteItemButton orderId={order.id} itemId={item.id} version={order.version} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Add Item Dialog
// -----------------------------------------------------------------------------

function AddItemDialog({ order }: { order: any }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [quantity, setQuantity] = useState("1");
  const [isSpecial, setIsSpecial] = useState(false);
  const [specialPrice, setSpecialPrice] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const addOrderItem = useAddOrderItem();
  const addLock = useRef(new SubmissionLock()).current;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const { data: productsPage, isLoading: isLoadingProducts } = useListProducts(
    { pageSize: 10, search: debouncedSearch, active: true },
    { query: { enabled: open && !selectedProduct, queryKey: getListProductsQueryKey({ pageSize: 10, search: debouncedSearch, active: true }) } }
  );

  // When product selected, fetch resolved price
  const { data: priceRes, isLoading: isLoadingPrice } = useResolvePrice(
    { customerId: order.customerId, productId: selectedProduct?.id! },
    { query: { enabled: open && !!selectedProduct, queryKey: getResolvePriceQueryKey({ customerId: order.customerId, productId: selectedProduct?.id! }) } }
  );

  // Reset state on open change
  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedProduct(null);
      setQuantity("1");
      setIsSpecial(false);
      setSpecialPrice("");
    }
  }, [open]);

  const handleAdd = () => {
    if (!selectedProduct || addOrderItem.isPending) return;

    const qStr = validateAndFormatQuantity(quantity);
    if (!qStr) {
      toast({ title: "Quantidade inválida", variant: "destructive" });
      return;
    }

    const payload: any = {
      productId: selectedProduct.id,
      quantity: qStr,
      version: order.version,
    };

    if (isSpecial) {
      const spStr = validateAndFormatUnitPrice(specialPrice);
      if (!spStr) {
        toast({ title: "Preço especial inválido", variant: "destructive" });
        return;
      }
      payload.specialUnitPrice = spStr;
    }

    if (!addLock.acquire()) return;
    addOrderItem.mutate(
      { id: order.id, data: payload },
      {
        onSuccess: (updated) => {
          toast({ title: "Produto adicionado." });
          queryClient.setQueryData(getGetOrderQueryKey(order.id), updated);
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setOpen(false);
        },
        onError: (err: any) => {
          toast({ title: "Não foi possível adicionar o item", description: getOrderErrorMessage(err), variant: "destructive" });
        },
        onSettled: () => { addLock.release(); },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" data-testid="button-open-add-item">
          <Plus className="h-4 w-4" /> Adicionar Produto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Adicionar Produto</DialogTitle>
          <DialogDescription>Busque um produto e informe a quantidade para incluí-lo no orçamento.</DialogDescription>
        </DialogHeader>

        {!selectedProduct ? (
          <div className="space-y-4 py-4 min-h-[300px]">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="product-search"
                aria-label="Buscar produto"
                placeholder="Buscar por descrição ou código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background"
                data-testid="input-product-search"
                autoFocus
              />
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[350px] pr-2">
              {isLoadingProducts && <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>}
              {!isLoadingProducts && productsPage?.items.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">Nenhum produto encontrado.</div>
              )}
              {productsPage?.items.map(p => (
                <button
                  type="button"
                  key={p.id}
                  className="w-full p-3 rounded-lg border border-border bg-card text-left hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all flex justify-between items-center group"
                  onClick={() => setSelectedProduct(p)}
                  data-testid={`product-option-${p.id}`}
                >
                  <div>
                    <div className="font-semibold text-sm">{p.description}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-3 font-mono-brand">
                      <span>Cód: {p.code}</span>
                      <span>Ref: {p.reference_code}</span>
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="flex items-start justify-between bg-muted/20 p-4 rounded-lg border border-border/50">
              <div>
                <div className="font-semibold">{selectedProduct.description}</div>
                <div className="text-xs text-muted-foreground font-mono-brand mt-1">Cód: {selectedProduct.code}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(null)} className="h-8 px-2 text-xs">
                Trocar
              </Button>
            </div>

            {isLoadingPrice ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Resolvendo preço...
              </div>
            ) : priceRes?.found ? (
              <div className="space-y-6 animate-rise">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Preço Tabela</Label>
                    <div className="font-mono-brand text-xl mt-1 font-medium">{formatUnitPrice(priceRes.unitPrice)}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">Origem: {priceRes.origin}</div>
                  </div>
                  <div>
                    <Label htmlFor="item-quantity" className="text-xs text-muted-foreground uppercase">Quantidade <span aria-hidden="true">*</span></Label>
                    <Input
                      value={quantity}
                      id="item-quantity"
                      onChange={e => setQuantity(e.target.value)}
                      aria-required="true"
                      className="mt-1 font-mono-brand text-lg"
                      data-testid="input-item-quantity"
                    />
                  </div>
                </div>

                <div className="border border-border rounded-lg p-4 bg-card">
                  <div className="flex items-center justify-between mb-4">
                    <Label htmlFor="special-price" className="text-sm font-semibold cursor-pointer flex items-center gap-2">
                      <input
                        id="special-price"
                        type="checkbox"
                        checked={isSpecial}
                        onChange={e => setIsSpecial(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary"
                        data-testid="checkbox-special-price"
                      />
                      Aplicar Preço Especial
                    </Label>
                  </div>

                  {isSpecial && (
                    <div className="space-y-3 animate-rise">
                      <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-md flex gap-2 items-start border border-destructive/20">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>Atenção: Ao usar preço especial, os descontos globais do cabeçalho <strong>não serão aplicados</strong> a este item.</p>
                      </div>
                      <div>
                        <Label htmlFor="item-special-price" className="text-xs text-muted-foreground uppercase">Preço Especial (Unitário) <span aria-hidden="true">*</span></Label>
                        <Input
                          value={specialPrice}
                          id="item-special-price"
                          onChange={e => setSpecialPrice(e.target.value)}
                          aria-required="true"
                          className="mt-1 font-mono-brand"
                          placeholder="0,00"
                          data-testid="input-special-price"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-lg flex flex-col items-center justify-center border border-destructive/20 text-center space-y-2">
                <AlertCircle className="h-6 w-6" />
                <p className="font-semibold">Nenhum preço encontrado.</p>
                <p className="text-xs opacity-90">Não há tabela de preços válida para este produto neste cliente.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className={!selectedProduct ? 'hidden' : ''}>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            onClick={handleAdd}
            disabled={addOrderItem.isPending || !priceRes?.found}
            data-testid="button-confirm-add-item"
          >
            {addOrderItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Adicionar Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Edit Item Dialog
// -----------------------------------------------------------------------------

function EditItemDialog({ order, item }: { order: any, item: OrderItem }) {
  const [open, setOpen] = useState(false);

  const [quantity, setQuantity] = useState(() => formatNumberBR(item.quantity, 4));
  const [isSpecial, setIsSpecial] = useState(item.isSpecialPrice);
  const [specialPrice, setSpecialPrice] = useState(() => item.specialUnitPrice ? formatNumberBR(item.specialUnitPrice, 6) : "");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateOrderItem = useUpdateOrderItem();
  const updateItemLock = useRef(new SubmissionLock()).current;

  // Reset state on open change
  useEffect(() => {
    if (open) {
      setQuantity(formatNumberBR(item.quantity, 4));
      setIsSpecial(item.isSpecialPrice);
      setSpecialPrice(item.specialUnitPrice ? formatNumberBR(item.specialUnitPrice, 6) : "");
    }
  }, [open, item]);

  const handleUpdate = () => {
    if (updateOrderItem.isPending) return;
    const qStr = validateAndFormatQuantity(quantity);
    if (!qStr) {
      toast({ title: "Quantidade inválida", variant: "destructive" });
      return;
    }

    const payload: any = {
      quantity: qStr,
      version: order.version,
    };

    if (isSpecial) {
      const spStr = validateAndFormatUnitPrice(specialPrice);
      if (!spStr) {
        toast({ title: "Preço especial inválido", variant: "destructive" });
        return;
      }
      payload.specialUnitPrice = spStr;
    } else {
      payload.specialUnitPrice = null;
    }

    if (!updateItemLock.acquire()) return;
    updateOrderItem.mutate(
      { id: order.id, itemId: item.id, data: payload },
      {
        onSuccess: (updated) => {
          toast({ title: "Item atualizado." });
          queryClient.setQueryData(getGetOrderQueryKey(order.id), updated);
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setOpen(false);
        },
        onError: (err: any) => {
          toast({ title: "Não foi possível atualizar o item", description: getOrderErrorMessage(err), variant: "destructive" });
        },
        onSettled: () => { updateItemLock.release(); },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Editar item ${item.productCodeSnapshot}`} className="h-8 w-8 text-muted-foreground hover:text-foreground" data-testid={`button-edit-item-${item.id}`}>
          <Edit2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Editar Item</DialogTitle>
          <DialogDescription>Atualize a quantidade ou o preço especial deste item.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="bg-muted/20 p-4 rounded-lg border border-border/50">
            <div className="font-semibold">{item.descriptionSnapshot}</div>
            <div className="text-xs text-muted-foreground font-mono-brand mt-1">Cód: {item.productCodeSnapshot}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Preço Tabela</Label>
              <div className="font-mono-brand text-xl mt-1 font-medium">{formatUnitPrice(item.suggestedUnitPrice)}</div>
            </div>
            <div>
              <Label htmlFor={`edit-quantity-${item.id}`} className="text-xs text-muted-foreground uppercase">Quantidade <span aria-hidden="true">*</span></Label>
              <Input
                value={quantity}
                id={`edit-quantity-${item.id}`}
                onChange={e => setQuantity(e.target.value)}
                aria-required="true"
                className="mt-1 font-mono-brand text-lg"
                data-testid={`input-edit-quantity-${item.id}`}
              />
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-center justify-between mb-4">
              <Label htmlFor={`edit-special-${item.id}`} className="text-sm font-semibold cursor-pointer flex items-center gap-2">
                <input
                  id={`edit-special-${item.id}`}
                  type="checkbox"
                  checked={isSpecial}
                  onChange={e => setIsSpecial(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary"
                  data-testid={`checkbox-edit-special-${item.id}`}
                />
                Aplicar Preço Especial
              </Label>
            </div>

            {isSpecial && (
              <div className="space-y-3 animate-rise">
                <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-md flex gap-2 items-start border border-destructive/20">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>Atenção: Ao usar preço especial, os descontos globais do cabeçalho <strong>não serão aplicados</strong> a este item.</p>
                </div>
                <div>
                  <Label htmlFor={`edit-special-price-${item.id}`} className="text-xs text-muted-foreground uppercase">Preço Especial (Unitário) <span aria-hidden="true">*</span></Label>
                  <Input
                    value={specialPrice}
                    id={`edit-special-price-${item.id}`}
                    onChange={e => setSpecialPrice(e.target.value)}
                    aria-required="true"
                    className="mt-1 font-mono-brand"
                    placeholder="0,00"
                    data-testid={`input-edit-special-price-${item.id}`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            onClick={handleUpdate}
            disabled={updateOrderItem.isPending}
            data-testid={`button-confirm-edit-item-${item.id}`}
          >
            {updateOrderItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Delete Item Button
// -----------------------------------------------------------------------------

function DeleteItemButton({ orderId, itemId, version }: { orderId: string, itemId: string, version: number }) {
  const deleteOrderItem = useDeleteOrderItem();
  const deleteLock = useRef(new SubmissionLock()).current;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDelete = () => {
    if (deleteOrderItem.isPending || !deleteLock.acquire()) return;
    deleteOrderItem.mutate(
      { id: orderId, itemId, data: { version } },
      {
        onSuccess: (updated) => {
          toast({ title: "Item removido." });
          queryClient.setQueryData(getGetOrderQueryKey(orderId), updated);
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Não foi possível remover o item", description: getOrderErrorMessage(err), variant: "destructive" });
        },
        onSettled: () => { deleteLock.release(); },
      }
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Remover item" className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors" data-testid={`button-delete-item-${itemId}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover Item?</DialogTitle>
          <DialogDescription>Confirme a remoção deste produto do orçamento.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>Deseja realmente remover este produto do orçamento?</p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteOrderItem.isPending} data-testid={`button-confirm-delete-item-${itemId}`}>
            {deleteOrderItem.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Remover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
