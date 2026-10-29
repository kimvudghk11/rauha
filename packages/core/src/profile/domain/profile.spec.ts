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

  it('이어 갈 대화는 프로필 폴더 아래 sessions에 둔다', () => {
    const profile = Profile.create({ name: 'work', claudeConfigDir: '~/.claude', sync: 'none' });
    expect(profile.sessionsDir('C:\\Users\\me')).toBe('C:/Users/me/.rauha/profiles/work/sessions');
  });
});
