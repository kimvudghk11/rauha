import { describe, expect, it } from 'vitest';
import { OpsReportDto } from './ops-report.dto.js';

describe('OpsReportDto', () => {
  it('답 뒤에 실행한 명령을 ■ 제목 아래 목록으로 붙인다', () => {
    const text = OpsReportDto.read({ answer: '버킷이 2개 있어요.', commands: ['aws s3 ls', ' aws sts get-caller-identity '] }).toAnswer();
    expect(text).toBe('버킷이 2개 있어요.\n\n■ 실행한 명령\n- aws s3 ls\n- aws sts get-caller-identity');
  });

  it('명령을 실행하지 않았으면 답만 보인다', () => {
    expect(OpsReportDto.read({ answer: '로그인부터 해 주세요.', commands: [] }).toAnswer()).toBe('로그인부터 해 주세요.');
  });

  it('깨진 보고는 버리지 않고 읽지 못했다고 알린다', () => {
    expect(OpsReportDto.read(null).toAnswer()).toContain('읽지 못했어요');
    expect(OpsReportDto.read({ answer: '  ', commands: [3] }).toAnswer()).toContain('읽지 못했어요');
  });
});
