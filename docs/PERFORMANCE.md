# Phase 6 — Performance and technical homologation

## Scope and safety

`@workspace/api-server` provides a reproducible, **local-only** benchmark:

```sh
PERF_ALLOW_LOCAL=1 PERF_ITERATIONS=10 pnpm --filter @workspace/api-server performance:phase6 \
  | tee phase6-results.json
```

It refuses to run when `NODE_ENV=production`, requires the explicit
`PERF_ALLOW_LOCAL=1` acknowledgement, starts its own server bound to
`127.0.0.1`, and does not accept a target URL. It creates a timestamped,
unique fixture (representative, customer, product, price, orders, and
credential), then removes it in `finally`, including order items and
integration logs. Run it only against an approved non-production database.

The measured path includes login, customer and product search, price
resolution, order create/add-item/submit, and ERP submitted-queue retrieval.
The JSON output contains per-operation request count, p50, p95, sequential
throughput, error rate, and PostgreSQL `EXPLAIN (FORMAT JSON)` evidence for
customer search and the ERP queue. It is intentionally sequential: it is a
repeatable functional homologation baseline, not a concurrency capacity
claim. `PERF_ITERATIONS` is limited to 1–100 to bound fixture growth.

Do not record invented values. Save the emitted JSON unchanged and copy its
values into the results template below. State database size, machine/runtime,
connection configuration, commit, and iteration count with every run; these
materially affect latency and plans.

## Recorded baseline — 2026-08-26

The main-agent benchmark run is recorded in
[`PERFORMANCE-results-2026-08-26.json`](./PERFORMANCE-results-2026-08-26.json).
It used `NODE_ENV=test`, a server bound to localhost, non-production Replit
PostgreSQL, and 10 sequential iterations. Every measured operation had an
error rate of `0`. This is a local sequential baseline only; it makes no
production-scale latency, throughput, concurrency, or capacity claim.

| Operation | Requests | p50 ms | p95 ms | Requests/s |
| --- | ---: | ---: | ---: | ---: |
| Login | 10 | 94.823 | 165.757 | 9.905 |
| Customer search | 10 | 5.143 | 30.179 | 120.668 |
| Product search | 10 | 4.518 | 10.261 | 179.961 |
| Pricing resolve | 10 | 6.335 | 13.467 | 136.623 |
| Order create | 10 | 12.195 | 29.094 | 68.433 |
| Order add item | 10 | 16.842 | 33.941 | 53.963 |
| Order submit | 10 | 17.305 | 24.634 | 55.064 |
| ERP queue | 1 | 3.767 | 3.767 | 265.496 |

The customer and ERP-queue plans used sequential scans with total costs
`1.11` and `1.09`, respectively, on the intentionally tiny isolated fixture.
That is expected at this dataset size and is not evidence to add indexes.

### Representative data profile

The tool's isolated fixture is deliberately small so that cleanup is certain:
one credential-linked representative, one owned customer, one active product,
one customer price table/item, and one complete submitted order per iteration.
The values use the same six-decimal price, quantity, payment term, carrier,
and submit workflow as the financial regression cases. It is suitable for
endpoint-contract and baseline-latency homologation.

For a capacity result, prepare a separately approved **non-production**
database with an anonymized, production-shaped catalog (customer ownership
distribution, active/inactive records, price-table scopes/validity periods,
and submitted queue age distribution). Do not copy credentials, CNPJ/CPF, or
identifying notes. Run this same tool with a fixed iteration count, record row
counts and the exact anonymization procedure in the results template, then
retain the emitted plan JSON. This distinguishes a reproducible baseline from
a claim about production-scale capacity.

## Query-plan review and index policy

Existing schema indexes cover the demonstrated access paths:

* `customers_representative_idx`
* `orders_submitted_queue_idx`

The benchmark records actual planner output but does not use `ANALYZE`; it
therefore has no destructive side effects and does not fabricate a plan
quality conclusion. An index may be proposed only when a captured,
representative `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` shows the relevant
slow path at realistic data volume, with a documented before/after comparison
and write-cost review. No Phase 6 index is added merely by assumption.

For a controlled staging-only deep review, use the exact query emitted by the
benchmark with the captured fixture identifiers:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id FROM orders
WHERE internal_status = 'SUBMITTED' AND erp_synced_at IS NULL
ORDER BY submitted_at, id LIMIT 100;
```

## Functional regression evidence

The API integration suite covers fixed-point totals (`2.994300 × 3 = 8.98`,
`1.667000 × 3 = 5.00`, order total `13.98`), cascaded discounts, special
prices, representative isolation, server-owned-field/mass-assignment
rejection, version conflicts, submitted-order immutability, ERP confirmation
idempotency/conflicts, and stale/equal ERP event handling. ERP status
transitions must be exercised for `EM_ANALISE`, `APROVADO`, `FECHADO`,
`FATURADO`, and `REPROVADO`.

## Results template

Copy [`docs/PERFORMANCE-results.template.json`](./PERFORMANCE-results.template.json)
for each approved run. Fields marked `null` must be filled from an actual
benchmark execution or remain null; they must never be estimated.