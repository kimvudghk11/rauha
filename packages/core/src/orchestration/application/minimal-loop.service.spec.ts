import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/domain-error.js';
import { TestRun } from '../domain/test-run.js';
import type { CheckResult } from '../domain/verification.js';
import type { Assumption } from './dto/intake.dto.js';
import { RoleSettingsDto, type MemberRole } from './dto/role-settings.dto.js';
import { MinimalLoopService } from './minimal-loop.service.js';
import type {
  ChecksPort,
  FileChange,
  MemberCall,
  MemberResult,
  ProgressPort,
  RunLogPort,
  TeamMemberPort,
  TestsResult,
  UserPort,
  WorkspacePort,
  WorkspaceSnapshot,
} from './ports.js';

// ── 가짜 작업 공간: 파일 내용 = 해시 ─────────────────────────
class FakeWorkspace implements WorkspacePort {
  readonly files = new Map<string, string>([['src/money.ts', 'v1']]);
  private readonly head = new Map(this.files);
  constructor(private readonly dirty: string[] | null = []) {}

  async dirtyFiles() {
    return this.dirty;
  }
  async snapshot(): Promise<WorkspaceSnapshot> {
    const changed = new Map<string, string>();
    for (const [p, v] of this.files) if (this.head.get(p) !== v) changed.set(p, v);
    return { files: changed };
  }
  changesBetween(a: WorkspaceSnapshot, b: WorkspaceSnapshot): FileChange[] {
    const paths = new Set([...a.files.keys(), ...b.files.keys()]);
    return [...paths]
      .filter((p) => a.files.get(p) !== b.files.get(p))
      .map((p) => ({ path: p, kind: this.head.has(p) ? 'modified' : 'added' }));
  }
  async changesSinceHead() {
    return this.changesBetween({ files: new Map() }, await this.snapshot());
  }
  async listFiles() {
    return [...this.files.keys()];
  }
}

class FakeUser implements UserPort {
  readonly asked: string[] = [];
  constructor(
    readonly interactive: boolean,
    private readonly answers: number[] = [],
  ) {}
  async choose(assumption: Assumption) {
    this.asked.push(assumption.question);
    return this.answers.shift() ?? 0;
  }
}

type Script = (call: MemberCall, ws: FakeWorkspace) => unknown;

class FakeTeam implements TeamMemberPort {
  readonly calls: MemberRole[] = [];
  constructor(
    private readonly ws: FakeWorkspace,
    private readonly scripts: Partial<Record<MemberRole, Script[]>>,
  ) {}
  async run(call: MemberCall): Promise<MemberResult> {
    this.calls.push(call.role);
    const queue = this.scripts[call.role] ?? [];
    const script = queue.length > 1 ? (queue.shift() as Script) : queue[0];
    return {
      output: script ? script(call, this.ws) : null,
      error: null,
      usage: { model: call.setting.tier, durationMs: 10, costUsd: 0.001, turns: 3, inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, denials: [], endReason: 'success' },
    };
  }
}

class FakeChecks implements ChecksPort {
  constructor(
    private readonly ws: FakeWorkspace,
    private readonly suite: () => CheckResult[] = () => [{ name: 'tests', status: 'pass', failures: [], command: 'npm run test', summary: '통과' }],
  ) {}
  async runTests(files: readonly string[]): Promise<TestsResult> {
    const implemented = this.ws.files.get('src/money.ts') === 'v2';
    const run = implemented ? TestRun.of({ passed: 2, failed: 0 }) : TestRun.of({ passed: 0, failed: 2, failedNames: ['discount'] });
    return { run, ids: [...run.failedNames], digest: implemented ? '' : 'discount: expected 9000', command: `vitest ${files.join(' ')}` };
  }
  async runSuite() {
    return this.suite();
  }
}

