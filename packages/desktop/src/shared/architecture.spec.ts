import { describe, expect, it } from 'vitest';
import { architectureOf, stackFromPaths } from './architecture.js';

const nest = [
  'package.json',
  'apps/api/nest-cli.json',
  'apps/api/src/app.module.ts',
  'apps/api/src/users/users.controller.ts',
  'apps/api/src/users/users.service.ts',
  'apps/api/src/users/users.service.spec.ts',
  'apps/api/test/app.e2e-spec.ts',
  'apps/web/package.json',
  'packages/core/package.json',
  'packages/core/src/orders/domain/order.ts',
  'packages/core/src/orders/application/place-order.ts',
  'packages/core/src/orders/infrastructure/order-repo.ts',
  'packages/core/src/orders/domain/order.spec.ts',
  'prisma/migrations/20240101_init/migration.sql',
  'schema.graphql',
  '.github/workflows/ci.yml',
  '.github/workflows/deploy.yml',
  'infra/main.tf',
  'Dockerfile',
  'k8s/deployment.yaml',
  'docs/adr/0001-use-events.md',
  'docs/design/overview.md',
];

describe('파일 배치에서 스택 알아보기(코드는 읽지 않음)', () => {
  it('nest-cli.json 이나 모듈·컨트롤러 파일 구성으로 NestJS', () => {
    expect(stackFromPaths(nest)).toContain('NestJS');
    expect(stackFromPaths(['src/a.module.ts', 'src/a.controller.ts'])).toContain('NestJS');
    expect(stackFromPaths(['src/a.ts'])).not.toContain('NestJS');
  });
  it('Spring·Django·Rails·Android·iOS 같은 파일 구성도', () => {
    expect(stackFromPaths(['src/main/java/a/Application.java', 'src/main/resources/application.yml'])).toContain('Spring Boot');
    expect(stackFromPaths(['manage.py', 'app/models.py'])).toContain('Django');
    expect(stackFromPaths(['app/src/main/AndroidManifest.xml'])).toContain('Android');
    expect(stackFromPaths(['App.xcodeproj/project.pbxproj'])).toContain('iOS');
  });
});

describe('아키텍처 신호(파일 배치만으로)', () => {
  const a = architectureOf(nest);
  it('모노레포(패키지 수), 계층 구조(domain·application·infrastructure), 테스트 비율', () => {
    expect(a.some((l) => /monorepo.*2 packages.*apps\/web.*packages\/core/i.test(l))).toBe(true);
    expect(a.some((l) => /layered.*domain.*application.*infrastructure/i.test(l))).toBe(true);
    expect(a.some((l) => /tests: 3 test files/i.test(l))).toBe(true);
  });
  it('CI·IaC·컨테이너·마이그레이션·API 방식·설계 문서', () => {
    const all = a.join('\n');
    expect(all).toMatch(/CI: 2 GitHub Actions workflows/);
    expect(all).toMatch(/Terraform/);
    expect(all).toMatch(/Docker/);
    expect(all).toMatch(/Kubernetes/);
    expect(all).toMatch(/migrations/i);
    expect(all).toMatch(/GraphQL/);
    expect(all).toMatch(/ADR/);
  });
  it('빈 레포는 빈 목록', () => {
    expect(architectureOf([])).toEqual([]);
  });
});
