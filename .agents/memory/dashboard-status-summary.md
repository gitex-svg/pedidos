---
name: Resumo do dashboard
description: Regra de agrupamento dos status internos e ERP nos cinco contadores exibidos ao usuário.
---

Os contadores do dashboard devem formar grupos mutuamente exclusivos: rascunhos
vêm de `DRAFT`; enviados abrangem pedidos submetidos sem retorno final do ERP
(incluindo `EM_ANALISE`); aprovados abrangem `APROVADO` e `FECHADO`; faturados e
rejeitados correspondem aos respectivos status ERP.

**Why:** A interface apresenta cinco cartões e calcula o total pela soma deles.
Agrupar `FECHADO` com aprovados evita omitir pedidos já concluídos pelo ERP,
mantendo a carteira coerente sem criar uma sexta categoria.

**How to apply:** Ao acrescentar status ERP ou alterar os cartões do dashboard,
revise o mapeamento para que cada pedido submetido pertença a exatamente um
grupo exibido.