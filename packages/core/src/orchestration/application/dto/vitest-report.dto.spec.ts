import { describe, expect, it } from 'vitest';
import { VitestReportDto } from './vitest-report.dto.js';

const assertion = (fullName: string, status: string, failureMessages: string[] = []) => ({
  ancestorTitles: [],
  fullName,
  title: fullName,
  status,
  failureMessages,
});

describe('VitestReportDto', () => {
  it('assertion 실패는 올바른 Red로 본다', () => {
    const dto = VitestReportDto.from({
      testResults: [
        {
          name: '/p/src/money.spec.ts',
          status: 'failed',
          message: '',
          assertionResults: [assertion('Money discount 10%', 'failed', ['AssertionError: expected 1 to be 2']), assertion('Money add', 'passed')],
        },
      ],
    });
    const run = dto.toTestRun();
    expect(run).toMatchObject({ passed: 1, failed: 1, failureKind: 'assertion' });
    expect(run.isValidRed()).toBe(true);
    expect(dto.failureIds()).toEqual(['Money discount 10%']);
  });

  it('통과한 테스트의 전체 이름을 돌려준다', () => {
    const dto = VitestReportDto.from({
      testResults: [
        { name: '/p/a.spec.ts', status: 'failed', message: '', assertionResults: [assertion('Money discount 10%', 'passed'), assertion('Money add', 'failed', ['x'])] },
        { name: '/p/b.spec.ts', status: 'passed', message: '', assertionResults: [assertion('Cart total', 'passed')] },
      ],
    });
    expect(dto.passedNames()).toEqual(['Money discount 10%', 'Cart total']);
  });

  it('실행 중 TypeError는 올바른 Red로 본다', () => {
    const dto = VitestReportDto.from({
      testResults: [
        { name: '/p/a.spec.ts', status: 'failed', message: '', assertionResults: [assertion('a', 'failed', ['Error: not implemented'])] },
      ],
    });
    expect(dto.toTestRun().isValidRed()).toBe(true);
  });

  it('모듈 로드 실패는 assertion 실패가 아니다', () => {
    const dto = VitestReportDto.from({
      testResults: [
        {
          name: '/p/src/x.spec.ts',
          status: 'failed',
          message: 'Failed to resolve import "./x.js" from "src/x.spec.ts". Does the file exist?',
          assertionResults: [],
        },
      ],
    });
    const run = dto.toTestRun();
    expect(run.failureKind).toBe('import');
    expect(run.isValidRed()).toBe(false);
    expect(dto.failureIds()).toEqual(['/p/src/x.spec.ts']);
  });

  it('beforeAll 실패처럼 파일은 실패인데 실패한 테스트가 없으면 실패로 센다', () => {
    const dto = VitestReportDto.from({
      testResults: [
        { name: '/p/a.spec.ts', status: 'failed', message: 'Error: boom in beforeAll', assertionResults: [assertion('a', 'skipped')] },
      ],
    });
    const run = dto.toTestRun();
    expect(run.failed).toBe(1);
    expect(run.isValidRed()).toBe(false);
    expect(dto.failureIds()).toEqual(['/p/a.spec.ts']);
  });

  it('문법 오류로 로드에 실패하면 compile로 본다', () => {
    const dto = VitestReportDto.from({
      testResults: [{ name: '/p/y.spec.ts', status: 'failed', message: 'Transform failed with 1 error: Expected ";"', assertionResults: [] }],
    });
    expect(dto.toTestRun().failureKind).toBe('compile');
  });

  it('시간 초과는 timeout으로 본다', () => {
    const dto = VitestReportDto.from({
      testResults: [{ name: '/p/z.spec.ts', status: 'failed', message: '', assertionResults: [assertion('slow', 'failed', ['Error: Test timed out in 5000ms.'])] }],
    });
    expect(dto.toTestRun().failureKind).toBe('timeout');
  });

  it('실패 요약은 다음 팀원에게 넘길 만큼만 자른다', () => {
    const dto = VitestReportDto.from({
      testResults: [
        { name: '/p/a.spec.ts', status: 'failed', message: '', assertionResults: [assertion('a', 'failed', ['line1\nline2\nline3\n'.repeat(10)])] },
      ],
    });
    expect(dto.failureDigest(5).split('\n').length).toBeLessThanOrEqual(5);
  });
});
