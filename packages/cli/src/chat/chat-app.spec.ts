import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatApp } from './chat-app.js';
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

  it('일하는 중에는 입력을 받지 않는다', async () => {
    const store = new ChatStore();
    store.setBusy(true);
    const { stdin, onSubmit, lastFrame } = app(store);
    await tick();
    stdin.write('abc');
    stdin.write('\r');
    await tick();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(visible(lastFrame())).toContain('일하는 중');
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

  it('입력창은 76칸을 넘지 않는다 (창을 조금 줄여도 접히지 않게)', () => {
    const { lastFrame } = app();
    const box = visible(lastFrame()).split('\n').filter((l) => l.includes('▁') || l.includes('▕') || l.includes('▔'));
    expect(box.length).toBeGreaterThan(0);
    for (const line of box) expect([...line.trimEnd()].length).toBeLessThanOrEqual(76);
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

  it('긴 고정 줄은 창 너비에 맞춰 미리 접는다 (줄 수를 정확히 세려고)', async () => {
    const store = new ChatStore();
    const { stdout, lastFrame } = app(store);
    store.print('가'.repeat(40));
    await resize(stdout, 30, 20);
    const lines = visible(lastScreen(lastFrame() ?? '')).split('\n').filter((l) => l.includes('가'));
    expect(lines.length).toBe(3);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(14);
  });

  it('진짜 커서를 입력창의 글자 자리로 옮기고, 일하는 동안에는 치운다 (한글 조합이 입력창에 보이게)', async () => {
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
    expect(spots.at(-1)).toBeNull();
  });

  it('긴 입력은 입력창 안에서 줄을 바꿔 다 보여 준다', async () => {
    const { stdin, lastFrame } = app();
    await tick();
    stdin.write('가'.repeat(50));
    await tick();
    const rows = visible(lastFrame()).split('\n').filter((l) => l.includes('가'));
    expect(rows.length).toBe(2);
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
