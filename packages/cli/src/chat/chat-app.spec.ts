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
  const r = render(React.createElement(ChatApp, { store, banner: 'rauha v0.0.0 시작 박스', view: null, onSubmit }));
  mounted.push(r);
  return { ...r, store, onSubmit };
}

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
