/**
 * 채용 공고 만들기: 내 연차(와 고른 직무)에 맞춰, 보낼 때마다 A~E 다섯 회사의 조건을 새로 정한다.
 * 업종·규모·직무·스택·연차 요건·경쟁률·단계별 통과율이 매번 달라져 같은 조건만 반복하지 않는다.
 * seed 가 같으면 같은 공고(확인·재현용).
 */
export type Tier = 'startup' | 'mid' | 'big' | 'bigtech';
export type RoleKey = 'backend' | 'frontend' | 'fullstack' | 'mobile' | 'data' | 'devops';
export type StageKey = 'document' | 'assignment' | 'technical' | 'culture' | 'offer';

export const JOB_ROLES: Readonly<Record<RoleKey, string>> = {
  backend: '백엔드 개발자',
  frontend: '프론트엔드 개발자',
  fullstack: '풀스택 개발자',
  mobile: '모바일 개발자',
  data: '데이터·AI 엔지니어',
  devops: 'DevOps·인프라 엔지니어',
};

export interface JobPosting {
  /** 방 A~E */
  readonly id: string;
  readonly industry: string;
  /** "A사 · 핀테크" */
  readonly label: string;
  readonly size: string;
  readonly tier: Tier;
  /** "백엔드 개발자 · 경력 3년 이상" */
  readonly role: string;
  readonly minYears: number;
  readonly wants: readonly string[];
  /** 자리 하나에 오는 지원자 수(N:1) */
  readonly applicants: number;
  /** 단계별 통과율(%) */
  readonly passRates: Readonly<Record<StageKey, number>>;
  /** 실제 공고 근거(웹에서 찾아 저장한 시장 정보로 만들었을 때). 내장 틀이면 null */
  readonly basis: PostingBasis | null;
  /** 이 회사가 서류를 거르는 평가표(실제 회사가 AI 서류 검토에 주는 기준처럼) */
  readonly rubric: Rubric;
  /** 이 자리 연봉 범위(만 원, 연봉) — 최종 처우 단계에서 희망 연봉과 비교 */
  readonly salary: { readonly min: number; readonly max: number };
}

export type CriterionKey = 'design' | 'depth' | 'fit' | 'ops' | 'collab' | 'growth' | 'impact';
export const CRITERIA: Readonly<Record<CriterionKey, string>> = {
  design: '문제 해결·설계',
  depth: '기술 깊이',
  fit: '직무 적합',
  ops: '운영·품질',
  collab: '협업·소통',
  growth: '성장·학습',
  impact: '성과·임팩트',
};
/** required: 공고 주 언어 경험 필수 · preferred: 우대 · any: 언어 무관(설계·기본기로 본다) */
export type LanguagePolicy = 'required' | 'preferred' | 'any';
export const LANGUAGE_POLICY_LABEL: Readonly<Record<LanguagePolicy, string>> = {
  required: '주 언어 경험 필수',
  preferred: '주 언어 경험 우대',
  any: '언어 무관(설계·기본기로 평가)',
};

export interface Rubric {
  /** 항목과 배점(합 100) */
  readonly criteria: readonly { readonly key: CriterionKey; readonly label: string; readonly weight: number }[];
  readonly languagePolicy: LanguagePolicy;
  /** 주 언어(공고 스택의 첫 언어) */
  readonly mainLanguage: string;
  /** 서류 통과 기준 점수(100점 만점) */
  readonly passScore: number;
}

export interface PostingBasis {
  /** 참고한 실제 회사들 */
  readonly companies: readonly string[];
  readonly sources: readonly { readonly title: string; readonly url: string }[];
  /** 확인한 날(YYYY-MM-DD) */
  readonly checkedAt: string;
}

/** 실제 채용 공고에서 모은 업종 × 직무별 흐름(스택 조합·요구 경험·참고 회사·출처) */
export interface MarketProfile {
  readonly industry: string;
  readonly role: RoleKey;
  readonly stacks: readonly (readonly string[])[];
  readonly extras: readonly string[];
  readonly companies: readonly string[];
  readonly sources: readonly { readonly title: string; readonly url: string }[];
}
export interface Market {
  readonly checkedAt: string;
  readonly profiles: readonly MarketProfile[];
}

