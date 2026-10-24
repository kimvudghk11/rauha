import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/domain-error.js';
import { ProfileConfigDto } from '../application/dto/profile-config.dto.js';
import type { ProfileRequest } from './profile-book.js';

const config = ProfileConfigDto.from({
  profiles: {
    personal: { claude_config_dir: '~/.rauha/profiles/personal/claude', sync: 'aws' },
    work: { claude_config_dir: '~/.rauha/profiles/work/claude', sync: 'none' },
  },
  match: [
    { path: '~/work/**', profile: 'work' },
    { path: 'D:/company/**', profile: 'work' },
    { git_remote: 'github.com/my-company/*', profile: 'work' },
  ],
});
const book = config.toEntity();

function request(overrides: Partial<ProfileRequest>): ProfileRequest {
  return { cwd: '/home/pyeong/dev/app', home: '/home/pyeong', gitRemote: null, flag: null, env: null, ...overrides };
}

describe('ProfileBook.resolve', () => {
  it('규칙이 없으면 기본값 personal', () => {
    const r = book.resolve(request({}));
    expect(r.profile.name).toBe('personal');
    expect(r.source).toBe('default');
  });

  it('회사 폴더는 work', () => {
    expect(book.resolve(request({ cwd: '/home/pyeong/work/api' })).profile.name).toBe('work');
  });

  it('Windows 경로도 대소문자 구분 없이 맞춘다', () => {
    expect(book.resolve(request({ cwd: 'd:\\Company\\api' })).profile.name).toBe('work');
  });

  it('회사 Git 원격 주소면 work (ssh, https 둘 다)', () => {
    expect(book.resolve(request({ gitRemote: 'git@github.com:my-company/api.git' })).profile.name).toBe('work');
    expect(book.resolve(request({ gitRemote: 'https://github.com/my-company/api.git' })).profile.name).toBe('work');
  });

  it('--profile 이 RAUHA_PROFILE 보다 우선', () => {
    const r = book.resolve(request({ flag: 'work', env: 'personal' }));
    expect(r.profile.name).toBe('work');
    expect(r.source).toBe('flag');
  });

  it('회사 폴더에서 personal 을 명시하면 막는다', () => {
    expect(() => book.resolve(request({ cwd: '/home/pyeong/work/api', flag: 'personal' }))).toThrow(DomainError);
  });

  it('프로필마다 Claude Code 설정 폴더가 다르다', () => {
    const work = book.resolve(request({ flag: 'work' })).profile;
    expect(work.agentEnv('/home/pyeong')).toEqual({ CLAUDE_CONFIG_DIR: '/home/pyeong/.rauha/profiles/work/claude' });
    expect(work.canSync()).toBe(false);
    expect(work.badge()).toBe('[work]');
  });

  it('정의되지 않은 프로필을 가리키는 규칙은 설정 단계에서 거부한다', () => {
    const bad = ProfileConfigDto.from({
      profiles: { personal: { claude_config_dir: '~/a' } },
      match: [{ path: '~/work/**', profile: 'work' }],
    });
    expect(() => bad.toEntity()).toThrow(/work/);
  });
});
