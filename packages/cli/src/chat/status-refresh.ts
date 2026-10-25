export interface Refreshing {
  /** 간격을 기다리지 않고 지금 한 번 읽는다(/usage). 이미 읽는 중이면 그것이 끝나기를 기다린다. */
  now(): Promise<void>;
  stop(): void;
}

/**
 * 상태 줄의 사용률을 시작할 때 한 번, 그 뒤 everyMs마다 다시 읽는다. 입력이 없어도 화면이 저절로 갱신되게 하려고.
 * (세션 한도가 풀린 뒤에도 옛 퍼센트가 남아 있던 문제.) 앞 읽기가 안 끝났으면 겹쳐 읽지 않고, 실패해도 멈추지 않는다.
 */
export function startRefreshing(refresh: () => Promise<void>, everyMs: number): Refreshing {
  let reading: Promise<void> | null = null;
  const now = (): Promise<void> => {
    reading ??= refresh()
      .catch(() => {})
      .finally(() => {
        reading = null;
      });
    return reading;
  };
  void now();
  const timer = setInterval(() => void now(), everyMs);
  timer.unref?.();
  return { now, stop: () => clearInterval(timer) };
}
