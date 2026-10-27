import { describe, expect, it } from 'vitest';
import { effectivePolicy, pickBinDir, shims } from './setup.js';

describe('pickBinDir', () => {
  it('Windows에서는 PATH에 있는 npm 전역 폴더에 둔다', () => {
    const picked = pickBinDir({ platform: 'win32', pathEnv: 'C:\\Windows;C:\\Users\\me\\AppData\\Roaming\\npm', appData: 'C:\\Users\\me\\AppData\\Roaming', home: 'C:\\Users\\me' });
    expect(picked).toEqual({ dir: 'C:\\Users\\me\\AppData\\Roaming\\npm', onPath: true });
  });

  it('PATH 비교는 Windows에서 대소문자와 끝의 구분자를 무시한다', () => {
    const picked = pickBinDir({ platform: 'win32', pathEnv: 'c:\\users\\me\\appdata\\roaming\\npm\\', appData: 'C:\\Users\\me\\AppData\\Roaming', home: 'C:\\Users\\me' });
    expect(picked.onPath).toBe(true);
  });

  it('macOS·Linux에서는 PATH에 있는 ~/.local/bin에 둔다', () => {
    expect(pickBinDir({ platform: 'linux', pathEnv: '/usr/bin:/home/me/.local/bin', appData: null, home: '/home/me' })).toEqual({ dir: '/home/me/.local/bin', onPath: true });
  });

  it('PATH에 맞는 폴더가 없으면 ~/.rauha/bin에 두고 PATH에 없다고 알린다', () => {
    expect(pickBinDir({ platform: 'linux', pathEnv: '/usr/bin', appData: null, home: '/home/me' })).toEqual({ dir: '/home/me/.rauha/bin', onPath: false });
  });
});

describe('shims', () => {
  const entry = 'E:\\rauha\\packages\\cli\\dist\\main.js';

  it('Windows: cmd와 Git Bash용을 만들고, 명령을 친 폴더를 작업 폴더로 넘긴다', () => {
    const files = shims({ platform: 'win32', entry, powershell: false });
    expect(files.map((f) => f.name)).toEqual(['rauha.cmd', 'rauha']);
    expect(files[0]!.content).toContain('set "INIT_CWD=%CD%"');
    expect(files[0]!.content).toContain(`node "${entry}" %*`);
    // Git Bash의 $PWD는 /e/... 꼴이라 node가 못 읽는다. pwd -W로 Windows 경로를 넘긴다.
    expect(files[1]!.content).toContain('pwd -W');
    expect(files[1]!.content).toContain('"E:/rauha/packages/cli/dist/main.js" "$@"');
  });

  it('PowerShell이 스크립트를 허용하면 ps1도 만들고, 바꾼 환경 변수는 되돌린다', () => {
    const ps1 = shims({ platform: 'win32', entry, powershell: true }).find((f) => f.name === 'rauha.ps1')!;
    expect(ps1.content).toContain('$env:INIT_CWD = $PWD.ProviderPath');
    expect(ps1.content).toContain('finally');
  });

  it('macOS·Linux: 실행 권한이 있는 sh 하나', () => {
    const files = shims({ platform: 'darwin', entry: '/opt/rauha/packages/cli/dist/main.js', powershell: false });
    expect(files).toEqual([{ name: 'rauha', content: expect.stringContaining('INIT_CWD="$PWD" exec node "/opt/rauha/packages/cli/dist/main.js" "$@"'), mode: 0o755 }]);
  });
});

describe('effectivePolicy', () => {
  it('앞선 범위의 정책이 이기고, 모두 비어 있으면 Restricted', () => {
    expect(effectivePolicy(['Undefined', 'Undefined', 'RemoteSigned', 'Restricted'])).toBe('RemoteSigned');
    expect(effectivePolicy(['Undefined', 'Undefined', 'Undefined', 'Undefined'])).toBe('Restricted');
  });
});
