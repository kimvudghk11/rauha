import { describe, expect, it } from 'vitest';
import { AppError } from '../shared/errors.js';
import { Cart } from './cart.js';
import { Money } from './money.js';

describe('Cart', () => {
  it('같은 상품을 다시 담으면 수량이 늘어난다', () => {
    const cart = Cart.create('c1');
    cart.addItem('apple', Money.of(1000));
    cart.addItem('apple', Money.of(1000), 2);
    expect(cart.items()).toEqual([{ productId: 'apple', unitPrice: Money.of(1000), quantity: 3 }]);
  });

  it('합계는 단가 × 수량의 합이다', () => {
    const cart = Cart.create('c1');
    cart.addItem('apple', Money.of(1000), 2);
    cart.addItem('pear', Money.of(1500));
    expect(cart.total().amount).toBe(3500);
  });

  it('수량이 1보다 작으면 담을 수 없다', () => {
    expect(() => Cart.create('c1').addItem('apple', Money.of(1000), 0)).toThrow(AppError);
  });
});
