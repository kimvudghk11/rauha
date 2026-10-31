import { describe, expect, it } from 'vitest';
import { Profile } from './profile.js';

describe('Profile', () => {
  it('실행 기록은 프로필 폴더 아래 runs에 둔다', () => {
    const profile = Profile.create({ name: 'work', claudeConfigDir: '~/.claude', sync: 'none' });
    expect(profile.runsDir('C:\\Users\\me')).toBe('C:/Users/me/.rauha/profiles/work/runs');
  });

  it('기억은 프로필 폴더 아래 memory에 둔다', () => {
    const profile = Profile.create({ name: 'work', claudeConfigDir: '~/.claude', sync: 'none' });
    expect(profile.memoryDir('C:\\Users\\me')).toBe('C:/Users/me/.rauha/profiles/work/memory');
  });

  it('저장소 지식은 프로필 폴더 아래 knowledge에 둔다', () => {
    const profile = Profile.create({ name: 'work', claudeConfigDir: '~/.claude', sync: 'none' });
    expect(profile.knowledgeDir('C:\\Users\\me')).toBe('C:/Users/me/.rauha/profiles/work/knowledge');
  });

  it('설계 문서는 프로필 폴더 아래 designs에 둔다', () => {
    const profile = Profile.create({ name: 'work', claudeConfigDir: '~/.claude', sync: 'none' });
    expect(profile.designsDir('C:\\Users\\me')).toBe('C:/Users/me/.rauha/profiles/work/designs');
  });

  it('회사 장부와 정기 업무와 학습 노트는 프로필 폴더 아래에 둔다 (회사 기록이 개인 기록과 섞이지 않게)', () => {
    const profile = Profile.create({ name: 'work', claudeConfigDir: '~/.claude', sync: 'none' });
    expect(profile.companyDir('C:/Users/me')).toBe('C:/Users/me/.rauha/profiles/work/company');
    expect(profile.routinesDir('C:/Users/me')).toBe('C:/Users/me/.rauha/profiles/work/routines');
    expect(profile.learningDir('C:/Users/me')).toBe('C:/Users/me/.rauha/profiles/work/learning');
  });

  it('이어 갈 대화는 프로필 폴더 아래 sessions에 둔다', () => {
    const profile = Profile.create({ name: 'work', claudeConfigDir: '~/.claude', sync: 'none' });
    expect(profile.sessionsDir('C:\\Users\\me')).toBe('C:/Users/me/.rauha/profiles/work/sessions');
  });
});
