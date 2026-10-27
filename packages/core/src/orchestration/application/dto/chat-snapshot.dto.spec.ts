import { describe, expect, it } from 'vitest';
import { ChatSnapshotDto, type ChatSnapshot } from './chat-snapshot.dto.js';

const snapshot: ChatSnapshot = {
  version: 1,
  turns: [{ input: 'Money에 할인 넣어줘', result: '작업 "할인" 완료' }],
  carried: [['src/money.ts', 'modified:h1']],
  lastTitle: '할인',
  savedAt: '2026-10-27T10:00:00.000Z',
};

describe('ChatSnapshotDto', () => {
  it('저장한 대화를 그대로 되읽는다', () => {
    const json = ChatSnapshotDto.of(snapshot).toJson();
    expect(ChatSnapshotDto.from(JSON.parse(json))?.value).toEqual(snapshot);
  });

  it('깨진 내용이나 옛 형식은 null', () => {
    for (const bad of [null, 'x', { ...snapshot, version: 2 }, { ...snapshot, turns: 'x' }, { ...snapshot, carried: [['a']] }, { ...snapshot, lastTitle: 3 }]) {
      expect(ChatSnapshotDto.from(bad)).toBeNull();
    }
  });
});
