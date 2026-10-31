import { describe, expect, it } from 'vitest';
import { runShell } from './shell-run.js';

describe('runShell', () => {
  it('명령의 출력과 종료 코드를 돌려준다', async () => {
    const result = await runShell('node -e "console.log(1+1)"', process.cwd(), 10_000);
    expect(result).toMatchObject({ exitCode: 0, timedOut: false });
    expect(result.output.trim()).toBe('2');
  });

  it('실패한 명령은 종료 코드와 오류 출력을 돌려준다', async () => {
    const result = await runShell('node -e "console.error(\'bad\'); process.exit(3)"', process.cwd(), 10_000);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain('bad');
  });

  it('시간이 넘으면 멈추고 알린다', async () => {
    const result = await runShell('node -e "setTimeout(()=>{}, 30000)"', process.cwd(), 300);
    expect(result.timedOut).toBe(true);
  });

  it('너무 긴 출력은 끝부분만 남긴다', async () => {
    const result = await runShell('node -e "console.log(\'x\'.repeat(100000))"', process.cwd(), 10_000, 1000);
    expect(result.output.length).toBeLessThanOrEqual(1100);
    expect(result.output).toContain('줄였어요');
  });
});
