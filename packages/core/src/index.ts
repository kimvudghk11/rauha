export { DomainError } from './shared/domain-error.js';

// orchestration
export { Difficulty, type DifficultyGrade, type DifficultySignals } from './orchestration/domain/difficulty.js';
export { MODEL_ID, type Assignment, type ModelTier, type TeamRole } from './orchestration/domain/team.js';
export { TestRun, type FailureKind } from './orchestration/domain/test-run.js';
export { WritePolicy } from './orchestration/domain/write-policy.js';
export {
  WorkOrder,
  type HaltReason,
  type ImplementerRung,
  type ReviewVerdict,
  type ScenarioSummary,
  type Stage,
  type SupportRequest,
} from './orchestration/domain/work-order.js';
export type { WorkOrderRepository } from './orchestration/domain/work-order.repository.js';
export { OpenWorkOrderDto } from './orchestration/application/dto/open-work-order.dto.js';
export { WorkReportDto, REPORT_TOKEN_BUDGET, type ReportResult } from './orchestration/application/dto/work-report.dto.js';
export { WorkOrderStatusDto } from './orchestration/application/dto/work-order-status.dto.js';
export { WorkOrderService } from './orchestration/application/work-order.service.js';
export { InMemoryWorkOrderRepository } from './orchestration/infrastructure/in-memory-work-order.repository.js';

// profile
export { Profile, type SyncTarget } from './profile/domain/profile.js';
export { MatchRule, type WorkspaceContext } from './profile/domain/match-rule.js';
export { ProfileBook, type ProfileRequest, type Resolution, type ResolutionSource } from './profile/domain/profile-book.js';
export { ProfileConfigDto } from './profile/application/dto/profile-config.dto.js';
