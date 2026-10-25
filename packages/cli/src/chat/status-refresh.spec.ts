import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRefreshing } from './status-refresh.js';

afterEach(() => vi.useRealTimers());

describe('startRefreshing', () => {
  it('시작하자마자 한 번, 그 뒤로 일정 간격마다 다시 읽는다', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => {});
    startRefreshing(refresh, 60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it('앞 읽기가 끝나지 않았으면 겹쳐 읽지 않는다', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => {};
    const refresh = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    startRefreshing(refresh, 1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('읽다가 실패해도 계속 돌고, stop하면 더 읽지 않는다', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => {
      throw new Error('네트워크');
    });
    const timer = startRefreshing(refresh, 1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).toHaveBeenCalledTimes(3);
    timer.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('지금 바로 읽으라고 하면 간격을 기다리지 않는다 (/usage)', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => {});
    const timer = startRefreshing(refresh, 60_000);
    await vi.advanceTimersByTimeAsync(0);
    await timer.now();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('읽는 중에 지금 읽으라고 하면 새로 읽지 않고 그 읽기를 기다린다', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => {});
    const timer = startRefreshing(refresh, 60_000);
    await timer.now();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
