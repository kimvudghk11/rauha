const WIDE: readonly [number, number][] = [
  [0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6],
];

/** 터미널에서 차지하는 칸 수. 한글·한자 같은 넓은 글자는 두 칸. 색 코드는 세지 않는다. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text.replace(/\x1b\[[0-9;]*m/g, '')) {
    const code = ch.codePointAt(0)!;
    width += WIDE.some(([from, to]) => code >= from && code <= to) ? 2 : 1;
  }
  return width;
}

/**
 * 색 코드가 섞인 글을 터미널 줄 단위로 접는다. 띄어쓰기에서 줄을 바꾸고, 줄보다 긴 단어만 글자 단위로 자른다.
 * 색 코드는 칸을 차지하지 않고 쪼개지 않는다(색 코드에는 띄어쓰기가 없다).
 */
export function fitLines(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const source of text.split('\n')) {
    let current = '';
    let used = 0;
    const breakLine = () => {
      lines.push(current.replace(/ +$/, ''));
      current = '';
      used = 0;
    };
    for (const piece of source.split(/( +)/)) {
      if (piece === '') continue;
      const w = displayWidth(piece);
      if (used + w <= width) {
        current += piece;
        used += w;
        continue;
      }
      // 줄 끝에 걸린 띄어쓰기는 줄바꿈으로 바꾼다.
      if (piece.startsWith(' ')) {
        if (used > 0) breakLine();
        continue;
      }
      if (used > 0) breakLine();
      if (w <= width) {
        current = piece;
        used = w;
        continue;
      }
      for (const token of piece.split(/(\x1b\[[0-9;]*m)/)) {
        if (token.startsWith('\x1b[')) {
          current += token;
          continue;
        }
        for (const ch of token) {
          const cw = displayWidth(ch);
          if (used + cw > width && used > 0) breakLine();
          current += ch;
          used += cw;
        }
      }
    }
    lines.push(current);
  }
  return lines;
}

/** 너비를 넘는 줄을 접는다. 위험한 명령은 줄이지 않고 전부 보여 줘야 해서 '...' 대신 접는다. */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const ch of text) {
    if (displayWidth(current + ch) > width) {
      lines.push(current);
      current = '';
    }
    current += ch;
  }
  lines.push(current);
  return lines;
}
