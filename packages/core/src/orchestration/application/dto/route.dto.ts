export interface Route {
  readonly mode: 'work' | 'question';
  readonly refersToPast: boolean;
  readonly pastQuery: string | null;
}

const FALLBACK: Route = { mode: 'work', refersToPast: false, pastQuery: null };

/**
 * 라우터 출력 → 입력 종류. 깨진 출력은 작업으로 본다: 작업이면 접수 팀장이 한 번 더 걸러 주고,
 * 지난 작업 찾기는 하지 않아 엉뚱한 작업을 이어 고치는 일은 생기지 않는다.
 */
export class RouteDto {
  private constructor() {}

  static read(input: unknown): Route {
    if (typeof input !== 'object' || input === null) return FALLBACK;
    const o = input as Record<string, unknown>;
    if (o['mode'] !== 'work' && o['mode'] !== 'question') return FALLBACK;
    const query = typeof o['pastQuery'] === 'string' && o['pastQuery'].trim() !== '' ? o['pastQuery'].trim() : null;
    return { mode: o['mode'], refersToPast: o['refersToPast'] === true, pastQuery: query };
  }
}
