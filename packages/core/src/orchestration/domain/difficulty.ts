import { DomainError } from '../../shared/domain-error.js';

export type DifficultyGrade = 'S' | 'M' | 'L';

export interface DifficultySignals {
  /** 바뀔 것으로 보이는 파일 수 */
  readonly fileCount: number;
  /** 모듈 경계를 넘는 변경인지 */
  readonly crossModule: boolean;
  /** 인증·권한·암호화·결제·개인정보가 걸렸는지 */
  readonly sensitive: boolean;
}

/** 난이도 값 객체. 판정 규칙은 설계서의 「난이도 판정 기준」을 그대로 옮겼다. */
export class Difficulty {
  private constructor(readonly grade: DifficultyGrade) {}

  static of(grade: DifficultyGrade): Difficulty {
    return new Difficulty(grade);
  }

  static judge(signals: DifficultySignals): Difficulty {
    if (!Number.isInteger(signals.fileCount) || signals.fileCount < 1) {
      throw new DomainError('INVALID_FILE_COUNT', '파일 수는 1 이상의 정수여야 합니다.');
    }
    if (signals.sensitive || signals.crossModule || signals.fileCount > 5) {
      return new Difficulty('L');
    }
    return new Difficulty(signals.fileCount <= 2 ? 'S' : 'M');
  }

  /**
   * 설계서는 L급이 시나리오 확정 뒤 설계(Opus)를 거친다고 정했지만, 설계 단계(3-3 설계 대화)는 아직 없다.
   * 없는 단계로 보내면 큰 요청이 늘 멈추므로, 그때까지는 L급도 시니어로 바로 테스트부터 한다.
   */
  requiresDesign(): boolean {
    return false;
  }

  /** L급은 기획·테스트·구현을 시니어부터 시작한다. */
  startsWithSenior(): boolean {
    return this.grade === 'L';
  }

  equals(other: Difficulty): boolean {
    return this.grade === other.grade;
  }
}
