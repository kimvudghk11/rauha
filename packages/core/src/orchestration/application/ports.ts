import type { CheckedClaim } from '../domain/fact-check.js';
import type { TestRun } from '../domain/test-run.js';
import type { CheckResult } from '../domain/verification.js';
import type { Assumption } from './dto/intake.dto.js';
import type { MemberRole, RoleSetting } from './dto/role-settings.dto.js';

/** 팀원 한 번 호출. 바뀌는 입력(업무 지시서 등)은 userMessage에, 역할 프롬프트는 어댑터가 넣는다. */
export interface MemberCall {
  readonly role: MemberRole;
  readonly setting: RoleSetting;
  readonly userMessage: string;
  readonly outputSchema: Record<string, unknown>;
  /** 작업 폴더 기준 상대 경로를 이 역할이 쓸 수 있는지(WritePolicy). */
  readonly canWrite: (relPath: string) => boolean;
}

export interface MemberUsage {
  readonly model: string;
  readonly durationMs: number;
  readonly costUsd: number;
  readonly turns: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly denials: readonly string[];
  readonly endReason: string;
}

export interface FetchedPage {
  readonly url: string;
  /** 가져온 본문(앞부분). 남기지 못했으면 null */
  readonly body: string | null;
}

export interface MemberResult {
  /** 구조화 출력. 실패하면 null. */
  readonly output: unknown;
  readonly error: string | null;
  readonly usage: MemberUsage;
  /** 이번 호출에서 팀원이 WebFetch로 실제로 연 주소. web 근거 확인에 쓴다. */
  readonly fetched: readonly FetchedPage[];
  /** 구독 사용 한도에 걸렸으면 그 문장(풀리는 시각 포함). 아니면 null이나 없음. */
  readonly limited?: string | null;
}

export interface TeamMemberPort {
  run(call: MemberCall): Promise<MemberResult>;
}

export interface FileChange {
  readonly path: string;
  readonly kind: 'added' | 'modified' | 'deleted';
}

/** HEAD 대비 바뀐 파일 → 내용 해시. 두 스냅숏을 비교해 한 팀원이 바꾼 파일을 구한다. */
export interface WorkspaceSnapshot {
  readonly files: ReadonlyMap<string, string>;
}

export interface WorkspacePort {
  /** 커밋하지 않은 파일 목록. git 저장소가 아니면 null. */
  dirtyFiles(): Promise<string[] | null>;
  /** 프로젝트 파일 목록(추적 중 + 새 파일, 실행 폴더 기준). 접수 팀장이 훑는 시간을 줄인다. */
  listFiles(): Promise<string[]>;
  /** 근거 확인용 파일 읽기(실행 폴더 기준). 밖이거나 없으면 null. */
  readFile(path: string): Promise<string | null>;
  snapshot(): Promise<WorkspaceSnapshot>;
  changesBetween(before: WorkspaceSnapshot, after: WorkspaceSnapshot): FileChange[];
  changesSinceHead(): Promise<FileChange[]>;
}

export interface TestsResult {
  readonly run: TestRun;
  readonly ids: readonly string[];
  /** 통과한 테스트의 전체 이름. test 근거 확인에 쓴다. */
  readonly passed: readonly string[];
  readonly digest: string;
  readonly command: string;
}

export interface ChecksPort {
  runTests(files: readonly string[]): Promise<TestsResult>;
  /** 전체 테스트·타입 검사·린트. 없는 검사는 status 'skip'. */
  runSuite(): Promise<CheckResult[]>;
}

export interface RunLogPort {
  recordCall(role: MemberRole, attempt: number, call: MemberCall, result: MemberResult): Promise<void>;
  recordChecks(label: string, results: readonly CheckResult[]): Promise<void>;
  /** 기록 폴더 경로를 돌려준다. */
  finish(summary: Record<string, unknown>, guideMarkdown: string): Promise<string>;
}

export type FactAnswer = { readonly correct: true } | { readonly correct: false; readonly correction: string };

/** 사용자에게 해석과 추측을 확인받는다. 물어볼 화면이 없으면 interactive가 false이고 아무것도 묻지 않는다. */
export interface UserPort {
  readonly interactive: boolean;
  /** 0 = 추천 해석(chosen), 1.. = alternatives의 순서. */
  choose(assumption: Assumption): Promise<number>;
  /** 코드에 들어갔는데 근거가 확인되지 않은 사실이 맞는지 묻는다. */
  confirmFact(claim: CheckedClaim): Promise<FactAnswer>;
}

export interface ProgressPort {
  /** role: 그 팀원이 일을 시작했다는 알림일 때만 넣는다. 화면은 다음 알림까지 그 팀원이 일하는 중으로 보여 준다. */
  step(message: string, role?: MemberRole): void;
}
