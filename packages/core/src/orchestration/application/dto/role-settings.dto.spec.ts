import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/domain-error.js';
import { RoleSettingsDto } from './role-settings.dto.js';

describe('RoleSettingsDto', () => {
  it('기본값: 접수는 sonnet low, 테스트·구현은 haiku medium', () => {
    const roles = RoleSettingsDto.defaults();
    expect(roles.get('intake')).toMatchObject({ tier: 'sonnet', effort: 'low' });
    expect(roles.get('tester')).toMatchObject({ tier: 'haiku', effort: 'medium' });
    expect(roles.get('implementer')).toMatchObject({ tier: 'haiku', effort: 'medium' });
    expect(roles.get('implementer').tools).toContain('Bash');
    expect(roles.get('intake').tools).not.toContain('Write');
  });

  it('환경 변수로 역할의 모델과 effort를 바꾼다', () => {
    const roles = RoleSettingsDto.defaults().withEnv({ RAUHA_ROLE_IMPLEMENTER: 'sonnet:high', RAUHA_ROLE_TESTER: 'opus' });
    expect(roles.get('implementer')).toMatchObject({ tier: 'sonnet', effort: 'high' });
    expect(roles.get('tester')).toMatchObject({ tier: 'opus', effort: 'medium' });
  });

  it('구현 시니어(sonnet)는 주니어보다 예산 상한이 크다', () => {
    const roles = RoleSettingsDto.defaults();
    expect(roles.forAssignment('implementer', 'sonnet')).toMatchObject({ tier: 'sonnet', effort: 'medium', maxBudgetUsd: 2 });
    expect(roles.forAssignment('implementer', 'haiku')).toMatchObject({ tier: 'haiku', maxBudgetUsd: 1 });
  });

  it('환경 변수로 고정한 역할은 배정 모델과 상관없이 그 모델을 쓴다', () => {
    const roles = RoleSettingsDto.defaults().withEnv({ RAUHA_ROLE_IMPLEMENTER: 'sonnet:high' });
    expect(roles.forAssignment('implementer', 'haiku')).toMatchObject({ tier: 'sonnet', effort: 'high' });
  });

  it('고정하지 않은 역할은 배정 모델을 따른다', () => {
    const roles = RoleSettingsDto.defaults().withEnv({ RAUHA_ROLE_TESTER: 'opus' });
    expect(roles.forAssignment('implementer', 'sonnet').tier).toBe('sonnet');
  });

  it('형식이 틀린 환경 변수는 거부한다', () => {
    expect(() => RoleSettingsDto.defaults().withEnv({ RAUHA_ROLE_TESTER: 'gpt:fast' })).toThrow(DomainError);
  });
});
