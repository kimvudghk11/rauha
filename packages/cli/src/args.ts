export type Command =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'whoami'; profile: string | null }
  | { kind: 'login'; profile: string | null }
  | { kind: 'bench'; profile: string | null; only: string | null; compare: boolean }
  | { kind: 'chat'; profile: string | null; prompt: string | null };

/** 지금 필요한 만큼만 읽는 작은 인자 파서. 명령이 늘면 그때 라이브러리로 바꾼다. */
export function parseArgs(argv: readonly string[]): Command {
  let profile: string | null = null;
  let prompt: string | null = null;
  let only: string | null = null;
  let compare = false;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '-h' || arg === '--help') return { kind: 'help' };
    if (arg === '-v' || arg === '--version') return { kind: 'version' };
    if (arg === '--profile') {
      profile = argv[++i] ?? null;
    } else if (arg.startsWith('--profile=')) {
      profile = arg.slice('--profile='.length);
    } else if (arg === '--only') {
      only = argv[++i] ?? null;
    } else if (arg === '--compare') {
      compare = true;
    } else if (arg === '-p' || arg === '--print') {
      prompt = argv[++i] ?? '';
    } else {
      positional.push(arg);
    }
  }

  if (positional[0] === 'whoami') return { kind: 'whoami', profile };
  if (positional[0] === 'login') return { kind: 'login', profile };
  if (positional[0] === 'bench') return { kind: 'bench', profile, only, compare };
  return { kind: 'chat', profile, prompt };
}
