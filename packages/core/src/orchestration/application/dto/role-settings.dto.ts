import { DomainError } from '../../../shared/domain-error.js';
import type { ModelTier } from '../../domain/team.js';

export type MemberRole = 'intake' | 'tester' | 'implementer' | 'reviewer' | 'router' | 'answerer';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface RoleSetting {
  readonly tier: ModelTier;
  readonly effort: Effort;
  readonly maxTurns: number;
  readonly maxBudgetUsd: number;
  readonly tools: readonly string[];
}

const READ_TOOLS = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'];
const WRITE_TOOLS = [...READ_TOOLS, 'Edit', 'Write', 'Bash'];
const TIERS: readonly ModelTier[] = ['haiku', 'sonnet', 'opus'];
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const ROLES: readonly MemberRole[] = ['intake', 'tester', 'implementer', 'reviewer', 'router', 'answerer'];

/** 상태 머신이 sonnet으로 올렸을 때 쓰는 설정. 표에 없는 조합은 역할 기본값에서 모델만 바꾼다. */
const ESCALATED: Readonly<Partial<Record<MemberRole, Partial<Record<ModelTier, Partial<RoleSetting>>>>>> = {
  tester: { sonnet: { maxBudgetUsd: 1 } },
  implementer: { sonnet: { maxBudgetUsd: 2 } },
};

/**
 * 역할별 모델·effort·상한. 모델은 보통 상태 머신이 배정하고(forAssignment), 실험대에서 바꿔 보기 쉽도록
 * `RAUHA_ROLE_<ROLE>=<tier>[:<effort>]` 환경 변수로 그 역할의 모델을 고정할 수 있다.
 */
export class RoleSettingsDto {
  private constructor(
    private readonly settings: Readonly<Record<MemberRole, RoleSetting>>,
    /** 환경 변수로 모델을 고정한 역할. 배정 모델을 무시한다. */
    private readonly pinned: ReadonlySet<MemberRole> = new Set(),
  ) {}

  static defaults(): RoleSettingsDto {
    return new RoleSettingsDto({
      intake: { tier: 'sonnet', effort: 'low', maxTurns: 15, maxBudgetUsd: 0.5, tools: READ_TOOLS },
      tester: { tier: 'haiku', effort: 'medium', maxTurns: 30, maxBudgetUsd: 0.5, tools: WRITE_TOOLS },
      implementer: { tier: 'haiku', effort: 'medium', maxTurns: 40, maxBudgetUsd: 1, tools: WRITE_TOOLS },
      // 리뷰어는 읽기만 한다. 같은 모델은 같은 실수를 놓치기 쉬워서 구현보다 한 단계 위(sonnet).
      reviewer: { tier: 'sonnet', effort: 'medium', maxTurns: 25, maxBudgetUsd: 1, tools: READ_TOOLS },
      // 라우터는 입력 종류만 가른다. 도구 없이 짧게.
      router: { tier: 'haiku', effort: 'low', maxTurns: 2, maxBudgetUsd: 0.05, tools: [] },
      // 질문에는 코드나 공식 문서를 읽고 답하되 파일은 쓰지 않는다. 일반 기술 질문은 문서 여러 장을 열어 봐야 해서 턴·예산을 넉넉히.
      answerer: { tier: 'sonnet', effort: 'medium', maxTurns: 25, maxBudgetUsd: 1, tools: READ_TOOLS },
    });
  }

  withEnv(env: Readonly<Record<string, string | undefined>>): RoleSettingsDto {
    const next = { ...this.settings };
    const pinned = new Set(this.pinned);
    for (const role of ROLES) {
      const key = `RAUHA_ROLE_${role.toUpperCase()}`;
      const value = env[key];
      if (value === undefined || value.trim() === '') continue;
      const [tier, effort] = value.trim().split(':');
      if (!TIERS.includes(tier as ModelTier) || (effort !== undefined && !EFFORTS.includes(effort as Effort))) {
        throw new DomainError('INVALID_INPUT', `${key}: <${TIERS.join('|')}>[:<${EFFORTS.join('|')}>] 형식이어야 합니다.`);
      }
      next[role] = { ...next[role], tier: tier as ModelTier, ...(effort !== undefined ? { effort: effort as Effort } : {}) };
      pinned.add(role);
    }
    return new RoleSettingsDto(next, pinned);
  }

  get(role: MemberRole): RoleSetting {
    return this.settings[role];
  }

  /** 상태 머신이 배정한 모델로 부를 때의 설정. 환경 변수로 고정한 역할은 고정 모델을 쓴다. */
  forAssignment(role: MemberRole, tier: ModelTier): RoleSetting {
    const base = this.settings[role];
    if (this.pinned.has(role) || tier === base.tier) return base;
    return { ...base, tier, ...ESCALATED[role]?.[tier] };
  }
}
