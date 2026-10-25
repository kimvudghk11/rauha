import { AppError } from '../shared/errors.js';
import { Money } from './money.js';

export interface CartLine {
  readonly productId: string;
  readonly unitPrice: Money;
  readonly quantity: number;
}

/** 장바구니 엔티티. 같은 상품을 다시 담으면 수량을 늘린다. */
export class Cart {
  private readonly lines = new Map<string, CartLine>();

  private constructor(readonly id: string) {}

  static create(id: string): Cart {
    return new Cart(id);
  }

  addItem(productId: string, unitPrice: Money, quantity = 1): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new AppError('INVALID_QUANTITY', `수량은 1 이상의 정수여야 합니다: ${quantity}`);
    }
    const existing = this.lines.get(productId);
    this.lines.set(productId, {
      productId,
      unitPrice,
      quantity: (existing?.quantity ?? 0) + quantity,
    });
  }

  items(): readonly CartLine[] {
    return [...this.lines.values()];
  }

  total(): Money {
    return this.items().reduce((sum, line) => sum.add(line.unitPrice.multiply(line.quantity)), Money.zero());
  }
}
