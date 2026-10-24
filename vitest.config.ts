import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // 테스트는 빌드 없이 각 패키지의 소스를 바로 읽는다.
    alias: {
      '@rauha/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/src/**/*.spec.ts'],
    environment: 'node',
  },
});
