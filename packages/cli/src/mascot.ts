import type { MemberRole, PermissionRequest } from '@rauha/core';
import { displayWidth, wrapText } from './text-width.js';

export { displayWidth };

/** 터미널에 그리는 rauha 캐릭터 Delfi(돌고래). 한 칸 = 픽셀 위아래 두 개(▀). */
export type Face = 'hello' | 'done' | 'stuck' | 'ask';
export type Pixels = (string | null)[][];

/**
 * 그림 16칸 + 오른쪽 6칸은 반짝이·땀·물음표 자리.
 * 줄의 마지막 칸은 위아래 픽셀 중 하나만 칠한다. 배경색이 있으면 cmd 창 크기를 바꿀 때 그 배경이 줄 끝까지 번진다.
 */
const WIDTH = 22;

const COLORS: Readonly<Record<string, string>> = {
  B: '#6FBDEB', S: '#4596CC', H: '#C4E8FF', L: '#DDF2FF',
  E: '#1D2B3A', W: '#FFFFFF', M: '#1D2B3A', P: '#F7A9C2', Y: '#FFDB7A', R: '#7CC4F0',
};

const BODY = [
  '........S.......',
  '.......SBS......',
  '.....HBBBBB.....',
  '...HBBBBBBBBB...',
  '..HBBBBBBBBBBB..',
  '.HBBBBBBBBBBBBB.',
  '.BBBBBBBBBBBBBB.',
  '.BBBBBBBBBBBBBB.',
  '.BBBBBBBBBBBBBB.',
  'SBBBBLLLLLLBBBBS',
  'SSBBLLLLLLLLBBSS',
  '..BBBLLLLLLBBB..',
  '...SBBLLLLBBS...',
  '.....SSSSSS.....',
];
const EYES: readonly [x: number, y: number][] = [[4, 6], [10, 6]];
const MOUTH: readonly [x: number, y: number] = [6, 10];
const BLUSH: readonly [x: number, y: number][] = [[2, 9], [3, 9], [12, 9], [13, 9]];

type Stamp = readonly string[];
const OPEN: Stamp = ['WE.', 'EE.', 'EE.'];
const HAPPY: Stamp = ['...', '.E.', 'E.E'];

interface FaceSpec {
  /** 왼쪽·오른쪽 눈 */
  readonly eyes: readonly [Stamp, Stamp];
  /** 3칸짜리 ^ 눈은 왼쪽 눈을 한 칸 당겨야 좌우가 맞는다. */
  readonly shiftLeftEye: boolean;
  readonly mouth: Stamp;
  readonly blush: boolean;
  readonly extra: readonly [color: string, points: readonly [number, number][]] | null;
}

const FACES: Readonly<Record<Face, FaceSpec>> = {
  hello: { eyes: [OPEN, OPEN], shiftLeftEye: false, mouth: ['M..M', '.MM.'], blush: false, extra: null },
  done: {
    eyes: [HAPPY, HAPPY], shiftLeftEye: true, mouth: ['M..M', '.MM.'], blush: true,
    extra: ['Y', [[19, 0], [18, 1], [19, 1], [20, 1], [19, 2], [17, 4]]],
  },
  stuck: {
    eyes: [['E..', '.E.', 'E..'], ['.E.', 'E..', '.E.']], shiftLeftEye: false, mouth: ['M.M.', '.M.M'], blush: false,
    extra: ['R', [[16, 2], [16, 3], [17, 3], [16, 4], [17, 4]]],
  },
  ask: {
    eyes: [OPEN, OPEN], shiftLeftEye: false, mouth: ['.MM.'], blush: false,
    extra: ['Y', [[18, 0], [19, 0], [20, 0], [21, 1], [20, 2], [19, 3], [19, 5]]],
  },
};

export function paintDelfi(face: Face): Pixels {
  const spec = FACES[face];
  const px: Pixels = BODY.map((row) => [...row.padEnd(WIDTH, '.')].map((k) => (k === '.' ? null : COLORS[k]!)));
  const stamp = (rows: Stamp, x: number, y: number) =>
    rows.forEach((row, dy) =>
      [...row].forEach((k, dx) => {
        if (k !== '.') px[y + dy]![x + dx] = COLORS[k]!;
      }),
    );
  EYES.forEach(([x, y], i) => stamp(spec.eyes[i]!, x - (i === 0 && spec.shiftLeftEye ? 1 : 0), y));
  stamp(spec.mouth, MOUTH[0], MOUTH[1]);
  if (spec.blush) for (const [x, y] of BLUSH) px[y]![x] = COLORS['P']!;
  if (spec.extra !== null) for (const [x, y] of spec.extra[1]) px[y]![x] = COLORS[spec.extra[0]]!;
  return px;
}

// ── 색 ─────────────────────────────────────────────────────

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** xterm 256색 큐브(16~231)에서 가장 가까운 번호. */
export function ansi256(hex: string): number {
  const levels = [0, 95, 135, 175, 215, 255];
  const nearest = (v: number) => levels.reduce((best, level, i) => (Math.abs(level - v) < Math.abs(levels[best]! - v) ? i : best), 0);
  const [r, g, b] = rgb(hex).map(nearest) as [number, number, number];
  return 16 + 36 * r + 6 * g + b;
}

