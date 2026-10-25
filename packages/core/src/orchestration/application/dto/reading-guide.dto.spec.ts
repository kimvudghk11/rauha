import { describe, expect, it } from 'vitest';
import { Verification } from '../../domain/verification.js';
import { ExplanationDto } from './explanation.dto.js';
import { ReadingGuideDto, type ReadingGuideProps } from './reading-guide.dto.js';

const explanation = ExplanationDto.from({
  decisions: [{ what: 'discount를 Money 메서드로 둠', why: 'add·multiply와 같은 자리', rejected: '유틸 함수' }],
  readingOrder: [
    { path: 'src/domain/money.ts', line: 30, note: '새 메서드' },
    { path: 'src/domain/money.spec.ts', note: '보장하는 것' },
  ],
  manualChecks: ['Money.of(10000).discount(10) → 9,000원'],
  untested: ['소수점 반올림'],
});

const verdict = Verification.of([
  { name: 'locked-tests', status: 'pass', failures: [], command: 'npx vitest run src/domain/money.spec.ts', summary: '통과 4' },
  { name: 'tests', status: 'fail', failures: ['old broken'], command: 'npm run test', summary: '통과 20 / 실패 1' },
  { name: 'lint', status: 'skip', failures: [], command: null, summary: '스크립트 없음' },
]).judge(Verification.of([{ name: 'tests', status: 'fail', failures: ['old broken'], command: null, summary: '' }]));

const base: ReadingGuideProps = {
  badge: '[personal]',
  title: 'Money 할인 적용',
  status: 'complete',
  stopReason: null,
  durationMs: 134_000,
  costUsd: 0.0123,
  tierCalls: { haiku: 2, sonnet: 1, opus: 0 },
  explanation,
  verdict,
  changes: [
    { path: 'src/domain/money.ts', kind: 'modified' },
    { path: 'src/domain/money.spec.ts', kind: 'added' },
  ],
  logDir: 'C:/Users/me/.rauha/profiles/personal/runs/x',
  assumptions: [],
};

describe('ReadingGuideDto', () => {
  it('안내서는 읽는 순서·결정·직접 해 볼 것·검증 결과를 담는다', () => {
    const md = ReadingGuideDto.create(base).toMarkdown();
    expect(md).toContain('[personal] Money 할인 적용 · 완료(리뷰 전) · 2분 14초 · haiku 2회, sonnet 1회');
    expect(md).toContain('1. src/domain/money.ts:30');
    expect(md).toContain('새 메서드');
    expect(md).toContain('discount를 Money 메서드로 둠');
    expect(md).toContain('버린 안: 유틸 함수');
    expect(md).toContain('Money.of(10000).discount(10)');
    expect(md).toContain('소수점 반올림');
    expect(md).toContain('✓ npx vitest run src/domain/money.spec.ts');
    expect(md).toContain('원래 깨져 있던 것: old broken');
    expect(md).toContain('- lint: 스크립트 없음, 건너뜀');
  });

  it('결정 문장 끝의 마침표가 겹치지 않는다', () => {
    const e = ExplanationDto.from({
      decisions: [{ what: '할인액을 버림한다.', why: '테스트가 900을 기대한다.', rejected: null }],
      readingOrder: [{ path: 'a.ts', note: 'n' }, { path: 'a.spec.ts', note: 't' }],
      manualChecks: ['x'],
      untested: [],
    });
    const md = ReadingGuideDto.create({ ...base, explanation: e }).toMarkdown();
    expect(md).toContain('  - 할인액을 버림한다. 테스트가 900을 기대한다.');
    expect(md).not.toContain('..');
  });

  it('멈췄을 때 안내서는 이유와 되돌리는 방법을 담는다', () => {
    const md = ReadingGuideDto.create({ ...base, status: 'stopped', stopReason: 'needs-support', explanation: null }).toMarkdown();
    expect(md).toContain('멈춤');
    expect(md).toContain('구현 시니어(sonnet)까지 실패했습니다');
    expect(md).not.toContain('2단계에서 붙입니다');
    expect(md).toContain('git checkout -- src/domain/money.ts');
    expect(md).toContain('git clean -f -- src/domain/money.spec.ts');
  });

  it('터미널 출력은 파일:줄을 하이퍼링크로 감싼다', () => {
    const out = ReadingGuideDto.create(base).toTerminal('E:\\work\\app');
    expect(out).toContain('\u001b]8;;file:///E:/work/app/src/domain/money.ts\u001b\\src/domain/money.ts:30\u001b]8;;\u001b\\');
  });
});

describe('ReadingGuideDto — 가정', () => {
  it('가정은 확인 여부와 함께 안내서 맨 위에 보여 준다', () => {
    const md = ReadingGuideDto.create({
      ...base,
      assumptions: [{ question: '원 미만 처리', chosen: '할인 후 금액을 버림', confirmed: false }],
    }).toMarkdown();
    const lines = md.split('\n');
    expect(lines[2]).toBe('⚠ 확인 안 된 가정 (rauha가 추천 해석으로 진행했습니다. 다르면 다시 요청하세요)');
    expect(lines[3]).toBe('  - 원 미만 처리 → 할인 후 금액을 버림');
  });
});
