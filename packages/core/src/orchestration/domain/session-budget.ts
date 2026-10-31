export type BudgetLevel = 'ample' | 'tight' | 'critical';

/** 구독 사용률 창 하나(세션 5시간·주간). percent는 0~100 */
export interface BudgetWindow {
  readonly percent: number;
  readonly resetsAt: string | null;
}

/** 이 사용률부터 아껴 쓴다 */
const TIGHT_FROM = 70;
/** 이 사용률부터 큰 요청은 미룬다 */
const CRITICAL_FROM = 90;

/**
 * 구독 한도가 얼마나 남았는지. 세션과 주간 중 더 찬 쪽을 따른다.
 * 모르면 넉넉하다고 본다: 읽지 못했다는 이유로 일을 막지 않는다.
 */
export class SessionBudget {
  private constructor(
    readonly percent: number,
    readonly resetsAt: string | null,
  ) {}

  static ample(): SessionBudget {
    return new SessionBudget(0, null);
  }

  static fromWindows(windows: readonly (BudgetWindow | null)[]): SessionBudget {
    const known = windows.filter((w): w is BudgetWindow => w !== null);
    if (known.length === 0) return SessionBudget.ample();
    const fullest = known.reduce((a, b) => (b.percent > a.percent ? b : a));
    return new SessionBudget(fullest.percent, fullest.resetsAt);
  }

  get level(): BudgetLevel {
    return this.percent >= CRITICAL_FROM ? 'critical' : this.percent >= TIGHT_FROM ? 'tight' : 'ample';
  }

  /** 상위 모델을 낮추는 등 아껴 쓰는 중인가 */
  get saving(): boolean {
    return this.level !== 'ample';
  }

  /** 부서장 종합·런칭처럼 호출이 많은 일을 미뤄야 하는가 */
  get holdsHeavyWork(): boolean {
    return this.level === 'critical';
  }
}
