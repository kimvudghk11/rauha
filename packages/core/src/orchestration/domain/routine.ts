import { DomainError } from '../../shared/domain-error.js';

export type Cadence = { readonly kind: 'daily' } | { readonly kind: 'weekly'; readonly weekday: number };

interface RoutineProps {
  readonly id: string;
  readonly request: string;
  readonly cadence: Cadence;
  /** 만든 날(YYYY-MM-DD, 사용자 컴퓨터의 날짜) */
  readonly createdOn: string;
  /** 마지막으로 실행한 날. 아직 안 했으면 null */
  readonly lastRunOn: string | null;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_MS = 86_400_000;
const day = (text: string) => Date.parse(`${text}T00:00:00Z`);
const weekdayOf = (text: string) => new Date(day(text)).getUTCDay();
const minusDays = (text: string, n: number) => new Date(day(text) - n * DAY_MS).toISOString().slice(0, 10);
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(day(v));

function readCadence(input: unknown): Cadence | null {
  if (typeof input !== 'object' || input === null) return null;
  const c = input as Record<string, unknown>;
  if (c['kind'] === 'daily') return { kind: 'daily' };
  const weekday = c['weekday'];
  if (c['kind'] === 'weekly' && typeof weekday === 'number' && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6) return { kind: 'weekly', weekday };
  return null;
}

/** 사용자가 등록한 반복 업무. 자동으로 돌지 않는다: 때가 됐음을 알리고, 사용자가 시킬 때 한 번 돈다(한도를 몰래 쓰지 않게). */
export class Routine {
  private constructor(private readonly props: RoutineProps) {}

  static create(p: { id: string; request: string; cadence: Cadence; today: string }): Routine {
    if (p.request.trim() === '') throw new DomainError('INVALID_INPUT', '정기 업무로 할 요청이 비었습니다.');
    return new Routine({ id: p.id, request: p.request.trim(), cadence: p.cadence, createdOn: p.today, lastRunOn: null });
  }

  static read(input: unknown): Routine | null {
    if (typeof input !== 'object' || input === null) return null;
    const o = input as Record<string, unknown>;
    const cadence = readCadence(o['cadence']);
    const last = o['lastRunOn'];
    if (typeof o['id'] !== 'string' || typeof o['request'] !== 'string' || o['request'].trim() === '' || cadence === null || !isDay(o['createdOn'])) return null;
    if (last !== null && !isDay(last)) return null;
    return new Routine({ id: o['id'], request: o['request'], cadence, createdOn: o['createdOn'], lastRunOn: last });
  }

  get id(): string {
    return this.props.id;
  }

  get request(): string {
    return this.props.request;
  }

  get lastRunOn(): string | null {
    return this.props.lastRunOn;
  }

  describe(): string {
    return this.props.cadence.kind === 'daily' ? '매일' : `매주 ${WEEKDAYS[this.props.cadence.weekday]}`;
  }

  /** today(YYYY-MM-DD) 기준으로 지금 할 때가 됐는가: 정해진 날이 만든 날 뒤에 있었고, 그 날 몫을 아직 안 했다. */
  isDue(today: string): boolean {
    const scheduled = this.props.cadence.kind === 'daily' ? today : minusDays(today, (weekdayOf(today) - this.props.cadence.weekday + 7) % 7);
    if (scheduled <= this.props.createdOn) return false;
    return this.props.lastRunOn === null || this.props.lastRunOn < scheduled;
  }

  ranOn(today: string): Routine {
    return new Routine({ ...this.props, lastRunOn: today });
  }

  toJSON(): RoutineProps {
    return this.props;
  }
}

const MAX_ROUTINES = 10;

export class RoutineBook {
  private constructor(readonly routines: readonly Routine[]) {}

  static empty(): RoutineBook {
    return new RoutineBook([]);
  }

  static read(input: unknown): RoutineBook {
    const list: unknown[] = Array.isArray(input) ? input : [];
    return new RoutineBook(list.map((item) => Routine.read(item)).filter((r): r is Routine => r !== null));
  }

  add(routine: Routine): RoutineBook {
    if (this.routines.length >= MAX_ROUTINES) throw new DomainError('INVALID_INPUT', `정기 업무는 ${MAX_ROUTINES}개까지만 둘 수 있어요. 안 쓰는 것을 먼저 지워 주세요.`);
    return new RoutineBook([...this.routines, routine]);
  }

  /** number: 목록에 보이는 번호(1부터) */
  remove(number: number): RoutineBook {
    if (!Number.isInteger(number) || number < 1 || number > this.routines.length) throw new DomainError('INVALID_INPUT', `${number}번 정기 업무가 없어요.`);
    return new RoutineBook(this.routines.filter((_, i) => i !== number - 1));
  }

  due(today: string): readonly Routine[] {
    return this.routines.filter((r) => r.isDue(today));
  }

  markRun(ids: readonly string[], today: string): RoutineBook {
    return new RoutineBook(this.routines.map((r) => (ids.includes(r.id) ? r.ranOn(today) : r)));
  }

  toJSON(): readonly RoutineProps[] {
    return this.routines.map((r) => r.toJSON());
  }
}
