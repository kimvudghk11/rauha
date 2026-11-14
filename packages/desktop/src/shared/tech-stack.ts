/**
 * 기술 스택 읽기(읽기만, 코드는 보내지 않는다): 내가 바꾼 파일의 언어와, 레포 설정 파일(package.json·Gradle·Maven …)의 기술 이름.
 * 채용 검토실이 공고의 스택과 비교하는 데 쓴다.
 */
const LANG: Readonly<Record<string, string>> = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  java: 'Java', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala', groovy: 'Groovy',
  py: 'Python', go: 'Go', rs: 'Rust', rb: 'Ruby', php: 'PHP', cs: 'C#', swift: 'Swift', m: 'Objective-C', dart: 'Dart',
  c: 'C', h: 'C', cpp: 'C++', cc: 'C++', hpp: 'C++', sql: 'SQL', sh: 'Shell', ps1: 'PowerShell',
  vue: 'Vue', svelte: 'Svelte', css: 'CSS', scss: 'CSS', sass: 'CSS', less: 'CSS', html: 'HTML', tf: 'Terraform',
};

/** 바꾼 파일의 언어. 문서·설정·잠금·데이터 파일은 null */
export function langOf(path: string): string | null {
  // git numstat 의 이름 바꿈 표기: "src/{a.js => b.ts}" · "a.js => b.ts"
  const p = path.replace(/\{[^}]*=> ([^}]*)\}/, '$1').replace(/^.* => /, '');
  const m = /\.([a-z0-9]+)$/i.exec(p);
  return m === null ? null : (LANG[m[1]!.toLowerCase()] ?? null);
}

const MANIFESTS = new Set(['package.json', 'build.gradle', 'build.gradle.kts', 'pom.xml', 'requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'Gemfile', 'composer.json', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yaml', 'Chart.yaml', 'pubspec.yaml', 'compose.yml', 'schema.prisma', '.env.example', '.env.sample', '.env.template', '.env.dist']);
const MAX_DEPTH = 5;

/** 스택을 읽을 설정 파일인지(레포 안 경로, / 구분, 깊이 5 까지 — 모노레포 apps/api/package.json 같은 곳도) */
export function isManifestPath(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((p) => p === 'node_modules' || p === 'vendor' || p === 'dist' || p === 'build')) return false;
  const name = parts[parts.length - 1]!;
  if (path.startsWith('.github/workflows/') && /\.ya?ml$/.test(name)) return true;
  if (parts.length > MAX_DEPTH) return false;
  return MANIFESTS.has(name) || name.endsWith('.tf');
}

