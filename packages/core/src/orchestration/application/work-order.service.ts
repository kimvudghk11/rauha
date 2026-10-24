import { DomainError } from '../../shared/domain-error.js';
import type { WorkOrder } from '../domain/work-order.js';
import type { WorkOrderRepository } from '../domain/work-order.repository.js';
import type { OpenWorkOrderDto } from './dto/open-work-order.dto.js';
import { WorkOrderStatusDto } from './dto/work-order-status.dto.js';
import type { WorkReportDto } from './dto/work-report.dto.js';

/**
 * 얇은 조정자. 규칙은 엔티티와 DTO 메서드에 있고, 서비스는
 * 불러오기 → 메서드 호출 → 저장 순서만 책임진다.
 */
export class WorkOrderService {
  constructor(
    private readonly repository: WorkOrderRepository,
    private readonly newId: () => string,
  ) {}

  async open(dto: OpenWorkOrderDto): Promise<WorkOrderStatusDto> {
    const order = dto.toEntity(this.newId());
    await this.repository.save(order);
    return WorkOrderStatusDto.fromEntity(order);
  }

  async submitImplementation(id: string, report: WorkReportDto): Promise<WorkOrderStatusDto> {
    const order = await this.load(id);
    order.assertDiffAllowed('implementer', report.changedFiles);
    order.recordGreen(report.toTestRun(), report.toFailureNote());
    await this.repository.save(order);
    return WorkOrderStatusDto.fromEntity(order);
  }

  async status(id: string): Promise<WorkOrderStatusDto> {
    return WorkOrderStatusDto.fromEntity(await this.load(id));
  }

  private async load(id: string): Promise<WorkOrder> {
    const order = await this.repository.findById(id);
    if (!order) throw new DomainError('NOT_FOUND', `업무 ${id}를 찾을 수 없습니다.`);
    return order;
  }
}
