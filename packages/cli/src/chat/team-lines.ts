import type { MemberRole, RoleSettingsDto } from '@rauha/core';
import { displayWidth } from '../text-width.js';

const NAME: Readonly<Record<MemberRole, string>> = { intake: '팀장', tester: '테스트 팀원', implementer: '구현 팀원', reviewer: '리뷰어', router: '라우터', answerer: '답변 팀원', surveyor: '저장소 파악', writer: '문서 팀원', designer: '설계 팀원', operator: '운영 팀원', debugger: '디버깅 팀원', riskchecker: '위험 점검 팀원' };

/** 팀원이 할 수 있는 일을 한 마디로. 명령 실행이 있으면 그것이 가장 큰 차이라 먼저 말한다. */
function ability(tools: readonly string[]): string {
  const edits = tools.includes('Edit') || tools.includes('Write');
  if (tools.includes('Bash')) return edits ? '파일 수정 · 명령 실행' : '명령 실행';
  if (edits) return '파일 수정';
  return tools.length === 0 ? '도구 없음' : '읽기만';
}

/** /team: 지금 팀 구성(역할별 모델·노력 수준·할 수 있는 일). 모델은 환경 변수로 고정한 값이 반영된 기본값이고, 작업 중에는 상태 머신이 올리기도 한다. */
export function teamLines(roles: RoleSettingsDto): string[] {
  const rows = roles.entries().map((e) => ({ name: NAME[e.role], detail: `${e.tier} · ${e.effort}`, ability: ability(e.tools) }));
  const width = Math.max(...rows.map((r) => displayWidth(r.name)));
  const pad = (s: string) => s + ' '.repeat(width - displayWidth(s));
  return ['', '  팀 구성', ...rows.map((r) => `    ${pad(r.name)}  ${r.detail.padEnd(16)}${r.ability}`), ''];
}
