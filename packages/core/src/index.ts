export { DomainError } from './shared/domain-error.js';

// orchestration
export { Difficulty, type DifficultyGrade, type DifficultySignals } from './orchestration/domain/difficulty.js';
export { MODEL_ID, type Assignment, type ModelTier, type TeamRole } from './orchestration/domain/team.js';
export { TestRun, type FailureKind } from './orchestration/domain/test-run.js';
export { WritePolicy } from './orchestration/domain/write-policy.js';
export { ToolRisk, type ToolDecision, type ToolVerdict } from './orchestration/domain/tool-risk.js';
export {
  Verification,
  VerificationVerdict,
  type CheckName,
  type CheckResult,
  type CheckStatus,
  type CheckVerdict,
} from './orchestration/domain/verification.js';
export { RunScope, type ScopeDecision, type StopReason } from './orchestration/domain/run-scope.js';
export { WorkspaceState } from './orchestration/domain/workspace-state.js';
export { relativeToRoot, isInsideRoot, toPosixPath } from './shared/path-pattern.js';
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
export { MinimalLoopService, type MinimalLoopDeps, type RunOutcome } from './orchestration/application/minimal-loop.service.js';
export {
  IntakeDto,
  type AcceptanceCriterion,
  type AcceptanceKind,
  type Assumption,
  type SettledAssumptionChoice,
} from './orchestration/application/dto/intake.dto.js';
export {
  ExplanationDto,
  MemberReportDto,
  EXPLANATION_TOKEN_BUDGET,
  type Decision,
  type ReadingStop,
} from './orchestration/application/dto/explanation.dto.js';
export { VitestReportDto } from './orchestration/application/dto/vitest-report.dto.js';
export { ReadingGuideDto, type ReadingGuideProps, type RunStopReason, type SettledAssumption } from './orchestration/application/dto/reading-guide.dto.js';
export {
  RoleSettingsDto,
  type Effort,
  type MemberRole,
  type RoleSetting,
} from './orchestration/application/dto/role-settings.dto.js';
export { INTAKE_SCHEMA, TESTER_REPORT_SCHEMA, IMPLEMENTER_REPORT_SCHEMA } from './orchestration/application/dto/schemas.js';
export type * from './orchestration/application/ports.js';
export { InMemoryWorkOrderRepository } from './orchestration/infrastructure/in-memory-work-order.repository.js';

// profile
export { Profile, type SyncTarget } from './profile/domain/profile.js';
export { MatchRule, type WorkspaceContext } from './profile/domain/match-rule.js';
export { ProfileBook, type ProfileRequest, type Resolution, type ResolutionSource } from './profile/domain/profile-book.js';
export { ProfileConfigDto } from './profile/application/dto/profile-config.dto.js';

// infrastructure (CLI가 조립한다)
export { AgentSdkTeamMember, type AgentSdkTeamMemberOptions } from './orchestration/infrastructure/agent-sdk-team-member.js';
export { PromptLibrary } from './orchestration/infrastructure/prompt-library.js';
export { GitWorkspace } from './orchestration/infrastructure/git-workspace.js';
export { NodeChecks, NodeProject, type PackageManager } from './orchestration/infrastructure/node-checks.js';
export { FileRunLog } from './orchestration/infrastructure/file-run-log.js';
export {
  createToolGuard,
  type PermissionAnswer,
  type PermissionAsker,
  type PermissionRequest,
  type ToolGuardOptions,
} from './orchestration/infrastructure/tool-guard.js';
export { loadProfileConfig } from './profile/infrastructure/config-file.js';

// memory
export {
  recallBlock,
  WorkMemory,
  type MemoryEdge,
  type MemoryEdgeKind,
  type MemoryEntry,
  type MemoryNode,
  type MemoryNodeKind,
  type Recall,
} from './memory/domain/work-memory.js';
export type { MemoryPort } from './memory/application/memory.port.js';
export { projectMemoryFile, SqliteMemory } from './memory/infrastructure/sqlite-memory.js';
