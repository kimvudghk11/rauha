/** 작업에서 쓰인 디자인 패턴·아키텍처 하나와, 그것을 왜 이 코드에 썼는지 */
export interface PatternNote {
  readonly pattern: string;
  readonly what: string;
  readonly why: string;
  /** ISO 시각 */
  readonly at: string;
}

/** 결정 하나(구현 팀원이 읽기 안내서에 남기는 "무엇을, 왜") */
export interface DecisionText {
  readonly what: string;
  readonly why: string;
}

/** 이 말이 함께 있어야 패턴 이야기로 본다("retry strategy"나 "git repository" 같은 일반 말은 거른다). */
const PATTERN_TALK = /패턴|pattern|아키텍처|architecture|원칙|principle/i;

const PATTERNS: readonly { readonly name: string; readonly match: RegExp }[] = [
  { name: '전략(Strategy)', match: /strategy|전략/i },
  { name: '팩토리(Factory)', match: /factory|팩토리/i },
  { name: '어댑터(Adapter)', match: /adapter|어댑터/i },
  { name: '리포지토리(Repository)', match: /repository|리포지토리|레포지토리/i },
  { name: '옵저버(Observer)', match: /observer|옵저버/i },
  { name: '데코레이터(Decorator)', match: /decorator|데코레이터/i },
  { name: '파사드(Facade)', match: /facade|파사드/i },
  { name: '커맨드(Command)', match: /command|커맨드/i },
  { name: '빌더(Builder)', match: /builder|빌더/i },
  { name: '상태(State)', match: /state\s*(machine|pattern)|상태\s*(패턴|머신)/i },
  { name: '의존성 주입(DI)', match: /dependency injection|의존성 주입/i },
  { name: '값 객체(Value Object)', match: /value object|값 객체/i },
  { name: 'CQRS', match: /cqrs/i },
  { name: '계층형·클린·헥사고날 아키텍처', match: /layered|clean architecture|hexagonal|헥사고날|계층형|클린 아키텍처|레이어드/i },
];

/** 노트 수 상한(오래된 것부터 버린다) */
const MAX_NOTES = 200;

/**
 * 학습 노트: 작업마다 쓰인 패턴과 이유를 모은다. 새 호출 없이, 구현 팀원이 읽기 안내서에 이미 남긴 결정에서 뽑는다.
 * 사용자가 자기 코드로 패턴을 배우고 복습하는 용도다.
 */
export class LearningBook {
  private constructor(readonly notes: readonly PatternNote[]) {}

  static empty(): LearningBook {
    return new LearningBook([]);
  }

  static read(input: unknown): LearningBook {
    const list: unknown[] = Array.isArray(input) ? input : [];
    const notes: PatternNote[] = [];
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue;
      const o = item as Record<string, unknown>;
      if (typeof o['pattern'] === 'string' && typeof o['what'] === 'string' && typeof o['why'] === 'string' && typeof o['at'] === 'string') {
        notes.push({ pattern: o['pattern'], what: o['what'], why: o['why'], at: o['at'] });
      }
    }
    return new LearningBook(notes);
  }

  /** 결정들에서 패턴 이야기를 뽑는다. 한 결정이 여러 패턴을 말하면 패턴마다 하나씩. */
  static notesFrom(decisions: readonly DecisionText[], at: string): PatternNote[] {
    return decisions.flatMap((d) => {
      const text = `${d.what} ${d.why}`;
      if (!PATTERN_TALK.test(text)) return [];
      return PATTERNS.filter((p) => p.match.test(text)).map((p) => ({ pattern: p.name, what: d.what, why: d.why, at }));
    });
  }

  /** 같은 패턴·같은 결정은 한 번만 남긴다. 상한을 넘으면 오래된 것을 버린다. */
  add(notes: readonly PatternNote[]): LearningBook {
    const merged = [...this.notes];
    for (const n of notes) if (!merged.some((m) => m.pattern === n.pattern && m.what === n.what)) merged.push(n);
    return new LearningBook(merged.slice(-MAX_NOTES));
  }

  /** 패턴별로 모아, 자주 쓴 패턴부터 */
  byPattern(): readonly { readonly pattern: string; readonly notes: readonly PatternNote[] }[] {
    const groups = new Map<string, PatternNote[]>();
    for (const n of this.notes) groups.set(n.pattern, [...(groups.get(n.pattern) ?? []), n]);
    return [...groups].map(([pattern, notes]) => ({ pattern, notes })).sort((a, b) => b.notes.length - a.notes.length);
  }
}
