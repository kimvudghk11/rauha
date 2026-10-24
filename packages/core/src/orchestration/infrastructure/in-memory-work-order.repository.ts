import type { WorkOrder } from '../domain/work-order.js';
import type { WorkOrderRepository } from '../domain/work-order.repository.js';

export class InMemoryWorkOrderRepository implements WorkOrderRepository {
  private readonly orders = new Map<string, WorkOrder>();

  async findById(id: string): Promise<WorkOrder | null> {
    return this.orders.get(id) ?? null;
  }

  async save(order: WorkOrder): Promise<void> {
    this.orders.set(order.id, order);
  }
}
