export interface OrderService {
  submit(orderId: string, actorUserId: string): Promise<void>;
}