export interface DiscountService {
  applyCascade(unitPrice: string, discounts: readonly string[]): string;
}