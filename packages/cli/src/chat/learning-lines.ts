import type { LearningBook } from '@rauha/core';

/** /learn: 내 코드에서 쓰인 패턴을 패턴별로 모아 보여 준다(복습용). 자주 쓴 패턴부터. */
export function learningLines(book: LearningBook): string[] {
  const groups = book.byPattern();
  if (groups.length === 0) {
    return ['', '  아직 모인 노트가 없어요. 작업이 끝날 때 구현 팀원이 디자인 패턴이나 아키텍처를 쓴 이유를 남기면 여기에 쌓여요.', ''];
  }
  return [
    '',
    `  학습 노트 · 패턴 ${groups.length}가지`,
    ...groups.flatMap((g) => ['', `  ■ ${g.pattern} · ${g.notes.length}번`, ...g.notes.slice(-3).flatMap((n) => [`    · ${n.what}`, `      왜: ${n.why}  (${n.at.slice(0, 10)})`])]),
    '',
  ];
}
