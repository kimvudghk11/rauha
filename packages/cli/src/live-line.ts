/** 사분면 블록이 한 바퀴 도는 스피너. 한글 글꼴 cmd에서도 한 칸으로 깔끔하게 그려진다(별·원 기호는 두 칸으로 겹친다). */
const SPINNER = ['▖', '▘', '▝', '▗'] as const;
const CLEAR = '\r\x1b[K';

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return total < 60 ? `${total}초` : `${Math.floor(total / 60)}분 ${total % 60}초`;
}

export interface LiveLineOptions {
  readonly write: (text: string) => void;
  readonly now: () => number;
  /** 일하는 중인 줄 */
  readonly working: (frame: string, text: string, elapsed: string) => string;
  /** 끝나서 고정되는 줄 */
  readonly done: (text: string, elapsed: string) => string;
  readonly intervalMs?: number;
}

/**
 * 맨 아래 한 줄을 계속 다시 그리는 '작업 중' 표시. Claude Code의 "Thinking… (12s)"와 같은 역할.
 * 한 줄만 '\r'로 다시 그리므로 창 크기를 바꿔도 위쪽 출력은 건드리지 않는다.
 */
export class LiveLine {
  private active: { text: string; started: number; frame: number; timer: ReturnType<typeof setInterval> } | null = null;

  constructor(private readonly options: LiveLineOptions) {}

  start(text: string): void {
    this.stop();
    this.active = { text, started: this.options.now(), frame: 0, timer: this.tick() };
    this.draw();
  }

  stop(): void {
    if (this.active === null) return;
    clearInterval(this.active.timer);
    this.options.write(`${CLEAR}${this.options.done(this.active.text, this.elapsed())}\n`);
    this.active = null;
  }

  /** 다른 출력을 스피너 위에 끼워 넣는다. */
  print(line: string): void {
    if (this.active === null) {
      this.options.write(`${line}\n`);
      return;
    }
    this.options.write(`${CLEAR}${line}\n`);
    this.draw();
  }

  /** 사용자에게 묻는 동안 스피너를 지우고 멈춘다. 질문 화면과 섞이지 않게. */
  async pause<T>(task: () => Promise<T>): Promise<T> {
    if (this.active === null) return task();
    clearInterval(this.active.timer);
    this.options.write(CLEAR);
    try {
      return await task();
    } finally {
      if (this.active !== null) {
        this.active.timer = this.tick();
        this.draw();
      }
    }
  }

  private tick(): ReturnType<typeof setInterval> {
    return setInterval(() => {
      if (this.active === null) return;
      this.active.frame += 1;
      this.draw();
    }, this.options.intervalMs ?? 120);
  }

  private elapsed(): string {
    return formatElapsed(this.options.now() - (this.active?.started ?? this.options.now()));
  }

  private draw(): void {
    if (this.active === null) return;
    const frame = SPINNER[this.active.frame % SPINNER.length]!;
    this.options.write(`${CLEAR}${this.options.working(frame, this.active.text, this.elapsed())}`);
  }
}