export interface PostingInput {
  readonly years: number;
  readonly role: RoleKey | 'any';
  readonly seed: number;
}

interface Industry {
  readonly name: string;
  readonly tier: Tier;
  readonly sizes: readonly string[];
  readonly roles: readonly RoleKey[];
}

const INDUSTRIES: readonly Industry[] = [
  { name: '초기 스타트업', tier: 'startup', sizes: ['시드 · 6명', '시리즈 A · 15명'], roles: ['fullstack', 'backend', 'frontend', 'mobile'] },
  { name: 'AI 스타트업', tier: 'startup', sizes: ['시리즈 B · 40명', '시리즈 A · 20명'], roles: ['data', 'backend', 'fullstack', 'devops'] },
  { name: '커머스', tier: 'mid', sizes: ['월 사용자 300만 · 200명', '월 사용자 1,000만 · 1,200명'], roles: ['backend', 'frontend', 'mobile', 'data'] },
  { name: '핀테크', tier: 'big', sizes: ['유니콘 · 송금·결제', '인터넷 은행 · 900명'], roles: ['backend', 'frontend', 'mobile', 'devops'] },
  { name: '빅테크 플랫폼', tier: 'bigtech', sizes: ['검색·클라우드 · 5,000명', '메신저·광고 · 7,000명'], roles: ['backend', 'devops', 'data', 'frontend'] },
  { name: '게임', tier: 'mid', sizes: ['모바일 게임 · 400명', 'PC 온라인 · 1,500명'], roles: ['backend', 'devops', 'data', 'mobile'] },
  { name: '모빌리티', tier: 'mid', sizes: ['배차·지도 · 600명'], roles: ['backend', 'mobile', 'data'] },
  { name: '헬스케어', tier: 'mid', sizes: ['의료 데이터 · 150명'], roles: ['backend', 'data', 'fullstack'] },
  { name: '에듀테크', tier: 'mid', sizes: ['학습 앱 · 120명'], roles: ['fullstack', 'frontend', 'mobile'] },
  { name: '증권·금융 IT', tier: 'big', sizes: ['증권사 · 임직원 3,000명', '카드사 · 2,000명'], roles: ['backend', 'devops', 'data'] },
  { name: '대기업 계열 IT', tier: 'big', sizes: ['그룹 IT 서비스 · 8,000명'], roles: ['backend', 'frontend', 'devops', 'fullstack'] },
  { name: '보안', tier: 'mid', sizes: ['보안 SaaS · 250명'], roles: ['backend', 'devops'] },
  { name: 'B2B SaaS', tier: 'mid', sizes: ['협업 SaaS · 300명', 'HR SaaS · 180명'], roles: ['fullstack', 'frontend', 'backend'] },
  { name: '미디어·콘텐츠', tier: 'mid', sizes: ['OTT · 500명', '웹툰 · 700명'], roles: ['backend', 'frontend', 'mobile', 'data'] },
];

const STACKS: Readonly<Record<RoleKey, readonly (readonly string[])[]>> = {
  backend: [['Java', 'Spring Boot', 'JPA', 'MySQL'], ['Kotlin', 'Spring', 'Kafka', 'Redis'], ['Go', 'gRPC', 'PostgreSQL', 'Kubernetes'], ['Node.js', 'NestJS', 'TypeScript', 'PostgreSQL'], ['Python', 'Django', 'PostgreSQL', 'Celery']],
  frontend: [['TypeScript', 'React', 'Next.js'], ['TypeScript', 'Vue', 'Nuxt'], ['TypeScript', 'React', '상태 관리 라이브러리']],
  fullstack: [['TypeScript', 'Node.js', 'React', 'AWS'], ['Python', 'FastAPI', 'React', 'GCP'], ['Kotlin', 'Spring', 'React', 'MySQL']],
  mobile: [['Kotlin', 'Android', 'Jetpack Compose'], ['Swift', 'iOS', 'SwiftUI'], ['Flutter', 'Dart'], ['React Native', 'TypeScript']],
  data: [['Python', 'PyTorch', 'MLOps'], ['Python', 'Spark', 'Airflow', 'SQL'], ['Python', 'LLM API', 'RAG', '벡터 DB']],
  devops: [['AWS', 'Terraform', 'Kubernetes'], ['GCP', 'Kubernetes', 'Helm'], ['Linux', 'CI/CD', 'Prometheus·Grafana']],
};
const EXTRAS: Readonly<Record<RoleKey, readonly string[]>> = {
  backend: ['대용량 트래픽', '돈의 정합성·트랜잭션', '장애 대응', 'MSA 설계', '테스트 자동화', '쿼리·성능 튜닝'],
  frontend: ['웹 성능 지표 개선', '접근성', '디자인 시스템', '테스트 자동화', 'SSR·SEO'],
  fullstack: ['혼자 끝까지 만든 경험', '제품 감각', '배포·운영', '빠른 실험'],
  mobile: ['앱 출시·운영 경험', '크래시율 관리', '앱 성능 최적화', '배포 자동화'],
  data: ['실험 설계', '데이터 파이프라인', '모델 서빙', '비용 관리'],
  devops: ['장애 대응·SRE', '클라우드 비용 최적화', '보안·권한 관리', '배포 자동화'],
};

