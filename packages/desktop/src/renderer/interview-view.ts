import { waitingTalk } from '../shared/hiring-banter.js';
import type { CompanyView, InterviewApi, Line, StageView, VerdictView, WorkFacts } from '../shared/interview-ipc.js';
import { el, isEnterKey } from './dom.js';
import { drawRecruiter } from './recruiter-sprite.js';

/**
 * 채용 검토실(픽셀 오피스): 가운데 내 책상, 둘레에 A~E 회사 방. 회사마다 가상 담당자 3명이 Git › My work 의 내 커밋 요약을 읽는다.
 * 기다리는 동안 셋이 내 커밋 사실로 말풍선 대화를 하고(판정 없음), 회사마다 평가가 끝나는 즉시 그 방에 도장·단계가 뜬다.
 * 방을 누르면 그 회사의 리포트를 모달로 보고, 담당자들과 대화한다.
 */
type RoomState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reviewing' }
  | { readonly kind: 'done'; readonly verdict: VerdictView }
  | { readonly kind: 'error'; readonly error: string };

interface Room {
  readonly company: CompanyView;
  readonly index: number;
  state: RoomState;
  /** 지금 틀고 있는 말(기다리는 동안은 사실 대화, 끝나면 실제 토론) */
  script: readonly Line[];
  at: number;
  /** 이번 검토에서 나온 말 전부(리포트에 보인다) */
  log: Line[];
  readonly el: HTMLElement;
  readonly badge: HTMLElement;
  readonly bubble: HTMLElement;
  readonly faces: readonly HTMLElement[];
}

const TICK_MS = 2600;
const STAMP_TEXT = { pass: 'PASS', hold: 'HOLD', drop: 'DROP' } as const;

