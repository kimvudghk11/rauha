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

  it('작업 팀원은 끝나면 걸린 시간과 함께 고정 줄로 남는다', () => {
    const store = new ChatStore();
    let now = 0;
    const progress = chatProgress(store, null, () => now);
    progress.step('작업 중…', 'router');
    progress.step('팀장 접수 작업 중…', 'intake');
    now = 3000;
    progress.step('검증 묶음을 실행합니다');
    expect(store.lines).toEqual(['  ◆ 팀장 접수 작업 중… 3초', '  · 검증 묶음을 실행합니다']);
  });
});
