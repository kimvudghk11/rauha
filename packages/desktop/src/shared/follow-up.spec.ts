import { describe, expect, it } from 'vitest';
import { FOLLOW_RESULT_MAX, FOLLOW_TURNS_MAX, followUpPrompt, followUpText, threadOfTurns, threadTeam, type ThreadTurn } from './follow-up.js';

const turn = (id: string, over: Partial<ThreadTurn> = {}): ThreadTurn => ({ id, request: `${id} 요청`, result: `${id} 결과`, cast: ['intake'], thread: null, queuedAt: `2026-11-15T00:00:0${id.length}Z`, ...over });

describe('이어서 묻기(답장·후속 질문)', () => {
  it('앞 대화를 차례로 맥락으로 붙이고 새 말은 맨 끝에', () => {
    const p = followUpPrompt([{ request: '로그인 버튼 고쳐 줘', result: '버튼 색과 클릭 범위를 고쳤어요.' }, { request: '모바일도', result: '모바일도 맞췄어요.' }], [], '다크 모드도');
    expect(p.indexOf('로그인 버튼 고쳐 줘')).toBeLessThan(p.indexOf('모바일도 맞췄어요.'));
    expect(p.trim().endsWith('다크 모드도')).toBe(true);
  });
  it('일했던 팀원을 알려 같은 팀이 이어 하고, 필요할 때만 다른 팀원을 더하게 한다', () => {
    const p = followUpPrompt([{ request: 'a', result: 'b' }], ['구현 팀원', '테스트 팀원'], 'c');
    expect(p).toContain('구현 팀원, 테스트 팀원');
    expect(p).toMatch(/same members/i);
    expect(p).toMatch(/only if/i);
  });
  it('팀원 목록이 비면 팀 줄을 넣지 않는다', () => {
    expect(followUpPrompt([{ request: 'a', result: 'b' }], [], 'c')).not.toMatch(/same members/i);
  });
  it('앞 결과가 없으면(멈춘 작업) 그렇다고 적는다', () => {
    expect(followUpPrompt([{ request: 'a', result: null }], [], 'b')).toMatch(/no result/i);
  });
  it('결과는 상한까지만, 오래된 대화는 최근 몇 개만', () => {
    const p = followUpPrompt([{ request: 'a', result: 'x'.repeat(FOLLOW_RESULT_MAX + 500) }], [], 'b');
    expect(p.length).toBeLessThan(FOLLOW_RESULT_MAX + 800);
    expect(p).toContain('(cut)');
    const many = Array.from({ length: FOLLOW_TURNS_MAX + 3 }, (_, i) => ({ request: `요청${i}번`, result: `r${i}` }));
    const q = followUpPrompt(many, [], 'z');
    expect(q).not.toContain('요청0번');
    expect(q).toContain(`요청${FOLLOW_TURNS_MAX + 2}번`);
    expect(q).toMatch(/earlier turns left out/i);
  });
  it('새 말은 다듬고, 비었거나 너무 길면 거절', () => {
    expect(followUpText('  더 해 줘 ')).toBe('더 해 줘');
    expect(followUpText('   ')).toBeNull();
    expect(followUpText('x'.repeat(20_001))).toBeNull();
    expect(followUpText(42)).toBeNull();
  });
});

describe('태스크 대화 묶음(thread)', () => {
  it('처음 태스크와 그 뒤 이어진 것들을 시간 순으로 모은다(다른 태스크는 빼고)', () => {
    const all = [turn('b', { thread: 'a', queuedAt: '2026-11-15T00:00:02Z' }), turn('a', { queuedAt: '2026-11-15T00:00:01Z' }), turn('x'), turn('c', { thread: 'a', queuedAt: '2026-11-15T00:00:03Z' })];
    expect(threadOfTurns(all, 'a').map((t) => t.id)).toEqual(['a', 'b', 'c']);
    // 이어진 작업 id 로 물어도 같은 묶음
    expect(threadOfTurns(all, 'b').map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
  it('없는 id 면 빈 묶음', () => {
    expect(threadOfTurns([turn('a')], 'zz')).toEqual([]);
  });
  it('팀: 묶음에서 일한 팀원을 처음 나온 순서로, 팀장(intake)은 빼고', () => {
    expect(threadTeam([turn('a', { cast: ['intake', 'implement'] }), turn('b', { cast: ['test', 'implement'] })])).toEqual(['implement', 'test']);
  });
});