/** 등급별 범위: 지원자 수, 서류 통과율(%) */
const TIER_RANGE: Readonly<Record<Tier, { applicants: readonly [number, number]; document: readonly [number, number] }>> = {
  startup: { applicants: [12, 40], document: [25, 40] },
  mid: { applicants: [50, 120], document: [12, 20] },
  big: { applicants: [130, 260], document: [7, 11] },
  bigtech: { applicants: [270, 420], document: [4, 6] },
};

/** 등급별 평가표 성향: 무게를 더 두는 항목, 언어 정책 가능성, 서류 기준 점수 */
const TIER_RUBRIC: Readonly<Record<Tier, { readonly lean: readonly CriterionKey[]; readonly policies: readonly LanguagePolicy[]; readonly pass: readonly [number, number] }>> = {
  startup: { lean: ['impact', 'growth', 'design'], policies: ['any', 'preferred', 'preferred'], pass: [58, 66] },
  mid: { lean: ['fit', 'design', 'collab'], policies: ['preferred', 'preferred', 'any', 'required'], pass: [66, 72] },
  big: { lean: ['fit', 'ops', 'depth'], policies: ['required', 'required', 'preferred'], pass: [72, 78] },
  bigtech: { lean: ['design', 'depth', 'ops'], policies: ['any', 'any', 'preferred'], pass: [78, 84] },
};
const LANGS = new Set(['Java', 'Kotlin', 'Go', 'Python', 'TypeScript', 'JavaScript', 'Swift', 'Dart', 'Rust', 'C#', 'C++', 'Node.js']);

/** 등급별 연봉 대략값(만 원): 기본 + 연차당 */
const SALARY: Readonly<Record<Tier, { readonly base: number; readonly perYear: number }>> = {
  startup: { base: 3400, perYear: 380 },
  mid: { base: 3700, perYear: 420 },
  big: { base: 4300, perYear: 480 },
  bigtech: { base: 5200, perYear: 580 },
};

export function seniorityOf(years: number): '신입' | '주니어' | '미들' | '시니어' {
  return years <= 0 ? '신입' : years <= 3 ? '주니어' : years <= 7 ? '미들' : '시니어';
}

/** 0 이상 1 미만을 차례로 내는 작은 난수(mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 업종 이름(시장 정보가 이 이름으로 맞춰 온다) */
export const INDUSTRY_ROLES: readonly { readonly name: string; readonly tier: Tier; readonly roles: readonly RoleKey[] }[] = INDUSTRIES.map((i) => ({ name: i.name, tier: i.tier, roles: i.roles }));