class FakeLog implements RunLogPort {
  readonly labels: string[] = [];
  async recordCall() {}
  async recordChecks(label: string) {
    this.labels.push(label);
  }
  async finish() {
    return '/runs/x';
  }
}

const intake = (overrides: Record<string, unknown> = {}) => ({
  title: 'Money 할인',
  fileCount: 2,
  crossModule: false,
  sensitive: false,
  scope: ['src/money.ts', 'src/money.spec.ts'],
  acceptance: [
    { kind: 'happy', text: '10% 할인' },
    { kind: 'error', text: '범위 밖 할인율' },
  ],
  doneWhen: 'discount 테스트 통과',
  forbidden: [],
  ...overrides,
});

const report = { result: 'done', did: ['했다'], changedFiles: [], passed: 0, failed: 0, failedTests: [], remaining: null, question: null };
const explanation = {
  decisions: [{ what: 'Money에 둠', why: '같은 자리', rejected: null }],
  readingOrder: [
    { path: 'src/money.ts', line: 3, note: '여기' },
    { path: 'src/money.spec.ts', line: 1, note: '테스트' },
  ],
  manualChecks: ['해 보기'],
  untested: [],
};

const writeTest: Script = (_c, ws) => {
  ws.files.set('src/money.spec.ts', 'test');
  return report;
};
const implement: Script = (_c, ws) => {
  ws.files.set('src/money.ts', 'v2');
  return { ...report, explanation };
};

function service(
  ws: FakeWorkspace,
  team: FakeTeam,
  checks: ChecksPort,
  log = new FakeLog(),
  user: UserPort = new FakeUser(false),
  progress: ProgressPort = { step: () => {} },
) {
  return new MinimalLoopService({
    team,
    workspace: ws,
    checks,
    log,
    progress,
    roles: RoleSettingsDto.defaults(),
    user,
    newId: () => 'w1',
    now: () => 0,
    today: () => '2026-10-25',
    badge: '[personal]',
    requireClean: true,
  });
}

