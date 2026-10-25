import { describe, expect, it } from 'vitest';
import { chatProgress } from './chat-progress.js';
import { ChatStore } from './chat-store.js';

describe('chatProgress', () => {
  it('라우터에서 답변 팀원으로 넘어가도 작업 중 한 줄로 이어지고, 끝나면 남기지 않는다', () => {
    const store = new ChatStore();
    let now = 0;
    const progress = chatProgress(store, null, () => now);
    progress.step('작업 중…', 'router');
    now = 5000;
    progress.step('작업 중…', 'answerer');
    expect(store.working).toMatchObject({ text: '작업 중…', startedAt: 0 });
    progress.finish();
    expect(store.working).toBeNull();
    expect(store.lines).toEqual([]);
  });

  it('작업 팀원이 바뀌어도 줄을 쌓지 않고 한 줄에서 단계가 이어진다', () => {
    const store = new ChatStore();
    let now = 0;
    const progress = chatProgress(store, null, () => now);
    progress.step('작업 중…', 'router');
    progress.step('팀장 접수 작업 중…', 'intake');
    now = 1000;
    progress.step('테스트 팀원 작업 중…', 'tester');
    now = 2000;
    progress.step('구현 팀원 작업 중…', 'implementer');
    expect(store.lines).toEqual([]);
    expect(store.working).toMatchObject({ text: '접수 > 테스트 > 구현 중…', role: 'implementer', startedAt: 2000 });
  });

  it('같은 팀원을 다시 부르면 몇 번째인지 붙인다', () => {
    const store = new ChatStore();
    const progress = chatProgress(store, null, () => 0);
    progress.step('x', 'intake');
    progress.step('x', 'implementer');
    progress.step('x', 'implementer');
    expect(store.working?.text).toBe('접수 > 구현 > 구현(2) 중…');
  });

  it('팀원 사이의 알림은 줄로 남기되 진행 줄은 이어 간다', () => {
    const store = new ChatStore();
    const progress = chatProgress(store, null, () => 0);
    progress.step('x', 'intake');
    progress.step('검증 묶음을 실행합니다');
    expect(store.lines).toEqual(['  · 검증 묶음을 실행합니다']);
    expect(store.working?.text).toBe('접수 중…');
  });

  it('끝나면 지나온 단계와 전체 걸린 시간을 한 줄로 남긴다', () => {
    const store = new ChatStore();
    let now = 0;
    const progress = chatProgress(store, null, () => now);
    progress.step('x', 'intake');
    progress.step('x', 'tester');
    now = 111_000;
    progress.finish();
    expect(store.working).toBeNull();
    expect(store.lines).toEqual(['  ◆ 접수 > 테스트 1분 51초']);
  });
});
