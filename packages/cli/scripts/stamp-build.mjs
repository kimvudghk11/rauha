// 빌드한 커밋을 dist/.built-commit에 적는다. rauha update가 "커밋은 최신인데 빌드가 예전 것"인지 알아보는 데 쓴다.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

try {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  writeFileSync(new URL('../dist/.built-commit', import.meta.url), `${head}\n`);
} catch {
  // git이 없거나 저장소가 아니면 적지 않는다(update가 다음에 한 번 더 빌드할 뿐이다).
}
