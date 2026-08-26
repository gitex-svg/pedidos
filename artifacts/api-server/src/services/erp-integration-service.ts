import {
  db,
  integrationLogs,
  orderItems,
  orders,
  orderStatusHistory,
} from "@workspace/db";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";

export type ErpOrderStatus = "EM_ANALISE" | "APROVADO" | "FECHADO" | "FATURADO" | "REPROVADO";

export class ErpOrderError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "ErpOrderError";
  }
}

type Operation = {
  correlationId: string;
  endpoint: string;
  method: string;
};

function summary(row: any) {
  return {
    id: row.id,
    internal_number: row.internalNumber,
    submitted_at: row.submittedAt,
    representative_erp_code: row.representativeErpCodeSnapshot,
    customer_erp_code: row.customerErpCodeSnapshot,
    gross_total: row.grossTotal,
    net_total: row.netTotal,
  };
}

function itemContract(item: typeof orderItems.$inferSelect) {
  return {
    id: item.id,
    product_erp_id: item.productErpIdSnapshot,
    group_code: item.groupCode,
    type_code: item.typeCode,
    product_code: item.productCode,
    reference_code: item.referenceCode,
    product_code_snapshot: item.productCodeSnapshot,
    description_snapshot: item.descriptionSnapshot,
    packaging_snapshot: item.packagingSnapshot,
    width_snapshot: item.widthSnapshot,
    color_snapshot: item.colorSnapshot,
    quantity: item.quantity,
    suggested_unit_price: item.suggestedUnitPrice,
    suggested_price_origin: item.suggestedPriceOrigin,
    suggested_price_table_erp_code: item.suggestedPriceTableErpCode,
    effective_unit_price: item.effectiveUnitPrice,
    effective_price_origin: item.effectivePriceOrigin,
    is_special_price: item.isSpecialPrice,
    special_unit_price: item.specialUnitPrice,
    discount1: item.discount1,
    discount2: item.discount2,
    discount3: item.discount3,
    discount4: item.discount4,
    discounts_applied: item.discountsApplied,
    net_unit_price: item.netUnitPrice,
    gross_total: item.grossTotal,
    net_total: item.netTotal,
  };
}

async function log(client: any, operation: Operation, values: {
  status: "SUCCESS" | "ERROR";
  entityId?: string;
  externalId?: string | null;
  errorMessage?: string | null;
  updated?: number;
  ignored?: number;
  errors?: number;
  errorDetails?: unknown;
}) {
  await client.insert(integrationLogs).values({
    correlationId: operation.correlationId,
    entity: "orders",
    endpoint: operation.endpoint,
    method: operation.method,
    status: values.status,
    entityId: values.entityId,
    externalId: values.externalId ?? null,
    errorMessage: values.errorMessage ?? null,
    received: 1,
    updated: values.updated ?? 0,
    ignored: values.ignored ?? 0,
    errors: values.errors ?? 0,
    errorDetails: values.errorDetails ?? null,
  });
}

