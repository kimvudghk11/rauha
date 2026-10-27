/** 대화 세션을 다시 열 때 필요한 것. 비용·호출 수는 새 세션에서 다시 센다. */
export interface ChatSnapshot {
  readonly version: 1;
  readonly turns: readonly { readonly input: string; readonly result: string }[];
  /** 세션 중 rauha가 남긴 파일 → 그때 내용 값 */
  readonly carried: readonly (readonly [string, string])[];
  readonly lastTitle: string | null;
  /** ISO 시각 */
  readonly savedAt: string;
}

const isString = (v: unknown): v is string => typeof v === 'string';

/**
 * 저장해 둔 대화 파일 ↔ 스냅숏. 파일은 rauha 밖에서 바뀌거나 옛 형식일 수 있어서,
 * 모양이 하나라도 틀리면 던지지 않고 null을 돌려준다(새 대화로 시작하면 그만이라서).
 */
export class ChatSnapshotDto {
  private constructor(readonly value: ChatSnapshot) {}

  static of(snapshot: ChatSnapshot): ChatSnapshotDto {
    return new ChatSnapshotDto(snapshot);
  }

  static from(input: unknown): ChatSnapshotDto | null {
    if (typeof input !== 'object' || input === null) return null;
    const o = input as Record<string, unknown>;
    if (o['version'] !== 1 || !isString(o['savedAt'])) return null;
    if (!(o['lastTitle'] === null || isString(o['lastTitle']))) return null;
    const turns = o['turns'];
    const carried = o['carried'];
    if (!Array.isArray(turns) || !Array.isArray(carried)) return null;
    const validTurns = turns.every((t) => typeof t === 'object' && t !== null && isString((t as Record<string, unknown>)['input']) && isString((t as Record<string, unknown>)['result']));
    const validCarried = carried.every((c) => Array.isArray(c) && c.length === 2 && isString(c[0]) && isString(c[1]));
    if (!validTurns || !validCarried) return null;
    return new ChatSnapshotDto({
      version: 1,
      turns: turns.map((t) => ({ input: (t as { input: string }).input, result: (t as { result: string }).result })),
      carried: carried.map((c) => [c[0] as string, c[1] as string] as const),
      lastTitle: o['lastTitle'] as string | null,
      savedAt: o['savedAt'],
    });
  }

  toJson(): string {
    return `${JSON.stringify(this.value, null, 2)}\n`;
  }
}
