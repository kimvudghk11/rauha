import { describe, expect, it } from 'vitest';
import { citedPaths, FactCheck, normalizeUrl, ReviewFindings, type Claim, type EvidenceSources } from './fact-check.js';

const MONEY = ['export class Money {', '  discount(rate: number): Money {', '    return Money.of(Math.floor(this.amount * (100 - rate) / 100));', '  }', '}'].join('\n');

const sources = (over: Partial<EvidenceSources> = {}): EvidenceSources => ({
  files: new Map<string, string | null>([['src/money.ts', MONEY], ['src/gone.ts', null]]),
  passedTests: ['Money > discount > 10% 할인하면 10,000원이 9,000원이 된다'],
  fetched: new Map<string, string | null>([['https://docs.example.com/api', 'POST /api/v1/info returns { name, email }'], ['https://blog.example.com/x', null]]),
  userStatements: ['할인 후 금액에서 원 미만을 버린다 (999원 10% → 899원)'],
  ...over,
});

const claim = (evidence: Claim['evidence'], kind: Claim['kind'] = 'decision'): Claim => ({ kind, text: '주장', evidence });
const one = (c: Claim, s = sources()) => FactCheck.of([c], s).all()[0]!;

describe('FactCheck — code 근거', () => {
  it('인용한 코드가 그 파일에 있으면 code 근거로 인정한다 (줄 번호가 밀려도)', () => {
    const checked = one(claim([{ kind: 'code', path: 'src/money.ts', line: 40, quote: 'Math.floor(this.amount * (100 - rate) / 100)' }]));
    expect(checked.isGuess).toBe(false);
    expect(checked.verified).toHaveLength(1);
  });

  it('공백 차이는 무시한다', () => {
    expect(one(claim([{ kind: 'code', path: 'src/money.ts', line: 2, quote: 'discount(rate:   number):  Money' }])).isGuess).toBe(false);
  });

  it('공백을 뺀 8자 미만의 인용은 근거로 인정하지 않는다', () => {
    expect(one(claim([{ kind: 'code', path: 'src/money.ts', line: 1, quote: '  }  ' }])).isGuess).toBe(true);
    expect(one(claim([{ kind: 'code', path: 'src/money.ts', line: 1, quote: 'Money' }])).isGuess).toBe(true);
  });

  it('없는 파일이나 읽지 못한 파일을 가리키는 code 근거는 인정하지 않는다', () => {
    expect(one(claim([{ kind: 'code', path: 'src/gone.ts', line: 1, quote: 'export class Money {' }])).isGuess).toBe(true);
    expect(one(claim([{ kind: 'code', path: 'src/nowhere.ts', line: 1, quote: 'export class Money {' }])).isGuess).toBe(true);
  });

  it('파일에 없는 인용은 인정하지 않는다', () => {
    expect(one(claim([{ kind: 'code', path: 'src/money.ts', line: 3, quote: 'Math.round(this.amount * rate)' }])).isGuess).toBe(true);
  });
});

describe('FactCheck — test·web·user 근거', () => {
  it('이번 실행에서 통과한 테스트만 test 근거로 인정한다', () => {
    expect(one(claim([{ kind: 'test', name: '10% 할인하면 10,000원이 9,000원이 된다' }])).isGuess).toBe(false);
    expect(one(claim([{ kind: 'test', name: '할인율이 100을 넘으면 에러' }])).isGuess).toBe(true);
  });

  it('실제로 연 주소만 web 근거로 인정하고, 끝 슬래시와 #은 같은 주소로 본다', () => {
    expect(one(claim([{ kind: 'web', url: 'https://docs.example.com/api/#post', quote: null }])).isGuess).toBe(false);
    expect(one(claim([{ kind: 'web', url: 'https://docs.example.com/other', quote: null }])).isGuess).toBe(true);
    expect(normalizeUrl('HTTPS://Docs.Example.com/api/#x')).toBe('https://docs.example.com/api');
  });

  it('가져온 본문이 있으면 인용 문장이 본문에 있어야 web 근거로 인정한다', () => {
    expect(one(claim([{ kind: 'web', url: 'https://docs.example.com/api', quote: 'POST /api/v1/info returns' }])).isGuess).toBe(false);
    expect(one(claim([{ kind: 'web', url: 'https://docs.example.com/api', quote: 'GET /api/v2/profile returns' }])).isGuess).toBe(true);
    expect(one(claim([{ kind: 'web', url: 'https://blog.example.com/x', quote: '어떤 문장이든 본문이 없으면' }])).isGuess).toBe(false);
  });

  it('확정된 가정이나 사용자 정정에 있는 내용만 user 근거로 인정한다', () => {
    expect(one(claim([{ kind: 'user', text: '할인 후 금액에서 원 미만을 버린다' }])).isGuess).toBe(false);
    expect(one(claim([{ kind: 'user', text: '할인액에서 원 미만을 버린다' }])).isGuess).toBe(true);
  });
});

