import { toPosixPath } from '../../shared/path-pattern.js';

export interface WorkspaceRepo {
  /** 메시지와 /repo에서 부르는 이름. 폴더 이름, 겹치면 `부모/폴더`. */
  readonly name: string;
  readonly root: string;
}

export type RepoPick =
  | { readonly kind: 'one'; readonly repo: WorkspaceRepo }
  | { readonly kind: 'many'; readonly repos: readonly WorkspaceRepo[] }
  | { readonly kind: 'ask'; readonly candidates: readonly WorkspaceRepo[] };

const same = (a: string, b: string) => toPosixPath(a).toLowerCase() === toPosixPath(b).toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 저장소 이름 정하기: 폴더 이름, 같은 이름이 둘 이상이면 그것들만 `부모/폴더`. */
function named(roots: readonly string[]): WorkspaceRepo[] {
  const parts = roots.map((r) => toPosixPath(r).split('/'));
  const last = parts.map((p) => p[p.length - 1] ?? '');
  return roots.map((root, i) => {
    const p = parts[i]!;
    const clash = last.filter((n) => n.toLowerCase() === last[i]!.toLowerCase()).length > 1;
    return { name: clash ? p.slice(-2).join('/') : last[i]!, root };
  });
}

/**
 * rauha 하나가 다루는 저장소들과 지금 저장소. 메시지에 나온 저장소 이름으로 어느 저장소 일인지 정한다.
 * 모델에게 묻지 않는다: 이름이 없으면 지금 저장소(마지막으로 다룬 곳), 그래도 못 정하면 사용자에게 묻는다.
 */
export class Workspace {
  private constructor(
    private roots: string[],
    private currentRoot: string | null,
  ) {}

  static of(roots: readonly string[], current: string | null = null): Workspace {
    const unique: string[] = [];
    for (const root of roots) if (!unique.some((u) => same(u, root))) unique.push(toPosixPath(root));
    const cur = current === null ? null : (unique.find((u) => same(u, current)) ?? null);
    return new Workspace(unique, cur);
  }

  get repos(): readonly WorkspaceRepo[] {
    return named(this.roots);
  }

  current(): WorkspaceRepo | null {
    return this.repos.find((r) => this.currentRoot !== null && same(r.root, this.currentRoot)) ?? null;
  }

  /** 이름으로 지금 저장소를 바꾼다. 없으면 null(지금 저장소는 그대로). */
  select(name: string): WorkspaceRepo | null {
    const repo = this.repos.find((r) => r.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
    if (repo !== null) this.currentRoot = repo.root;
    return repo;
  }

  /** 저장소를 더한다. 경로 표기만 다른 같은 저장소면 있는 것을 돌려준다. */
  add(root: string): WorkspaceRepo {
    if (!this.roots.some((r) => same(r, root))) this.roots = [...this.roots, toPosixPath(root)];
    return this.repos.find((r) => same(r.root, root))!;
  }

  /** 메시지에 나온 저장소(나온 순서). 이름 앞뒤가 영문·숫자·`_`·`-`·`/`면 다른 말의 일부로 보고 잡지 않는다. */
  mentioned(message: string): WorkspaceRepo[] {
    const text = message.toLowerCase();
    const hits = this.repos.flatMap((repo) => {
      const at = text.search(new RegExp(`(^|[^a-z0-9_\\-/])${escape(repo.name.toLowerCase())}(?![a-z0-9_\\-/])`));
      return at < 0 ? [] : [{ at, repo }];
    });
    return hits.sort((a, b) => a.at - b.at).map((h) => h.repo);
  }

  /** 이 메시지는 어느 저장소 일인가. 고른 저장소(여럿이면 첫 저장소)가 다음 지금 저장소가 된다. */
  pick(message: string): RepoPick {
    const named = this.mentioned(message);
    const chosen = named.length > 0 ? named : [this.current() ?? (this.roots.length === 1 ? this.repos[0]! : null)].filter((r): r is WorkspaceRepo => r !== null);
    if (chosen.length === 0) return { kind: 'ask', candidates: this.repos };
    this.currentRoot = chosen[0]!.root;
    return chosen.length === 1 ? { kind: 'one', repo: chosen[0]! } : { kind: 'many', repos: chosen };
  }
}
