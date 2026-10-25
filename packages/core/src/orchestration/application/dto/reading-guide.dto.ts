import { toPosixPath } from '../../../shared/path-pattern.js';
import type { StopReason } from '../../domain/run-scope.js';
import type { ModelTier } from '../../domain/team.js';
import type { CheckVerdict, VerificationVerdict } from '../../domain/verification.js';
import type { FileChange } from '../ports.js';
import type { ExplanationDto } from './explanation.dto.js';

export type RunStopReason = StopReason | 'intake-failed';

export interface ReadingGuideProps {
  readonly badge: string;
  readonly title: string;
  readonly status: 'complete' | 'stopped';
  readonly stopReason: RunStopReason | null;
  readonly durationMs: number;
  readonly costUsd: number;
  readonly tierCalls: Readonly<Record<ModelTier, number>>;
  readonly explanation: ExplanationDto | null;
  readonly verdict: VerificationVerdict | null;
  readonly changes: readonly FileChange[];
  readonly logDir: string | null;
  /** 해석이 갈린 지점과 실제로 따른 해석. confirmed = 사용자가 직접 확인했는지. */
  readonly assumptions: readonly SettledAssumption[];
}

export interface SettledAssumption {
  readonly question: string;
  readonly chosen: string;
  readonly confirmed: boolean;
}

const STOP_MESSAGE: Readonly<Record<RunStopReason, string>> = {
  'too-large': 'L급 작업입니다. 설계·시니어가 필요해서 1단계에서는 시작하지 않습니다. 작업을 더 작게 나눠 다시 요청해 주세요.',
  'needs-senior': '주니어가 두 번 실패했습니다. 시니어 승격은 2단계에서 붙입니다. 아래 기록의 실패 요약을 참고하세요.',
  'needs-support': '디버깅·설계 지원이 필요한 단계입니다. 1단계에서는 여기서 멈춥니다.',
  halted: '상태 머신이 작업을 중단했습니다.',
  'unsupported-stage': '1단계에서 다루지 않는 단계에 도달했습니다.',
  'intake-failed': '요청을 업무 지시서로 바꾸지 못했습니다. 요청을 더 구체적으로 적어 주세요.',
};

type Link = (path: string, label: string) => string;

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return min > 0 ? `${min}분 ${sec}초` : `${sec}초`;
}

/** 끝에 마침표가 없을 때만 붙인다. */
function sentence(text: string): string {
  return /[.!?。]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

function checkLine(c: CheckVerdict): string[] {
  if (c.status === 'skip') return [`  - ${c.name}: ${c.summary}, 건너뜀`];
  const mark = c.ok ? '✓' : '✗';
  const head = `  ${mark} ${c.command ?? c.name}   ${c.summary}`;
  return [
    head,
    ...(c.newFailures.length > 0 && !c.ok ? [`      새 실패: ${c.newFailures.slice(0, 5).join(', ')}`] : []),
    ...(c.preexisting.length > 0 ? [`      원래 깨져 있던 것: ${c.preexisting.slice(0, 5).join(', ')}`] : []),
  ];
}

/**
 * 실행이 끝난 뒤 사용자가 코드를 읽고 남에게 설명할 수 있게 돕는 읽기 안내서.
 * 모델을 다시 부르지 않고, 구현 팀원의 설명과 rauha가 실행한 검증 결과로 조립한다.
 */
export class ReadingGuideDto {
  private constructor(private readonly props: ReadingGuideProps) {}

  static create(props: ReadingGuideProps): ReadingGuideDto {
    return new ReadingGuideDto(props);
  }

  toMarkdown(): string {
    return this.render((_path, label) => label);
  }

  /** `파일:줄`을 OSC 8 하이퍼링크로 감싼다. VS Code 터미널에서 클릭하면 열린다. */
  toTerminal(root: string): string {
    const base = toPosixPath(root);
    const prefix = base.startsWith('/') ? 'file://' : 'file:///';
    return this.render((path, label) => `\u001b]8;;${prefix}${base}/${toPosixPath(path)}\u001b\\${label}\u001b]8;;\u001b\\`);
  }

  private render(link: Link): string {
    const p = this.props;
    const tiers = (Object.entries(p.tierCalls) as [ModelTier, number][])
      .filter(([, n]) => n > 0)
      .map(([tier, n]) => `${tier} ${n}회`)
      .join(', ');
    const state = p.status === 'complete' ? '완료(리뷰 전)' : '멈춤';
    const lines: string[] = [
      `${p.badge} ${p.title} · ${state} · ${formatDuration(p.durationMs)} · ${tiers} · 추정 $${p.costUsd.toFixed(3)}`,
    ];

    // 가정은 맨 위에: 해석이 다르면 코드를 읽기 전에 알아야 한다.
    const unconfirmed = p.assumptions.filter((a) => !a.confirmed);
    const confirmed = p.assumptions.filter((a) => a.confirmed);
    if (unconfirmed.length > 0) {
      lines.push('', '⚠ 확인 안 된 가정 (rauha가 추천 해석으로 진행했습니다. 다르면 다시 요청하세요)');
      for (const a of unconfirmed) lines.push(`  - ${a.question} → ${a.chosen}`);
    }
    if (confirmed.length > 0) {
      lines.push('', '확인한 가정');
      for (const a of confirmed) lines.push(`  - ${a.question} → ${a.chosen} (직접 확인함)`);
    }

    if (p.status === 'stopped' && p.stopReason !== null) {
      lines.push('', `멈춘 이유: ${STOP_MESSAGE[p.stopReason]}`);
    }

    const e = p.explanation;
    if (e !== null) {
      lines.push('', '읽는 순서');
      e.readingOrder.forEach((stop, i) => {
        const label = stop.line !== null ? `${stop.path}:${stop.line}` : stop.path;
        lines.push(`  ${i + 1}. ${link(stop.path, label)}   ${stop.note}`);
      });
      lines.push('', '결정과 이유');
      for (const d of e.decisions) {
        lines.push(`  - ${sentence(d.what)} ${d.why}${d.rejected !== null ? ` (버린 안: ${d.rejected.replace(/\.\s*$/, '')})` : ''}`);
      }
      lines.push('', '직접 해 볼 것');
      for (const check of e.manualChecks) lines.push(`  - ${check}`);
      if (e.untested.length > 0) lines.push(`  - 자동 테스트가 못 잡는 부분: ${e.untested.join(', ')}`);
    }

    if (p.verdict !== null) {
      lines.push('', '검증 (rauha가 직접 실행)');
      for (const c of p.verdict.checks) lines.push(...checkLine(c));
    }

    if (p.changes.length > 0) {
      lines.push('', '바뀐 파일 (커밋은 직접 하세요)');
      for (const c of p.changes) lines.push(`  ${c.kind === 'added' ? '+' : c.kind === 'deleted' ? '-' : '~'} ${link(c.path, c.path)}`);
      if (p.status === 'stopped') {
        lines.push('', '되돌리려면');
        for (const c of p.changes) {
          lines.push(c.kind === 'added' ? `  git clean -f -- ${c.path}` : `  git checkout -- ${c.path}`);
        }
      }
    }

    if (p.logDir !== null) lines.push('', `기록: ${p.logDir}`);
    return lines.join('\n');
  }
}
