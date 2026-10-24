import { MODEL_ID, type ModelTier, type TeamRole } from '../../domain/team.js';
import type { Stage, WorkOrder } from '../../domain/work-order.js';

/** CLI의 /status 가 보여주는 읽기 전용 뷰. */
export class WorkOrderStatusDto {
  private constructor(
    readonly id: string,
    readonly title: string,
    readonly grade: string,
    readonly stage: Stage,
    readonly next: { role: TeamRole; tier: ModelTier; model: string } | null,
    readonly waitingFor: string | null,
  ) {}

  static fromEntity(order: WorkOrder): WorkOrderStatusDto {
    const next = order.nextAssignment();
    return new WorkOrderStatusDto(
      order.id,
      order.title,
      order.difficulty.grade,
      order.stage,
      next ? { ...next, model: MODEL_ID[next.tier] } : null,
      order.haltReason,
    );
  }

  toStatusLine(): string {
    const head = `[${this.grade}] ${this.title} · ${this.stage}`;
    if (this.next) return `${head} · 다음: ${this.next.role}(${this.next.tier})`;
    return this.waitingFor ? `${head} · 중단: ${this.waitingFor}` : head;
  }
}
