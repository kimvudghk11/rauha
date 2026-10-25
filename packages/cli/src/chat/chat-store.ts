import type { MemberRole } from '@rauha/core';

/** 화면에 띄우는 질문. 메뉴는 고른 번호(-1 = Esc), 글은 입력한 문자열로 답한다. */
export type Prompt =
  | { readonly kind: 'menu'; readonly screen: string; readonly options: readonly string[] }
  | { readonly kind: 'text'; readonly label: string };

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
  private printed: string[] = [];
  private current: Working | null = null;
  private waiting: Pending[] = [];
  private isBusy = false;
  private readonly listeners = new Set<() => void>();

  get lines(): readonly string[] {
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

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  print(text: string): void {
    this.printed = [...this.printed, text];
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

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