/** depth: 24 = 트루컬러, 8 = 256색. layer 38 = 글자색, 48 = 배경색. */
function color(hex: string, depth: number, layer: 38 | 48): string {
  return depth >= 24 ? `${layer};2;${rgb(hex).join(';')}` : `${layer};5;${ansi256(hex)}`;
}

const RESET = '\x1b[0m';

export function toAnsi(px: Pixels, depth: number): string[] {
  const lines: string[] = [];
  for (let y = 0; y < px.length; y += 2) {
    let line = '';
    for (let x = 0; x < px[y]!.length; x += 1) {
      const top = px[y]![x] ?? null;
      const bottom = px[y + 1]?.[x] ?? null;
      // 글자색·배경색 코드는 따로 쓴다. 한 코드에 묶으면 Ink(대화 화면)가 다시 쓸 때 배경색을 닫지 않는다.
      if (top !== null && bottom !== null) line += `\x1b[${color(top, depth, 38)}m\x1b[${color(bottom, depth, 48)}m▀`;
      else if (top !== null) line += `\x1b[49m\x1b[${color(top, depth, 38)}m▀`;
      else if (bottom !== null) line += `\x1b[49m\x1b[${color(bottom, depth, 38)}m▄`;
      else line += `${RESET} `;
    }
    lines.push(line + RESET);
  }
  return lines;
}

/**
 * 1/8 블록으로 그린 얇은 테두리 박스. 테두리는 글자색만 쓴다(배경색 없음).
 * 세로선 ▕ ▏은 칸의 안쪽 가장자리에, 윗변 ▁·아랫변 ▔은 그 사이 칸에만 그려서 모서리가 맞물린다.
 * 선 문자(╭─╮)는 한글 글꼴 cmd에서 창 크기를 바꾸면 가로선이 사라져서 쓰지 않는다.
 * 안쪽 글에는 '·'처럼 터미널마다 폭이 다른 글자를 넣지 않는다. 두 칸이 되어 테두리가 어긋난다.
 */
export function box(lines: readonly string[], borderHex: string, depth: number): string[] {
  const inner = Math.max(...lines.map(displayWidth));
  const edge = (text: string) => `\x1b[${color(borderHex, depth, 38)}m${text}${RESET}`;
  return [
    ` ${edge('▁'.repeat(inner + 2))} `,
    ...lines.map((line) => `${edge('▕')} ${line}${' '.repeat(inner - displayWidth(line))} ${edge('▏')}`),
    ` ${edge('▔'.repeat(inner + 2))} `,
  ];
}

/** 너비 max를 넘으면 가운데를 '...'로 줄인다. 경로의 앞(드라이브)과 끝(폴더 이름)이 남는다. */
function shortenMiddle(text: string, max: number): string {
  if (displayWidth(text) <= max) return text;
  const chars = [...text];
  const take = (from: string[], budget: number) => {
    const out: string[] = [];
    for (const ch of from) {
      if (displayWidth([...out, ch].join('')) > budget) break;
      out.push(ch);
    }
    return out;
  };
  const room = Math.max(0, max - 3);
  const head = take(chars, Math.ceil(room / 2));
  const tail = take([...chars].reverse(), Math.floor(room / 2)).reverse();
  return `${head.join('')}...${tail.join('')}`;
}

/** 그림 오른쪽에 글을 붙인다. 짧은 쪽을 세로 가운데에 둔다. */
export function beside(art: readonly string[], text: readonly string[], gap = 2): string[] {
  const artWidth = displayWidth(art[0] ?? '');
  const height = Math.max(art.length, text.length);
  const artTop = Math.floor((height - art.length) / 2);
  const textTop = Math.floor((height - text.length) / 2);
  return Array.from({ length: height }, (_, i) => {
    const a = art[i - artTop];
    const t = text[i - textTop];
    if (t === undefined) return a ?? '';
    return `${a ?? ' '.repeat(artWidth)}${' '.repeat(gap)}${t}`;
  });
}

// ── 화면 ───────────────────────────────────────────────────

/**
 * 시작 박스의 최대 너비. cmd는 창을 줄이면 이미 찍힌 줄도 다시 접어서, 박스보다 좁아지면 테두리가 깨진다.
 * 다시 그리는 TUI가 아니므로 박스를 작게 잡아서 버틴다.
 */
const MAX_BANNER_WIDTH = 60;

/** 허락 박스의 최대 너비. 긴 명령은 이 안에서 접는다. */
const MAX_PERMISSION_WIDTH = 76;

