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
export function parkingStream(real: NodeJS.WriteStream): { stream: NodeJS.WriteStream; park: CursorPark; release: () => void } {
  let wanted: CursorSpot | null = null;
  let parked: CursorSpot | null = null;
  let visible = false;
  let released = false;
  // leave·enter는 보낼 글을 돌려주고 상태만 바꾼다. 호출하는 쪽이 한 번의 쓰기로 합쳐 보낸다:
  // 따로 보내면 터미널이 그 사이(커서가 아래에 내려가 있는 때)를 보고, 한글 조합 글자를 엉뚱한 줄에 그린다.
  const leave = () => {
    if (parked === null) return '';
    const text = `\x1b[${parked.up}B\r`;
    parked = null;
    return text;
  };
  const enter = () => {
    if (released) return '';
    if (wanted === null) {
      const text = visible ? '\x1b[?25l' : '';
      visible = false;
      return text;
    }
    const text = `\x1b[${wanted.up}A\x1b[${wanted.column + 1}G${visible ? '' : '\x1b[?25h'}`;
    parked = wanted;
    visible = true;
    return text;
  };
  const write = (...args: Parameters<NodeJS.WriteStream['write']>) => {
    const [data, ...rest] = args;
    const before = leave();
    if (typeof data === 'string') return (real.write as (...a: unknown[]) => boolean)(before + data + enter(), ...rest);
    // 글이 아닌 데이터(Buffer 등)는 합칠 수 없어서 앞뒤를 따로 보낸다.
    if (before !== '') real.write(before);
    const result = (real.write as (...a: unknown[]) => boolean)(data, ...rest);
    const after = enter();
    if (after !== '') real.write(after);
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
        const before = leave();
        wanted = spot;
        const text = before + enter();
        if (text !== '') real.write(text);
      },
    },
    /** 화면을 닫은 뒤: 커서를 화면 끝으로 돌려 보이게 하고 더는 옮기지 않는다. 그 뒤에 쓰는 글이 입력창을 덮지 않게. */
    release() {
      released = true;
      wanted = null;
      real.write(`${leave()}\x1b[?25h`);
      visible = true;
    },
  };
}
