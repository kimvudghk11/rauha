import {
  asRecord,
  readBoolean,
  readInt,
  readString,
  readStringArray,
} from '../../../shared/validation.js';
import { Difficulty } from '../../domain/difficulty.js';
import { WorkOrder } from '../../domain/work-order.js';

/** 팀장이 요청을 해석해서 만든 업무 생성 입력. */
export class OpenWorkOrderDto {
  private constructor(
    readonly title: string,
    readonly fileCount: number,
    readonly crossModule: boolean,
    readonly sensitive: boolean,
    readonly scope: readonly string[],
  ) {}

  /** 팀장 모델의 구조화 출력 등 바깥 입력을 검증해서 DTO로 만든다. */
  static from(input: unknown): OpenWorkOrderDto {
    const obj = asRecord(input, 'OpenWorkOrder');
    return new OpenWorkOrderDto(
      readString(obj, 'title', 'OpenWorkOrder'),
      readInt(obj, 'fileCount', 'OpenWorkOrder'),
      readBoolean(obj, 'crossModule', 'OpenWorkOrder', false),
      readBoolean(obj, 'sensitive', 'OpenWorkOrder', false),
      readStringArray(obj, 'scope', 'OpenWorkOrder'),
    );
  }

  toEntity(id: string): WorkOrder {
    return WorkOrder.open({
      id,
      title: this.title,
      difficulty: Difficulty.judge({
        fileCount: this.fileCount,
        crossModule: this.crossModule,
        sensitive: this.sensitive,
      }),
      sensitive: this.sensitive,
      scope: this.scope,
    });
  }
}
