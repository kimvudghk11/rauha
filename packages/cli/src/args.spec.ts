import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';

describe('parseArgs', () => {
  it('인자가 없으면 대화 모드', () => {
    expect(parseArgs([])).toEqual({ kind: 'chat', profile: null, prompt: null, quick: false });
  });

  it('whoami 와 --profile', () => {
    expect(parseArgs(['whoami', '--profile', 'work'])).toEqual({ kind: 'whoami', profile: 'work' });
    expect(parseArgs(['--profile=work', 'whoami'])).toEqual({ kind: 'whoami', profile: 'work' });
  });

  it('-p 는 한 번 실행 모드', () => {
    expect(parseArgs(['-p', '고쳐줘'])).toEqual({ kind: 'chat', profile: null, prompt: '고쳐줘', quick: false });
  });
});

describe('parseArgs — 1단계 명령', () => {
  it('login 과 --profile', () => {
    expect(parseArgs(['login'])).toEqual({ kind: 'login', profile: null });
    expect(parseArgs(['login', '--profile', 'work'])).toEqual({ kind: 'login', profile: 'work' });
  });

  it('bench 와 --only', () => {
    expect(parseArgs(['bench'])).toEqual({ kind: 'bench', profile: null, only: null, compare: false, quick: false });
    expect(parseArgs(['bench', '--only', 'discount'])).toEqual({ kind: 'bench', profile: null, only: 'discount', compare: false, quick: false });
  });

  it('--quick은 리뷰와 사실 점검을 건너뛴다', () => {
    expect(parseArgs(['-p', '고쳐줘', '--quick'])).toMatchObject({ kind: 'chat', quick: true });
    expect(parseArgs(['bench', '--quick'])).toMatchObject({ kind: 'bench', quick: true });
  });

  it('bench --compare는 사다리와 sonnet 고정을 비교하는 실행이다', () => {
    expect(parseArgs(['bench', '--compare'])).toEqual({ kind: 'bench', profile: null, only: null, compare: true, quick: false });
  });
});
