import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatApp } from './chat-app.js';
import { mascotView } from '../mascot.js';
import { ChatStore } from './chat-store.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
const visible = (s: string | undefined) => (s ?? '').replace(/\x1b\[[0-9;]*m/g, '');
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const m of mounted.splice(0)) m.unmount();
});

function app(store = new ChatStore(), onSubmit = vi.fn()) {
  const r = render(React.createElement(ChatApp, { store, banner: (columns: number) => `rauha v0.0.0 시작 박스 ${columns}칸`, view: null, onSubmit }));
  mounted.push(r);
  return { ...r, store, onSubmit };
}

/** 가짜 터미널 크기를 바꾸고 resize를 알린 뒤, 다시 그릴 때까지 기다린다. */
async function resize(stdout: NodeJS.EventEmitter, columns: number, rows: number) {
  Object.defineProperty(stdout, 'columns', { value: columns, configurable: true });
  Object.defineProperty(stdout, 'rows', { value: rows, configurable: true });
  stdout.emit('resize');
  await new Promise((resolve) => setTimeout(resolve, 300));
}

/** 마지막으로 다시 그린 화면(마지막 배너부터 끝까지) */
const lastScreen = (frame: string) => frame.slice(frame.lastIndexOf('rauha v0.0.0'));

describe('ChatApp', () => {
  it('처음에는 배너와 입력창을 그린다', () => {
    const { lastFrame } = app();
    const frame = visible(lastFrame());
    expect(frame).toContain('rauha v0.0.0 시작 박스');
    expect(frame).toContain('▁');
    expect(frame).toContain('>');
  });

  it('글을 치고 Enter를 누르면 onSubmit으로 보낸다', async () => {
    const { stdin, onSubmit } = app();
    await tick();
    stdin.write('고쳐줘');
    await tick();
    stdin.write('\r');
    await tick();
    expect(onSubmit).toHaveBeenCalledWith('고쳐줘');
  });

  it('일하는 중에도 입력을 받는다 (줄 세우는 건 onSubmit을 받는 쪽이 한다)', async () => {
    const store = new ChatStore();
    store.setBusy(true);
    const { stdin, onSubmit } = app(store);
    await tick();
    stdin.write('abc');
    await tick();
    stdin.write('\r');
    await tick();
    expect(onSubmit).toHaveBeenCalledWith('abc');
  });

  it('일하는 중에 받아 둔 입력은 입력창 위에 대기로 보인다', async () => {
    const store = new ChatStore();
    store.setBusy(true);
    store.enqueue('테스트도 추가해줘');
    const { lastFrame } = app(store);
    await tick();
    expect(visible(lastFrame())).toContain('대기 1  테스트도 추가해줘');
  });

  it('메뉴 질문이 뜨면 아래 화살표와 Enter로 고른다', async () => {
    const store = new ChatStore();
    const { stdin, lastFrame } = app(store);
    const answer = store.ask({ kind: 'menu', screen: '위험할 수 있는 동작이에요', options: ['허락', '거절'] });
    await tick();
    expect(visible(lastFrame())).toContain('1. 허락');
    stdin.write('\u001B[B');
    await tick();
    stdin.write('\r');
    expect(await answer).toBe(1);
  });

  it('글 질문은 입력한 글로 답한다', async () => {
    const store = new ChatStore();
    const { stdin } = app(store);
    const answer = store.ask({ kind: 'text', label: '팀원에게 전할 이유' });
    await tick();
    stdin.write('build만 지워');
    await tick();
    stdin.write('\r');
    expect(await answer).toBe('build만 지워');
  });

  it('입력창은 창 너비를 따라 넓어지고 줄어든다 (마지막 칸은 비운다)', async () => {
    const { lastFrame, stdout } = app();
    const widest = () => Math.max(...visible(lastFrame() ?? '').split('\n').filter((l) => l.includes('▁') || l.includes('▔')).map((l) => [...l.trimEnd()].length));
    await resize(stdout, 140, 40);
    expect(widest()).toBeGreaterThan(100);
    expect(widest()).toBeLessThanOrEqual(139);
    await resize(stdout, 50, 40);
    expect(widest()).toBeLessThanOrEqual(49);
  });

  it('입력창은 화면 맨 아래에 붙는다 (위 출력과 입력창 사이를 빈 줄로 채운다)', async () => {
    const { stdout, lastFrame } = app();
    await resize(stdout, 100, 20);
    const lines = visible(lastScreen(lastFrame() ?? '')).split('\n');
    // 마지막 줄 다음에 커서가 한 줄 더 내려가므로 화면 높이보다 한 줄 적게 그린다.
    expect(lines.length).toBe(19);
    expect(lines.at(-1)).toContain('▔');
  });

  it('출력이 화면보다 길어지면 빈 줄 없이 출력 바로 아래에 입력창이 온다', async () => {
    const store = new ChatStore();
    const { stdout, lastFrame } = app(store);
    for (let i = 0; i < 30; i++) store.print(`줄 ${i}`);
    await resize(stdout, 100, 20);
    const lines = visible(lastScreen(lastFrame() ?? '')).split('\n');
    expect(lines.indexOf('줄 29') + 1).toBe(lines.findIndex((l) => l.includes('▁')) - 1);
  });

  it('창 크기가 바뀌면 화면을 지우고 지난 출력을 새 너비로 다시 그린다', async () => {
    const store = new ChatStore();
    const { stdout, lastFrame } = app(store);
    store.print('지난 출력');
    await tick();
    await resize(stdout, 60, 20);
    expect((stdout as unknown as { frames: string[] }).frames.some((f) => f.includes('\x1b[2J\x1b[3J'))).toBe(true);
    const screen = visible(lastScreen(lastFrame() ?? ''));
    expect(screen).toContain('시작 박스 60칸');
    expect(screen).toContain('지난 출력');
  });

  it('화면을 비우면 화면과 스크롤을 지우고 배너부터 새로 그린다 (지난 출력은 다시 찍지 않는다)', async () => {
    const store = new ChatStore();
    const { stdout, lastFrame } = app(store);
    store.print('지난 출력');
    await tick();
    store.clearScreen();
    await tick();
    expect((stdout as unknown as { frames: string[] }).frames.some((f) => f.includes('\x1b[2J\x1b[3J'))).toBe(true);
    const screen = visible(lastScreen(lastFrame() ?? ''));
    expect(screen).toContain('시작 박스');
    expect(screen).not.toContain('지난 출력');
  });

  it('Ctrl+L은 터미널처럼 화면을 비운다', async () => {
    const store = new ChatStore();
    const { stdin, stdout } = app(store);
    store.print('지난 출력');
    await tick();
    stdin.write('\x0c');
    await tick();
    expect((stdout as unknown as { frames: string[] }).frames.some((f) => f.includes('\x1b[2J\x1b[3J'))).toBe(true);
    expect(store.lines).toEqual([]);
  });

  it('긴 고정 줄은 창 너비에 맞춰 미리 접는다 (줄 수를 정확히 세려고)', async () => {
    const store = new ChatStore();
    const { stdout, lastFrame } = app(store);
    store.print('가'.repeat(40));
    await resize(stdout, 30, 20);
    const lines = visible(lastScreen(lastFrame() ?? '')).split('\n').filter((l) => l.includes('가'));
    expect(lines.length).toBe(3);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(14);
  });

  it('진짜 커서를 입력창의 글자 자리로 옮기고, 일하는 동안에도 그 자리에 둔다 (한글 조합이 입력창에 보이게)', async () => {
    const spots: unknown[] = [];
    const store = new ChatStore();
    const r = render(React.createElement(ChatApp, { store, banner: () => '배너', view: null, onSubmit: vi.fn(), cursor: { set: (s) => spots.push(s) } }));
    mounted.push(r);
    await tick();
    r.stdin.write('가a');
    await tick();
    // ▕ + 여백 + '> ' = 4칸, '가a' = 3칸. 입력 줄은 아래 테두리 위, 화면 끝 다음 줄에서 두 줄 위.
    expect(spots.at(-1)).toEqual({ up: 2, column: 7 });
    store.setBusy(true);
    await tick();
    expect(spots.at(-1)).toEqual({ up: 2, column: 7 });
  });

  it('입력창 아래에 상태 줄을 흐리게 보여 주고, 커서 자리는 그만큼 위로 잡는다', async () => {
    const spots: unknown[] = [];
    const store = new ChatStore();
    store.setStatus('[personal] · 세션 83% · 주간 21% · main');
    const r = render(React.createElement(ChatApp, { store, banner: () => '배너', view: null, onSubmit: vi.fn(), cursor: { set: (s) => spots.push(s) } }));
    mounted.push(r);
    await tick();
    const lines = visible(r.lastFrame()).split('\n');
    expect(lines.at(-1)).toContain('세션 83% · 주간 21% · main');
    expect(lines.at(-2)).toContain('▔');
    expect(spots.at(-1)).toEqual({ up: 3, column: 4 });
  });

  it('상태 줄이 창보다 길어도 한 줄로 잘라서, 입력창 위치와 커서 자리가 틀어지지 않는다', async () => {
    const store = new ChatStore();
    store.setStatus(`[personal] · 세션 ${'█'.repeat(60)} 83%`);
    const { stdout, lastFrame } = app(store);
    await resize(stdout, 40, 20);
    const lines = visible(lastScreen(lastFrame() ?? '')).split('\n');
    // 접히면 막대 조각이 다음 줄에 따로 남는다.
    expect(lines.filter((l) => l.includes('█'))).toHaveLength(1);
    expect(lines.at(-1)).toContain('세션');
  });

  it('긴 입력은 입력창 안에서 줄을 바꿔 다 보여 준다', async () => {
    const { stdin, lastFrame } = app();
    await tick();
    stdin.write('가'.repeat(50));
    await tick();
    const rows = visible(lastFrame()).split('\n').filter((l) => l.includes('가'));
    expect(rows.length).toBe(2);
  });

  it('창 너비에 따라 달라지는 고정 줄은 그 너비로 만들어 그린다 (창을 바꾸면 다시 만든다)', async () => {
    const store = new ChatStore();
    const { stdout, lastFrame } = app(store);
    store.print((columns) => `카드 ${columns}칸`);
    await tick();
    expect(visible(lastFrame())).toContain('카드 100칸');
    await resize(stdout, 60, 20);
    expect(visible(lastScreen(lastFrame() ?? ''))).toContain('카드 60칸');
  });

  it('입력창에 글이 있으면 Ctrl+C는 글만 지우고 끝내기로 넘기지 않는다 (Claude Code·Kiro처럼)', async () => {
    const onInterrupt = vi.fn();
    const r = render(React.createElement(ChatApp, { store: new ChatStore(), banner: () => '배너', view: null, onSubmit: vi.fn(), onInterrupt }));
    mounted.push(r);
    await tick();
    r.stdin.write('hello');
    await tick();
    r.stdin.write('\x03');
    await tick();
    expect(onInterrupt).not.toHaveBeenCalled();
    expect(visible(r.lastFrame())).not.toContain('hello');
  });

  it('일하는 중에 Esc를 누르면 Ctrl+C처럼 그 작업을 멈추고, 쉬는 중의 Esc는 아무 일도 없다', async () => {
    const onInterrupt = vi.fn();
    const store = new ChatStore();
    const r = render(React.createElement(ChatApp, { store, banner: () => '배너', view: null, onSubmit: vi.fn(), onInterrupt }));
    mounted.push(r);
    await tick();
    r.stdin.write(String.fromCharCode(27));
    await tick();
    expect(onInterrupt).not.toHaveBeenCalled();
    store.setBusy(true);
    await tick();
    r.stdin.write(String.fromCharCode(27));
    await tick();
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('빈 입력창에서 Ctrl+D는 Ctrl+C처럼 끝내기로 넘긴다', async () => {
    const onInterrupt = vi.fn();
    const r = render(React.createElement(ChatApp, { store: new ChatStore(), banner: () => '배너', view: null, onSubmit: vi.fn(), onInterrupt }));
    mounted.push(r);
    await tick();
    r.stdin.write('\x04');
    await tick();
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('잠깐 알림은 입력창 아래에 띄우고 지난 출력에 남기지 않는다', async () => {
    const store = new ChatStore();
    const { lastFrame } = app(store);
    store.setNotice('한 번 더 누르면 끝나요');
    await tick();
    expect(visible(lastFrame()).split('\n').at(-1)).toContain('한 번 더 누르면 끝나요');
    expect(store.lines).toEqual([]);
    store.setNotice('');
    await tick();
    expect(visible(lastFrame())).not.toContain('한 번 더 누르면 끝나요');
  });

  it('Ctrl+C는 바로 끝내지 않고 onInterrupt로 알린다', async () => {
    const onInterrupt = vi.fn();
    const r = render(React.createElement(ChatApp, { store: new ChatStore(), banner: () => '배너', view: null, onSubmit: vi.fn(), onInterrupt }));
    mounted.push(r);
    await tick();
    r.stdin.write('\x03');
    await tick();
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('위 화살표로 앞서 보낸 입력을 다시 불러오고, 아래로 내리면 쓰던 글로 돌아온다', async () => {
    const store = new ChatStore();
    store.remember('첫 요청');
    store.remember('둘째 요청');
    const { stdin, lastFrame } = app(store);
    await tick();
    stdin.write('쓰던');
    await tick();
    stdin.write('\u001B[A');
    await tick();
    expect(visible(lastFrame())).toContain('> 둘째 요청');
    stdin.write('\u001B[A');
    await tick();
    expect(visible(lastFrame())).toContain('> 첫 요청');
    stdin.write('\u001B[B');
    await tick();
    stdin.write('\u001B[B');
    await tick();
    expect(visible(lastFrame())).toContain('> 쓰던');
  });

  it("'/'를 치면 명령 후보가 설명과 함께 뜨고, Tab으로 고른 명령을 채운다", async () => {
    const { stdin, lastFrame, onSubmit } = app();
    await tick();
    stdin.write('/u');
    await tick();
    expect(visible(lastFrame())).toContain('/usage');
    expect(visible(lastFrame())).toContain('구독 사용률');
    stdin.write('\t');
    await tick();
    stdin.write('\r');
    await tick();
    expect(onSubmit).toHaveBeenCalledWith('/usage');
  });

  it('명령 후보가 떠 있을 때 Enter는 고른 명령을 보낸다', async () => {
    const { stdin, onSubmit } = app();
    await tick();
    stdin.write('/');
    await tick();
    stdin.write('\u001B[B');
    await tick();
    stdin.write('\r');
    await tick();
    expect(onSubmit).toHaveBeenCalledWith('/status');
  });

  it('한 번에 낸 여러 줄의 빈 줄도 그대로 그린다 (세어 둔 줄 수와 실제가 같아야 입력창이 맨 아래에 붙는다)', async () => {
    const store = new ChatStore();
    const { lastFrame } = app(store);
    store.printLines(['윗줄', '', '아랫줄']);
    await tick();
    const lines = visible(lastFrame()).split('\n');
    expect(lines.indexOf('아랫줄') - lines.indexOf('윗줄')).toBe(2);
  });

  it('줄마다 따로 내도 빈 줄이 사라지지 않게 한 덩어리로 낸다 (Ink는 빈 줄뿐인 고정 출력을 버린다)', async () => {
    const store = new ChatStore();
    const { lastFrame } = app(store);
    // 이전: 줄마다 따로 그려져서 빈 줄 하나짜리 덩어리가 통째로 버려졌다.
    store.printLines(['\n> 질문', '', '  답']);
    await tick();
    const lines = visible(lastFrame()).split('\n');
    expect(lines.indexOf('  답') - lines.indexOf('> 질문')).toBe(2);
  });

  it('질문이 떠 있는 동안에는 작업 중 줄을 감춘다 (키가 눌릴 때마다가 아니라 0.12초마다 다시 그리면 화면이 넘칠 때 전체를 계속 다시 찍는다)', async () => {
    const store = new ChatStore();
    const { lastFrame } = app(store);
    store.startWorking('접수 중…', 'intake', Date.now());
    await tick();
    expect(visible(lastFrame())).toContain('접수 중…');
    void store.ask({ kind: 'menu', screen: '허락?', options: ['허락', '거절'] });
    await tick();
    expect(visible(lastFrame())).not.toContain('접수 중…');
    expect(visible(lastFrame())).toContain('허락?');
  });

  it('질문 화면이 창보다 높으면 짧은 질문 화면으로 바꿔 그린다', async () => {
    const store = new ChatStore();
    const { stdout, lastFrame } = app(store);
    await resize(stdout, 80, 16);
    void store.ask({ kind: 'menu', screen: Array.from({ length: 30 }, (_, i) => 'LONG' + i).join('\n'), compactScreen: 'COMPACT', options: ['허락', '거절'] });
    await tick();
    expect(visible(lastFrame())).toContain('COMPACT');
    expect(visible(lastFrame())).not.toContain('LONG1');
  });

  it('창이 충분히 높으면 원래 질문 화면을 그린다', async () => {
    const store = new ChatStore();
    const { stdout, lastFrame } = app(store);
    await resize(stdout, 80, 40);
    void store.ask({ kind: 'menu', screen: 'FULL', compactScreen: 'COMPACT', options: ['허락', '거절'] });
    await tick();
    expect(visible(lastFrame())).toContain('FULL');
    expect(visible(lastFrame())).not.toContain('COMPACT');
  });

  it('낮은 창에서는 작은 Delfi 대신 한 줄짜리 작업 중 표시를 쓴다', async () => {
    const store = new ChatStore();
    const view = mascotView(24, 'v0', '[personal]');
    const r = render(React.createElement(ChatApp, { store, banner: () => '배너', view, onSubmit: vi.fn() }));
    mounted.push(r);
    await resize(r.stdout, 80, 12);
    store.startWorking('접수 중…', 'intake', Date.now());
    await tick();
    const screen = visible(r.lastFrame());
    expect(screen).toContain('접수 중…');
    expect(screen).not.toMatch(/[▀▄]/);
  });

  it('일하는 동안 작은 Delfi가 시간이 지나면 움직인다', async () => {
    const store = new ChatStore();
    const view = mascotView(24, 'v0', '[personal]');
    const r = render(React.createElement(ChatApp, { store, banner: () => '배너', view, onSubmit: vi.fn() }));
    mounted.push(r);
    await resize(r.stdout, 100, 30);
    store.startWorking('접수 중…', 'intake', Date.now());
    const seen = new Set<string>();
    for (let i = 0; i < 14; i++) {
      await new Promise((resolve) => setTimeout(resolve, 130));
      // 스피너·경과 시간 같은 글은 빼고 그림(들여쓰기 2 + 10칸)만 비교한다.
      seen.add(
        visible(r.lastFrame())
          .split('\n')
          .filter((l) => /[▀▄]/.test(l.slice(0, 12)))
          .map((l) => l.slice(0, 12))
          .join('\n'),
      );
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('고정 줄은 출력된 순서대로 남는다', async () => {
    const store = new ChatStore();
    const { lastFrame } = app(store);
    store.print('첫 줄');
    store.print('둘째 줄');
    await tick();
    const frame = visible(lastFrame());
    expect(frame.indexOf('첫 줄')).toBeLessThan(frame.indexOf('둘째 줄'));
  });
});

describe('ChatApp — 큰 창의 작은 Delfi', () => {
  it('창이 높으면 일하는 중 Delfi가 2배(10줄)로 그려지고 낮으면 5줄이다', async () => {
    const store = new ChatStore();
    const view = mascotView(24, 'v0', '[personal]');
    const r = render(React.createElement(ChatApp, { store, banner: () => '배너', view, onSubmit: vi.fn() }));
    mounted.push(r);
    const artLines = () => visible(r.lastFrame()).split('\n').filter((l) => /[▀▄]/.test(l.slice(0, 24))).length;
    await resize(r.stdout, 100, 30);
    store.startWorking('접수 중…', 'intake', Date.now());
    await tick();
    expect(artLines()).toBeLessThanOrEqual(5);
    await resize(r.stdout, 100, 50);
    await tick();
    expect(artLines()).toBeGreaterThan(5);
  });
});
