import type { WorkOrder } from './work-order.js';

/** 저장 방식(메모리, 파일, DynamoDB)은 infrastructure가 고른다. */
export interface WorkOrderRepository {
  findById(id: string): Promise<WorkOrder | null>;
  save(order: WorkOrder): Promise<void>;
}
