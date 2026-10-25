import { describe, expect, it } from 'vitest';
import { ansi256, beside, box, displayWidth, mascotView, paintDelfi, toAnsi } from './mascot.js';

const visible = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, '');

describe('Delfi 그림', () => {
  it('터미널 한 줄에 픽셀 위아래 두 개를 담는다', () => {
    const lines = toAnsi(paintDelfi('hello'), 24);
    expect(lines).toHaveLength(7);
    expect(new Set(lines.map((l) => visible(l).length))).toEqual(new Set([22]));
  });

  it('위아래 모두 비면 공백, 위만 색이면 ▀, 아래만 색이면 ▄, 둘 다면 위는 글자색 아래는 배경색', () => {
    const [line] = toAnsi([[null, '#FF0000', null, '#FF0000'], [null, null, '#00FF00', '#00FF00']], 24);
    expect(visible(line!)).toBe(' ▀▄▀');
    // 글자색과 배경색은 코드를 따로 쓴다. 한 코드에 묶으면 Ink가 다시 쓸 때 배경색을 닫지 않는다.
    expect(line).toContain('\x1b[38;2;255;0;0m\x1b[48;2;0;255;0m▀');
    expect(line).not.toMatch(/38;2;[\d;]*;48;2/);
  });

  it('256색 터미널에서는 가장 가까운 xterm 색 번호를 쓴다', () => {
    expect(ansi256('#000000')).toBe(16);
    expect(ansi256('#FFFFFF')).toBe(231);
    expect(ansi256('#8FD3F7')).toBe(117);
    expect(toAnsi([['#FFFFFF'], [null]], 8)[0]).toContain('38;5;231m▀');
  });

  it('표정마다 그림이 다르고, 완료 표정에는 반짝이가 있다', () => {
    const faces = (['hello', 'done', 'stuck', 'ask'] as const).map((f) => JSON.stringify(paintDelfi(f)));
    expect(new Set(faces).size).toBe(4);
    expect(paintDelfi('done').flat()).toContain('#FFDB7A');
    expect(paintDelfi('hello').flat()).not.toContain('#FFDB7A');
  });
});

describe('box', () => {
  it('한글은 두 칸으로 세서, 한글이 섞여도 오른쪽 테두리가 한 줄에 맞는다', () => {
    expect(displayWidth('한글ab')).toBe(6);
    expect(displayWidth('\x1b[1mab\x1b[0m')).toBe(2);
    const lines = box(['rauha v0', '오늘도 신나게'], '#8FD3F7', 24);
    expect(new Set(lines.map(displayWidth)).size).toBe(1);
    expect(visible(lines[0]!)).toMatch(/^ ▁+ $/);
    expect(visible(lines[2]!)).toBe('▕ 오늘도 신나게 ▏');
    expect(visible(lines[3]!)).toMatch(/^ ▔+ $/);
  });

  it('윗변·아랫변은 양옆 세로선 사이 칸을 정확히 채운다', () => {
    const [top, middle, bottom] = box(['ab'], '#8FD3F7', 24).map(visible);
    expect(top!.indexOf('▁')).toBe(middle!.indexOf('▕') + 1);
    expect(top!.lastIndexOf('▁')).toBe(middle!.indexOf('▏') - 1);
    expect(bottom!.replace(/▔/g, '▁')).toBe(top);
  });
});

describe('beside', () => {
  it('그림 오른쪽에 글을 붙이고, 그림을 세로 가운데에 맞춘다', () => {
    expect(beside(['AA', 'BB', 'CC'], ['x'])).toEqual(['AA', 'BB  x', 'CC']);
    expect(beside(['AA'], ['x', 'y', 'z'])).toEqual(['    x', 'AA  y', '    z']);
  });
});

