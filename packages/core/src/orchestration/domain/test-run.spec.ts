import { describe, expect, it } from 'vitest';
import { TestRun } from './test-run.js';

describe('TestRun', () => {
  it('올바른 Red면 문제 설명이 없다', () => {
    expect(TestRun.of({ passed: 0, failed: 2 }).redProblem()).toBeNull();
  });

  it('실패가 없으면 테스트가 아무것도 막지 못한다고 설명한다', () => {
    expect(TestRun.of({ passed: 3, failed: 0 }).redProblem()).toMatch(/모두 통과/);
    expect(TestRun.of({ passed: 0, failed: 0 }).redProblem()).toMatch(/실행된 테스트가 없/);
  });

  it('assertion이 아닌 이유로 실패하면 그 종류를 알려 준다', () => {
    expect(TestRun.of({ passed: 0, failed: 1, failureKind: 'import' }).redProblem()).toMatch(/import/);
  });
});
