import { describe, expect, it } from 'vitest';
import { Profile } from './profile.js';

describe('Profile', () => {
  it('실행 기록은 프로필 폴더 아래 runs에 둔다', () => {
    const profile = Profile.create({ name: 'work', claudeConfigDir: '~/.claude', sync: 'none' });
    expect(profile.runsDir('C:\\Users\\me')).toBe('C:/Users/me/.rauha/profiles/work/runs');
  });
});
