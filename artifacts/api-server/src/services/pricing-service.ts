export interface PriceContext {
  customerId: string;
  representativeId: string;
  productId: string;
}

export interface PricingService {
  resolveSuggestedPrice(context: PriceContext): Promise<{
    unitPrice: string;
    origin: "CUSTOMER" | "REPRESENTATIVE" | "STANDARD";
  }>;
}