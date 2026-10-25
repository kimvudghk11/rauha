import { describe, expect, it } from 'vitest';
import { AppError } from '../shared/errors.js';
import { CartService } from './cart.service.js';

describe('CartService', () => {
  it('장바구니를 열고 상품을 담아 합계를 낸다', () => {
    const service = new CartService();
    service.open('c1');
    service.add('c1', 'apple', 1000, 2);
    expect(service.total('c1').amount).toBe(2000);
  });

  it('없는 장바구니는 CART_NOT_FOUND', () => {
    expect(() => new CartService().total('nope')).toThrow(AppError);
  });
});
