import type { Department, DepartmentMemberRole } from '../../domain/department.js';

export interface Assignment {
  readonly role: DepartmentMemberRole;
  readonly brief: string;
}

/** 한 번에 일을 맡길 팀원 수 상한. 팀원마다 호출이 하나씩 늘기 때문이다. */
const MAX_ASSIGNED = 3;

/** 부서장의 계획 → 팀원별 지시. 부서에 없는 팀원·중복은 버리고, 쓸 만한 계획이 없으면 부서의 첫 팀원이 요청을 그대로 맡는다. */
export class CompanyPlanDto {
  private constructor(readonly assignments: readonly Assignment[]) {}

  static read(input: unknown, department: Department): CompanyPlanDto {
    const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
    const raw: unknown[] = Array.isArray(o['assignments']) ? o['assignments'] : [];
    const chosen = new Map<DepartmentMemberRole, string>();
    for (const item of raw) {
      const a = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
      const member = department.member(String(a['member']));
      if (member === null || chosen.has(member.role)) continue;
      chosen.set(member.role, typeof a['brief'] === 'string' ? a['brief'].trim() : '');
      if (chosen.size === MAX_ASSIGNED) break;
    }
    if (chosen.size === 0) chosen.set(department.members[0]!.role, '');
    return new CompanyPlanDto([...chosen].map(([role, brief]) => ({ role, brief })));
  }
}
