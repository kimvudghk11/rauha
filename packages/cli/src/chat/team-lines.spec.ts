import { RoleSettingsDto } from '@rauha/core';
import { describe, expect, it } from 'vitest';
import { teamLines } from './team-lines.js';

describe('teamLines', () => {
  it('팀원마다 이름·모델·노력 수준·쓰는 도구 종류를 한 줄씩 보여 준다', () => {
    const lines = teamLines(RoleSettingsDto.defaults());
    expect(lines.some((l) => l.includes('팀장') && l.includes('sonnet'))).toBe(true);
    expect(lines.some((l) => l.includes('운영 팀원') && l.includes('명령 실행'))).toBe(true);
  });

  it('파일을 고치는 팀원과 읽기만 하는 팀원을 구분해 적는다', () => {
    const lines = teamLines(RoleSettingsDto.defaults());
    expect(lines.find((l) => l.includes('구현 팀원'))).toContain('파일 수정');
    expect(lines.find((l) => l.includes('리뷰어'))).toContain('읽기만');
  });

  it('환경 변수로 고정한 모델이 반영된다', () => {
    const lines = teamLines(RoleSettingsDto.defaults().withEnv({ RAUHA_ROLE_TESTER: 'opus:high' }));
    expect(lines.find((l) => l.includes('테스트 팀원'))).toMatch(/opus.*high/);
  });
});
