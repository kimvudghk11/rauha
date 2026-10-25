import { describe, expect, it } from 'vitest';
import { Difficulty } from './difficulty.js';
import { RunScope } from './run-scope.js';
import { TestRun } from './test-run.js';
import { WorkOrder } from './work-order.js';

const scope = RunScope.minimalLoop();
const red = TestRun.of({ passed: 0, failed: 1, failureKind: 'assertion' });
const invalid = TestRun.of({ passed: 0, failed: 1, failureKind: 'import' });
const fail = TestRun.of({ passed: 1, failed: 1 });
const green = TestRun.of({ passed: 2, failed: 0 });

function openAtRed(grade: 'S' | 'M' | 'L' = 'S'): WorkOrder {
  const order = WorkOrder.open({ id: 'w', title: 't', difficulty: Difficulty.of(grade), sensitive: false, scope: ['src/**'] });
  order.approveScenario({ happyPaths: 1, errorPaths: 1 });
  return order;
}

describe('RunScope.minimalLoop', () => {
  it('L급은 팀원을 부르지 않고 멈춘다(too-large)', () => {
    expect(scope.decide(openAtRed('L'))).toEqual({ kind: 'stop', reason: 'too-large' });
  });

  it('red 단계 haiku 테스트 팀원과 green 단계 haiku 구현 팀원만 이어서 부른다', () => {
    const order = openAtRed();
    expect(scope.decide(order)).toEqual({ kind: 'continue', assignment: { role: 'tester', tier: 'haiku' } });
    order.recordRed(red);
    expect(scope.decide(order)).toEqual({ kind: 'continue', assignment: { role: 'implementer', tier: 'haiku' } });
  });

  it('review 단계에 닿으면 1단계 완료', () => {
    const order = openAtRed();
    order.recordRed(red);
    order.recordGreen(green);
    expect(scope.decide(order)).toEqual({ kind: 'complete' });
  });

  it('구현이 sonnet으로 오르면 needs-senior', () => {
    const order = openAtRed();
    order.recordRed(red);
    order.recordGreen(fail);
    expect(scope.decide(order).kind).toBe('continue');
    order.recordGreen(fail);
    expect(scope.decide(order)).toEqual({ kind: 'stop', reason: 'needs-senior' });
  });

  it('테스트 팀원이 sonnet으로 올라도 needs-senior', () => {
    const order = openAtRed();
    order.recordRed(invalid);
    order.recordRed(invalid);
    expect(scope.decide(order)).toEqual({ kind: 'stop', reason: 'needs-senior' });
  });

  it('시나리오 단계는 1단계에서 다루지 않는다', () => {
    const order = WorkOrder.open({ id: 'w', title: 't', difficulty: Difficulty.of('S'), sensitive: false, scope: ['src/**'] });
    expect(scope.decide(order)).toEqual({ kind: 'stop', reason: 'unsupported-stage' });
  });
});
