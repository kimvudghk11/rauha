/**
 * 작업 무대 배경과 소품 그리기(픽셀). 자리는 shared/scene-plan.ts 가 정하고 여기서는 모양만 그린다.
 * 소품은 기본 모양 몇 가지(기계·개수대·나무·탁자·선반·불·문·허수아비·물·의자)에 색을 입힌다. 높이는 10칸 이하.
 */
import type { CharacterSetId } from '../shared/character-set-ids.js';
import { sceneOf, type Station } from '../shared/scene-plan.js';

type Shape = 'machine' | 'basin' | 'tree' | 'table' | 'shelf' | 'fire' | 'door' | 'dummy' | 'water' | 'chair' | 'box' | 'plant' | 'board' | 'tower';

/** 소품 이름 → 모양과 색 */
const PROPS: Readonly<Record<string, readonly [Shape, string]>> = {
  'reef rock': ['box', '#3f5f74'], coral: ['plant', '#d8735f'], seaweed: ['plant', '#3f8f5a'], shipwreck: ['door', '#6a4a30'], 'treasure chest': ['box', '#b08a3a'], bubbles: ['water', '#7fc6e8'],
  campfire: ['fire', '#e8893a'], 'big tree': ['tree', '#2f6b3a'], mushrooms: ['plant', '#c45a4a'], stream: ['water', '#4f8fc0'], 'log bench': ['table', '#7a5434'], 'berry bush': ['plant', '#4a7a3a'],
  'barn door': ['door', '#8a3a2a'], field: ['plant', '#9aa83a'], well: ['basin', '#7a7a7a'], 'hay bale': ['box', '#c8a84a'], tractor: ['machine', '#3a7a3a'], 'chicken coop': ['door', '#9a7a4a'],
  'captain chair': ['chair', '#5a6a8a'], console: ['machine', '#3a6a9a'], airlock: ['door', '#6a7080'], window: ['board', '#1a2a5a'], rover: ['machine', '#9a8a6a'], antenna: ['tower', '#9aa0b0'],
  'meeting table': ['table', '#6a5040'], desk: ['table', '#7a5a40'], whiteboard: ['board', '#d8dde0'], 'server rack': ['tower', '#3a4048'], 'coffee corner': ['machine', '#5a3a2a'], printer: ['machine', '#9aa0a8'],
  throne: ['chair', '#b8902a'], 'training dummy': ['dummy', '#a8884a'], forge: ['fire', '#d8602a'], bookshelf: ['shelf', '#6a4a2a'], gate: ['door', '#5a5560'], 'war table': ['table', '#6a4a3a'],
  'teacher desk': ['table', '#7a5a3a'], desks: ['table', '#8a6a4a'], blackboard: ['board', '#2f5a3f'], locker: ['tower', '#4a6a8a'], library: ['shelf', '#6a4a2a'], 'science table': ['table', '#4a6a6a'],
  counter: ['table', '#7a4a2a'], 'coffee machine': ['machine', '#4a4a50'], sink: ['basin', '#9aa8b0'], oven: ['machine', '#5a3a30'], tables: ['table', '#8a6a4a'], 'menu board': ['board', '#2a2a2a'],
};

/** 배경: 벽(또는 하늘·물)과 바닥 색, 별 같은 점 */
const BG: Readonly<Record<CharacterSetId, { wall: string; floor: string; dots?: string }>> = {
  ocean: { wall: '#0d2a40', floor: '#8a7448', dots: '#4f8fb8' },
  forest: { wall: '#132a1c', floor: '#3b2c1c', dots: '#2f5a3a' },
  farm: { wall: '#27486a', floor: '#3f6a2c' },
  space: { wall: '#0a0b1c', floor: '#2f3346', dots: '#c8d0ff' },
  office: { wall: '#262a31', floor: '#3e352e' },
  fantasy: { wall: '#29253a', floor: '#4a4656', dots: '#3a3550' },
  school: { wall: '#25392d', floor: '#5a442c' },
  cafe: { wall: '#2e221a', floor: '#5e4530' },
};

