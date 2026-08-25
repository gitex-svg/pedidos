export interface ERPIntegrationService {
  synchronize(entity: string, externalId: string, payload: unknown): Promise<void>;
}