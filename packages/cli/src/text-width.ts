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

/** 색 코드가 섞인 글을 터미널 줄 단위로 접는다. 색 코드는 칸을 차지하지 않고 쪼개지 않는다. */
export function fitLines(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const source of text.split('\n')) {
    let current = '';
    let used = 0;
    for (const token of source.split(/(\x1b\[[0-9;]*m)/)) {
      if (token.startsWith('\x1b[')) {
        current += token;
        continue;
      }
      for (const ch of token) {
        const w = displayWidth(ch);
        if (used + w > width && used > 0) {
          lines.push(current);
          current = '';
          used = 0;
        }
        current += ch;
        used += w;
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
