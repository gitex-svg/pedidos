export interface ProductService {
  findByErpIdentity(identity: {
    groupCode: string;
    typeCode: string;
    productCode: string;
    referenceCode: string;
  }): Promise<unknown | null>;
}