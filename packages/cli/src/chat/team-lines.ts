import { Department, type MemberRole, type RoleSettingsDto } from '@rauha/core';
import { displayWidth } from '../text-width.js';

const NAME: Readonly<Record<MemberRole, string>> = {
  intake: '팀장', tester: '테스트 팀원', implementer: '구현 팀원', reviewer: '리뷰어', router: '라우터', answerer: '답변 팀원', surveyor: '저장소 파악', writer: '문서 팀원', designer: '설계 팀원', operator: '운영 팀원',
  debugger: '디버깅 팀원', riskchecker: '위험 점검 팀원', planner: '기획 팀원', chief: '부서장', bm: '사업 모델 팀원', marketer: '마케팅 팀원', growth: '그로스 팀원', uxdesigner: 'UX 디자인 팀원', brand: '브랜드 팀원', securitychecker: '보안 점검 팀원', releaser: '릴리스 팀원',
};

/** 개발부와 회사 공통은 작업 흐름이 따로 있어 부서 정의(Department)에 없다. */
const DEVELOPMENT: readonly MemberRole[] = ['intake', 'tester', 'implementer', 'reviewer'];
const COMMON: readonly { readonly role: MemberRole; readonly title?: string }[] = [{ role: 'router', title: '대표 (라우터)' }, { role: 'answerer' }, { role: 'surveyor' }, { role: 'writer' }, { role: 'designer' }];

/** 팀원이 할 수 있는 일을 한 마디로. 명령 실행이 있으면 그것이 가장 큰 차이라 먼저 말한다. */
function ability(tools: readonly string[]): string {
  const edits = tools.includes('Edit') || tools.includes('Write');
  if (tools.includes('Bash')) return edits ? '파일 수정 · 명령 실행' : '명령 실행';
  if (edits) return '파일 수정';
  return tools.length === 0 ? '도구 없음' : '읽기만';
}

/**
 * /team: 회사 구성. 부서마다 부서장과 팀원의 모델·노력 수준·할 수 있는 일을 묶어 보여 준다.
 * 모델은 환경 변수로 고정한 값이 반영된 기본값이고, 작업 중에는 상태 머신이 올리기도 한다.
 */
export function teamLines(roles: RoleSettingsDto): string[] {
  const row = (role: MemberRole, title?: string) => {
    const s = roles.get(role);
    return { name: title ?? NAME[role], detail: `${s.tier} · ${s.effort}`, ability: ability(s.tools) };
  };
  const groups: { readonly title: string; readonly rows: ReturnType<typeof row>[] }[] = [
    { title: '개발부', rows: DEVELOPMENT.map((r) => row(r)) },
    ...Department.all().map((d) => ({ title: d.label, rows: [row('chief', '부서장'), ...d.members.map((m) => row(m.role))] })),
    { title: '회사 공통', rows: COMMON.map((c) => row(c.role, c.title)) },
  ];
  const width = Math.max(...groups.flatMap((g) => g.rows.map((r) => displayWidth(r.name))));
  const pad = (s: string) => s + ' '.repeat(width - displayWidth(s));
  return ['', '  rauha 회사 구성 (부서장은 7년차 이상의 판단을 하는 상위 모델로, 넓은 요청에서만 부르고 작은 요청은 팀원이 바로 해요)', ...groups.flatMap((g) => ['', `  ${g.title}`, ...g.rows.map((r) => `    ${pad(r.name)}  ${r.detail.padEnd(16)}${r.ability}`)]), ''];
}
