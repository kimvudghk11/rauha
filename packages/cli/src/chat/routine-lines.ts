import type { RoutineBook } from '@rauha/core';

export const ROUTINE_USAGE = [
  '  /routine add 매일 <요청>          예: /routine add 매일 어제 커밋으로 릴리스 노트 초안 써줘',
  '  /routine add 매주 <요일> <요청>   예: /routine add 매주 월 지난주 지표 점검해줘',
  '  /routine            목록 · /routine run  때가 된 것 실행 · /routine remove <번호>',
  '  자동으로 돌지 않아요. 때가 되면 알려 드리고, run을 하면 그때 한 번 실행해요(세션 한도를 몰래 쓰지 않으려고).',
];

/** /routine 목록. 때가 된 것은 표시한다. */
export function routineLines(book: RoutineBook, today: string): string[] {
  if (book.routines.length === 0) return ['', '  등록된 정기 업무가 없어요.', ...ROUTINE_USAGE, ''];
  const lines = book.routines.map((r, i) => `  ${i + 1}. ${r.describe()}  ${r.request}  (${r.lastRunOn === null ? '아직 안 함' : `마지막 ${r.lastRunOn}`})${r.isDue(today) ? '  ← 지금 할 때' : ''}`);
  return ['', `  정기 업무 ${book.routines.length}개`, ...lines, '', '  /routine run 으로 때가 된 것을 실행해요.', ''];
}

/** 시작할 때 알리는 한 줄. 때가 된 것이 없으면 null. */
export function dueNotice(book: RoutineBook, today: string): string[] | null {
  const due = book.due(today);
  if (due.length === 0) return null;
  return [`  ⏰ 정기 업무 ${due.length}개가 때가 됐어요 (/routine run 으로 실행):`, ...due.map((r) => `     · ${r.describe()}  ${r.request}`)];
}