describe('MinimalLoopService', () => {
  it('커밋하지 않은 변경이 있으면 시작하지 않는다', async () => {
    const ws = new FakeWorkspace(['src/a.ts']);
    const team = new FakeTeam(ws, {});
    await expect(service(ws, team, new FakeChecks(ws)).run('할인')).rejects.toThrow(DomainError);
    expect(team.calls).toEqual([]);
  });

  it('Red가 유효하면 구현 팀원을 부르고 검증이 통과하면 완료', async () => {
    const ws = new FakeWorkspace();
    const team = new FakeTeam(ws, { intake: [() => intake()], tester: [writeTest], implementer: [implement] });
    const log = new FakeLog();
    const outcome = await service(ws, team, new FakeChecks(ws), log).run('Money에 할인 추가');
    expect(team.calls).toEqual(['intake', 'tester', 'implementer']);
    expect(outcome.status).toBe('complete');
    expect(outcome.implementerAttempts).toBe(1);
    expect(outcome.usage.haiku.calls).toBe(2);
    expect(outcome.guide.toMarkdown()).toContain('src/money.ts:3');
    expect(outcome.logDir).toBe('/runs/x');
    expect(log.labels).toEqual(['baseline', 'red-1', 'green-1']);
  });

  it('팀원을 부를 때 진행 알림에 어느 팀원인지 함께 알린다', async () => {
    const ws = new FakeWorkspace();
    const team = new FakeTeam(ws, { intake: [() => intake()], tester: [writeTest], implementer: [implement] });
    const steps: [string, MemberRole | undefined][] = [];
    await service(ws, team, new FakeChecks(ws), new FakeLog(), new FakeUser(false), {
      step: (message, role) => steps.push([message, role]),
    }).run('Money에 할인 추가');
    expect(steps.filter(([, role]) => role !== undefined).map(([, role]) => role)).toEqual(['intake', 'tester', 'implementer']);
    expect(steps.find(([m]) => m.startsWith('검증 묶음'))?.[1]).toBeUndefined();
  });

  it('L급 접수는 팀원을 부르지 않고 멈춘다', async () => {
    const ws = new FakeWorkspace();
    const team = new FakeTeam(ws, { intake: [() => intake({ sensitive: true })] });
    const outcome = await service(ws, team, new FakeChecks(ws)).run('결제 바꿔줘');
    expect(team.calls).toEqual(['intake']);
    expect(outcome).toMatchObject({ status: 'stopped', stopReason: 'too-large' });
  });

  it('수용 기준이 모자라면 접수를 한 번 다시 받는다', async () => {
    const ws = new FakeWorkspace();
    const team = new FakeTeam(ws, {
      intake: [() => intake({ acceptance: [{ kind: 'happy', text: 'a' }] }), () => intake()],
      tester: [writeTest],
      implementer: [implement],
    });
    const outcome = await service(ws, team, new FakeChecks(ws)).run('할인');
    expect(team.calls.filter((r) => r === 'intake')).toHaveLength(2);
    expect(outcome.status).toBe('complete');
  });

  it('접수가 두 번 실패하면 intake-failed로 멈춘다', async () => {
    const ws = new FakeWorkspace();
    const team = new FakeTeam(ws, { intake: [() => ({ nonsense: true })] });
    const outcome = await service(ws, team, new FakeChecks(ws)).run('?');
    expect(outcome).toMatchObject({ status: 'stopped', stopReason: 'intake-failed' });
  });

  it('테스트를 만들지 않은 Red는 무효이고 다시 맡긴다', async () => {
    const ws = new FakeWorkspace();
    const team = new FakeTeam(ws, { intake: [() => intake()], tester: [() => report, writeTest], implementer: [implement] });
    const outcome = await service(ws, team, new FakeChecks(ws)).run('할인');
    expect(team.calls).toEqual(['intake', 'tester', 'tester', 'implementer']);
    expect(outcome.status).toBe('complete');
  });

  it('잠긴 테스트를 바꾼 구현은 실패로 치고, 두 번 실패하면 needs-senior로 멈춘다', async () => {
    const ws = new FakeWorkspace();
    const cheat: Script = (_c, w) => {
      w.files.set('src/money.ts', 'v2');
      w.files.set('src/money.spec.ts', `cheat-${Math.random()}`);
      return { ...report, explanation };
    };
    const team = new FakeTeam(ws, { intake: [() => intake()], tester: [writeTest], implementer: [cheat] });
    const outcome = await service(ws, team, new FakeChecks(ws)).run('할인');
    expect(outcome).toMatchObject({ status: 'stopped', stopReason: 'needs-senior', implementerAttempts: 2 });
    expect(outcome.guide.toMarkdown()).toContain('되돌리려면');
  });

  it('기준선에서 이미 깨진 테스트는 Green을 막지 않는다', async () => {
    const ws = new FakeWorkspace();
    const team = new FakeTeam(ws, { intake: [() => intake()], tester: [writeTest], implementer: [implement] });
    const broken = () => [{ name: 'tests', status: 'fail', failures: ['old'], command: 'npm run test', summary: '실패 1' }] as CheckResult[];
    const outcome = await service(ws, team, new FakeChecks(ws, broken)).run('할인');
    expect(outcome.status).toBe('complete');
    expect(outcome.guide.toMarkdown()).toContain('원래 깨져 있던 것: old');
  });

  it('구현 팀원에게는 잠긴 테스트 쓰기를 허락하지 않는다', async () => {
    const ws = new FakeWorkspace();
    let allowed: boolean | null = null;
    const team = new FakeTeam(ws, {
      intake: [() => intake()],
      tester: [writeTest],
      implementer: [
        (call, w) => {
          allowed = call.canWrite('src/money.spec.ts');
          return implement(call, w);
        },
      ],
    });
    await service(ws, team, new FakeChecks(ws)).run('할인');
    expect(allowed).toBe(false);
  });
});