export function buildInterview(deps: { readonly api: InterviewApi; readonly openMyWork: () => void }) {
  const root = el('section', 'iv hr');
  let companies: readonly CompanyView[] = [];
  let stages: readonly StageView[] = [];
  let facts: WorkFacts | null = null;
  let running = false;
  let error = '';
  const rooms: Room[] = [];
  const chats = new Map<string, { from: 'me' | 'them'; text: string }[]>();
  let openReport: { readonly id: string; readonly paint: () => void } | null = null;

  const head = el('div', 'rhead');
  const go = el('button', 'btn primary', 'Send my resume');
  go.addEventListener('click', () => void start());
  const myWork = el('button', 'btn', 'Git › My work');
  myWork.addEventListener('click', () => deps.openMyWork());
  head.append(el('b', undefined, 'Hiring review'), el('span', 'hint grow', 'Five fictional companies, three recruiters each. Their yardsticks come from what well-known people have said about hiring (named on each card). They read your commits from Git › My work.'), myWork, go);
  const summary = el('div', 'hr-sum');
  const office = el('div', 'hr-office');
  const hub = el('div', 'hr-hub');
  root.append(head, summary, office);

  const stageLabel = (id: string): string => stages.find((s) => s.id === id)?.label ?? id;

  function face(company: string, index: number, scale: number, pose: 'read' | 'idle'): HTMLCanvasElement {
    const cv = el('canvas', 'px');
    drawRecruiter(cv, company, index, scale, pose);
    return cv;
  }

  function buildRoom(c: CompanyView, index: number): Room {
    const box = el('button', `hr-room co-${c.id}`);
    box.type = 'button';
    box.title = `Open ${c.label}'s report`;
    const top = el('div', 'hr-rt');
    const badge = el('span', 'hr-badge');
    top.append(el('b', undefined, c.label), badge);
    const bubble = el('div', 'hr-bub');
    const crew = el('div', 'hr-crew');
    const faces = c.recruiters.map((r, i) => {
      const who = el('div', 'hr-who');
      who.append(face(c.id, i, 3, 'read'), el('span', undefined, r.name));
      who.title = `${r.name} · ${r.title} · ${r.by}: ${r.rule}`;
      crew.append(who);
      return who;
    });
    box.append(top, bubble, crew, el('div', 'hr-desk'));
    const room: Room = { company: c, index, state: { kind: 'idle' }, script: [], at: 0, log: [], el: box, badge, bubble, faces };
    box.addEventListener('click', () => openModal(room));
    return room;
  }

  function paintRoom(r: Room): void {
    const s = r.state;
    r.el.dataset['state'] = s.kind;
    r.badge.className = 'hr-badge';
    if (s.kind === 'idle') r.badge.textContent = 'Waiting for your resume';
    else if (s.kind === 'reviewing') {
      r.badge.classList.add('busy');
      r.badge.textContent = 'Reviewing…';
    } else if (s.kind === 'error') {
      r.badge.classList.add('err');
      r.badge.textContent = 'Could not finish';
    } else {
      r.badge.replaceChildren(el('span', `hr-stamp ${s.verdict.stamp}`, STAMP_TEXT[s.verdict.stamp]), el('span', undefined, stageLabel(s.verdict.reached)));
    }
    const line = r.script.length === 0 ? null : r.script[Math.min(r.at, r.script.length - 1)]!;
    r.bubble.hidden = line === null;
    if (line !== null) r.bubble.replaceChildren(el('b', undefined, line.who), el('span', undefined, line.text));
    r.faces.forEach((f, i) => f.classList.toggle('talking', line !== null && r.company.recruiters[i]?.name === line.who));
  }

  function paintSummary(): void {
    const done = rooms.flatMap((r) => (r.state.kind === 'done' ? [{ r, v: r.state.verdict }] : []));
    summary.replaceChildren();
    if (error !== '') {
      summary.append(el('span', 'err', error));
      return;
    }
    if (!running && done.length === 0) {
      summary.append(el('span', 'dim', 'Press "Send my resume". Each company decides on its own and shows its stamp the moment it is done. Only commit subjects and counts are sent, no code.'));
      return;
    }
    const order = stages.map((s) => s.id);
    const best = [...done].sort((a, b) => order.indexOf(b.v.reached) - order.indexOf(a.v.reached))[0];
    const count = (k: 'pass' | 'hold' | 'drop'): number => done.filter((d) => d.v.stamp === k).length;
    summary.append(
      el('b', undefined, `${done.length}/${rooms.length} companies done`),
      el('span', undefined, best === undefined ? 'Still reading…' : `Furthest: ${best.r.company.label} · ${stageLabel(best.v.reached)}`),
      el('span', 'hr-stamp pass', `PASS ${count('pass')}`),
      el('span', 'hr-stamp hold', `HOLD ${count('hold')}`),
      el('span', 'hr-stamp drop', `DROP ${count('drop')}`),
    );
    if (facts !== null) summary.append(el('span', 'dim grow right', `Your work: ${facts.total} commits · ${facts.repos.length} repos`));
  }

  function paintHub(): void {
    hub.replaceChildren(face('me', 0, 4, running ? 'read' : 'idle'), el('b', undefined, 'Me'), el('span', 'dim', facts === null ? 'Resume not sent yet' : `${facts.total} commits · ${facts.repos.length} repos`));
  }

  /** 이력서가 가운데 책상에서 각 방으로 날아간다(움직임을 줄이는 설정이면 생략) */
  function fly(): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const from = hub.getBoundingClientRect();
    const base = office.getBoundingClientRect();
    rooms.forEach((r, i) => {
      const to = r.el.getBoundingClientRect();
      const p = el('div', 'hr-fly');
      p.style.left = `${from.left - base.left + from.width / 2}px`;
      p.style.top = `${from.top - base.top + from.height / 3}px`;
      office.append(p);
      setTimeout(() => {
        p.style.transform = `translate(${to.left + to.width / 2 - from.left - from.width / 2}px, ${to.top + to.height / 2 - from.top - from.height / 3}px) rotate(${i % 2 === 0 ? 12 : -12}deg)`;
        p.style.opacity = '0';
      }, 60 + i * 140);
      setTimeout(() => p.remove(), 1400 + i * 140);
    });
  }

  async function start(): Promise<void> {
    if (running) return;
    error = '';
    running = true;
    go.disabled = true;
    go.textContent = 'Recruiters are reading…';
    paintSummary();
    const prep = await deps.api.prepare();
    if (!prep.ok) {
      running = false;
      error = prep.error;
      go.disabled = false;
      go.textContent = 'Send my resume';
      paintSummary();
      return;
    }
    facts = prep.data;
    paintHub();
    for (const r of rooms) {
      r.state = { kind: 'reviewing' };
      r.script = waitingTalk(r.company.recruiters, prep.data, r.index);
      r.at = 0;
      r.log = [r.script[0]!];
      paintRoom(r);
    }
    fly();
    paintSummary();
    // 회사마다 따로: 먼저 끝난 회사부터 그 방에 바로 도장이 뜬다
    await Promise.all(
      rooms.map(async (r) => {
        const res = await deps.api.evaluate(r.company.id);
        r.state = res.ok ? { kind: 'done', verdict: res.data } : { kind: 'error', error: res.error };
        if (res.ok && res.data.talk.length > 0) {
          r.log.push({ who: '—', text: 'Decision reached' }, ...res.data.talk);
          r.script = res.data.talk;
          r.at = 0;
        }
        paintRoom(r);
        paintSummary();
        if (openReport?.id === r.company.id) openReport.paint();
      }),
    );
    running = false;
    go.disabled = false;
    go.textContent = 'Send again';
    paintHub();
  }

  // 말풍선: 검토 중이면 대화를 돌려 가며, 끝났으면 실제 토론을 한 번 끝까지
  const timer = setInterval(() => {
    if (!root.isConnected) return void clearInterval(timer);
    if (document.hidden) return;
    for (const r of rooms) {
      if (r.script.length === 0) continue;
      if (r.state.kind === 'reviewing') {
        r.at = (r.at + 1) % r.script.length;
        r.log.push(r.script[r.at]!);
      } else if (r.state.kind === 'done' && r.at < r.script.length - 1) r.at += 1;
      else continue;
      paintRoom(r);
      if (openReport?.id === r.company.id) openReport.paint();
    }
  }, TICK_MS);

  // ── 리포트 모달 ──
  function openModal(r: Room): void {
    const c = r.company;
    const veil = el('div', 'veil');
    const box = el('div', `dialog hr-report co-${c.id}`);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', `${c.label} report`);
    const close = (): void => {
      veil.remove();
      openReport = null;
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    veil.addEventListener('click', (e) => {
      if (e.target === veil) close();
    });
    const x = el('button', 'btn sm', 'Close');
    x.addEventListener('click', close);
    const top = el('div', 'hr-rep-top');
    const title = el('div', 'grow');
    title.append(el('b', undefined, c.label), el('div', 'hint', c.lens));
    const status = el('div', 'hr-rep-status');
    top.append(title, status, x);
    const report = el('div', 'hr-rep-body');
    const chat = chatBox(c);
    box.append(top, report, chat);
    veil.append(box);
    document.body.append(veil);

    const list = (titleText: string, items: readonly string[], cls: string): HTMLElement => {
      const b = el('div', `iv-list ${cls}`);
      b.append(el('b', undefined, titleText));
      const ul = el('ul');
      for (const t of items) ul.append(el('li', undefined, t));
      b.append(ul);
      return b;
    };
    const paint = (): void => {
      const s = r.state;
      status.replaceChildren();
      if (s.kind === 'done') status.append(el('span', `hr-stamp big ${s.verdict.stamp}`, STAMP_TEXT[s.verdict.stamp]));
      else status.append(el('span', 'hint', s.kind === 'reviewing' ? 'Reviewing…' : s.kind === 'error' ? 'Could not finish' : 'Not sent yet'));
      const keepTop = report.scrollTop;
      report.replaceChildren();
      if (s.kind === 'done') {
        const track = el('div', 'iv-track');
        const idx = stages.findIndex((st) => st.id === s.verdict.reached);
        stages.forEach((st, i) => track.append(el('span', `iv-stage${i < idx ? ' pass' : i === idx ? ' here' : ''}`, st.label)));
        report.append(track, el('p', 'iv-comment', s.verdict.comment));
      }
      if (s.kind === 'error') report.append(el('div', 'err', s.error));
      // 담당자 셋: 각자 맡은 기준(출처)과 그 기준으로 본 한 줄
      const crew = el('div', 'hr-rep-crew');
      c.recruiters.forEach((rc, i) => {
        const card = el('div', 'hr-rep-person');
        const note = s.kind === 'done' ? (s.verdict.notes.find((n) => n.who === rc.name)?.note ?? '') : '';
        const words = el('div', 'grow');
        words.append(el('b', undefined, `${rc.name} · ${rc.title}`), el('div', 'hr-rule', `${rc.by}: "${rc.rule}"`));
        if (note !== '') words.append(el('div', 'hr-note', note));
        card.append(face(c.id, i, 3, 'read'), words);
        crew.append(card);
      });
      report.append(crew);
      if (s.kind === 'done') {
        const cols = el('div', 'iv-cols');
        cols.append(list('Doing well', s.verdict.strengths, 'good'), list('Missing', s.verdict.gaps, 'gap'));
        report.append(cols);
        if (s.verdict.evidence.length > 0) report.append(list('Based on', s.verdict.evidence, 'next'));
        if (s.verdict.question !== '') report.append(el('div', 'iv-q', `Next question: ${s.verdict.question}`));
      }
      if (r.log.length > 0) {
        const talk = el('div', 'hr-talk');
        talk.append(el('div', 'sub', s.kind === 'reviewing' ? 'In the room right now' : 'How they talked it through'));
        for (const l of r.log.slice(-40)) {
          if (l.who === '—') talk.append(el('div', 'hr-talk-sep', l.text));
          else {
            const row = el('div', 'hr-talk-line');
            row.append(el('b', undefined, l.who), el('span', undefined, l.text));
            talk.append(row);
          }
        }
        report.append(talk);
      }
      report.scrollTop = keepTop;
    };
    openReport = { id: c.id, paint };
    paint();
  }

  /** 회사 담당자들과 대화(모달 아래). 모달이 다시 그려져도 이 칸은 그대로 둔다 */
  function chatBox(c: CompanyView): HTMLElement {
    const box = el('div', 'iv-chat');
    const log = el('div', 'iv-log');
    const input = el('textarea', 'iv-input');
    input.rows = 2;
    input.placeholder = `Ask ${c.recruiters.map((r) => r.name).join(', ')}… (Enter to send, Shift+Enter for a new line)`;
    let waiting = false;
    const draw = (): void => {
      log.replaceChildren();
      for (const m of chats.get(c.id) ?? []) log.append(el('div', `iv-msg ${m.from}`, m.text));
      if (waiting) log.append(el('div', 'iv-msg them dim', '…'));
      log.scrollTop = log.scrollHeight;
    };
    const send = async (): Promise<void> => {
      const q = input.value.trim();
      if (q === '' || waiting) return;
      const history = chats.get(c.id) ?? [];
      chats.set(c.id, [...history, { from: 'me', text: q }]);
      input.value = '';
      waiting = true;
      draw();
      const r = await deps.api.ask(c.id, history, q);
      waiting = false;
      chats.set(c.id, [...(chats.get(c.id) ?? []), { from: 'them', text: r.ok ? r.data : `(${r.error})` }]);
      draw();
    };
    input.addEventListener('keydown', (e) => {
      if (isEnterKey(e) && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    });
    box.append(el('div', 'sub', `Talk to ${c.label}`), log, input);
    draw();
    return box;
  }

  void deps.api.panel().then((p) => {
    companies = p.companies;
    stages = p.stages;
    rooms.splice(0, rooms.length, ...companies.map(buildRoom));
    // 위 줄 A·B·C, 아래 줄 D·나·E
    const [a, b, c, d, e] = rooms.map((r) => r.el);
    office.replaceChildren(...[a, b, c, d, hub, e].filter((x): x is HTMLElement => x !== undefined));
    rooms.forEach(paintRoom);
    paintHub();
    paintSummary();
  });
  return { root };
}