/** package.json 의존성 이름 → 기술 이름(정확히 같거나 접두어) */
const NPM: readonly (readonly [string, string])[] = [
  ['react-native', 'React Native'], ['react', 'React'], ['next', 'Next.js'], ['vue', 'Vue'], ['nuxt', 'Nuxt'], ['svelte', 'Svelte'], ['@angular/core', 'Angular'],
  ['express', 'Express'], ['@nestjs/', 'NestJS'], ['fastify', 'Fastify'], ['koa', 'Koa'], ['electron', 'Electron'], ['typescript', 'TypeScript'],
  ['vitest', 'Vitest'], ['jest', 'Jest'], ['@playwright/test', 'Playwright'], ['playwright', 'Playwright'], ['cypress', 'Cypress'], ['@storybook/', 'Storybook'],
  ['tailwindcss', 'Tailwind CSS'], ['@prisma/client', 'Prisma'], ['prisma', 'Prisma'], ['typeorm', 'TypeORM'], ['sequelize', 'Sequelize'], ['mongoose', 'MongoDB'], ['mongodb', 'MongoDB'],
  ['pg', 'PostgreSQL'], ['postgres', 'PostgreSQL'], ['pg-promise', 'PostgreSQL'], ['@neondatabase/serverless', 'PostgreSQL'], ['@supabase/supabase-js', 'PostgreSQL'],
  ['better-sqlite3', 'SQLite'], ['sqlite3', 'SQLite'], ['mariadb', 'MariaDB'], ['mssql', 'SQL Server'], ['tedious', 'SQL Server'], ['oracledb', 'Oracle'],
  ['@elastic/elasticsearch', 'Elasticsearch'], ['@opensearch-project/opensearch', 'Elasticsearch'], ['@aws-sdk/client-dynamodb', 'DynamoDB'], ['@aws-sdk/lib-dynamodb', 'DynamoDB'], ['cassandra-driver', 'Cassandra'], ['@google-cloud/bigquery', 'BigQuery'],
  ['drizzle-orm', 'Drizzle'], ['knex', 'Knex'], ['amqplib', 'RabbitMQ'], ['mysql2', 'MySQL'], ['mysql', 'MySQL'], ['redis', 'Redis'], ['ioredis', 'Redis'], ['kafkajs', 'Kafka'], ['graphql', 'GraphQL'], ['@apollo/', 'Apollo'],
  ['aws-sdk', 'AWS'], ['@aws-sdk/', 'AWS'], ['@anthropic-ai/', 'Claude API'], ['openai', 'OpenAI API'], ['vite', 'Vite'], ['webpack', 'webpack'],
  ['@reduxjs/toolkit', 'Redux'], ['redux', 'Redux'], ['zustand', 'Zustand'], ['@tanstack/react-query', 'React Query'], ['socket.io', 'Socket.IO'], ['zod', 'Zod'],
];
/** 그 밖의 설정 파일 글에서 찾을 말 → 기술 이름 */
const WORDS: readonly (readonly [RegExp, string])[] = [
  [/org\.springframework\.boot|spring-boot/, 'Spring Boot'], [/spring-kafka|org\.apache\.kafka|kafka-clients/, 'Kafka'], [/kotlin\(|org\.jetbrains\.kotlin/, 'Kotlin'],
  [/spring-boot-starter-data-jpa|hibernate/, 'JPA'], [/querydsl/, 'QueryDSL'], [/mysql-connector|com\.mysql/, 'MySQL'], [/postgresql/, 'PostgreSQL'], [/ojdbc|oracle/, 'Oracle'],
  [/spring-boot-starter-data-redis|lettuce|jedis/, 'Redis'], [/spring-batch/, 'Spring Batch'], [/webflux/, 'WebFlux'], [/kotest/, 'Kotest'], [/junit/, 'JUnit'],
  [/\bdjango\b/i, 'Django'], [/\bflask\b/i, 'Flask'], [/\bfastapi\b/i, 'FastAPI'], [/\bsqlalchemy\b/i, 'SQLAlchemy'], [/\bpandas\b/i, 'pandas'], [/\btorch\b/i, 'PyTorch'], [/\btensorflow\b/i, 'TensorFlow'], [/\bcelery\b/i, 'Celery'],
  [/gin-gonic\/gin/, 'Gin'], [/labstack\/echo/, 'Echo'], [/gorm\.io/, 'GORM'], [/google\.golang\.org\/grpc/, 'gRPC'], [/\btokio\b/, 'Tokio'], [/\baxum\b/, 'Axum'], [/\bactix/, 'Actix'],
  [/\bpsycopg2?\b|\bpsycopg[-_]|\basyncpg\b|org\.postgresql/i, 'PostgreSQL'], [/\bpymysql\b|\bmysqlclient\b|mysql-connector-python/i, 'MySQL'], [/\bpymongo\b|\bmotor\b|mongodb-driver/i, 'MongoDB'], [/^redis[=<>~ ]|\bredis-py\b/im, 'Redis'], [/mariadb/i, 'MariaDB'], [/mssql-jdbc|com\.microsoft\.sqlserver/i, 'SQL Server'], [/h2database/i, 'H2'],
  [/\brails\b/, 'Rails'], [/laravel/, 'Laravel'], [/flutter/, 'Flutter'],
];

function npmStack(text: string): string[] {
  let pkg: unknown;
  try {
    pkg = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof pkg !== 'object' || pkg === null) return [];
  const o = pkg as Record<string, unknown>;
  const names = ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((k) => (typeof o[k] === 'object' && o[k] !== null ? Object.keys(o[k] as object) : []));
  const out: string[] = [];
  for (const n of names) {
    const hit = NPM.find(([key]) => (key.endsWith('/') ? n.startsWith(key) : n === key));
    if (hit !== undefined) out.push(hit[1]);
  }
  return out;
}

/** docker-compose 이미지 이름 → 기술 */
const IMAGES: readonly (readonly [RegExp, string])[] = [
  [/(^|\/)(postgres|postgis|timescale)/i, 'PostgreSQL'], [/(^|\/)mysql/i, 'MySQL'], [/(^|\/)mariadb/i, 'MariaDB'], [/(^|\/)(redis|valkey)/i, 'Redis'], [/(^|\/)mongo/i, 'MongoDB'],
  [/elasticsearch|opensearch/i, 'Elasticsearch'], [/mssql|sqlserver/i, 'SQL Server'], [/(^|\/)oracle/i, 'Oracle'], [/(^|\/)cassandra/i, 'Cassandra'], [/kafka/i, 'Kafka'], [/rabbitmq/i, 'RabbitMQ'], [/localstack/i, 'AWS'], [/dynamodb/i, 'DynamoDB'],
];
const PRISMA: Readonly<Record<string, string>> = { postgresql: 'PostgreSQL', postgres: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite', sqlserver: 'SQL Server', mongodb: 'MongoDB', cockroachdb: 'CockroachDB' };
const URL_SCHEMES: Readonly<Record<string, string>> = { postgres: 'PostgreSQL', postgresql: 'PostgreSQL', mysql: 'MySQL', mariadb: 'MariaDB', mongodb: 'MongoDB', 'mongodb+srv': 'MongoDB', redis: 'Redis', rediss: 'Redis', sqlserver: 'SQL Server', amqp: 'RabbitMQ', amqps: 'RabbitMQ' };

/** 설정 파일들 → 기술 이름(문자 코드 순 — 로캘과 상관없이 같은 순서, 중복 없음) */
export function stackOf(files: readonly { readonly path: string; readonly text: string }[]): string[] {
  const out = new Set<string>();
  for (const f of files) {
    const name = f.path.split('/').pop()!;
    if (name === 'package.json') npmStack(f.text).forEach((x) => out.add(x));
    else if (name.startsWith('docker-compose') || name === 'compose.yaml' || name === 'compose.yml') {
      out.add('Docker');
      // 서비스 이미지 이름으로 DB·큐(postgres:16, redis:7 …)
      for (const m of f.text.matchAll(/^\s*image:\s*["']?([^\s"']+)/gm)) for (const [re, tech] of IMAGES) if (re.test(m[1]!)) out.add(tech);
    } else if (name === 'Dockerfile') out.add('Docker');
    else if (name === 'schema.prisma') {
      out.add('Prisma');
      const p = /provider\s*=\s*"(\w+)"/.exec(f.text.replace(/generator[\s\S]*?\}/g, ''))?.[1];
      if (p !== undefined && PRISMA[p] !== undefined) out.add(PRISMA[p]!);
    } else if (name.startsWith('.env.')) {
      // 예시 .env 에서는 주소의 종류(scheme)만 본다(값은 쓰지 않는다)
      for (const m of f.text.matchAll(/=\s*["']?([a-z+]+):\/\//gim)) {
        const tech = URL_SCHEMES[m[1]!.toLowerCase()];
        if (tech !== undefined) out.add(tech);
      }
    }
    else if (f.path.startsWith('.github/workflows/')) out.add('GitHub Actions');
    else if (name === 'Chart.yaml') out.add('Kubernetes');
    else if (name.endsWith('.tf')) {
      out.add('Terraform');
      if (/"aws_/.test(f.text)) out.add('AWS');
      if (/"google_/.test(f.text)) out.add('GCP');
    } else for (const [re, tech] of WORDS) if (re.test(f.text)) out.add(tech);
    if (name === 'pubspec.yaml') out.add('Flutter');
  }
  return [...out].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