describe('MinimalLoopService — 해석이 갈리는 요청과 재시도 정보', () => {
  const assumption = { question: '원 미만은 무엇을 버리나', chosen: '할인 후 금액', alternatives: ['할인액'] };

  it('해석이 갈리면 사용자에게 묻고, 다른 해석을 고르면 확정해서 접수를 다시 받는다', async () => {
    const ws = new FakeWorkspace();
    const messages: string[] = [];
    const team = new FakeTeam(ws, {
      intake: [
        (c) => {
          messages.push(c.userMessage);
          return intake({ assumptions: [assumption] });
        },
        (c) => {
          messages.push(c.userMessage);
          return intake({ title: '확정된 할인', assumptions: [] });
        },
      ],
      tester: [writeTest],
      implementer: [implement],
    });
    const user = new FakeUser(true, [1]);
    const outcome = await service(ws, team, new FakeChecks(ws), new FakeLog(), user).run('할인');
    expect(user.asked).toEqual(['원 미만은 무엇을 버리나']);
    expect(messages[1]).toContain('<clarifications>');
    expect(messages[1]).toContain('원 미만은 무엇을 버리나 → 할인액');
    expect(outcome.title).toBe('확정된 할인');
    expect(outcome.guide.toMarkdown()).toContain('원 미만은 무엇을 버리나 → 할인액 (직접 확인함)');
  });

  it('추천 해석을 그대로 고르면 접수를 다시 받지 않는다', async () => {
    const ws = new FakeWorkspace();
    const team = new FakeTeam(ws, { intake: [() => intake({ assumptions: [assumption] })], tester: [writeTest], implementer: [implement] });
    await service(ws, team, new FakeChecks(ws), new FakeLog(), new FakeUser(true, [0])).run('할인');
    expect(team.calls.filter((r) => r === 'intake')).toHaveLength(1);
  });

  it('물어볼 화면이 없으면 추천 해석으로 진행하고 안내서에 확인 안 된 가정으로 남긴다', async () => {
    const ws = new FakeWorkspace();
    const team = new FakeTeam(ws, { intake: [() => intake({ assumptions: [assumption] })], tester: [writeTest], implementer: [implement] });
    const user = new FakeUser(false);
    const outcome = await service(ws, team, new FakeChecks(ws), new FakeLog(), user).run('할인');
    expect(user.asked).toEqual([]);
    expect(outcome.guide.toMarkdown()).toContain('⚠ 확인 안 된 가정');
    expect(outcome.guide.toMarkdown()).toContain('원 미만은 무엇을 버리나 → 할인 후 금액');
  });

  it('접수 팀장에게 프로젝트 파일 목록과 오늘 날짜를 준다', async () => {
    const ws = new FakeWorkspace();
    let message = '';
    const team = new FakeTeam(ws, {
      intake: [
        (c) => {
          message = c.userMessage;
          return intake({ sensitive: true });
        },
      ],
    });
    await service(ws, team, new FakeChecks(ws)).run('할인');
    expect(message).toContain('<today>2026-10-25</today>');
    expect(message).toContain('<project_files>\nsrc/money.ts\n</project_files>');
  });

  it('구현 재시도에는 지난 실패의 실제 메시지를 넘긴다', async () => {
    const ws = new FakeWorkspace();
    const second: string[] = [];
    const team = new FakeTeam(ws, {
      intake: [() => intake()],
      tester: [writeTest],
      implementer: [
        () => ({ ...report, explanation }),
        (c, w) => {
          second.push(c.userMessage);
          return implement(c, w);
        },
      ],
    });
    const outcome = await service(ws, team, new FakeChecks(ws)).run('할인');
    expect(outcome.status).toBe('complete');
    expect(second[0]).toContain('<last_failure>');
    expect(second[0]).toContain('discount: expected 9000');
  });
});
