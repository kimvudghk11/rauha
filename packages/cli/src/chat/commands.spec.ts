import { describe, expect, it } from 'vitest';
import { parseCommand, suggestCommands } from './commands.js';

describe('parseCommand', () => {
  it('/로 시작하지 않으면 명령이 아니다', () => {
    expect(parseCommand('Money에 할인 넣어줘')).toBeNull();
  });

  it('알려진 명령을 읽는다 (대소문자·앞뒤 공백 무시)', () => {
    expect(parseCommand('/clear')).toEqual({ kind: 'clear' });
    expect(parseCommand('  /STATUS ')).toEqual({ kind: 'status' });
    expect(parseCommand('/usage')).toEqual({ kind: 'usage' });
    expect(parseCommand('/help')).toEqual({ kind: 'help' });
    expect(parseCommand('/exit')).toEqual({ kind: 'exit' });
    expect(parseCommand('/update')).toEqual({ kind: 'update' });
  });

  it('알 수 없는 명령은 요청으로 보내지 않고 알 수 없는 명령으로 본다', () => {
    expect(parseCommand('/deploy now')).toEqual({ kind: 'unknown', name: '/deploy' });
  });
});

describe('/review', () => {
  it('/review는 커밋 안 한 변경, /review <브랜치>는 그 브랜치와 갈라진 뒤의 변경을 검토한다', () => {
    expect(parseCommand('/review')).toEqual({ kind: 'review', target: null });
    expect(parseCommand('/review develop')).toEqual({ kind: 'review', target: 'develop' });
  });
});

describe('/repo', () => {
  it('/repo는 목록, /repo <이름>은 지금 저장소 바꾸기, /repo add <경로>는 더하기', () => {
    expect(parseCommand('/repo')).toEqual({ kind: 'repo', action: 'list' });
    expect(parseCommand('/repo shop-api')).toEqual({ kind: 'repo', action: 'select', name: 'shop-api' });
    expect(parseCommand('/repo add E:\\work\\my lib')).toEqual({ kind: 'repo', action: 'add', path: 'E:\\work\\my lib' });
  });
});

describe('/guide', () => {
  it('/guide는 지난 작업의 읽기 안내서를 여는 명령이다', () => {
    expect(parseCommand('/guide')).toEqual({ kind: 'guide' });
  });
});

describe('suggestCommands', () => {
  it('/만 치면 모든 명령을, 더 치면 앞이 맞는 명령만 설명과 함께 보여 준다', () => {
    expect(suggestCommands('/').map((c) => c.name)).toEqual(['/clear', '/status', '/usage', '/guide', '/review', '/design', '/repo', '/retry', '/queue', '/update', '/help', '/exit']);
    expect(suggestCommands('/us')).toEqual([{ name: '/usage', help: expect.stringContaining('구독 사용률') }]);
    expect(suggestCommands('/up')).toEqual([{ name: '/update', help: expect.stringContaining('최신') }]);
  });

  it('명령이 아닌 글이나 띄어쓰기가 들어간 뒤에는 보여 주지 않는다', () => {
    expect(suggestCommands('안녕')).toEqual([]);
    expect(suggestCommands('/usage ')).toEqual([]);
    expect(suggestCommands('')).toEqual([]);
  });
});

describe('/design', () => {
  it('/design <요청>은 라우터를 거치지 않고 설계부터 시작하는 요청이다', () => {
    expect(parseCommand('/design 쿠폰 기능 만들어줘')).toEqual({ kind: 'design', request: '쿠폰 기능 만들어줘' });
    expect(parseCommand('/DESIGN   로그인 페이지  ')).toEqual({ kind: 'design', request: '로그인 페이지' });
  });

  it('요청 없이 /design만 치면 안내 대상이다', () => {
    expect(parseCommand('/design')).toEqual({ kind: 'design', request: null });
  });

  it('입력창에서 /de를 치면 후보에 /design이 뜬다', () => {
    expect(suggestCommands('/de').map((c) => c.name)).toContain('/design');
  });
});

describe('/retry', () => {
  it('/retry는 마지막 요청을 다시 보내는 명령이다', () => {
    expect(parseCommand('/retry')).toEqual({ kind: 'retry' });
    expect(suggestCommands('/re').map((c) => c.name)).toContain('/retry');
  });
});

describe('/queue', () => {
  it('/queue는 대기 중인 입력을 보여 주고, /queue clear는 비운다', () => {
    expect(parseCommand('/queue')).toEqual({ kind: 'queue', action: 'show' });
    expect(parseCommand('/queue clear')).toEqual({ kind: 'queue', action: 'clear' });
    expect(parseCommand('/queue 비워')).toEqual({ kind: 'queue', action: 'show' });
  });
});
