/** 진짜 터미널 커서를 둘 자리. up: Ink가 그린 화면 끝에서 몇 줄 위인지, column: 0부터 센 칸. */
export interface CursorSpot {
  readonly up: number;
  readonly column: number;
}

export interface CursorPark {
  /** null이면 커서를 원래 자리로 돌리고 숨긴다. */
  set(spot: CursorSpot | null): void;
}

/**
 * Ink는 커서를 숨기고 화면 끝 다음 줄에 둔다. 그러면 한글 입력기가 조합 중인 글자를 그 엉뚱한 자리에 그려서
 * 글자가 완성되기 전까지 입력창에 안 보인다(영어는 조합이 없어 바로 보인다).
 * 그래서 Ink가 쓰는 출력을 감싸, 쓰기 전에는 커서를 Ink가 아는 자리로 돌려 두고 쓴 뒤에는 입력창 글자 자리로 옮긴다.
 */
export function parkingStream(real: NodeJS.WriteStream): { stream: NodeJS.WriteStream; park: CursorPark } {
  let wanted: CursorSpot | null = null;
  let parked: CursorSpot | null = null;
  let visible = false;
  const raw = (data: string) => real.write(data);
  const leave = () => {
    if (parked === null) return;
    raw(`\x1b[${parked.up}B\r`);
    parked = null;
  };
  const enter = () => {
    if (wanted === null) {
      if (visible) raw('\x1b[?25l');
      visible = false;
      return;
    }
    raw(`\x1b[${wanted.up}A\x1b[${wanted.column + 1}G${visible ? '' : '\x1b[?25h'}`);
    parked = wanted;
    visible = true;
  };
  const write = (...args: Parameters<NodeJS.WriteStream['write']>) => {
    leave();
    const result = (real.write as (...a: unknown[]) => boolean)(...args);
    enter();
    return result;
  };
  const stream = new Proxy(real, {
    get(target, prop) {
      if (prop === 'write') return write;
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    stream,
    park: {
      set(spot) {
        if (spot?.up === wanted?.up && spot?.column === wanted?.column) return;
        leave();
        wanted = spot;
        enter();
      },
    },
  };
}
