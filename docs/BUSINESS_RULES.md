# Regras de negócio

## Preços

Hierarquia obrigatória: `CUSTOMER` → `REPRESENTATIVE` → `STANDARD`.

O item preservará `suggested_price_origin` e `effective_price_origin`. Preço especial usa origem efetiva `SPECIAL` sem apagar a origem sugerida.

## Descontos

Descontos 1 a 4 são aplicados em cascata. Itens com preço especial não recebem os descontos, mas preservam o snapshot informado na capa.

## Segurança

- `ADMIN` pode administrar todos os dados.
- `REPRESENTATIVE` acessa somente clientes e pedidos vinculados ao seu representante.
- O backend deriva identidade e escopo da sessão; não confia em IDs de representante enviados pelo navegador.

## Produto ERP

Grupo, tipo, produto e referência são textos e preservam zeros à esquerda. A combinação terá índice composto, sem `UNIQUE` até confirmação do ERP.