export function draftPostings(input: PostingInput, market: Market | null = null): JobPosting[] {
  const r = rng(input.seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
  const between = (lo: number, hi: number): number => Math.round(lo + r() * (hi - lo));
  const years = Math.max(0, Math.min(40, Math.round(input.years)));

  // 업종 다섯: 스타트업 하나, 대기업·빅테크 하나는 꼭, 나머지는 겹치지 않게
  const fits = (i: Industry): boolean => input.role === 'any' || i.roles.includes(input.role);
  const pool = INDUSTRIES.filter(fits);
  const chosen: Industry[] = [pick(pool.filter((i) => i.tier === 'startup')), pick(pool.filter((i) => i.tier === 'big' || i.tier === 'bigtech'))];
  while (chosen.length < 5) {
    const next = pick(pool);
    if (!chosen.includes(next)) chosen.push(next);
  }
  // 방 순서도 섞는다(늘 A 가 스타트업이 아니게)
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j]!, chosen[i]!];
  }

  // 연차 요건: 내 연차 둘레로 섞는다(하나는 신입·연차 무관 쪽으로)
  const offsets = [-2, 0, 0, 2, 4];
  return chosen.map((ind, k): JobPosting => {
    const id = 'ABCDE'[k]!;
    const roleKey = input.role === 'any' ? pick(ind.roles) : input.role;
    const lowOne = k === Math.floor(r() * 5) || years === 0;
    const minYears = lowOne && (ind.tier === 'startup' || years <= 1) ? 0 : Math.max(0, years + pick(offsets));
    const yearsText = minYears === 0 ? (ind.tier === 'startup' ? '연차 무관' : '신입 가능') : `경력 ${minYears}년 이상`;
    // 실제 공고에서 모은 흐름이 있으면 그것으로, 없으면 내장 틀로
    const prof = market?.profiles.find((p) => p.industry === ind.name && p.role === roleKey && p.stacks.length > 0);
    const stack = pick(prof?.stacks ?? STACKS[roleKey]);
    const extras = [...(prof !== undefined && prof.extras.length > 0 ? prof.extras : EXTRAS[roleKey])].sort(() => r() - 0.5).slice(0, 2);
    // 평가표: 등급 성향 항목 셋 + 나머지에서 둘, 성향 항목에 배점을 더 준다(합 100)
    const lean = TIER_RUBRIC[ind.tier];
    const others = (Object.keys(CRITERIA) as CriterionKey[]).filter((k) => !lean.lean.includes(k)).sort(() => r() - 0.5).slice(0, 2);
    const keys = [...lean.lean, ...others];
    const raw = keys.map((k) => (lean.lean.includes(k) ? between(22, 30) : between(10, 16)));
    const sum = raw.reduce((n, x) => n + x, 0);
    const weights = raw.map((x) => Math.round((x / sum) * 100));
    weights[0]! += 100 - weights.reduce((n, x) => n + x, 0);
    const mainLanguage = stack.find((x) => LANGS.has(x)) ?? stack[0] ?? '';
    const rubric: Rubric = { criteria: keys.map((key, i) => ({ key, label: CRITERIA[key], weight: weights[i]! })), languagePolicy: pick(lean.policies), mainLanguage, passScore: between(lean.pass[0], lean.pass[1]) };
    const basis: PostingBasis | null = prof === undefined || market === null ? null : { companies: prof.companies, sources: prof.sources, checkedAt: market.checkedAt };
    const range = TIER_RANGE[ind.tier];
    // 신입·주니어 자리는 지원자가 더 몰린다
    const crowd = minYears <= 1 ? 1.6 : minYears <= 3 ? 1.2 : minYears >= 8 ? 0.6 : 1;
    return {
      id,
      industry: ind.name,
      label: `${id}사 · ${ind.name}`,
      size: pick(ind.sizes),
      tier: ind.tier,
      role: `${JOB_ROLES[roleKey]} · ${yearsText}`,
      minYears,
      wants: [...stack, ...extras],
      applicants: Math.max(5, Math.round(between(range.applicants[0], range.applicants[1]) * crowd)),
      passRates: { document: between(range.document[0], range.document[1]), assignment: between(35, 55), technical: between(25, 45), culture: between(50, 70), offer: between(75, 90) },
      basis,
      rubric,
      salary: (() => {
        const mid = SALARY[ind.tier].base + SALARY[ind.tier].perYear * minYears;
        const spread = between(10, 18) / 100;
        return { min: Math.round((mid * (1 - spread)) / 100) * 100, max: Math.round((mid * (1 + spread)) / 100) * 100 };
      })(),
    };
  });
}
