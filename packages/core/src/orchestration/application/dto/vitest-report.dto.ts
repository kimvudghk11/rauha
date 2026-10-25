import { asRecord } from '../../../shared/validation.js';
import { TestRun, type FailureKind } from '../../domain/test-run.js';

const IMPORT_FAILURE = /Cannot find module|Failed to load|Failed to resolve import|does not provide an export|ERR_MODULE_NOT_FOUND/;
const TIMEOUT = /timed out/i;

interface FileResult {
  readonly name: string;
  readonly loadFailure: string | null;
  readonly passed: readonly string[];
  readonly failed: readonly { name: string; messages: readonly string[] }[];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `vitest run --reporter=json` 출력 → TestRun. 실패 종류 분류가 이 DTO의 일이다. */
export class VitestReportDto {
  private constructor(private readonly files: readonly FileResult[]) {}

  static from(input: unknown): VitestReportDto {
    const obj = asRecord(input, 'VitestReport');
    const files = asArray(obj['testResults']).map((raw): FileResult => {
      const file = asRecord(raw, 'VitestReport.testResults[]');
      const assertions = asArray(file['assertionResults']).map((a) => asRecord(a, 'assertionResults[]'));
      const message = typeof file['message'] === 'string' ? file['message'] : '';
      const name = String(file['name'] ?? '');
      // 파일은 실패인데 실패한 테스트가 없다 = 로드 실패, beforeAll 실패처럼 테스트 밖에서 깨졌다.
      const failedInside = assertions.some((a) => a['status'] === 'failed');
      return {
        name,
        loadFailure: file['status'] === 'failed' && !failedInside ? message || '테스트 파일을 불러오지 못했습니다.' : null,
        passed: assertions.filter((a) => a['status'] === 'passed').map((a) => String(a['fullName'] ?? a['title'])),
        failed: assertions
          .filter((a) => a['status'] === 'failed')
          .map((a) => ({
            name: String(a['fullName'] ?? a['title']),
            messages: asArray(a['failureMessages']).map(String),
          })),
      };
    });
    return new VitestReportDto(files);
  }

  toTestRun(): TestRun {
    const passed = this.files.reduce((n, f) => n + f.passed.length, 0);
    const loadFailures = this.files.filter((f) => f.loadFailure !== null);
    const failed = this.files.reduce((n, f) => n + f.failed.length, 0) + loadFailures.length;
    return TestRun.of({ passed, failed, failureKind: failed > 0 ? this.failureKind() : null, failedNames: this.failureIds() });
  }

  passedNames(): string[] {
    return this.files.flatMap((f) => [...f.passed]);
  }

  /** 기준선과 비교할 실패 식별자. assertion은 전체 이름, 로드 실패는 파일 경로. */
  failureIds(): string[] {
    return this.files.flatMap((f) => [...(f.loadFailure !== null ? [f.name] : []), ...f.failed.map((a) => a.name)]);
  }

  /** 다음 팀원에게 넘길 실패 요약. 전체 출력 대신 앞부분 몇 줄만. */
  failureDigest(maxLines = 12): string {
    const lines = this.files.flatMap((f) => [
      ...(f.loadFailure !== null ? [`${f.name}: ${f.loadFailure}`] : []),
      ...f.failed.map((a) => `${a.name}: ${a.messages.join(' ')}`),
    ]);
    return lines
      .flatMap((l) => l.split('\n'))
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .slice(0, maxLines)
      .join('\n');
  }

  private failureKind(): FailureKind {
    const load = this.files.find((f) => f.loadFailure !== null);
    if (load) return IMPORT_FAILURE.test(load.loadFailure as string) ? 'import' : 'compile';
    const messages = this.files.flatMap((f) => f.failed.flatMap((a) => a.messages));
    if (messages.length > 0 && messages.every((m) => TIMEOUT.test(m))) return 'timeout';
    return 'assertion';
  }
}
