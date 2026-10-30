import { describe, expect, it } from 'vitest';
import { ChatStore } from './chat-store.js';

describe('ChatStore', () => {
  it('질문은 한 번에 하나씩 뜨고 답하면 다음 질문이 뜬다', async () => {
    const store = new ChatStore();
    const first = store.ask({ kind: 'menu', screen: '허락?', options: ['허락', '거절'] });
    const second = store.ask({ kind: 'text', label: '이유' });
    expect(store.prompt).toMatchObject({ kind: 'menu' });
    store.answer(1);
    expect(await first).toBe(1);
    await Promise.resolve();
    expect(store.prompt).toMatchObject({ kind: 'text', label: '이유' });
    store.answer('build만 지워');
    expect(await second).toBe('build만 지워');
    expect(store.prompt).toBeNull();
  });

  it('멈추면 기다리던 질문을 모두 거절(-1)이나 빈 글로 닫는다', async () => {
    const store = new ChatStore();
    const menu = store.ask({ kind: 'menu', screen: '허락?', options: ['허락', '거절'] });
    const text = store.ask({ kind: 'text', label: '이유' });
    store.cancelPrompts();
    expect(await menu).toBe(-1);
    expect(await text).toBe('');
    expect(store.prompt).toBeNull();
  });

  it('보낸 입력을 기억해 둔다 (위 화살표로 다시 부르려고)', () => {
    const store = new ChatStore();
    store.remember('첫 요청');
    store.remember('첫 요청');
    store.remember('둘째');
    expect(store.history).toEqual(['첫 요청', '둘째']);
  });

  it('여러 줄을 한 번에 내면 구독자에게 한 번만 알린다 (줄마다 따로 그리면 빈 줄이 버려진다)', () => {
    const store = new ChatStore();
    let notified = 0;
    store.subscribe(() => (notified += 1));
    store.printLines(['가', '', '나']);
    expect(notified).toBe(1);
    expect(store.lines).toEqual(['가', '', '나']);
    store.printLines([]);
    expect(notified).toBe(1);
  });

  it('상태 줄을 바꾸면 구독자에게 알린다', () => {
    const store = new ChatStore();
    let notified = 0;
    store.subscribe(() => (notified += 1));
    store.setStatus('[personal] · 세션 83%');
    expect(store.status).toBe('[personal] · 세션 83%');
    expect(notified).toBe(1);
  });

  it('출력과 상태가 바뀌면 구독자에게 알린다', () => {
    const store = new ChatStore();
    let notified = 0;
    const off = store.subscribe(() => (notified += 1));
    store.print('안녕');
    store.setBusy(true);
    off();
    store.print('끝');
    expect(notified).toBe(2);
    expect(store.lines).toEqual(['안녕', '끝']);
    expect(store.busy).toBe(true);
  });

  it('일이 끝나면 일하는 중 표시를 고정 줄로 바꾼다', () => {
    const store = new ChatStore();
    store.startWorking('구현 팀원 작업 중…', 'implementer', 1000);
    expect(store.working).toMatchObject({ text: '구현 팀원 작업 중…', role: 'implementer', startedAt: 1000 });
    store.stopWorking('◆ 구현 팀원 34초');
    expect(store.working).toBeNull();
    expect(store.lines).toEqual(['◆ 구현 팀원 34초']);
  });

  it('답할 질문이 없을 때 답은 무시한다', () => {
    const store = new ChatStore();
    expect(() => store.answer(0)).not.toThrow();
  });
});

describe('ChatStore — 입력 대기열', () => {
  it('일하는 중에 넣은 입력은 넣은 순서대로 하나씩 꺼낸다', () => {
    const store = new ChatStore();
    store.enqueue('첫째');
    store.enqueue('둘째');
    expect(store.queue).toEqual(['첫째', '둘째']);
    expect(store.dequeue()).toBe('첫째');
    expect(store.dequeue()).toBe('둘째');
    expect(store.dequeue()).toBeUndefined();
  });

  it('대기열을 비우면 지운 개수를 돌려준다', () => {
    const store = new ChatStore();
    store.enqueue('하나');
    store.enqueue('둘');
    expect(store.clearQueue()).toBe(2);
    expect(store.queue).toEqual([]);
  });
});

describe('ChatStore — 입력 기록 불러오기', () => {
  it('지난 실행의 기록을 앞에 깔고, 새로 보낸 입력이 그 뒤에 붙는다', () => {
    const store = new ChatStore();
    store.restoreHistory(['옛날 1', '옛날 2']);
    store.remember('새 입력');
    expect(store.history).toEqual(['옛날 1', '옛날 2', '새 입력']);
  });
});
