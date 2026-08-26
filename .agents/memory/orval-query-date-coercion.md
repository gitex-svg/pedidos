---
name: Orval query date coercion
description: Why date must remain enabled in Orval's query coercion configuration.
---

Keep `date` enabled for query-parameter coercion in the Orval Zod generator configuration when `useDates` is enabled.

**Why:** Without query-date coercion, OpenAPI `date-time` query parameters generate as `z.date()`. That rejects the ISO string actually sent in an HTTP URL, even though the runtime route and React client correctly use a string.

**How to apply:** After changing any query `date-time` contract or Orval settings, regenerate clients and verify the generated query schema parses an offset ISO date-time string into the correct instant.