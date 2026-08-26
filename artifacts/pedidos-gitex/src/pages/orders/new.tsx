import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useGetCurrentUser, getGetCurrentUserQueryKey,
  useCreateOrder,
  useListCustomers,
  useListPaymentTerms,
  useListCarriers,
  getListCustomersQueryKey,
  getListOrdersQueryKey,
  Customer
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

import { AppShell } from '@/components/app-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Search, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

import { normalizeDecimalString } from '@/lib/format';
import { getOrderErrorMessage } from '@/lib/order-error';
import { SubmissionLock } from '@/lib/submission-lock';

const decimalDiscountSchema = z.string()
  .transform(val => normalizeDecimalString(val))
  .refine(val => /^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,4})?$/.test(val), "Desconto inválido (ex: 5 ou 5,50)");

const formSchema = z.object({
  customerId: z.string().min(1, "Selecione um cliente"),
  paymentTermId: z.string().min(1, "Selecione uma condição de pagamento"),
  carrierId: z.string().optional(),
  notes: z.string().max(5000).optional(),
  discount1: decimalDiscountSchema.default("0"),
  discount2: decimalDiscountSchema.default("0"),
  discount3: decimalDiscountSchema.default("0"),
  discount4: decimalDiscountSchema.default("0"),
});

type FormValues = z.infer<typeof formSchema>;

export default function OrderNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createOrder = useCreateOrder();
  const createLock = useRef(new SubmissionLock()).current;
  const queryClient = useQueryClient();

  const currentUser = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });

  useEffect(() => {
    if (currentUser.isError && !currentUser.isFetching) {
      queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
      setLocation('/');
    }
  }, [currentUser.isError, currentUser.isFetching, queryClient, setLocation]);

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
    { query: { enabled: customerDialogOpen, queryKey: getListCustomersQueryKey({ pageSize: 10, search: debouncedCustomerSearch, active: true }) } }
  );

  const { data: paymentTermsPage } = useListPaymentTerms({ pageSize: 100, active: true });
  const { data: carriersPage } = useListCarriers({ pageSize: 100, active: true });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: "",
      paymentTermId: "",
      carrierId: undefined,
      notes: "",
      discount1: "0",
      discount2: "0",
      discount3: "0",
      discount4: "0",
    }
  });

  const onSubmit = (data: FormValues) => {
    if (createOrder.isPending || !createLock.acquire()) return;
    const carrierId = data.carrierId === "none" || data.carrierId === "" ? null : data.carrierId;
    createOrder.mutate(
      { data: { ...data, carrierId, notes: data.notes || null } },
      {
        onSuccess: (order) => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          toast({ title: "Orçamento criado com sucesso!" });
          setLocation(`/orders/${order.id}`);
        },
        onError: (err: any) => {
          toast({
            title: "Erro ao criar orçamento",
            description: getOrderErrorMessage(err),
            variant: "destructive"
          });
        },
        onSettled: () => { createLock.release(); },
      }
    );
  };

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

  if (user.role !== 'REPRESENTATIVE') {
    return (
      <AppShell user={user}>
        <div className="flex items-center justify-center h-full">
          <Card className="w-full max-w-md text-center p-8">
            <CardTitle className="text-xl mb-2 text-destructive">Acesso restrito</CardTitle>
            <p className="text-muted-foreground">Somente representantes podem criar orçamentos.</p>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 max-w-4xl mx-auto animate-rise">
        <div>
          <h2 className="text-3xl font-bold tracking-tight font-display text-foreground">Novo Orçamento</h2>
          <p className="text-muted-foreground mt-1 font-sans">
            Inicie um novo rascunho de orçamento.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="bg-card/70 border-card-border backdrop-blur-sm shadow-sm overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
                <CardTitle className="text-lg">Dados Principais</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">

                <div className="space-y-2">
                  <Label htmlFor="select-customer">Cliente <span aria-hidden="true">*</span></Label>
                  <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        id="select-customer"
                        aria-required="true"
                        aria-invalid={!!form.formState.errors.customerId}
                        aria-describedby={form.formState.errors.customerId ? "customer-error" : undefined}
                        className={`w-full justify-between bg-background ${!selectedCustomer ? "text-muted-foreground" : ""}`}
                        data-testid="button-select-customer"
                      >
                        {selectedCustomer ? `${selectedCustomer.erp_code} - ${selectedCustomer.corporate_name}` : "Selecionar cliente..."}
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
                          id="customer-search"
                          aria-label="Buscar cliente"
                          placeholder="Nome, CNPJ ou código..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="bg-background"
                          data-testid="input-customer-search"
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
                                form.setValue('customerId', c.id);
                                form.clearErrors('customerId');
                                setCustomerDialogOpen(false);
                              }}
                              data-testid={`customer-option-${c.id}`}
                            >
                              <div className="font-semibold text-sm">{c.corporate_name}</div>
                              <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                                <span className="font-mono-brand">Cód: {c.erp_code}</span>
                                <span>{c.cnpj_cpf}</span>
                                <span>{c.city}/{c.state}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  {form.formState.errors.customerId && (
                    <p id="customer-error" role="alert" className="text-sm font-medium text-destructive">{form.formState.errors.customerId.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="paymentTermId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Condição de Pagamento</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-background" aria-required="true" data-testid="select-payment-term">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {paymentTermsPage?.items.map(pt => (
                              <SelectItem key={pt.id} value={pt.id}>{pt.description}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="carrierId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transportadora (Opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-background" data-testid="select-carrier">
                              <SelectValue placeholder="Sem transportadora" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Sem transportadora</SelectItem>
                            {carriersPage?.items.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <Card className="md:col-span-8 bg-card/70 border-card-border backdrop-blur-sm shadow-sm">
                <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
                  <CardTitle className="text-lg">Observações</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Notas internas ou para o cliente..."
                            className="min-h-[120px] bg-background resize-none"
                            {...field}
                            data-testid="input-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="md:col-span-4 bg-card/70 border-card-border backdrop-blur-sm shadow-sm">
                <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
                  <CardTitle className="text-lg">Descontos (%)</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {[1, 2, 3, 4].map((num) => (
                    <FormField
                      key={num}
                      control={form.control}
                      name={`discount${num}` as any}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-4 space-y-0">
                          <FormLabel className="w-16 text-muted-foreground font-mono-brand text-xs uppercase">Desc {num}</FormLabel>
                          <div className="flex-1">
                            <FormControl>
                              <Input
                                type="text"
                                className="bg-background text-right font-mono-brand"
                                {...field}
                                data-testid={`input-discount-${num}`}
                              />
                            </FormControl>
                            <FormMessage className="mt-1 text-xs" />
                          </div>
                        </FormItem>
                      )}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => setLocation('/orders')} data-testid="button-cancel">
                Cancelar
              </Button>
              <Button type="submit" disabled={createOrder.isPending} data-testid="button-submit">
                {createOrder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Criar Rascunho
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AppShell>
  );
}
