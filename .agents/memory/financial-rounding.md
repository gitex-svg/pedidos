---
name: Arredondamento financeiro
description: Regras obrigatórias de precisão e arredondamento para itens e totais de pedidos.
---

Preços unitários e snapshots unitários preservam até 6 casas em `NUMERIC(18,6)`. Quantidades usam `NUMERIC(18,4)`, descontos usam `NUMERIC(7,4)` e totais monetários de itens e pedidos usam obrigatoriamente `NUMERIC(20,2)`.

O backend deve preservar precisão decimal nas operações intermediárias e arredondar somente o total final de cada item para duas casas, usando uma política decimal centralizada e explicitamente documentada. Não usar ponto flutuante JavaScript ou `Math.round()` em valores monetários críticos.

O total do pedido é a soma dos totais dos itens já arredondados:

- `order.gross_total = SUM(order_items.gross_total)`
- `order.net_total = SUM(order_items.net_total)`

Não recalcular o total do pedido a partir de valores intermediários não arredondados.

Para preço especial, o preço efetivo e líquido são o preço especial, descontos não se aplicam e os totais bruto e líquido do item são o preço especial multiplicado pela quantidade, arredondado para duas casas.

**Why:** Somar valores internos antes de arredondar produz divergências contábeis em relação aos itens exibidos e armazenados. Produtos também podem ter preços unitários legítimos com mais de duas casas.

**How to apply:** Na implementação de pedidos, centralizar a aritmética decimal, definir o modo de arredondamento e cobrir preços com seis casas, quatro descontos, quantidade, preço especial e a soma dos itens arredondados. Casos mínimos: `2.994300 × 3 = 8.98`, `1.667000 × 3 = 5.00` e pedido `8.98 + 5.00 = 13.98`.