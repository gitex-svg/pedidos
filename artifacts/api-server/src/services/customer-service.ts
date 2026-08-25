export interface CustomerService {
  findAccessibleById(customerId: string, representativeId: string): Promise<unknown | null>;
}