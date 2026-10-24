import { DomainError } from './domain-error.js';

/** DTO의 from()에서 바깥 입력(unknown)을 읽을 때 쓰는 작은 검사 도구. */

export function asRecord(input: unknown, what: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new DomainError('INVALID_INPUT', `${what}: 객체가 필요합니다.`);
  }
  return input as Record<string, unknown>;
}

export function readString(obj: Record<string, unknown>, key: string, what: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('INVALID_INPUT', `${what}.${key}: 비어 있지 않은 문자열이 필요합니다.`);
  }
  return value.trim();
}

export function readOptionalString(obj: Record<string, unknown>, key: string, what: string): string | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  return readString(obj, key, what);
}

export function readInt(obj: Record<string, unknown>, key: string, what: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new DomainError('INVALID_INPUT', `${what}.${key}: 0 이상의 정수가 필요합니다.`);
  }
  return value;
}

export function readBoolean(obj: Record<string, unknown>, key: string, what: string, fallback: boolean): boolean {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new DomainError('INVALID_INPUT', `${what}.${key}: true / false 가 필요합니다.`);
  }
  return value;
}

export function readStringArray(obj: Record<string, unknown>, key: string, what: string): string[] {
  const value = obj[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new DomainError('INVALID_INPUT', `${what}.${key}: 문자열 배열이 필요합니다.`);
  }
  return value.map((v: string) => v.trim()).filter((v) => v !== '');
}