const ROLE_COLOR: Readonly<Record<MemberRole, string>> = { intake: '#8FD3F7', tester: '#F3958F', implementer: '#84D9AE', reviewer: '#C3B4F5', router: '#8FD3F7', answerer: '#8FD3F7' };
const ROLE_NAME: Readonly<Record<MemberRole, string>> = { intake: '팀장', tester: '테스트 팀원', implementer: '구현 팀원', reviewer: '리뷰어', router: '라우터', answerer: '답변 팀원' };

export interface MascotView {
  /** columns: 터미널 너비. 박스가 이보다 넓어지지 않게 작업 폴더 경로를 줄인다. */
  banner(workDir: string, columns: number): string;
  step(message: string, role?: MemberRole): string;
  /** 팀원이 일하는 동안 다시 그리는 한 줄 */
  working(frame: string, message: string, role: MemberRole, elapsed: string): string;
  /** 팀원 일이 끝나 고정되는 줄 */
  done(message: string, role: MemberRole, elapsed: string): string;
  finale(status: 'complete' | 'stopped'): string;
  /** Claude Code 허락 화면처럼: 물음표 Delfi + 누가·어떤 도구로·무엇을·왜 하는지 담은 박스 */
  permission(request: PermissionRequest, columns: number): string;
  /** 코드에 들어갔는데 근거를 확인하지 못한 사실을 보여 주는 화면 */
  factCheck(claim: string, columns: number): string;
  /** "아까 그 기능" 후보를 고르게 하기 전에 보여 주는 화면 */
  pastPick(columns: number): string;
  /** 선택 목록에서 고른 줄 색칠 */
  highlight(text: string): string;
}

/** 256색 이상 터미널에서만 Delfi를 그린다. 그보다 못하면 null(글자만 쓰는 기존 출력). */
export function mascotView(depth: number, version: string, badge: string): MascotView | null {
  if (depth < 8) return null;
  const fg = (hex: string, text: string) => `\x1b[${color(hex, depth, 38)}m${text}${RESET}`;
  const dim = (text: string) => `\x1b[2m${text}${RESET}`;
  /** Delfi를 왼쪽에서 두 칸 띄우고, 글과는 세 칸 띄운다. */
  const GAP = 3;
  const art = (face: Face) => toAnsi(paintDelfi(face), depth).map((line) => `  ${line}`);
  const say = (face: Face, text: string[]) => beside(art(face), text, GAP).join('\n');
  return {
    // Claude Code 시작 화면처럼 맨 위에 박스 하나: 왼쪽 Delfi, 오른쪽 rauha·인사말·작업 폴더.
    banner: (workDir, columns) => {
      const picture = art('hello');
      const textRoom = Math.min(columns, MAX_BANNER_WIDTH) - 4 - displayWidth(picture[0]!) - GAP;
      const text = [`\x1b[1m${fg(COLORS['B']!, 'rauha')} ${dim(version)}  ${dim(badge)}`, '오늘도 신나게 헤엄쳐요', '', dim(shortenMiddle(workDir, textRoom))];
      return box(['', ...beside(picture, text, GAP), ''], COLORS['B']!, depth).join('\n');
    },
    step: (message, role) => (role === undefined ? `  ${dim('·')} ${dim(message)}` : `  ${fg(ROLE_COLOR[role], '◆')} ${message}`),
    working: (frame, message, role, elapsed) => `  ${fg(ROLE_COLOR[role], frame)} ${message} ${dim(elapsed)}`,
    done: (message, role, elapsed) => `  ${fg(ROLE_COLOR[role], '◆')} ${message.replace(/ 작업 중…$/, '')} ${dim(elapsed)}`,
    finale: (status) =>
      status === 'complete'
        ? say('done', ['끝났어요! 아래 읽기 안내서부터 봐 주세요.'])
        : say('stuck', ['여기서 멈췄어요. 이유는 아래 안내서에 적어 뒀어요.']),
    permission: (request, columns) => {
      const inner = Math.min(columns, MAX_PERMISSION_WIDTH) - 4;
      const command = wrapText(request.detail, inner - 2).map((line) => `  \x1b[1m${line}${RESET}`);
      const reason = wrapText(request.reason, inner - 2).map((line) => `  ${dim(line)}`);
      const header = `\x1b[1m${fg(ROLE_COLOR[request.role], ROLE_NAME[request.role])}  ${dim(request.tool)}`;
      return [say('ask', ['위험할 수 있는 동작이라 직접 허락받을게요.']), '', ...box([header, '', ...command, ...reason], COLORS['B']!, depth)].join('\n');
    },
    factCheck: (claim, columns) => {
      const inner = Math.min(columns, MAX_PERMISSION_WIDTH) - 4;
      const lines = wrapText(claim, inner - 2).map((line) => `  \x1b[1m${line}${RESET}`);
      return [say('ask', ['근거를 확인하지 못했어요. 맞는지 알려 주세요.']), '', ...box([dim('코드에 들어간 사실'), '', ...lines], COLORS['B']!, depth)].join('\n');
    },
    pastPick: () => say('ask', ['혹시 이 작업을 말씀하시는 건가요?']),
    highlight: (text) => `\x1b[1m${fg(COLORS['B']!, text)}`,
  };
}
