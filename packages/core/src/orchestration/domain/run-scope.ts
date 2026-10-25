import type { Assignment, TeamRole } from './team.js';
import type { Stage, WorkOrder } from './work-order.js';

export type StopReason = 'too-large' | 'needs-senior' | 'needs-support' | 'halted' | 'unsupported-stage';

export type ScopeDecision =
  | { readonly kind: 'continue'; readonly assignment: Assignment }
  | { readonly kind: 'complete' }
  | { readonly kind: 'stop'; readonly reason: StopReason };

/**
 * 이번 실행이 어디까지 다루는지. 1단계(최소 루프)는 Haiku 테스트 팀원과
 * Haiku 구현 주니어만 부르고, review 단계에 닿으면 완료로 본다.
 */
export class RunScope {
  private constructor(
    private readonly supported: ReadonlyMap<Stage, TeamRole>,
    private readonly completeAt: Stage,
  ) {}

  static minimalLoop(): RunScope {
    return new RunScope(
      new Map<Stage, TeamRole>([
        ['red', 'tester'],
        ['green', 'implementer'],
      ]),
      'review',
    );
  }

  decide(order: WorkOrder): ScopeDecision {
    if (order.difficulty.startsWithSenior()) return { kind: 'stop', reason: 'too-large' };
    if (order.stage === this.completeAt) return { kind: 'complete' };
    if (order.stage === 'halted') return { kind: 'stop', reason: 'halted' };
    if (order.pendingSupport !== null) return { kind: 'stop', reason: 'needs-support' };

    const assignment = order.nextAssignment();
    const role = this.supported.get(order.stage);
    if (assignment === null || role === undefined || assignment.role !== role) {
      return { kind: 'stop', reason: 'unsupported-stage' };
    }
    if (assignment.tier !== 'haiku') return { kind: 'stop', reason: 'needs-senior' };
    return { kind: 'continue', assignment };
  }
}
