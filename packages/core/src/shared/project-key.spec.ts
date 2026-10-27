import { describe, expect, it } from 'vitest';
import { projectKey } from './project-key.js';

describe('projectKey', () => {
  it('경로 표기(대소문자, \\와 /, 끝 구분자)가 달라도 같은 프로젝트는 같은 키', () => {
    expect(projectKey('E:\\Work\\App\\')).toBe(projectKey('e:/work/app'));
  });

  it('다른 프로젝트는 다른 12자리 키', () => {
    expect(projectKey('e:/work/app')).toMatch(/^[0-9a-f]{12}$/);
    expect(projectKey('e:/work/app')).not.toBe(projectKey('e:/work/app-2'));
  });
});
