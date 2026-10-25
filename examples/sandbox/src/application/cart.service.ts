import { Cart } from '../domain/cart.js';
import { Money } from '../domain/money.js';
import { AppError } from '../shared/errors.js';

/** 장바구니 저장과 조회를 맡는 얇은 서비스. 규칙은 Cart·Money에 있다. */
export class CartService {
  private readonly carts = new Map<string, Cart>();

  open(id: string): Cart {
    const cart = Cart.create(id);
    this.carts.set(id, cart);
    return cart;
  }

  add(cartId: string, productId: string, unitPrice: number, quantity = 1): void {
    this.get(cartId).addItem(productId, Money.of(unitPrice), quantity);
  }

  total(cartId: string): Money {
    return this.get(cartId).total();
  }

  private get(id: string): Cart {
    const cart = this.carts.get(id);
    if (!cart) throw new AppError('CART_NOT_FOUND', `장바구니를 찾을 수 없습니다: ${id}`);
    return cart;
  }
}
