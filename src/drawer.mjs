// The details drawer: draws the three tabs that details.mjs built for a task. DOM calls and textContent only, never innerHTML,
// because task names and step names are text from outside this page.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const link = (text, url) => { const a = el('a', '', text); a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a; };
const httpsOnly = u => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

export const TABS = [['overview', 'Overview'], ['progress', 'Progress'], ['history', 'History']];

function overviewBody(model) {
  const box = el('div', 'dlist');
  for (const r of model.overview) {
    const row = el('div', 'drow'), url = httpsOnly(r.href);
    row.append(el('span', 'dl', r.label), url ? link(r.value, url) : el('span', 'dv', r.value));
    box.append(row);
  }
  return box;
}

function progressBody(model) {
  const p = model.progress, box = el('div', 'dprog');
  if (p.figure) {
    const bar = el('div', `bar ${model.tone} known${p.figure.exact ? '' : ' est'}`), fill = el('i');
    fill.style.width = `${p.figure.value}%`; bar.append(fill);
    const top = el('div', 'dpct'); top.append(el('span', 'pct', p.figure.label), el('span', 'dim', p.figure.exact ? 'from its steps' : 'an estimate from past runs'));
    box.append(top, bar);
  } else if (p.mode === 'running') {
    const bar = el('div', `bar ${model.tone}`); bar.append(el('i')); box.append(bar);   // sweeping: it is working, how far is not known
  }
  const line = (label, value, cls) => { const row = el('div', cls ? `drow ${cls}` : 'drow'); row.append(el('span', 'dl', label), el('span', 'dv', value)); box.append(row); };
  if (p.step) line('Current step', p.step);
  if (p.stepsText) line('Steps', p.stepsText);
  if (p.finish) line('Estimated finish', p.finish.text, p.finish.late ? 'late' : '');
  if (p.note) box.append(el('p', 'note', p.note));
  return box;
}

function historyBody(model) {
  if (!model.history.length) return el('p', 'note', 'No runs yet.');
  const list = el('ul', 'dhist');
  for (const r of model.history) {
    const li = el('li'), url = httpsOnly(r.href), main = el('span', 'm');
    main.append(url ? link(r.result, url) : r.result);
    li.append(el('span', `dot ${r.tone === 'fail' ? 'fail' : r.tone === 'running' ? 'running' : 'ok'}`), main,
      el('span', 't', [r.when, r.how, r.duration].filter(Boolean).join(' · ')));
    list.append(li);
  }
  return list;
}

// Draws `model` (from taskDetails) into `root`, or empties and hides it when there is none.
export function renderDrawer(root, model, { tab = 'overview', onTab = () => {}, onClose = () => {} } = {}) {
  const sameTab = root.querySelector('.dtabs .on')?.textContent === (TABS.find(t => t[0] === tab) || [])[1];
  const scrolled = sameTab ? root.querySelector('.dbody')?.scrollTop || 0 : 0;   // a redraw keeps the reader's place
  root.replaceChildren();
  root.hidden = !model;
  if (!model) return;
  const head = el('div', 'dhead'), titles = el('div', 'dtitles');
  titles.append(el('h2', '', model.title), el('p', 'dsub', model.subtitle));
  const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close details'); x.onclick = onClose;
  head.append(titles, x);
  const tabs = el('div', 'dtabs'); tabs.setAttribute('role', 'tablist');
  for (const [id, label] of TABS) {
    const b = el('button', id === tab ? 'on' : '', label); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(id === tab)); b.onclick = () => onTab(id);
    tabs.append(b);
  }
  const body = el('div', 'dbody');
  body.append(tab === 'progress' ? progressBody(model) : tab === 'history' ? historyBody(model) : overviewBody(model));
  root.append(head, tabs, body);
  body.scrollTop = scrolled;
}
