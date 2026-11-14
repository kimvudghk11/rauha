import { describe, expect, it } from 'vitest';
import { isManifestPath, langOf, stackOf } from './tech-stack.js';

describe('바꾼 파일의 언어', () => {
  it('확장자로 언어를 고르고, 문서·설정·잠금 파일은 세지 않는다', () => {
    expect(langOf('src/a.ts')).toBe('TypeScript');
    expect(langOf('App.tsx')).toBe('TypeScript');
    expect(langOf('svc/Pay.kt')).toBe('Kotlin');
    expect(langOf('main.go')).toBe('Go');
    expect(langOf('styles/x.scss')).toBe('CSS');
    expect(langOf('README.md')).toBeNull();
    expect(langOf('yarn.lock')).toBeNull();
    expect(langOf('package.json')).toBeNull();
  });
  it('git 의 이름 바꿈 표기({a => b})도 새 경로로 본다', () => {
    expect(langOf('src/{old.js => new.ts}')).toBe('TypeScript');
  });
});

describe('레포 설정 파일에서 스택 읽기(이름만)', () => {
  it('설정 파일을 알아본다(깊이 5 까지, node_modules 는 빼고)', () => {
    expect(isManifestPath('package.json')).toBe(true);
    expect(isManifestPath('packages/desktop/package.json')).toBe(true);
    expect(isManifestPath('build.gradle.kts')).toBe(true);
    expect(isManifestPath('.github/workflows/ci.yml')).toBe(true);
    expect(isManifestPath('infra/main.tf')).toBe(true);
    expect(isManifestPath('Dockerfile')).toBe(true);
    expect(isManifestPath('node_modules/x/package.json')).toBe(false);
    expect(isManifestPath('backend/apps/api/src/package.json')).toBe(true);
    expect(isManifestPath('a/b/c/d/e/package.json')).toBe(false);
    expect(isManifestPath('src/index.ts')).toBe(false);
  });
  it('package.json 의 의존성에서 아는 기술 이름만', () => {
    const pkg = JSON.stringify({ dependencies: { react: '^18', '@nestjs/core': '1', pg: '8', 'left-pad': '1' }, devDependencies: { vitest: '3', typescript: '5', '@playwright/test': '1' } });
    expect(stackOf([{ path: 'package.json', text: pkg }])).toEqual(['NestJS', 'Playwright', 'PostgreSQL', 'React', 'TypeScript', 'Vitest']);
  });
  it('Gradle·Maven·Python·Go 의존성과 Docker·Actions·Terraform', () => {
    const files = [
      { path: 'build.gradle.kts', text: 'plugins { id("org.springframework.boot") kotlin("jvm") }\nimplementation("org.springframework.kafka:spring-kafka")\nruntimeOnly("com.mysql:mysql-connector-j")' },
      { path: 'requirements.txt', text: 'fastapi==0.1\nsqlalchemy\n' },
      { path: 'go.mod', text: 'require github.com/gin-gonic/gin v1' },
      { path: 'Dockerfile', text: 'FROM node' },
      { path: '.github/workflows/ci.yml', text: 'on: push' },
      { path: 'infra/main.tf', text: 'resource "aws_s3_bucket" "b" {}' },
    ];
    expect(stackOf(files)).toEqual(['AWS', 'Docker', 'FastAPI', 'Gin', 'GitHub Actions', 'Kafka', 'Kotlin', 'MySQL', 'SQLAlchemy', 'Spring Boot', 'Terraform']);
  });
  it('DB 는 docker-compose 이미지·Prisma provider·여러 드라이버 이름으로도 알아본다', () => {
    expect(isManifestPath('prisma/schema.prisma')).toBe(true);
    expect(isManifestPath('.env.example')).toBe(true);
    const files = [
      { path: 'docker-compose.yml', text: 'services:\n  db:\n    image: postgres:16-alpine\n  cache:\n    image: "redis:7"\n  search:\n    image: docker.elastic.co/elasticsearch/elasticsearch:8.1\n' },
      { path: 'prisma/schema.prisma', text: 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}' },
      { path: 'requirements.txt', text: 'psycopg2-binary==2.9\n' },
      { path: 'package.json', text: JSON.stringify({ dependencies: { postgres: '3', mongodb: '6' } }) },
      { path: '.env.example', text: 'DATABASE_URL=mysql://user:pass@localhost:3306/app\n' },
    ];
    expect(stackOf(files)).toEqual(expect.arrayContaining(['Docker', 'PostgreSQL', 'Redis', 'Elasticsearch', 'Prisma', 'MongoDB', 'MySQL']));
  });
  it('.env 는 예시 파일만(진짜 비밀이 든 .env 는 읽지 않는다)', () => {
    expect(isManifestPath('.env')).toBe(false);
    expect(isManifestPath('.env.local')).toBe(false);
    expect(isManifestPath('.env.sample')).toBe(true);
  });
  it('깨진 package.json 은 건너뛴다', () => {
    expect(stackOf([{ path: 'package.json', text: '{oops' }])).toEqual([]);
  });
});
