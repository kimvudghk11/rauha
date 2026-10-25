import { DomainError } from '../../../shared/domain-error.js';
import type { ModelTier } from '../../domain/team.js';

export type MemberRole = 'intake' | 'tester' | 'implementer';
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
const ROLES: readonly MemberRole[] = ['intake', 'tester', 'implementer'];

/**
 * 역할별 모델·effort·상한. 실험대에서 바꿔 보기 쉽도록
 * `RAUHA_ROLE_<ROLE>=<tier>[:<effort>]` 환경 변수로 덮어쓸 수 있다.
 */
export class RoleSettingsDto {
  private constructor(private readonly settings: Readonly<Record<MemberRole, RoleSetting>>) {}

  static defaults(): RoleSettingsDto {
    return new RoleSettingsDto({
      intake: { tier: 'sonnet', effort: 'low', maxTurns: 15, maxBudgetUsd: 0.5, tools: READ_TOOLS },
      tester: { tier: 'haiku', effort: 'medium', maxTurns: 30, maxBudgetUsd: 0.5, tools: WRITE_TOOLS },
      implementer: { tier: 'haiku', effort: 'medium', maxTurns: 40, maxBudgetUsd: 1, tools: WRITE_TOOLS },
    });
  }

  withEnv(env: Readonly<Record<string, string | undefined>>): RoleSettingsDto {
    const next = { ...this.settings };
    for (const role of ROLES) {
      const key = `RAUHA_ROLE_${role.toUpperCase()}`;
      const value = env[key];
      if (value === undefined || value.trim() === '') continue;
      const [tier, effort] = value.trim().split(':');
      if (!TIERS.includes(tier as ModelTier) || (effort !== undefined && !EFFORTS.includes(effort as Effort))) {
        throw new DomainError('INVALID_INPUT', `${key}: <${TIERS.join('|')}>[:<${EFFORTS.join('|')}>] 형식이어야 합니다.`);
      }
      next[role] = { ...next[role], tier: tier as ModelTier, ...(effort !== undefined ? { effort: effort as Effort } : {}) };
    }
    return new RoleSettingsDto(next);
  }

  get(role: MemberRole): RoleSetting {
    return this.settings[role];
  }
}