describe('mascotView', () => {
  it('256색 미만 터미널에서는 캐릭터를 쓰지 않는다', () => {
    expect(mascotView(4, 'v0', '[personal]')).toBeNull();
    expect(mascotView(1, 'v0', '[personal]')).toBeNull();
  });

  it('팀원 진행 줄은 팀원마다 다른 색 표시를 붙이고, 그 밖의 줄은 흐리게 쓴다', () => {
    const view = mascotView(24, 'v0', '[personal]')!;
    const lead = view.step('팀장 접수(sonnet) 작업 중…', 'intake');
    const tester = view.step('테스트 팀원(haiku) 작업 중…', 'tester');
    const plain = view.step('검증 묶음을 실행합니다');
    expect(visible(lead)).toBe('  ◆ 팀장 접수(sonnet) 작업 중…');
    expect(lead).not.toBe(tester.replace('테스트 팀원(haiku)', '팀장 접수(sonnet)'));
    expect(visible(plain)).toBe('  · 검증 묶음을 실행합니다');
  });

  it('찍히는 모든 줄은 마지막 글자에 배경색이 없다 (cmd 창은 크기가 바뀌면 마지막 글자 배경을 줄 끝까지 늘린다)', () => {
    const view = mascotView(24, 'v0', '[personal]')!;
    const request = { role: 'tester', tool: 'Bash', detail: 'rm -rf dist', reason: '지웁니다' } as const;
    const screens = [view.banner('E:\\work', 120), view.finale('complete'), view.finale('stopped'), view.permission(request, 80)];
    for (const line of screens.flatMap((s) => s.split('\n'))) {
      const last = line.split(/(?=\x1b\[)/).filter((seg) => visible(seg).trim() !== '').at(-1);
      if (last === undefined) continue;
      expect(last, JSON.stringify(line)).not.toMatch(/48;/);
    }
  });

  it('시작 화면은 Delfi·rauha·인사말·작업 폴더를 한 박스에 담는다 (rauha 아래 줄이 인사말)', () => {
    const view = mascotView(24, 'v0.0.0', '[personal]')!;
    const lines = view.banner('E:\\work', 120).split('\n').map(visible);
    expect(lines[0]).toMatch(/^ ▁+ $/);
    expect(lines.at(-1)).toMatch(/^ ▔+ $/);
    const inner = lines.slice(1, -1);
    for (const line of inner) expect(line).toMatch(/^▕ .*▏$/);
    const title = inner.findIndex((l) => /rauha v0\.0\.0 +\[personal\]/.test(l));
    expect(inner[title + 1]).toContain('오늘도 신나게 헤엄쳐요');
    expect(inner.join('\n')).toContain('E:\\work');
    expect(inner.join('\n')).toMatch(/[▀▄]/);
    expect(new Set(lines.map(displayWidth)).size).toBe(1);
    expect(lines.join('\n')).not.toContain('Delfi:');
  });

  it('작업 폴더가 길면 가운데를 줄여서 박스가 터미널 너비를 넘지 않는다', () => {
    const view = mascotView(24, 'v0.0.0', '[personal]')!;
    const lines = view.banner(`C:\\${'a'.repeat(200)}\\shop`, 80).split('\n');
    for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(80);
    expect(lines.map(visible).join('\n')).toMatch(/C:\\a+\.\.\.a*\\shop/);
  });

  it('넓은 터미널에서도 시작 박스는 60칸을 넘지 않는다', () => {
    const view = mascotView(24, 'v0.0.0', '[personal]')!;
    for (const line of view.banner(`C:\\${'a'.repeat(200)}`, 200).split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(60);
  });

  it('시작 화면은 어떤 터미널 너비에서도 마지막 칸까지 차지 않는다 (꽉 차면 터미널이 줄을 접는다)', () => {
    const view = mascotView(24, 'v0.0.0', '[personal]')!;
    for (let columns = 10; columns <= 120; columns++) {
      for (const line of view.banner(`C:\\Users\\kimbo\\${'a'.repeat(40)}\\shop`, columns).split('\n')) {
        expect(displayWidth(line), `${columns}칸: ${JSON.stringify(visible(line))}`).toBeLessThan(columns);
      }
    }
  });

  it('Delfi 옆에 글을 둘 자리가 없으면 Delfi 아래에 글을 둔다', () => {
    const view = mascotView(24, 'v0.0.0', '[personal]')!;
    const lines = view.banner('E:\\work', 40).split('\n').map(visible);
    expect(lines[0]).toMatch(/^ ▁+ $/);
    const title = lines.findIndex((l) => l.includes('rauha v0.0.0'));
    const lastArt = lines.findLastIndex((l) => /[▀▄]/.test(l));
    expect(title).toBeGreaterThan(lastArt);
    expect(lines[title + 1]).toContain('오늘도 신나게 헤엄쳐요');
  });

  it('Delfi도 못 들어갈 만큼 좁으면 박스 없이 글만 쓴다', () => {
    const view = mascotView(24, 'v0.0.0', '[personal]')!;
    const text = view.banner('E:\\work', 20).split('\n').map(visible).join('\n');
    expect(text).not.toMatch(/[▀▄▁▔▕▏]/);
    expect(text).toContain('rauha');
  });

  it('Delfi는 테두리나 왼쪽 끝에 붙지 않는다', () => {
    const view = mascotView(24, 'v0', '[personal]')!;
    for (const line of view.banner('E:\\work', 120).split('\n').slice(1, -1)) expect(visible(line)).toMatch(/^▕ {3}/);
    for (const screen of [view.finale('complete'), view.finale('stopped')]) {
      for (const line of screen.split('\n')) expect(visible(line)).toMatch(/^ {2}/);
    }
  });

  it('허락 화면은 누가·어떤 도구로·무엇을·왜 하는지 박스에 담고, 긴 명령은 자르지 않고 접는다', () => {
    const view = mascotView(24, 'v0', '[personal]')!;
    const command = `rm -rf ${'build/'.repeat(30)}`;
    const lines = view
      .permission({ role: 'implementer', tool: 'Bash', detail: command, reason: '파일이나 폴더를 지웁니다' }, 80)
      .split('\n')
      .map(visible);
    const boxed = lines.slice(lines.findIndex((l) => /^ ▁+ $/.test(l)));
    expect(new Set(boxed.map(displayWidth)).size).toBe(1);
    for (const line of boxed) expect(displayWidth(line)).toBeLessThanOrEqual(80);
    expect(boxed.join('\n')).toContain('구현 팀원');
    expect(boxed.join('\n')).toContain('Bash');
    expect(boxed.join('\n')).toContain('파일이나 폴더를 지웁니다');
    expect(boxed.join('').replace(/[ ▕▏]/g, '')).toContain(command.replace(/ /g, ''));
  });

  it('허락·추측 확인 박스도 터미널 마지막 칸까지 차지 않는다', () => {
    const view = mascotView(24, 'v0', '[personal]')!;
    const request = { role: 'implementer', tool: 'Bash', detail: `rm -rf ${'build/'.repeat(30)}`, reason: '지웁니다' } as const;
    for (const columns of [40, 60, 77, 120]) {
      const boxes = [view.permission(request, columns), view.factCheck('응답 필드 이름은 email이다 '.repeat(5), columns)];
      for (const screen of boxes) {
        const lines = screen.split('\n');
        for (const line of lines.slice(lines.findIndex((l) => /^ ▁+ $/.test(visible(l))))) expect(displayWidth(line)).toBeLessThan(columns);
      }
    }
  });

  it('작업 중 줄은 팀원 색 스피너와 경과 시간을, 끝난 줄은 ◆와 걸린 시간을 보여 준다', () => {
    const view = mascotView(24, 'v0', '[personal]')!;
    expect(visible(view.working('▘', '팀장 접수(sonnet) 작업 중…', 'intake', '12초'))).toBe('  ▘ 팀장 접수(sonnet) 작업 중… 12초');
    expect(visible(view.done('팀장 접수(sonnet) 작업 중…', 'intake', '34초'))).toBe('  ◆ 팀장 접수(sonnet) 34초');
  });

  it('추측 확인 화면은 주장과 확인하지 못했다는 말을 박스에 담는다', () => {
    const view = mascotView(24, 'v0', '[personal]')!;
    const lines = view.factCheck('응답 필드 이름은 email이다', 80).split('\n').map(visible);
    const boxed = lines.slice(lines.findIndex((l) => /^ ▁+ $/.test(l)));
    expect(new Set(boxed.map(displayWidth)).size).toBe(1);
    expect(boxed.join('\n')).toContain('응답 필드 이름은 email이다');
    expect(lines.join('\n')).toContain('근거를 확인하지 못했어요');
  });

  it('끝 인사는 결과에 따라 다르다', () => {
    const view = mascotView(24, 'v0', '[personal]')!;
    expect(visible(view.finale('complete'))).not.toBe(visible(view.finale('stopped')));
  });
});
