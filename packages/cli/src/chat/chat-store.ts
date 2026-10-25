import type { MemberRole } from '@rauha/core';

/** 화면에 띄우는 질문. 메뉴는 고른 번호(-1 = Esc), 글은 입력한 문자열로 답한다. */
export type Prompt =
  | { readonly kind: 'menu'; readonly screen: string; readonly options: readonly string[]; readonly compactScreen?: string | undefined }
  | { readonly kind: 'text'; readonly label: string };

/** 화면에 고정할 글. 창 너비에 따라 달라지는 것(박스)은 너비를 받아 만드는 함수로 두어 창을 바꾸면 다시 만든다. */
export type Printable = string | ((columns: number) => string);

export interface Working {
  readonly text: string;
  readonly role: MemberRole;
  readonly startedAt: number;
}

interface Pending {
  readonly prompt: Prompt;
  readonly resolve: (value: number | string) => void;
}

/**
 * 대화 화면 상태. Ink 화면은 이걸 그리기만 하고, 세션·팀원 쪽은 이걸 바꾸기만 한다.
 * 팀원 둘이 동시에 물어도 질문은 줄을 세워 한 번에 하나씩 띄운다.
 */
export class ChatStore {
  private printed: Printable[] = [];
  private current: Working | null = null;
  private waiting: Pending[] = [];
  private isBusy = false;
  private statusText = '';
  private sent: string[] = [];
  private readonly listeners = new Set<() => void>();

  get lines(): readonly Printable[] {
    return this.printed;
  }
  get working(): Working | null {
    return this.current;
  }
  get prompt(): Prompt | null {
    return this.waiting[0]?.prompt ?? null;
  }
  get busy(): boolean {
    return this.isBusy;
  }
  /** 입력창 아래 상태 줄(프로필 · 사용률 · 브랜치). 빈 글이면 그리지 않는다. */
  get status(): string {
    return this.statusText;
  }

  setStatus(text: string): void {
    this.statusText = text;
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  print(text: Printable): void {
    this.printLines([text]);
  }

  /**
   * 여러 줄을 한 번에 고정한다. 줄마다 따로 내면 Ink가 줄마다 즉시 다시 그리는데(React 18 일괄 처리가 없다),
   * 빈 줄 하나짜리 덩어리는 통째로 버려서 결과 출력의 빈 줄이 사라지고 줄 수를 틀리게 센다.
   */
  printLines(texts: readonly Printable[]): void {
    if (texts.length === 0) return;
    this.printed = [...this.printed, ...texts];
    this.changed();
  }

  startWorking(text: string, role: MemberRole, now: number): void {
    this.current = { text, role, startedAt: now };
    this.changed();
  }

  /** finalLine이 있으면 일하는 중 줄 대신 고정 줄로 남긴다. */
  stopWorking(finalLine: string | null): void {
    if (this.current === null) return;
    this.current = null;
    if (finalLine !== null) this.printed = [...this.printed, finalLine];
    this.changed();
  }

  setBusy(busy: boolean): void {
    this.isBusy = busy;
    this.changed();
  }

  ask(prompt: Prompt): Promise<number | string> {
    return new Promise((resolve) => {
      this.waiting = [...this.waiting, { prompt, resolve }];
      this.changed();
    });
  }

  answer(value: number | string): void {
    const [head, ...rest] = this.waiting;
    if (head === undefined) return;
    this.waiting = rest;
    head.resolve(value);
    this.changed();
  }

  /** 작업을 멈출 때 기다리던 질문을 모두 닫는다. 메뉴는 Esc와 같은 -1(허락이면 거절), 글은 빈 글. */
  cancelPrompts(): void {
    const pending = this.waiting;
    this.waiting = [];
    for (const p of pending) p.resolve(p.prompt.kind === 'menu' ? -1 : '');
    this.changed();
  }

  /** 보낸 입력(위 화살표로 다시 부른다). 바로 앞과 같으면 한 번만. */
  get history(): readonly string[] {
    return this.sent;
  }

  remember(text: string): void {
    if (this.sent.at(-1) === text) return;
    this.sent = [...this.sent, text];
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
