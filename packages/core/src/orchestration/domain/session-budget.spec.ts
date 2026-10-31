import { describe, expect, it } from 'vitest';
import { SessionBudget } from './session-budget.js';

const win = (percent: number, resetsAt: string | null = null) => ({ percent, resetsAt });

describe('SessionBudget', () => {
  it('사용률이 70% 미만이면 넉넉하다', () => {
    expect(SessionBudget.fromWindows([win(10), win(69)]).level).toBe('ample');
  });

  it('70% 이상이면 빠듯하고, 90% 이상이면 위험하다', () => {
    expect(SessionBudget.fromWindows([win(70)]).level).toBe('tight');
    expect(SessionBudget.fromWindows([win(89)]).level).toBe('tight');
    expect(SessionBudget.fromWindows([win(90)]).level).toBe('critical');
  });

  it('세션과 주간 중 더 찬 쪽을 따른다', () => {
    expect(SessionBudget.fromWindows([win(20), win(95)]).level).toBe('critical');
  });

  it('사용률을 모르면(읽지 못했거나 비었으면) 넉넉하다고 본다 (모르는데 막지 않는다)', () => {
    expect(SessionBudget.fromWindows([null, null]).level).toBe('ample');
    expect(SessionBudget.fromWindows([]).level).toBe('ample');
  });

  it('빠듯하거나 위험하면 아껴 쓰는 중이다', () => {
    expect(SessionBudget.fromWindows([win(10)]).saving).toBe(false);
    expect(SessionBudget.fromWindows([win(75)]).saving).toBe(true);
    expect(SessionBudget.fromWindows([win(95)]).saving).toBe(true);
  });

  it('큰 요청은 위험할 때만 미룬다', () => {
    expect(SessionBudget.fromWindows([win(75)]).holdsHeavyWork).toBe(false);
    expect(SessionBudget.fromWindows([win(95)]).holdsHeavyWork).toBe(true);
  });

  it('안내 글에 사용률과, 알면 풀리는 시각을 담는다', () => {
    const b = SessionBudget.fromWindows([win(20), win(93, '2026-11-01T14:30:00.000Z')]);
    expect(b.percent).toBe(93);
    expect(b.resetsAt).toBe('2026-11-01T14:30:00.000Z');
    expect(SessionBudget.fromWindows([win(93)]).resetsAt).toBeNull();
  });

  it('넉넉함을 직접 만들 수 있다', () => {
    expect(SessionBudget.ample().level).toBe('ample');
  });
});
