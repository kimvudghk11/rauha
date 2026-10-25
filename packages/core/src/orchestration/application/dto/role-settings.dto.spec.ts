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

  it('형식이 틀린 환경 변수는 거부한다', () => {
    expect(() => RoleSettingsDto.defaults().withEnv({ RAUHA_ROLE_TESTER: 'gpt:fast' })).toThrow(DomainError);
  });
});
