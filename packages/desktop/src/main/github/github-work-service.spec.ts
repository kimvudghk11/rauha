import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GithubWorkService } from './github-work-service.js';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rauha-ghwork-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const TOKENS: Record<string, string> = { 'kim-me': 'ghp_' + 'a'.repeat(36), 'kim-corp': 'ghp_' + 'b'.repeat(36) };
const b64 = (t: string): string => Buffer.from(t, 'utf8').toString('base64');

/** 가짜 GitHub API: 개인 레포 하나(NestJS), 회사 레포 하나(SSO 로 막힘)·하나(Kotlin) */
function fakeApi(calls: string[]): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const path = String(url).replace('https://api.github.com', '');
    calls.push(path);
    const token = String((init?.headers as Record<string, string>)['Authorization']).replace('Bearer ', '');
    const who = Object.entries(TOKENS).find(([, t]) => t === token)?.[0];
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (path.startsWith('/user/repos')) return json(200, who === 'kim-me' ? [{ full_name: 'kim-me/shop', default_branch: 'main', pushed_at: '2026-10-01T00:00:00Z' }] : [{ full_name: 'corp/pay', default_branch: 'main', pushed_at: '2026-09-01T00:00:00Z' }, { full_name: 'corp/secret', default_branch: 'main', pushed_at: '2026-08-01T00:00:00Z' }]);
    if (path.startsWith('/repos/corp/secret/commits')) return new Response('Resource protected by organization SAML enforcement.', { status: 403 });
    if (path.startsWith('/repos/kim-me/shop/commits')) return json(200, [{ sha: 'aaaa1111', commit: { message: 'feat: 주문', author: { date: '2026-03-01T00:00:00Z', name: 'Kim' } }, parents: [{}] }]);
    if (path.startsWith('/repos/corp/pay/commits')) return json(200, [{ sha: 'bbbb2222', commit: { message: 'fix: 결제 재시도', author: { date: '2026-07-01T00:00:00Z', name: 'Kim' } }, parents: [{}] }]);
    if (path === '/repos/kim-me/shop/languages') return json(200, { TypeScript: 9000, CSS: 1000 });
    if (path === '/repos/corp/pay/languages') return json(200, { Kotlin: 10000 });
    if (path.startsWith('/repos/kim-me/shop/git/trees')) return json(200, { tree: [{ path: 'package.json', type: 'blob', size: 100 }, { path: 'src/orders/orders.module.ts', type: 'blob' }, { path: 'src/orders/orders.controller.ts', type: 'blob' }, { path: 'src/orders/orders.service.spec.ts', type: 'blob' }, { path: '.github/workflows/ci.yml', type: 'blob', size: 10 }] });
    if (path.startsWith('/repos/corp/pay/git/trees')) return json(200, { tree: [{ path: 'build.gradle.kts', type: 'blob', size: 100 }, { path: 'src/main/kotlin/pay/domain/Payment.kt', type: 'blob' }] });
    if (path.startsWith('/repos/kim-me/shop/contents/package.json')) return json(200, { encoding: 'base64', content: b64(JSON.stringify({ dependencies: { '@nestjs/core': '10', pg: '8' } })) });
    if (path.startsWith('/repos/corp/pay/contents/build.gradle.kts')) return json(200, { encoding: 'base64', content: b64('plugins { id("org.springframework.boot") kotlin("jvm") }') });
    return json(404, { message: 'Not Found' });
  }) as unknown as typeof fetch;
}

const service = (calls: string[]) =>
  GithubWorkService.create({
    platform: 'linux',
    env: {},
    cacheFile: join(dir, 'gh.json'),
    fetch: fakeApi(calls),
    ghPath: '/usr/bin/gh',
    run: async (_file, args) => {
      if (args[0] === 'auth' && args[1] === 'status') return { code: 0, out: '  ✓ Logged in to github.com account kim-me (keyring)\n  ✓ Logged in to github.com account kim-corp (keyring)' };
      const user = args[args.indexOf('--user') + 1] ?? '';
      return TOKENS[user] !== undefined ? { code: 0, out: TOKENS[user]! } : { code: 1, out: 'no' };
    },
  });

describe('GitHub 에서 내 작업 읽기(clone 없이, 여러 계정)', () => {
  it('gh 에 로그인한 계정들을 읽는다', async () => {
    expect(await service([]).logins()).toEqual({ installed: true, logins: ['kim-me', 'kim-corp'] });
  });
  it('계정마다 레포·내 커밋·언어·파일 구성·설정 파일로 커밋과 스택(NestJS·Spring)·아키텍처를 만든다', async () => {
    const r = await service([]).scan(['Kim-Me', 'kim-corp'], true);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.commits.map((c) => [c.repo, c.subject, c.email]).sort()).toEqual([
      ['corp/pay', 'fix: 결제 재시도', 'github:kim-corp'],
      ['kim-me/shop', 'feat: 주문', 'github:kim-me'],
    ]);
    expect(r.data.commits.find((c) => c.repo === 'kim-me/shop')!.langs).toEqual({ TypeScript: 90, CSS: 10 });
    const shop = r.data.stacks.find((s) => s.repo === 'kim-me/shop')!;
    expect(shop.stack).toEqual(expect.arrayContaining(['NestJS', 'PostgreSQL']));
    expect(shop.architecture.join('\n')).toMatch(/GitHub Actions/);
    expect(r.data.stacks.find((s) => s.repo === 'corp/pay')!.stack).toEqual(expect.arrayContaining(['Spring Boot', 'Kotlin']));
    expect(r.data.repos).toBe(2);
  });
  it('SSO 로 막힌 회사 레포는 고치는 법을 안내한다', async () => {
    const r = await service([]).scan(['kim-corp'], true);
    expect(r.ok && r.data.notes.some((n) => /corp\/secret.*SSO/.test(n))).toBe(true);
  });
  it('하루 안에 같은 계정으로 다시 부르면 저장해 둔 것을 쓴다(API 를 다시 부르지 않음), force 면 새로', async () => {
    const calls: string[] = [];
    const s = service(calls);
    await s.scan(['kim-me'], true);
    const n = calls.length;
    await s.scan(['kim-me'], false);
    expect(calls.length).toBe(n);
    await s.scan(['kim-me'], true);
    expect(calls.length).toBeGreaterThan(n);
  });
  it('로그인 안 된 계정은 안내만 남기고 건너뛴다, 계정이 없으면 실패', async () => {
    const r = await service([]).scan(['nobody'], true);
    expect(r.ok && r.data.notes[0]).toMatch(/nobody: not signed in/);
    expect((await service([]).scan([], true)).ok).toBe(false);
  });
});
