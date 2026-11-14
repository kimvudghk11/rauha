import { describe, expect, it } from 'vitest';
import { waitingTalk, workFacts } from './hiring-banter.js';
import type { WorkSummary } from './my-work.js';

const summary: WorkSummary = {
  total: 120,
  accounts: [
    {
      label: 'Company',
      commits: 80,
      added: 1000,
      removed: 200,
      first: Date.UTC(2026, 4, 3) / 1000,
      last: Date.UTC(2026, 10, 1) / 1000,
      langs: [{ lang: 'Kotlin', lines: 300 }, { lang: 'SQL', lines: 100 }],
      months: [
        { month: '2026-11', repos: [{ repo: 'pay', commits: 50, added: 1, removed: 1, subjects: ['feat: 결제 재시도', 'fix: 타임아웃'] }] },
        { month: '2026-06', repos: [{ repo: 'pay', commits: 10, added: 1, removed: 1, subjects: ['chore: 정리'] }, { repo: 'admin', commits: 20, added: 1, removed: 1, subjects: ['feat: 정산 화면'] }] },
      ],
    },
    { label: 'Personal', commits: 40, added: 1, removed: 1, langs: [{ lang: 'TypeScript', lines: 100 }], first: Date.UTC(2025, 0, 1) / 1000, last: Date.UTC(2026, 3, 1) / 1000, months: [{ month: '2026-04', repos: [{ repo: 'rauha', commits: 40, added: 1, removed: 1, subjects: ['feat: 팀 대화'] }] }] },
  ],
  others: [],
  stacks: [{ repo: 'pay', stack: ['Spring Boot', 'Kotlin'], architecture: ['layered folders: domain'] }],
};

const crew = [
  { name: '토리', by: '리누스 토르발스', rule: '말은 쉽다. 코드를 보여 달라.' },
  { name: '준서', by: '조엘 스폴스키', rule: '똑똑하고, 일을 끝낸다.' },
  { name: '다온', by: '켄트 벡', rule: '먼저 작동하게.' },
];

describe('기다리는 동안 이야기할 사실', () => {
  it('레포는 계정·달을 합쳐 커밋 많은 순, 계정은 기간과 함께', () => {
    const f = workFacts(summary);
    expect(f.total).toBe(120);
    expect(f.repos).toEqual([{ repo: 'pay', commits: 60 }, { repo: 'rauha', commits: 40 }, { repo: 'admin', commits: 20 }]);
    expect(f.accounts[0]).toEqual({ label: 'Company', commits: 80, from: '2026-05', to: '2026-11' });
    expect(f.samples).toContain('feat: 결제 재시도');
  });
  it('바꾼 언어 비중(계정 합산)과 설정 파일 스택', () => {
    const f = workFacts(summary);
    expect(f.langs).toEqual([{ lang: 'Kotlin', share: 60 }, { lang: 'SQL', share: 20 }, { lang: 'TypeScript', share: 20 }]);
    expect(f.stack).toEqual(['Kotlin', 'Spring Boot']);
  });
});

describe('검토 중 담당자 대화(판정 없이 사실만)', () => {
  const facts = workFacts(summary);
  it('세 담당자가 번갈아 말하고, 말에는 실제 레포·커밋 제목·숫자가 들어간다', () => {
    const lines = waitingTalk(crew, facts, 0);
    expect(lines.length).toBeGreaterThanOrEqual(6);
    expect(new Set(lines.map((l) => l.who))).toEqual(new Set(['토리', '준서', '다온']));
    for (let i = 1; i < lines.length; i++) expect(lines[i]!.who).not.toBe(lines[i - 1]!.who);
    const all = lines.map((l) => l.text).join(' ');
    expect(all).toMatch(/pay/);
    expect(all).toMatch(/120/);
  });
  it('언어·스택·공고·경쟁률도 사실로 이야기한다', () => {
    const all = waitingTalk(crew, facts, 0, ['Kotlin', 'Kafka'], 250).map((l) => l.text).join(' ');
    expect(all).toMatch(/Kotlin/);
    expect(all).toMatch(/250명/);
  });
  it('담당자는 자기 기준의 출처를 밝히며 말한다', () => {
    expect(waitingTalk(crew, facts, 0).some((l) => l.text.includes('리누스 토르발스'))).toBe(true);
  });
  it('판정(통과·탈락·합격)을 미리 말하지 않는다', () => {
    for (let seed = 0; seed < 5; seed++) for (const l of waitingTalk(crew, facts, seed)) expect(l.text).not.toMatch(/통과|탈락|합격|불합격|pass|drop/i);
  });
  it('회사(seed)마다 순서가 달라 다섯 방이 똑같은 말을 하지 않는다', () => {
    expect(waitingTalk(crew, facts, 1).map((l) => l.text)).not.toEqual(waitingTalk(crew, facts, 2).map((l) => l.text));
  });
  it('커밋이 없어도 깨지지 않는다', () => {
    expect(waitingTalk(crew, { total: 0, accounts: [], repos: [], samples: [], langs: [], stack: [], scanned: [] }, 3).length).toBeGreaterThan(0);
  });
});
