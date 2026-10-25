import type { MemoryEntry, Recall } from '../domain/work-memory.js';

/** 프로젝트 하나의 기억 그래프 저장소. 나중에 동기화 등을 붙일 때 이 뒤만 바꾼다. */
export interface MemoryPort {
  /** 같은 id의 점은 한 번만 남고, 같은 선은 중복되지 않는다. */
  save(entry: MemoryEntry): Promise<void>;
  /** 글로 작업·질문을 찾는다. 결정·파일 등으로 맞으면 그 작업으로 올라간다. 최근 것부터. */
  search(text: string, limit: number): Promise<Recall[]>;
  recent(limit: number): Promise<Recall[]>;
}
