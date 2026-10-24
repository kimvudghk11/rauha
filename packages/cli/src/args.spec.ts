import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';

describe('parseArgs', () => {
  it('인자가 없으면 대화 모드', () => {
    expect(parseArgs([])).toEqual({ kind: 'chat', profile: null, prompt: null });
  });

  it('whoami 와 --profile', () => {
    expect(parseArgs(['whoami', '--profile', 'work'])).toEqual({ kind: 'whoami', profile: 'work' });
    expect(parseArgs(['--profile=work', 'whoami'])).toEqual({ kind: 'whoami', profile: 'work' });
  });

  it('-p 는 한 번 실행 모드', () => {
    expect(parseArgs(['-p', '고쳐줘'])).toEqual({ kind: 'chat', profile: null, prompt: '고쳐줘' });
  });
});