export class DbErpOrderService {
  async listSubmitted(input: { page: number; pageSize: number }) {
    const where = and(eq(orders.internalStatus, "SUBMITTED"), isNull(orders.erpSyncedAt));
    const [rows, totals] = await Promise.all([
       db.select().from(orders)
        .where(where)
        .orderBy(asc(orders.submittedAt), asc(orders.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db.select({ value: count() }).from(orders).where(where),
    ]);
    const totalItems = totals[0]?.value ?? 0;
    return {
      items: rows.map(summary),
      page: input.page,
      page_size: input.pageSize,
      total_items: totalItems,
      total_pages: Math.ceil(totalItems / input.pageSize),
    };
  }

  async detail(id: string) {
     const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, id), eq(orders.internalStatus, "SUBMITTED")));
     if (!order) throw new ErpOrderError("ORDER_NOT_FOUND");
    const items = await db.select().from(orderItems)
      .where(eq(orderItems.orderId, id))
      .orderBy(asc(orderItems.createdAt), asc(orderItems.id));
    return {
       id: order.id,
       internal_number: order.internalNumber,
       created_at: order.createdAt,
       submitted_at: order.submittedAt,
       representative_erp_code: order.representativeErpCodeSnapshot,
       customer_erp_code: order.customerErpCodeSnapshot,
       payment_term_erp_code: order.paymentTermErpCodeSnapshot,
       carrier_erp_code: order.carrierErpCodeSnapshot,
       notes: order.notes,
       discount1: order.discount1,
       discount2: order.discount2,
       discount3: order.discount3,
       discount4: order.discount4,
       gross_total: order.grossTotal,
       net_total: order.netTotal,
       erp_order_number: order.erpOrderNumber,
       erp_import_id: order.erpImportId,
       erp_synced_at: order.erpSyncedAt,
       erp_status: order.erpStatus,
      items: items.map(itemContract),
    };
  }

  async confirm(id: string, input: {
    erpOrderNumber: string;
    erpImportId?: string;
    status?: ErpOrderStatus;
    sourceUpdatedAt: Date;
  }, operation: Operation) {
    try {
      return await db.transaction(async tx => {
        await tx.execute(sql`select id from orders where id = ${id} for update`);
        const [order] = await tx.select().from(orders).where(eq(orders.id, id));
        if (!order) throw new ErpOrderError("ORDER_NOT_FOUND");
        if (order.internalStatus !== "SUBMITTED") throw new ErpOrderError("ORDER_NOT_SUBMITTED");
        if (order.erpOrderNumber && order.erpOrderNumber !== input.erpOrderNumber) {
          throw new ErpOrderError("ERP_ORDER_NUMBER_CONFLICT");
        }
        if (order.erpImportId && order.erpImportId !== (input.erpImportId ?? null)) {
          throw new ErpOrderError("ERP_IMPORT_ID_CONFLICT");
        }

        const alreadyImported = order.erpSyncedAt !== null;
        const statusIsStale = order.erpLastStatusAt !== null
          && input.sourceUpdatedAt.getTime() <= order.erpLastStatusAt.getTime();
        const statusChanges = input.status !== undefined && !statusIsStale && input.status !== order.erpStatus;
        const now = new Date();
        await tx.update(orders).set({
          erpOrderNumber: input.erpOrderNumber,
          erpImportId: input.erpImportId ?? order.erpImportId,
          erpSyncedAt: order.erpSyncedAt ?? now,
          ...(input.status !== undefined && !statusIsStale
            ? { erpStatus: input.status, erpLastStatusAt: input.sourceUpdatedAt }
            : {}),
          updatedAt: alreadyImported && !statusChanges ? order.updatedAt : now,
        }).where(eq(orders.id, id));
        if (statusChanges) {
          await tx.insert(orderStatusHistory).values({
            orderId: id,
            statusType: "ERP",
            previousStatus: order.erpStatus,
            newStatus: input.status!,
            source: "ERP",
            correlationId: operation.correlationId,
            sourceUpdatedAt: input.sourceUpdatedAt,
          });
        }
        await log(tx, operation, {
          status: "SUCCESS",
          entityId: id,
          externalId: input.erpOrderNumber,
          updated: alreadyImported && !statusChanges ? 0 : 1,
          ignored: alreadyImported && !statusChanges ? 1 : 0,
        });
        return {
          correlation_id: operation.correlationId,
          result: alreadyImported && !statusChanges ? "ignored" : "updated",
          reason: alreadyImported && !statusChanges ? "ALREADY_CONFIRMED" : undefined,
          erp_order_number: input.erpOrderNumber,
          erp_import_id: input.erpImportId ?? order.erpImportId,
          erp_synced_at: order.erpSyncedAt ?? now,
          erp_status: statusChanges ? input.status! : order.erpStatus,
        };
      });
    } catch (error: any) {
      if (error?.code === "23505" && error?.constraint === "orders_erp_import_id_unique") {
        throw new ErpOrderError("ERP_IMPORT_ID_CONFLICT");
      }
      throw error;
    }
  }

  async updateStatus(id: string, input: {
    status: ErpOrderStatus;
    sourceUpdatedAt: Date;
  }, operation: Operation) {
    return db.transaction(async tx => {
      await tx.execute(sql`select id from orders where id = ${id} for update`);
      const [order] = await tx.select().from(orders).where(eq(orders.id, id));
      if (!order) throw new ErpOrderError("ORDER_NOT_FOUND");
      if (order.internalStatus !== "SUBMITTED") throw new ErpOrderError("ORDER_NOT_SUBMITTED");
      if (order.erpLastStatusAt && input.sourceUpdatedAt.getTime() <= order.erpLastStatusAt.getTime()) {
        await log(tx, operation, {
          status: "SUCCESS", entityId: id, externalId: order.erpOrderNumber,
          ignored: 1, errorMessage: "STALE_SOURCE_VERSION",
        });
        return { correlation_id: operation.correlationId, result: "ignored", reason: "STALE_SOURCE_VERSION", erp_status: order.erpStatus };
      }
      if (order.erpStatus === input.status) {
        await tx.update(orders).set({ erpLastStatusAt: input.sourceUpdatedAt }).where(eq(orders.id, id));
        await log(tx, operation, {
          status: "SUCCESS", entityId: id, externalId: order.erpOrderNumber, ignored: 1,
        });
        return { correlation_id: operation.correlationId, result: "ignored", reason: "STATUS_UNCHANGED", erp_status: order.erpStatus };
      }
      await tx.update(orders).set({
        erpStatus: input.status,
        erpLastStatusAt: input.sourceUpdatedAt,
        updatedAt: new Date(),
      }).where(eq(orders.id, id));
      await tx.insert(orderStatusHistory).values({
        orderId: id,
        statusType: "ERP",
        previousStatus: order.erpStatus,
        newStatus: input.status,
        source: "ERP",
        correlationId: operation.correlationId,
        sourceUpdatedAt: input.sourceUpdatedAt,
      });
      await log(tx, operation, {
        status: "SUCCESS", entityId: id, externalId: order.erpOrderNumber, updated: 1,
      });
      return { correlation_id: operation.correlationId, result: "updated", erp_status: input.status };
    });
  }

  async logFailure(operation: Operation, id: string | undefined, error: ErpOrderError) {
    await log(db, operation, {
      status: "ERROR",
      entityId: id,
      errors: 1,
      errorMessage: error.code,
      errorDetails: { code: error.code },
    });
  }
}

export const erpOrderService = new DbErpOrderService();