import { describe, expect, it } from 'vitest';
import { Department } from '../../domain/department.js';
import { CompanyPlanDto } from './company-plan.dto.js';

const marketing = Department.of('marketing');

describe('CompanyPlanDto', () => {
  it('부서장이 고른 팀원과 지시를 읽는다', () => {
    const plan = CompanyPlanDto.read({ note: '둘로 나눔', assignments: [{ member: 'marketer', brief: '스토어 문구' }, { member: 'growth', brief: '지표 설계' }] }, marketing);
    expect(plan.assignments).toEqual([{ role: 'marketer', brief: '스토어 문구' }, { role: 'growth', brief: '지표 설계' }]);
  });

  it('부서에 없는 팀원과 같은 팀원의 중복은 버린다', () => {
    const plan = CompanyPlanDto.read({ assignments: [{ member: 'debugger', brief: 'x' }, { member: 'marketer', brief: 'a' }, { member: 'marketer', brief: 'b' }] }, marketing);
    expect(plan.assignments).toEqual([{ role: 'marketer', brief: 'a' }]);
  });

  it('한 번에 세 명까지만 일을 맡긴다', () => {
    const operations = Department.of('operations');
    const plan = CompanyPlanDto.read({ assignments: operations.members.map((m) => ({ member: m.role, brief: 'b' })).concat([{ member: 'operator', brief: 'again' }]) }, operations);
    expect(plan.assignments).toHaveLength(3);
  });

  it('고른 팀원이 없거나 출력이 깨졌으면 부서의 첫 팀원이 요청을 그대로 맡는다', () => {
    expect(CompanyPlanDto.read({ assignments: [] }, marketing).assignments).toEqual([{ role: 'marketer', brief: '' }]);
    expect(CompanyPlanDto.read(null, marketing).assignments).toEqual([{ role: 'marketer', brief: '' }]);
  });
});
