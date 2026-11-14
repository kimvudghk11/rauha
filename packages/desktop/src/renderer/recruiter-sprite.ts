/**
 * 채용 검토실 사람(12×16 픽셀). 담당자는 회사 색 셔츠에 머리·피부 색을 조금씩 달리하고, 나는 하늘색 셔츠.
 * pose: read(서류를 들고 읽음) · idle
 */
const W = 12;
const H = 16;
const SHIRT: Readonly<Record<string, string>> = { A: '#b8862e', B: '#5d6676', C: '#2f6fe0', D: '#2f9a6b', E: '#d0652c', me: '#5cc8ff' };
const HAIR = ['#2a2a2a', '#6b4423', '#d9d2c4', '#1c2b3a', '#8a3b1f', '#4a3a6b', '#3b2a1e'];
const SKIN = ['#f2c9a0', '#e8b98c', '#d9a77a', '#f5cfa8'];

export function drawRecruiter(cv: HTMLCanvasElement, company: string, index: number, scale: number, pose: 'read' | 'idle'): void {
  cv.width = W * scale;
  cv.height = H * scale;
  const g = cv.getContext('2d');
  if (g === null) return;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  const seed = company === 'me' ? 3 : company.charCodeAt(0) * 3 + index;
  const hair = HAIR[seed % HAIR.length]!;
  const skin = SKIN[seed % SKIN.length]!;
  const shirt = SHIRT[company] ?? '#888888';
  const r = (x: number, y: number, w: number, h: number, c: string): void => {
    g.fillStyle = c;
    g.fillRect(x * scale, y * scale, w * scale, h * scale);
  };
  r(3, 0, 6, 2, hair);
  r(2, 1, 1, index === 2 ? 5 : 3, hair);
  r(9, 1, 1, index === 2 ? 5 : 3, hair);
  r(3, 2, 6, 5, skin);
  r(3, 2, 6, 1, hair);
  r(4, 4, 1, 1, '#1a1a1a');
  r(7, 4, 1, 1, '#1a1a1a');
  if (index === 1) r(3, 3, 6, 1, '#1a1a1a'); // 안경 테
  r(5, 6, 2, 1, '#b36b5a');
  r(2, 7, 8, 6, shirt);
  r(1, 8, 1, 4, shirt);
  r(10, 8, 1, 4, shirt);
  r(3, 13, 2, 3, '#26303b');
  r(7, 13, 2, 3, '#26303b');
  if (pose === 'read') {
    r(3, 8, 6, 5, '#f1ede3');
    r(4, 9, 4, 1, '#9aa4ae');
    r(4, 11, 3, 1, '#9aa4ae');
    r(2, 10, 1, 2, skin);
    r(9, 10, 1, 2, skin);
  } else {
    r(1, 12, 1, 1, skin);
    r(10, 12, 1, 1, skin);
  }
}
