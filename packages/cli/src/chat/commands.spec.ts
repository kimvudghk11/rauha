import { describe, expect, it } from 'vitest';
import { parseCommand } from './commands.js';

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
  });

  it('알 수 없는 명령은 요청으로 보내지 않고 알 수 없는 명령으로 본다', () => {
    expect(parseCommand('/deploy now')).toEqual({ kind: 'unknown', name: '/deploy' });
  });
});
