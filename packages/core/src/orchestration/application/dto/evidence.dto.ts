import type { Evidence } from '../../domain/fact-check.js';

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

/**
 * 팀원 보고의 근거 칸 → Evidence. 구조화 출력이 한 모양(모든 칸 + null)이라 종류별 필수 칸을 여기서 고른다.
 * 필수 칸이 빈 근거는 버린다. 근거가 모자란 주장은 거부하지 않고 추측으로 드러나게 둔다.
 */
export class EvidenceDto {
  private constructor() {}

  static list(raw: unknown, _what: string): Evidence[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item): Evidence[] => {
      if (typeof item !== 'object' || item === null) return [];
      const e = item as Record<string, unknown>;
      switch (e['kind']) {
        case 'code': {
          const path = text(e['path']);
          const quote = text(e['quote']);
          const line = typeof e['line'] === 'number' && Number.isInteger(e['line']) && e['line'] > 0 ? e['line'] : null;
          return path !== null && quote !== null ? [{ kind: 'code', path, line, quote }] : [];
        }
        case 'test': {
          const name = text(e['name']);
          return name !== null ? [{ kind: 'test', name }] : [];
        }
        case 'web': {
          const url = text(e['url']);
          return url !== null ? [{ kind: 'web', url, quote: text(e['quote']) }] : [];
        }
        case 'user':
        case 'record': {
          const said = text(e['text']);
          return said !== null ? [{ kind: e['kind'], text: said }] : [];
        }
        default:
          return [];
      }
    });
  }
}
