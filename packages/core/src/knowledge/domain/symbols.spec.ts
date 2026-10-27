import { describe, expect, it } from 'vitest';
import { exportedSymbols } from './symbols.js';

describe('exportedSymbols', () => {
  it('내보낸 이름만 순서대로 뽑는다', () => {
    const source = [
      'export class Money {}',
      'export async function load() {}',
      'export const A = 1, B = 2;',
      'export type T = string;',
      'export interface I {}',
      'export enum E { X }',
      'export { x, y as z };',
      'export default Cart;',
      'export abstract class Base {}',
      'const hidden = 1;',
      'function inner() {}',
      '// export class Fake {}',
      '/* export function Ghost() {} */',
    ].join('\n');
    const names = exportedSymbols(source);
    for (const name of ['Money', 'load', 'A', 'T', 'I', 'E', 'x', 'z', 'Cart', 'Base']) expect(names).toContain(name);
    for (const name of ['hidden', 'inner', 'Fake', 'Ghost', 'y']) expect(names).not.toContain(name);
    expect(names.indexOf('Money')).toBeLessThan(names.indexOf('load'));
  });

  it('같은 이름은 한 번만', () => {
    expect(exportedSymbols('export const a = 1;\nexport { a };')).toEqual(['a']);
  });
});
