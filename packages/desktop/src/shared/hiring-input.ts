/**
 * 채용 검토실 입력: 연차(필수)·희망 직무(선택)·쓰는 DB(선택). 화면에서 온 값이라 main 이 다시 검사한다.
 * 기술 스택은 입력받지 않고 git(바꾼 언어·설정 파일)에서만 읽는다. DB 는 git 에서 찾은 것을 미리 체크해 둔다.
 */
export const HIRING_ROLES = ['any', 'backend', 'frontend', 'fullstack', 'mobile', 'data', 'devops'] as const;
export type HiringRole = (typeof HIRING_ROLES)[number];
export const HIRING_ROLE_LABEL: Readonly<Record<HiringRole, string>> = {
  any: 'Any role (mixed)',
  backend: 'Backend',
  frontend: 'Frontend',
  fullstack: 'Full-stack',
  mobile: 'Mobile',
  data: 'Data · AI',
  devops: 'DevOps · Infra',
};
export const DB_CHOICES = ['MySQL', 'PostgreSQL', 'Oracle', 'SQL Server', 'MariaDB', 'SQLite', 'MongoDB', 'Redis', 'DynamoDB', 'Elasticsearch', 'Cassandra', 'BigQuery'] as const;

export interface HiringInput {
  readonly years: number;
  readonly role: HiringRole;
  readonly dbs: readonly string[];
  /** 희망 연봉(만 원). 선택. 최종 처우 단계에서만 쓴다 */
  readonly desiredSalary: number | null;
}

const YEARS_MAX = 40;
const DBS_MAX = 12;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

export function hiringInputOf(raw: unknown): HiringInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const years = o['years'];
  if (typeof years !== 'number' || !Number.isFinite(years) || years < 0 || years > YEARS_MAX) return null;
  const role = HIRING_ROLES.find((r) => r === o['role']);
  if (role === undefined) return null;
  const dbs: string[] = [];
  for (const d of Array.isArray(o['dbs']) ? o['dbs'] : []) {
    if (typeof d !== 'string') continue;
    const t = d.trim();
    if (t === '' || t.length > 40 || CONTROL.test(t) || dbs.includes(t)) continue;
    dbs.push(t);
    if (dbs.length >= DBS_MAX) break;
  }
  const pay = o['desiredSalary'];
  const desiredSalary = typeof pay === 'number' && Number.isFinite(pay) && pay >= 1000 && pay <= 100_000 ? Math.round(pay) : null;
  return { years: Math.round(years), role, dbs, desiredSalary };
}

/** git 설정 파일 스택 중 DB 인 것 */
export function detectedDbs(stack: readonly string[]): string[] {
  return stack.filter((s) => (DB_CHOICES as readonly string[]).includes(s));
}
