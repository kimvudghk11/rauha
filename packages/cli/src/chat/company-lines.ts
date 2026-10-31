import { Department, LAUNCH_ORDER, type DepartmentId } from '@rauha/core';

interface Entry {
  readonly department: DepartmentId;
  readonly summary: string;
  readonly at: string;
}

/** /company: 회사가 이미 정한 것(부서별 가장 최근 결과의 요약). 부서 팀원이 일할 때 같은 것을 읽는다. */
export function companyLines(entries: readonly Entry[]): string[] {
  if (entries.length === 0) {
    return ['', '  아직 정한 것이 없어요. 기획·마케팅·디자인 같은 부서 일을 시키면 그 결과의 요약이 여기에 쌓이고, 다음 일에 팀원들이 읽어요.', ''];
  }
  const sorted = [...entries].sort((a, b) => LAUNCH_ORDER.indexOf(a.department) - LAUNCH_ORDER.indexOf(b.department));
  return ['', '  회사가 이미 정한 것 (부서별 가장 최근 결과)', ...sorted.flatMap((e) => ['', `  ${Department.of(e.department).label}  ${e.at.slice(0, 10)}`, ...e.summary.split('\n').map((l) => `    ${l}`)]), ''];
}
