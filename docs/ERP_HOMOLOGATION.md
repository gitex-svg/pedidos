# Homologação ERP — checklist

## Limite da evidência

**Homologação técnica simulada** cobre contrato, testes automatizados e chamadas
contra simulador/ambiente controlado. Ela não prova conectividade, credenciais,
mapeamentos ou regras do ERP real. **Homologação real** exige ERP real de
homologação, chave própria, operadores de ambos os lados e evidências
registradas. Em 2026-08-26, a suíte técnica final da API (46/46) e as validações de
contrato concluíram a preparação técnica/simulada; homologação com ERP real
continua **pendente**.

Todas as rotas abaixo usam `Authorization: Bearer <ERP_API_KEY>`. A chave não
deve aparecer em evidências. Registrar URL mascarada, data, operador,
`correlation_id`, request ID quando disponível, código HTTP e payload
sanitizado. Consulte `ERP_API.md` para payloads.

## Pré-requisitos

- [ ] Banco e aplicação de homologação independentes de produção.
- [ ] `ERP_API_KEY` exclusiva de homologação criada e configurada.
- [ ] Chave inválida retorna `401`; chave ausente impede inicialização por
  configuração validada, sem vazar valor.
- [ ] Operadores, janela, origem/destino e contatos ERP reais aprovados.
- [ ] Dados de homologação autorizados; nenhum dado demo é promovido.

## Checklist técnico/simulado — concluído na validação interna

- [x] Sincronizar representatives antes de customers; verificar criação,
  atualização, `active=false`, reenvio e `source_updated_at` antigo/igual
  (`STALE_SOURCE_VERSION`).
- [x] Sincronizar customers, products, payment terms e carriers; confirmar
  UPSERT por código externo e erro parcial `207` quando aplicável.
- [x] Validar `REPRESENTATIVE_NOT_FOUND`, `CUSTOMER_NOT_FOUND`,
  `PRODUCT_NOT_FOUND` e `PRICE_TABLE_NOT_FOUND` sem abortar itens válidos.
- [x] Sincronizar price tables STANDARD, REPRESENTATIVE e CUSTOMER e seus
  itens; confirmar preços como strings decimais, até seis casas.
- [x] Confirmar correlação: `correlation_id` informado é preservado; ausente é
  gerado e rastreável em `integration_logs`.
- [x] Criar pedido pelo representante, incluir itens e finalizar; validar
  snapshot de códigos ERP, preços, descontos, quantidade e totais.
- [x] Confirmar a fila `GET /api/v1/erp/orders/submitted` somente para
  `SUBMITTED` sem `erp_synced_at`, ordenada por `submitted_at`, `id`.
- [x] Consultar detalhe e confirmar que ele não recalcula snapshots.
- [x] Confirmar importação e verificar remoção da fila, número ERP e
  `erp_import_id` quando usado.
- [x] Repetir confirmação idêntica e obter comportamento idempotente
  `ALREADY_CONFIRMED`, sem duplicidade.
- [x] Enviar número ERP/`erp_import_id` conflitante e obter `409`, sem
  sobrescrita.
- [x] Enviar `EM_ANALISE`, `APROVADO`, `FECHADO`, `FATURADO` e, em cenário
  separado, `REPROVADO`; validar histórico e apresentação.
- [x] Enviar status antigo/igual e validar `STALE_SOURCE_VERSION`; enviar mesmo
  status com data nova e validar `STATUS_UNCHANGED`, sem histórico duplicado.
- [x] Reproduzir falha entre importação e confirmação: pedido segue disponível
  até confirmação; reprocessamento deve ser seguro.
- [x] Validar precisão: unitários `NUMERIC(18,6)`, quantidades `(18,4)` e totais
  `(20,2)` transitam como strings, sem float.

## Checklist de homologação real

- [ ] ERP real recebeu a chave exclusiva por canal seguro.
- [ ] ERP real chamou cada endpoint com seu cliente HTTP/rede reais.
- [ ] Mapeamento de códigos externos e fuso/timestamps foi aprovado pelo dono
  do ERP.
- [ ] Importação real de pedido de homologação e confirmação foram conciliadas
  dos dois lados.
- [ ] Retornos de status reais, idempotência, conflito e evento fora de ordem
  foram evidenciados.
- [ ] Responsáveis ERP e aplicação assinaram a evidência e registraram exceções.

Não marque esta seção por resultado de teste automatizado ou `curl` simulado.
