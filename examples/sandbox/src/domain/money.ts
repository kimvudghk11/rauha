import { AppError } from '../shared/errors.js';
import { formatWon } from '../shared/format.js';

/** 원 단위 금액 값 객체. 음수와 소수를 허용하지 않는다. */
export class Money {
  private constructor(readonly amount: number) {}

  static of(amount: number): Money {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new AppError('INVALID_MONEY', `금액은 0 이상의 정수여야 합니다: ${amount}`);
    }
    return new Money(amount);
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.amount + other.amount);
  }

  multiply(quantity: number): Money {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new AppError('INVALID_QUANTITY', `수량은 0 이상의 정수여야 합니다: ${quantity}`);
    }
    return new Money(this.amount * quantity);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount;
  }

  toString(): string {
    return formatWon(this.amount);
  }
}
