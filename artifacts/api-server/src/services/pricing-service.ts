import {
  customers, db, priceTableItems, priceTables, products, representatives,
} from "@workspace/db";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

export class PricingEntityNotFoundError extends Error {
  constructor(public readonly entity: "CUSTOMER" | "REPRESENTATIVE" | "PRODUCT") {
    super(`${entity} not found or inactive`);
    this.name = "PricingEntityNotFoundError";
  }
}

export class AmbiguousPriceError extends Error {
  constructor(
    public readonly scope: "CUSTOMER" | "REPRESENTATIVE" | "STANDARD",
    public readonly tableIds: string[],
  ) {
    super(`More than one ${scope} price table applies to this product`);
    this.name = "AmbiguousPriceError";
  }
}

export interface ResolvePriceInput {
  customerId: string;
  productId: string;
  referenceDate?: Date;
}

export type ResolvedPrice =
  | {
      found: false;
      productId: string;
      customerId: string;
    }
  | {
      found: true;
      productId: string;
      customerId: string;
      representativeId: string;
      unitPrice: string;
      origin: "CUSTOMER" | "REPRESENTATIVE" | "STANDARD";
      priceTableId: string;
      priceTableErpCode: string;
    };

function fixedSixDecimal(value: string) {
  const [integer, fraction = ""] = value.split(".");
  return `${integer}.${fraction.padEnd(6, "0").slice(0, 6)}`;
}

export async function resolvePrice({
  customerId,
  productId,
  referenceDate = new Date(),
}: ResolvePriceInput): Promise<ResolvedPrice> {
  const [[customer], [product]] = await Promise.all([
    db.select({
      id: customers.id,
      active: customers.active,
      representativeId: customers.representativeId,
      representativeActive: representatives.active,
    }).from(customers)
      .innerJoin(representatives, eq(customers.representativeId, representatives.id))
      .where(eq(customers.id, customerId)).limit(1),
    db.select({ id: products.id, active: products.active }).from(products)
      .where(eq(products.id, productId)).limit(1),
  ]);

  if (!customer || !customer.active) throw new PricingEntityNotFoundError("CUSTOMER");
  if (!customer.representativeActive) throw new PricingEntityNotFoundError("REPRESENTATIVE");
  if (!product || !product.active) throw new PricingEntityNotFoundError("PRODUCT");

  // Priority ordering means two rows are sufficient: either they expose ambiguity at
  // the highest applicable scope, or the first row is the unique winning price.
  const candidates = await db.select({
    id: priceTables.id,
    erpCode: priceTables.erpCode,
    priceType: priceTables.priceType,
    unitPrice: priceTableItems.unitPrice,
  }).from(priceTableItems)
    .innerJoin(priceTables, eq(priceTableItems.priceTableId, priceTables.id))
    .where(and(
      eq(priceTableItems.productId, productId),
      eq(priceTableItems.active, true),
      eq(priceTables.active, true),
      or(isNull(priceTables.validFrom), lte(priceTables.validFrom, referenceDate)),
      or(isNull(priceTables.validUntil), gte(priceTables.validUntil, referenceDate)),
      or(
        and(eq(priceTables.priceType, "CUSTOMER"), eq(priceTables.customerId, customerId)),
        and(eq(priceTables.priceType, "REPRESENTATIVE"), eq(priceTables.representativeId, customer.representativeId)),
        eq(priceTables.priceType, "STANDARD"),
      ),
    ))
    .orderBy(asc(sql`case ${priceTables.priceType}
      when 'CUSTOMER' then 1 when 'REPRESENTATIVE' then 2 else 3 end`))
    .limit(2);

  if (!candidates[0]) return { found: false, productId, customerId };
  if (candidates[1]?.priceType === candidates[0].priceType) {
    throw new AmbiguousPriceError(candidates[0].priceType, [candidates[0].id, candidates[1].id]);
  }
  const winner = candidates[0];
  return {
    found: true,
    productId,
    customerId,
    representativeId: customer.representativeId,
    unitPrice: fixedSixDecimal(winner.unitPrice),
    origin: winner.priceType,
    priceTableId: winner.id,
    priceTableErpCode: winner.erpCode,
  };
}

export const pricingService = { resolvePrice };