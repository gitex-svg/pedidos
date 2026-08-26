/** Exact fixed-point decimal helpers. Values are never converted to JS number. */
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function parse(value: string, scale: number): bigint {
  if (!DECIMAL.test(value)) throw new Error(`Invalid decimal: ${value}`);
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale) throw new Error(`Too many decimal places: ${value}`);
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}

function format(value: bigint, scale: number): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const divisor = 10n ** BigInt(scale);
  return `${sign}${absolute / divisor}.${(absolute % divisor).toString().padStart(scale, "0")}`;
}

/** ROUND_HALF_UP, including for non-negative money values used by orders. */
export function roundHalfUp(value: bigint, fromScale: number, toScale: number): bigint {
  if (toScale >= fromScale) return value * 10n ** BigInt(toScale - fromScale);
  const factor = 10n ** BigInt(fromScale - toScale);
  const sign = value < 0n ? -1n : 1n;
  const absolute = value < 0n ? -value : value;
  return sign * ((absolute + factor / 2n) / factor);
}

export function multiplyDecimal(left: string, leftScale: number, right: string, rightScale: number, outputScale: number): string {
  const product = parse(left, leftScale) * parse(right, rightScale);
  return format(roundHalfUp(product, leftScale + rightScale, outputScale), outputScale);
}

export function sumMoney(values: readonly string[]): string {
  return format(values.reduce((total, value) => total + parse(value, 2), 0n), 2);
}

export class ExactDiscountService {
  /**
   * Applies D1..D4 in cascade. Each discount has four decimal places and the
   * returned unit price is explicitly ROUND_HALF_UP to six decimal places.
   */
  applyCascade(unitPrice: string, discounts: readonly string[]): string {
    let numerator = parse(unitPrice, 6);
    for (const discount of discounts) {
      const percentage = parse(discount, 4);
      if (percentage < 0n || percentage > 1000000n) throw new Error("Discount must be between 0 and 100");
      // Keep the whole cascade as a rational number.  Each multiplier is
      // (1_000_000 - percentage) / 1_000_000; no intermediate rounding.
      numerator *= 1000000n - percentage;
    }
    // Input scale 6 plus four scale-6 multipliers; round only the final net unit.
    return format(roundHalfUp(numerator, 30, 6), 6);
  }
}

export const discountService = new ExactDiscountService();
export interface DiscountService { applyCascade(unitPrice: string, discounts: readonly string[]): string; }