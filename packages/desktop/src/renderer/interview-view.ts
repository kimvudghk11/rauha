import type { InterviewApi, InterviewView, InterviewerView, StageView } from '../shared/interview-ipc.js';
import { el, isEnterKey } from './dom.js';

/**
 * 면접관 패널: Git › My work 에 묶은 내 커밋 요약을 가상 면접관 5명이 읽고(실존 인물 아님, 관점·말투만 본뜸)
 * 1차 서류 → 2차 과제 → 3차 기술 → 4차 컬처 → 최종 중 어디까지 갈지, 잘하는 것·부족한 것을 말한다. 면접관과 대화도 한다.
 */
export function buildInterview(deps: { readonly api: InterviewApi; readonly openMyWork: () => void }) {
  const root = el('section', 'iv');
  let interviewers: readonly InterviewerView[] = [];
  let stages: readonly StageView[] = [];
  let result: InterviewView | null = null;
  let busy = false;
  let error = '';
  let talking: string | null = null;
  const chats = new Map<string, { from: 'me' | 'them'; text: string }[]>();

  const head = el('div', 'rhead');
  const go = el('button', 'btn primary', 'Get evaluated');
  go.addEventListener('click', () => void evaluate());
  const myWork = el('button', 'btn', 'Git › My work');
  myWork.addEventListener('click', () => deps.openMyWork());
  head.append(el('b', undefined, 'Interview panel'), el('span', 'hint grow', 'Five fictional interviewers (viewpoints, not real people) read your commits from Git › My work.'), myWork, go);
  const body = el('div', 'iv-body');
  root.append(head, body);

  const stageLabel = (id: string): string => stages.find((s) => s.id === id)?.label ?? id;
  const stageTrack = (reached: string): HTMLElement => {
    const track = el('div', 'iv-track');
    const idx = stages.findIndex((s) => s.id === reached);
    stages.forEach((s, i) => track.append(el('span', `iv-stage${i < idx ? ' pass' : i === idx ? ' here' : ''}`, s.label)));
    return track;
  };
  const list = (title: string, items: readonly string[], cls: string): HTMLElement => {
    const box = el('div', `iv-list ${cls}`);
    box.append(el('b', undefined, title));
    const ul = el('ul');
    for (const t of items) ul.append(el('li', undefined, t));
    box.append(ul);
    return box;
  };

  function chatBox(p: InterviewerView): HTMLElement {
    const box = el('div', 'iv-chat');
    const log = el('div', 'iv-log');
    for (const m of chats.get(p.id) ?? []) log.append(el('div', `iv-msg ${m.from}`, m.text));
    const input = el('textarea', 'iv-input');
    input.rows = 2;
    input.placeholder = `Ask ${p.name}… (Enter to send, Shift+Enter for a new line)`;
    const send = async (): Promise<void> => {
      const q = input.value.trim();
      if (q === '' || busy) return;
      const history = chats.get(p.id) ?? [];
      chats.set(p.id, [...history, { from: 'me', text: q }]);
      busy = true;
      paint();
      const r = await deps.api.ask(p.id, history, q);
      busy = false;
      chats.set(p.id, [...(chats.get(p.id) ?? []), { from: 'them', text: r.ok ? r.data : `(${r.error})` }]);
      paint();
    };
    input.addEventListener('keydown', (e) => {
      if (isEnterKey(e) && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    });
    if (busy) log.append(el('div', 'iv-msg them dim', '…'));
    box.append(log, input);
    queueMicrotask(() => {
      log.scrollTop = log.scrollHeight;
      input.focus();
    });
    return box;
  }

  function paint(): void {
    go.disabled = busy;
    go.textContent = busy && talking === null ? 'The panel is reading…' : result === null ? 'Get evaluated' : 'Evaluate again';
    body.replaceChildren();
    if (error !== '') body.append(el('div', 'err pad', error));
    if (result === null && !busy) body.append(el('div', 'dim pad', 'Press "Get evaluated". The panel reads only your commit subjects and counts (no code). Set up your accounts in Git › My work first.'));
    if (result !== null) {
      const o = result.overall;
      const top = el('div', 'iv-overall');
      top.append(el('div', 'iv-reached', `Overall: you would reach ${stageLabel(o.reached)}`), stageTrack(o.reached), el('p', undefined, o.summary));
      const cols = el('div', 'iv-cols');
      cols.append(list('Doing well', o.strengths, 'good'), list('Missing', o.gaps, 'gap'), list('Next', o.next, 'next'));
      top.append(cols);
      body.append(top);
    }
    const grid = el('div', 'iv-grid');
    for (const p of interviewers) {
      const v = result?.panel.find((x) => x.id === p.id);
      const card = el('div', `iv-card${talking === p.id ? ' on' : ''}`);
      const h = el('div', 'iv-card-top');
      h.append(el('span', `iv-avatar ${p.id}`, p.name[0] ?? '?'), el('div', 'grow', ''), v === undefined ? el('span') : el('span', 'iv-pill', stageLabel(v.reached)));
      (h.children[1] as HTMLElement).append(el('b', undefined, p.name), el('div', 'hint', p.lens));
      card.append(h);
      if (v !== undefined) {
        card.append(el('p', 'iv-comment', v.comment));
        if (v.strengths.length > 0) card.append(list('+', v.strengths, 'good'));
        if (v.gaps.length > 0) card.append(list('−', v.gaps, 'gap'));
        if (v.question !== '') card.append(el('div', 'iv-q', `Q. ${v.question}`));
      }
      const talk = el('button', talking === p.id ? 'btn sm' : 'btn sm primary', talking === p.id ? 'Close chat' : 'Talk');
      talk.addEventListener('click', () => ((talking = talking === p.id ? null : p.id), paint()));
      card.append(talk);
      if (talking === p.id) card.append(chatBox(p));
      grid.append(card);
    }
    body.append(grid);
  }

  async function evaluate(): Promise<void> {
    busy = true;
    error = '';
    talking = null;
    paint();
    const r = await deps.api.evaluate();
    busy = false;
    if (r.ok) result = r.data;
    else error = r.error;
    paint();
  }

  void deps.api.panel().then((p) => {
    interviewers = p.interviewers;
    stages = p.stages;
    paint();
  });
  return { root };
}
