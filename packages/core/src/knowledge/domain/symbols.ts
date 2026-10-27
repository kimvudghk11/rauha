const IDENT = '[A-Za-z_$][\\w$]*';
/** `export [default] [declare] [abstract] [async] function|class|const|… 이름` */
const DECLARATION = new RegExp(`^\\s*export\\s+(?:default\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:function\\*?|class|const|let|var|interface|type|enum|namespace)\\s+(${IDENT})`, 'gm');
/** `export default 이름;` */
const DEFAULT_NAME = new RegExp(`^\\s*export\\s+default\\s+(${IDENT})\\s*;?\\s*$`, 'gm');
/** `export { a, b as c }` (뒤에 from이 와도 된다) */
const NAMED = /^\s*export\s+(?:type\s+)?\{([^}]*)\}/gm;
const KEYWORDS = new Set(['function', 'class', 'async', 'abstract', 'declare']);

/**
 * TS·JS 소스에서 밖으로 내보낸 이름을 나온 순서대로 뽑는다(Aider의 저장소 지도처럼 파일마다 핵심 이름).
 * 파서를 쓰지 않고 줄 머리의 export 문만 본다. 주석 속 export는 무시한다.
 */
export function exportedSymbols(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found: { at: number; name: string }[] = [];
  for (const m of code.matchAll(DECLARATION)) found.push({ at: m.index ?? 0, name: m[1] as string });
  for (const m of code.matchAll(DEFAULT_NAME)) if (!KEYWORDS.has(m[1] as string)) found.push({ at: m.index ?? 0, name: m[1] as string });
  for (const m of code.matchAll(NAMED)) {
    for (const part of (m[1] as string).split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim() ?? '';
      if (new RegExp(`^${IDENT}$`).test(name)) found.push({ at: m.index ?? 0, name });
    }
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.name))];
}
