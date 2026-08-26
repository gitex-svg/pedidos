---
name: OpenAPI fechado e composição
description: Regra para schemas fechados que reutilizam propriedades em contratos OpenAPI.
---

Não componha com `allOf` dois objetos que usam `additionalProperties: false`
quando cada parte declara apenas seu próprio subconjunto de propriedades.
Prefira um objeto fechado e achatado para payloads e respostas.

**Why:** Validadores OpenAPI estritos aplicam o fechamento a cada componente.
Um payload que possui as propriedades requeridas pelas duas partes acaba
rejeitado por ambas, mesmo quando geradores específicos produzem tipos que
parecem funcionar.

**How to apply:** Ao adicionar payloads versionados ou respostas que estendem
outro schema, achate propriedades e `required` se o resultado precisar rejeitar
campos desconhecidos. Regenere clientes e validadores depois da alteração.