describe('FactCheck — 추측', () => {
  it('확인된 근거가 하나도 없는 주장은 추측이다', () => {
    const check = FactCheck.of(
      [
        claim([], 'decision'),
        claim([{ kind: 'test', name: '없는 테스트' }], 'fact'),
        claim([{ kind: 'test', name: '10% 할인하면 10,000원이 9,000원이 된다' }], 'fact'),
      ],
      sources(),
    );
    expect(check.guesses()).toHaveLength(2);
    expect(check.guesses('fact')).toHaveLength(1);
  });

  it('근거 중 하나라도 확인되면 사실로 본다', () => {
    const checked = one(claim([{ kind: 'test', name: '없는 테스트' }, { kind: 'user', text: '원 미만을 버린다' }]));
    expect(checked.isGuess).toBe(false);
    expect(checked.verified).toEqual([{ kind: 'user', text: '원 미만을 버린다' }]);
  });

  it('사용자가 맞다고 확인한 추측은 사용자 근거가 붙은 사실이 된다', () => {
    const check = FactCheck.of([{ kind: 'fact', text: '응답 필드는 email', evidence: [] }, { kind: 'fact', text: '경로는 /info', evidence: [] }], sources());
    const confirmed = check.withConfirmed(['응답 필드는 email']);
    expect(confirmed.guesses('fact').map((c) => c.text)).toEqual(['경로는 /info']);
    expect(confirmed.all()[0]!.verified).toEqual([{ kind: 'user', text: '사용자가 맞다고 확인함' }]);
  });

  it('code 근거에 나온 경로를 중복 없이 모은다', () => {
    const quote = 'export class Money {';
    expect(
      citedPaths([
        claim([{ kind: 'code', path: 'src/a.ts', line: 1, quote }, { kind: 'test', name: 'x' }]),
        claim([{ kind: 'code', path: 'src/a.ts', line: 2, quote }, { kind: 'code', path: 'src/b.ts', line: 1, quote }]),
      ]),
    ).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('ReviewFindings', () => {
  const verifiedIssue: Claim = { kind: 'review', text: 'discount가 할인액을 먼저 버린다', evidence: [{ kind: 'code', path: 'src/money.ts', line: 3, quote: 'Math.floor(this.amount * (100 - rate) / 100)' }] };
  const guessIssue: Claim = { kind: 'review', text: '이름이 마음에 안 든다', evidence: [] };

  it('확인된 리뷰 지적이 있으면 수정 요청이고, 추측인 지적만 있으면 통과다', () => {
    expect(ReviewFindings.of(FactCheck.of([verifiedIssue, guessIssue], sources()), []).verdict()).toBe('changes');
    expect(ReviewFindings.of(FactCheck.of([guessIssue], sources()), []).verdict()).toBe('pass');
  });

  it('피드백에는 확인된 지적만 들어간다', () => {
    const feedback = ReviewFindings.of(FactCheck.of([verifiedIssue, guessIssue], sources()), []).feedback();
    expect(feedback).toContain('discount가 할인액을 먼저 버린다');
    expect(feedback).not.toContain('이름이 마음에 안 든다');
  });

  it('사용자 정정이 있으면 수정 요청이고 정정 내용이 피드백에 들어간다', () => {
    const findings = ReviewFindings.of(FactCheck.of([guessIssue], sources()), ['응답 필드는 email이 아니라 mail이다']);
    expect(findings.verdict()).toBe('changes');
    expect(findings.feedback()).toContain('응답 필드는 email이 아니라 mail이다');
  });
});