function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** 한 소품: (cx, 바닥 y) 기준으로 아래에서 위로 */
function drawProp(px: (x: number, y: number, w: number, h: number, c: string) => void, shape: Shape, cx: number, gy: number, c: string, tick: number): void {
  const dark = shade(c, 0.65);
  const lite = shade(c, 1.3);
  switch (shape) {
    case 'machine':
      px(cx - 4, gy - 8, 8, 8, c); px(cx - 3, gy - 7, 6, 2, lite); px(cx + 1, gy - 4, 2, 2, (tick >> 2) % 2 === 0 ? '#e8c84a' : dark); px(cx - 3, gy - 4, 2, 3, dark);
      break;
    case 'basin':
      px(cx - 5, gy - 5, 10, 2, lite); px(cx - 4, gy - 3, 8, 3, c); px(cx + 2, gy - 8, 1, 3, dark);
      break;
    case 'tree':
      px(cx - 1, gy - 5, 2, 5, '#5a3a22'); px(cx - 5, gy - 10, 10, 5, c); px(cx - 3, gy - 12, 6, 2, lite);
      break;
    case 'table':
      px(cx - 6, gy - 5, 12, 2, c); px(cx - 5, gy - 3, 1, 3, dark); px(cx + 4, gy - 3, 1, 3, dark);
      break;
    case 'shelf':
      px(cx - 4, gy - 10, 8, 10, dark); for (let r = 0; r < 3; r++) px(cx - 3, gy - 9 + r * 3, 6, 2, r % 2 === 0 ? '#a8584a' : '#4a7aa8');
      break;
    case 'fire': {
      const f = (tick >> 1) % 2;
      px(cx - 4, gy - 1, 8, 1, '#5a3a22'); px(cx - 2, gy - 4 - f, 4, 3 + f, c); px(cx - 1, gy - 6 - f, 2, 2, '#f8d86a');
      break;
    }
    case 'door':
      px(cx - 4, gy - 10, 8, 10, c); px(cx - 3, gy - 9, 6, 9, dark); px(cx + 1, gy - 5, 1, 1, lite);
      break;
    case 'dummy':
      px(cx, gy - 9, 1, 9, '#5a3a22'); px(cx - 3, gy - 7, 7, 1, '#5a3a22'); px(cx - 2, gy - 9, 5, 4, c); px(cx - 1, gy - 11, 3, 2, lite);
      break;
    case 'water': {
      const b = tick % 12;
      px(cx - 5, gy - 1, 10, 1, c); px(cx - 2, gy - 3 - (b >> 2), 1, 1, lite); px(cx + 2, gy - 6 + (b >> 2), 1, 1, lite);
      break;
    }
    case 'chair':
      px(cx - 3, gy - 10, 6, 6, c); px(cx - 4, gy - 4, 8, 2, lite); px(cx - 4, gy - 2, 1, 2, dark); px(cx + 3, gy - 2, 1, 2, dark);
      break;
    case 'box':
      px(cx - 4, gy - 5, 8, 5, c); px(cx - 4, gy - 5, 8, 1, lite); px(cx - 1, gy - 4, 2, 1, dark);
      break;
    case 'plant':
      px(cx - 1, gy - 4, 1, 4, c); px(cx + 1, gy - 6, 1, 6, c); px(cx + 3, gy - 3, 1, 3, lite); px(cx - 3, gy - 5, 1, 5, lite);
      break;
    case 'board':
      px(cx - 6, gy - 11, 12, 7, dark); px(cx - 5, gy - 10, 10, 5, c); px(cx - 1, gy - 4, 1, 4, dark);
      break;
    case 'tower':
      px(cx - 2, gy - 11, 5, 11, c); for (let r = 0; r < 4; r++) px(cx - 1, gy - 10 + r * 3, 3, 1, (tick + r) % 4 === 0 ? '#6ad86a' : lite);
      break;
  }
}

/** 배경(벽·바닥·점)과 소품을 그린다. cols·rows 는 칸 수, scale 은 칸 하나의 화면 픽셀 */
export function drawScene(ctx: CanvasRenderingContext2D, id: CharacterSetId, cols: number, rows: number, scale: number, tick: number): void {
  const bg = BG[id];
  const px = (x: number, y: number, w: number, h: number, c: string): void => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x) * scale, Math.round(y) * scale, w * scale, h * scale);
  };
  const ground = rows - 1;
  px(0, 0, cols, ground, bg.wall);
  px(0, ground, cols, rows - ground, bg.floor);
  if (bg.dots !== undefined) for (let i = 0; i < cols; i += 9) px(i + ((i * 7) % 5), (i * 3) % Math.max(1, ground - 6), 1, 1, bg.dots);
  const s = sceneOf(id);
  const all: Station[] = [s.center, ...s.stations];
  for (const st of all) {
    const prop = PROPS[st.label];
    if (prop !== undefined) drawProp(px, prop[0], Math.round(st.x * cols), ground, prop[1], tick);
  }
}
