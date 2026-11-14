import { INDUSTRY_ROLES, JOB_ROLES, type Market, type MarketProfile, type RoleKey } from '../../domain/job-posting.js';

/**
 * 실제 채용 공고 시장 정보: 웹 검색 결과(바깥 입력)를 믿지 않고 거른다.
 * 정해진 업종·직무만, 짧은 글만, https 출처만 받는다.
 */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const word = (v: unknown, max = 40): string | null => (typeof v === 'string' && v.trim() !== '' && v.trim().length <= max && !CONTROL.test(v) ? v.trim() : null);
const words = (v: unknown, n: number, max = 40): string[] => (Array.isArray(v) ? v.map((x) => word(x, max)).filter((x): x is string => x !== null).slice(0, n) : []);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function profileOf(v: unknown): MarketProfile | null {
  if (!isObj(v)) return null;
  const industry = INDUSTRY_ROLES.find((i) => i.name === v['industry']);
  const role = Object.hasOwn(JOB_ROLES, v['role'] as string) ? (v['role'] as RoleKey) : null;
  if (industry === undefined || role === null) return null;
  const stacks = (Array.isArray(v['stacks']) ? v['stacks'] : []).map((s) => words(s, 6)).filter((s) => s.length > 0).slice(0, 5);
  if (stacks.length === 0) return null;
  const sources = (Array.isArray(v['sources']) ? v['sources'] : [])
    .filter(isObj)
    .map((x) => ({ title: word(x['title'], 120) ?? '', url: typeof x['url'] === 'string' && x['url'].length <= 400 && /^https:\/\/[^\s]+$/.test(x['url']) ? x['url'] : '' }))
    .filter((x) => x.title !== '' && x.url !== '')
    .slice(0, 6);
  return { industry: industry.name, role, stacks, extras: words(v['extras'], 6, 60), companies: words(v['companies'], 8), sources };
}

export class MarketDto {
  private constructor() {}

  /** 모델(웹 검색)이 낸 결과 → 시장 정보. checkedAt 은 오늘 날짜 */
  static from(output: unknown, checkedAt: string): Market {
    const raw = isObj(output) && Array.isArray(output['profiles']) ? output['profiles'] : [];
    return { checkedAt, profiles: raw.map(profileOf).filter((p): p is MarketProfile => p !== null) };
  }

  /** 저장해 둔 파일 → 시장 정보(깨졌으면 null) */
  static fromSaved(saved: unknown): Market | null {
    if (!isObj(saved) || typeof saved['checkedAt'] !== 'string' || !DATE.test(saved['checkedAt'])) return null;
    return MarketDto.from(saved, saved['checkedAt']);
  }
}

/** 웹 검색 모델이 채울 모양 */
export const MARKET_SCHEMA = {
  type: 'object',
  properties: {
    profiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          industry: { type: 'string', enum: INDUSTRY_ROLES.map((i) => i.name) },
          role: { type: 'string', enum: Object.keys(JOB_ROLES) },
          stacks: { type: 'array', description: '2 to 4 common stack combinations seen in real postings, each 3 to 5 short names', items: { type: 'array', items: { type: 'string' } } },
          extras: { type: 'array', description: 'Common requirements or preferred experience, short Korean phrases', items: { type: 'string' } },
          companies: { type: 'array', description: 'Real companies whose postings this is based on', items: { type: 'string' } },
          sources: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' } }, required: ['title', 'url'] } },
        },
        required: ['industry', 'role', 'stacks', 'extras', 'companies', 'sources'],
      },
    },
  },
  required: ['profiles'],
} as const;
