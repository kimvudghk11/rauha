/**
 * 작업 무대의 장면(순수 규칙): 컨셉마다 가운데 자리 + 소품 다섯 곳, 팀원은 맡은 일에 맞는 두 소품 사이를 오간다.
 * 그림은 renderer/scene-draw.ts 가 그린다. 여기서는 자리(가로 비율)와 시간에 따른 위치만 정한다.
 */
import type { CharacterSetId } from './character-set-ids.js';

export interface Station {
  readonly id: string;
  readonly label: string;
  /** 무대 너비에 대한 가로 비율(0~1) */
  readonly x: number;
}

export interface Scene {
  readonly center: Station;
  readonly stations: readonly Station[];
}

const st = (id: string, label: string, x: number): Station => ({ id, label, x });
const XS = [0.1, 0.27, 0.73, 0.9, 0.38] as const;
const scene = (center: [string, string], labels: readonly [string, string, string, string, string]): Scene => ({
  center: st(center[0], center[1], 0.5),
  stations: labels.map((l, i) => st(l.replace(/\s+/g, '-'), l, XS[i]!)),
});

const SCENES: Readonly<Record<CharacterSetId, Scene>> = {
  ocean: scene(['reef', 'reef rock'], ['coral', 'seaweed', 'shipwreck', 'treasure chest', 'bubbles']),
  forest: scene(['campfire', 'campfire'], ['big tree', 'mushrooms', 'stream', 'log bench', 'berry bush']),
  farm: scene(['barn', 'barn door'], ['field', 'well', 'hay bale', 'tractor', 'chicken coop']),
  space: scene(['bridge', 'captain chair'], ['console', 'airlock', 'window', 'rover', 'antenna']),
  office: scene(['meeting', 'meeting table'], ['desk', 'whiteboard', 'server rack', 'coffee corner', 'printer']),
  fantasy: scene(['throne', 'throne'], ['training dummy', 'forge', 'bookshelf', 'gate', 'war table']),
  school: scene(['podium', 'teacher desk'], ['desks', 'blackboard', 'locker', 'library', 'science table']),
  cafe: scene(['counter', 'counter'], ['coffee machine', 'sink', 'oven', 'tables', 'menu board']),
};

/** 역할 → 오가는 두 소품(번호). 만드는 일은 0↔1, 확인하는 일은 4↔2, 쓰는·꾸미는 일은 2↔3, 계획·운영은 4↔3 */
const ROLE_PAIRS: Readonly<Record<string, readonly [number, number]>> = {
  implementer: [0, 1], debugger: [0, 1], operator: [0, 1], splitter: [0, 1],
  tester: [4, 2], reviewer: [4, 2], riskchecker: [4, 2], securitychecker: [4, 2],
  writer: [2, 3], designer: [2, 3], uxdesigner: [2, 3], brand: [2, 3], marketer: [2, 3], publisher: [2, 3],
  planner: [4, 3], chief: [4, 3], router: [4, 3], surveyor: [4, 3], answerer: [4, 3], bm: [4, 3], growth: [4, 3], releaser: [4, 3],
};

export function sceneOf(id: CharacterSetId): Scene {
  return SCENES[id];
}

/** 그 역할이 오가는 두 소품(팀장은 가운데 한 곳) */
export function stationsFor(id: CharacterSetId, role: string): Station[] {
  const s = SCENES[id];
  if (role === 'intake') return [s.center];
  const [a, b] = ROLE_PAIRS[role] ?? [0, 3];
  return [s.stations[a]!, s.stations[b]!];
}

/** 한 바퀴: 머무름 30 · 걷기 10 · 머무름 30 · 걷기 10 (걸음 단위) */
const CYCLE = 80;

/**
 * 시간(tick)에 따른 왼쪽 위치(칸). 팀원마다 시작 시점을 엇갈리게(index) 한다.
 * 걷는 동안은 두 자리 사이를 고르게 지나간다(순간이동 없음). 무대 밖으로 나가지 않는다.
 */
export function actorX(id: CharacterSetId, role: string, index: number, tick: number, cols: number, width: number): number {
  const spots = stationsFor(id, role);
  const clamp = (x: number): number => Math.max(0, Math.min(cols - width, Math.round(x)));
  const at = (s: Station): number => s.x * cols - width / 2;
  if (spots.length === 1) return clamp(at(spots[0]!));
  const [a, b] = [at(spots[0]!), at(spots[1]!)];
  const t = (tick + index * 23) % CYCLE;
  if (t < 30) return clamp(a);
  if (t < 40) return clamp(a + ((b - a) * (t - 30)) / 10);
  if (t < 70) return clamp(b);
  return clamp(b + ((a - b) * (t - 70)) / 10);
}
