import { langOf } from './tech-stack.js';

/**
 * 레포의 파일 배치(git 이 추적하는 경로 목록)만으로 읽는 아키텍처 신호와 스택. 파일 내용·코드는 읽지 않는다.
 * 채용 검토실이 "언어가 다르다"보다 설계·테스트·운영 같은 실제 엔지니어링을 보게 한다.
 */
const name = (p: string): string => p.split('/').pop() ?? p;
const segs = (p: string): string[] => p.split('/');

/** 파일 구성으로 알아보는 프레임워크(설정 파일에 안 드러날 때를 메운다) */
export function stackFromPaths(paths: readonly string[]): string[] {
  const out = new Set<string>();
  const has = (re: RegExp): boolean => paths.some((p) => re.test(p));
  if (has(/(^|\/)nest-cli\.json$/) || (has(/\.module\.ts$/) && has(/\.controller\.ts$/))) out.add('NestJS');
  if (has(/src\/main\/(java|kotlin)\//) && has(/src\/main\/resources\/application\.(ya?ml|properties)$/)) out.add('Spring Boot');
  if (has(/(^|\/)manage\.py$/)) out.add('Django');
  if (has(/(^|\/)config\/routes\.rb$/)) out.add('Rails');
  if (has(/AndroidManifest\.xml$/)) out.add('Android');
  if (has(/\.xcodeproj\//) || has(/\.swift$/)) out.add('iOS');
  if (has(/(^|\/)next\.config\.(js|mjs|ts)$/)) out.add('Next.js');
  if (has(/\.proto$/)) out.add('gRPC');
  if (has(/\.graphql$|\.gql$/)) out.add('GraphQL');
  if (has(/(^|\/)(k8s|kubernetes|helm|charts)\//)) out.add('Kubernetes');
  return [...out].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

const LAYERS = ['domain', 'application', 'infrastructure', 'presentation', 'adapters', 'ports', 'usecase', 'usecases', 'controller', 'controllers', 'service', 'services', 'repository', 'repositories', 'entity', 'entities'];
const isTest = (p: string): boolean => /(\.|-|_)(spec|test)\.[a-z0-9]+$/i.test(name(p)) || /(^|\/)(__tests__|tests?)\//.test(p) || /Test\.(java|kt)$/.test(name(p)) || /_test\.go$/.test(name(p));

/** 사람이 읽는 신호 몇 줄(모델에 그대로 넘긴다) */
export function architectureOf(paths: readonly string[]): string[] {
  if (paths.length === 0) return [];
  const out: string[] = [];
  // 모노레포: 하위 패키지 설정 파일이 둘 이상
  const pkgs = paths.filter((p) => segs(p).length >= 2 && /^(package\.json|build\.gradle(\.kts)?|pom\.xml|go\.mod|pyproject\.toml|Cargo\.toml)$/.test(name(p)));
  if (pkgs.length >= 2) out.push(`monorepo with ${pkgs.length} packages (${[...new Set(pkgs.map((p) => segs(p).slice(0, -1).join('/')))].slice(0, 6).join(', ')})`);
  // 계층 구조: 이름 붙은 계층 폴더들
  const layers = LAYERS.filter((l) => paths.some((p) => segs(p).slice(0, -1).includes(l)));
  const order = ['domain', 'application', 'infrastructure'];
  if (layers.length >= 2) out.push(`layered folders: ${[...order.filter((l) => layers.includes(l)), ...layers.filter((l) => !order.includes(l))].join(', ')}`);
  // 테스트 비율
  const source = paths.filter((p) => langOf(p) !== null);
  const tests = source.filter(isTest);
  if (source.length > 0) out.push(`tests: ${tests.length} test files for ${source.length - tests.length} source files (${Math.round((tests.length / Math.max(1, source.length - tests.length)) * 100)}%)${paths.some((p) => /e2e/i.test(p)) ? ', has e2e tests' : ''}`);
  // 운영: CI·IaC·컨테이너
  const workflows = paths.filter((p) => p.startsWith('.github/workflows/'));
  const ci = [workflows.length > 0 ? `${workflows.length} GitHub Actions workflows` : '', paths.includes('.gitlab-ci.yml') ? 'GitLab CI' : '', paths.some((p) => name(p) === 'Jenkinsfile') ? 'Jenkins' : ''].filter((x) => x !== '');
  if (ci.length > 0) out.push(`CI: ${ci.join(', ')}`);
  const infra = [paths.some((p) => p.endsWith('.tf')) ? 'Terraform' : '', paths.some((p) => /(^|\/)cdk\.json$/.test(p)) ? 'AWS CDK' : '', paths.some((p) => /(^|\/)(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/.test(p)) ? 'Docker' : '', paths.some((p) => /(^|\/)(k8s|kubernetes|helm|charts)\//.test(p)) ? 'Kubernetes manifests' : ''].filter((x) => x !== '');
  if (infra.length > 0) out.push(`infrastructure: ${infra.join(', ')}`);
  // 데이터: 마이그레이션
  const migrations = paths.filter((p) => /(^|\/)(migrations?|db\/migration|flyway|liquibase)\//i.test(p));
  if (migrations.length > 0) out.push(`database migrations: ${migrations.length} files`);
  // API 방식
  const api = [paths.some((p) => /\.(graphql|gql)$/.test(p)) ? 'GraphQL' : '', paths.some((p) => p.endsWith('.proto')) ? 'gRPC (proto)' : '', paths.some((p) => /(openapi|swagger)\.(ya?ml|json)$/i.test(p)) ? 'OpenAPI spec' : '', paths.some((p) => /controllers?\/|\.controller\.|routes?\//.test(p)) ? 'REST controllers/routes' : ''].filter((x) => x !== '');
  if (api.length > 0) out.push(`API: ${api.join(', ')}`);
  // 문서: 설계 문서·ADR
  const docs = paths.filter((p) => /\.md$/i.test(p) && /(^|\/)docs?\//i.test(p));
  const adr = paths.filter((p) => /(^|\/)(adr|adrs|decisions)\//i.test(p));
  if (docs.length > 0 || adr.length > 0) out.push(`docs: ${docs.length} design/docs markdown files${adr.length > 0 ? `, ${adr.length} ADR files` : ''}`);
  return out;
}
