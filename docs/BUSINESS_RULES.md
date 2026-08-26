## Sincronização e paginação

- O ERP é a fonte dos cadastros e versões anteriores ou iguais são ignoradas.
- Cada item de lote recebe resultado `created`, `updated`, `ignored` ou `error`.
- Consultas usam `pageSize` (20 por padrão, máximo efetivo 100); `limit` é legado.

# Regras de negócio

## Preços

Hierarquia obrigatória: `CUSTOMER` → `REPRESENTATIVE` → `STANDARD`.

Para cliente e produto ativos, procura-se primeiro uma tabela CUSTOMER do
cliente; sem item aplicável, uma tabela REPRESENTATIVE do representante
associado ao cliente; por fim, uma tabela STANDARD. O frontend não informa o
representante. A origem retornada é exatamente `CUSTOMER`, `REPRESENTATIVE` ou
`STANDARD`.

Uma tabela é aplicável quando está ativa e `valid_from` é nulo ou menor/igual à
referência, e `valid_until` é nulo ou maior/igual à referência. Os dois limites
são inclusivos. Sem referência explícita, usa-se a data/hora atual do servidor.

Se nenhum nível contiver preço, o resultado é `found=false`; zero nunca
representa ausência. Se duas ou mais tabelas aplicáveis no mesmo nível
contiverem o produto, há ambiguidade e a API retorna `409`, sem selecionar por
ordem ou acaso. Um preço em nível prioritário vence os níveis inferiores.

Preço é string decimal na fronteira e `NUMERIC(18,6)` no PostgreSQL. A entrada
permite zeros à esquerda e de uma a seis casas; a canonicalização preserva a
parte inteira e completa a fração, e a saída sempre possui seis casas. Não há
conversão monetária para `number` JavaScript.

Tabelas e itens são sincronizados pelo ERP, em lotes de até 500 itens, por
códigos externos. Aplicam-se UPSERT idempotente, `source_updated_at`,
`correlation_id`, processamento parcial (`207`) e inativação lógica. As razões
estáveis incluem `CUSTOMER_NOT_FOUND`, `PRODUCT_NOT_FOUND` e
`PRICE_TABLE_NOT_FOUND`; UUID interno não faz parte da integração.

## Descontos e pedidos

Pedidos, itens de pedido, descontos em cascata e preço especial são regras
futuras e não são implementados na Fase 3.

## Segurança

- `ADMIN` pode administrar todos os dados.
- `REPRESENTATIVE` acessa somente clientes e pedidos vinculados ao seu representante.
- O backend deriva identidade e escopo da sessão; não confia em IDs de representante enviados pelo navegador.

## Produto ERP

Grupo, tipo, produto e referência são textos e preservam zeros à esquerda. A combinação terá índice composto, sem `UNIQUE` até confirmação do ERP.

## Catálogos ERP — Fase 2

- O ERP é a fonte de verdade para representantes, clientes, produtos, condições
  de pagamento e transportadoras. A web apenas consulta esses dados; não há
  manutenção manual pelo navegador.
- Cada entrada de sincronização faz UPSERT idempotente por sua chave externa:
  `erp_code` para representantes, clientes, condições e transportadoras; e
  `erp_id` para produtos.
- `source_updated_at` define a precedência temporal. Eventos mais antigos que o
  estado persistido são ignorados, mesmo que sejam reenviados.
- `active=false` inativa logicamente o cadastro; não há exclusão física pelo
  fluxo de sincronização.
- Ao atualizar um representante, o vínculo local `user_id` é preservado. O ERP
  não pode desvincular ou trocar o usuário representante por esse endpoint.
- Ao sincronizar um cliente, `representative_erp_code` deve resolver um
  representante cadastrado; falha nessa resolução é erro daquele item.
- Lotes têm máximo de 500 itens e validação por item. Itens válidos podem ser
  processados quando outros falham; nesse caso a resposta é `207
  Multi-Status`, com erros por índice/chave externa.
- Toda sincronização pode trazer `correlation_id`, utilizado nos logs de
  integração e devolvido na resposta para rastreabilidade.

## Escopo explicitamente fora da Fase 3

- Criação, edição, envio ou aprovação de pedidos e orçamentos e seus itens.
- Descontos, preço especial, impostos, fretes ou condições comerciais em pedidos.
- Integração de pedidos, status comerciais, faturamento ou retorno operacional
  do ERP.
- Operações de escrita de catálogo na interface web.