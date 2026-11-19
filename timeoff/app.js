(() => {
'use strict';
const L = window.Leave;
let S = L.load();
L.save(S); // keep any one-time update from load()
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const persist = () => { if (!L.save(S)) snack('Could not save on this device'); };
const NAME = { annual: 'Annual', sick: 'Sick' };
const CHEV = '<svg class="chev" viewBox="0 0 8 13" aria-hidden="true"><path d="M1 1l5.5 5.5L1 12" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const thisYear = new Date().getFullYear();
const dShort = d => L.fmtDate(d, L.parse(d).getFullYear() === thisYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
const mLong = ym => L.fmtMonth(ym);
const mName = ym => L.parse(ym + '-01').toLocaleDateString('en-US', { month: 'long' });
const prevMonth = ym => { let [y, m] = ym.split('-').map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
const days = m => L.fmtDays(m, S.dayMins);
const dayWord = m => days(m) === '1' ? 'day' : 'days';
const sortedRates = () => [...S.rates].sort((a, b) => a.from.localeCompare(b.from));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* duration input: hours + minutes */
const durHTML = (id, mins) => `<span class="duration"><input type="number" inputmode="numeric" min="0" id="${id}_h" value="${mins != null ? Math.floor(mins / 60) : ''}" placeholder="0" aria-label="Hours"><span>h</span><input type="number" inputmode="numeric" min="0" max="59" id="${id}_m" value="${mins != null ? mins % 60 : ''}" placeholder="0" aria-label="Minutes"><span>m</span></span>`;
const readDur = id => (parseInt($(id + '_h').value, 10) || 0) * 60 + Math.min(59, Math.max(0, parseInt($(id + '_m').value, 10) || 0));
const setDur = (id, mins) => { $(id + '_h').value = Math.floor(mins / 60); $(id + '_m').value = mins % 60; };

/* ---------- navigation ---------- */
const VIEWS = ['home', 'settings', 'dates', 'setup'];
const PARENT = { settings: 'home', dates: 'settings' };
let view = 'home';
function route() {
  const h = location.hash.slice(1);
  view = !S.setupDone ? 'setup' : VIEWS.includes(h) && h !== 'setup' ? h : 'home';
  for (const v of VIEWS) $('view-' + v).hidden = v !== view;
  $('backBtn').hidden = !PARENT[view];
  $('backLabel').textContent = PARENT[view] === 'settings' ? 'Settings' : 'Home';
  $('settingsBtn').hidden = view !== 'home';
  $('barTitle').textContent = $('view-' + view).dataset.title;
  $('snackbar').classList.remove('show');
  const el = $('view-' + view); el.classList.remove('view-enter'); void el.offsetWidth; el.classList.add('view-enter');
  $('scroller').scrollTop = 0;
  ({ home: () => renderHome(true), settings: () => { renderSettings(); applyTheme(); }, dates: renderDates, setup: renderSetup })[view]();
}
window.addEventListener('hashchange', route);
$('settingsBtn').addEventListener('click', () => { location.hash = 'settings'; });
$('backBtn').addEventListener('click', () => { location.hash = PARENT[view] === 'home' ? '' : PARENT[view]; });
$('scroller').addEventListener('scroll', () => $('appbar').classList.toggle('scrolled', $('scroller').scrollTop > 40), { passive: true });
function refresh() { ({ home: () => renderHome(true), settings: renderSettings, dates: renderDates, setup: renderSetup })[view](); }

/* ---------- segmented controls with a sliding thumb ---------- */
function placeThumb(group) {
  const on = group.querySelector('button[aria-pressed="true"]'), th = group.querySelector('.thumb');
  if (!on || !th) return;
  th.style.width = on.offsetWidth + 'px';
  th.style.transform = `translateX(${on.offsetLeft - 4}px)`;
}
function pressOne(group, btn) {
  group.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === btn));
  placeThumb(group);
}
window.addEventListener('resize', () => document.querySelectorAll('.segmented').forEach(placeThumb));

/* ---------- theme ---------- */
function applyTheme() {
  const t = S.theme || 'light';
  document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const tc = document.getElementById('themeColor'); if (tc) tc.content = dark ? '#000000' : '#ffffff';
  const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (sb) sb.content = dark ? 'black-translucent' : 'default';
  const g = $('themeToggle');
  g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.theme === t));
  placeThumb(g);
}
$('themeToggle').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.theme = b.dataset.theme; persist(); applyTheme();
  if (navigator.standalone) snack('Close and reopen the app to update the top bar');
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); });

/* ---------- home: both balances, one chart, one list ---------- */
const shownN = { annual: null, sick: null };
const rafN = { annual: 0, sick: 0 };
const fmt2 = v => (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function setNum(type, mins, animate) {
  const el = $(type === 'annual' ? 'numA' : 'numS'), target = mins / S.dayMins;
  cancelAnimationFrame(rafN[type]);
  if (!animate || shownN[type] === null || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt2(target); shownN[type] = target; }
  else {
    const from = shownN[type], t0 = performance.now();
    const step = now => { const p = Math.min(1, (now - t0) / 550), e = 1 - Math.pow(1 - p, 4), v = from + (target - from) * e;
      el.textContent = fmt2(v); shownN[type] = v; if (p < 1) rafN[type] = requestAnimationFrame(step); };
    rafN[type] = requestAnimationFrame(step);
  }
  el.classList.toggle('neg', mins < 0);
  $(type === 'annual' ? 'hrsA' : 'hrsS').textContent = L.fmtHM(mins);
}
function showDate(date, label, animate = true) {
  const b = L.balanceOn(S, date);
  if (date < S.anchor.date && chart) { // before the CityTime date: read from the chart history
    b.annual = L.valueAt(chart.pa, date); b.sick = L.valueAt(chart.ps, date);
  }
  setNum('annual', b.annual, animate); setNum('sick', b.sick, animate);
  $('asOfLine').textContent = label;
}
const todayLabel = () => 'Today, ' + L.fmtDate(L.today(), { month: 'short', day: 'numeric' });

function renderHome(animate) {
  const t = L.today();
  shownN.annual = shownN.sick = null;
  drawChart(animate !== false);
  showDate(t, todayLabel());

  const last = L.lastCredit(S, t), next = L.nextCredit(S, t);
  const row = (label, c, fut) => c ? `<div class="row"><span class="badge-icon neutral"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg></span>
      <div class="row-main"><div class="row-title">${label}</div><div class="row-sub">${dShort(c.date)}</div></div>
      <div class="row-value"><span style="color:var(--annual)">+${L.fmtHM(c.annual)}</span><small><span style="color:var(--sick);font-weight:600">+${L.fmtHM(c.sick)}</span></small></div></div>` : '';
  $('credits').innerHTML = (row('Next deposit', next, true) + row('Last deposit', last)) || '<div class="empty">Add your monthly hours in Settings.</div>';

  const groups = groupUses();
  let counted = false;
  $('taken').innerHTML = groups.length ? groups.map(g => {
    const first = g.items[0], last = g.items[g.items.length - 1];
    const tag = first.date > t ? '<span class="pill planned">Planned</span>'
      : last.date <= S.anchor.date ? (counted = true, '<span class="pill counted">In CityTime</span>') : '';
    const when = g.items.length > 1 ? `${dShort(first.date)} to ${dShort(last.date)}` : dShort(first.date);
    const span = first.start && first.end ? `, ${fmtTime(first.start)} to ${fmtTime(first.end)}` : '';
    const n = g.items.length;
    return `<li><button class="row" data-use="${first.id}">
      <span class="badge-icon ${first.type}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg></span>
      <div class="row-main"><div class="row-title">${when} ${tag}</div>
      <div class="row-sub">${NAME[first.type]}${n > 1 ? `, ${n} days` : ''}${span}${first.note ? ', ' + esc(first.note) : ''}</div></div>
      <div class="row-value" style="color:var(--${first.type})">−${L.fmtHM(g.mins)}<small>${days(g.mins)} ${dayWord(g.mins)}</small></div></button></li>`;
  }).join('') : '<li class="empty">Nothing logged yet.</li>';
  $('takenFoot').hidden = !counted;
  $('takenFoot').textContent = `"In CityTime" means it's on or before ${dShort(S.anchor.date)}, the date of your balance, so it isn't subtracted again.`;
}

/* ---------- chart: two step lines (annual, sick); drag to scrub, like a stock chart ---------- */
const RANGES = { '3M': [-45, 46], '6M': [-91, 92], '1Y': [-183, 183], '2Y': [-183, 548], 'All': null };
let range = '6M', chart = null;
function drawChart(animate) {
  const wrap = $('chart'); if (!wrap) return;
  const t = L.today(), tD = L.parse(t);
  let from, to;
  if (RANGES[range]) { from = L.iso(L.addDays(tD, RANGES[range][0])); to = L.iso(L.addDays(tD, RANGES[range][1])); }
  else { from = S.startDate; to = L.iso(L.addDays(tD, 548)); }
  if (from < S.startDate) { const shift = L.parse(S.startDate) - L.parse(from); from = S.startDate; to = L.iso(new Date(L.parse(to).getTime() + shift)); }
  const pa = L.series(S, 'annual', to), ps = L.series(S, 'sick', to);
  const W = wrap.clientWidth, H = wrap.clientHeight, padX = 4, padTop = 30, padBot = 6;
  const t0 = L.parse(from).getTime(), t1 = L.parse(to).getTime();
  const xOf = d => padX + (L.parse(d).getTime() - t0) / (t1 - t0) * (W - 2 * padX);
  const clip = pts => { const out = [{ date: from, value: L.valueAt(pts, from) }]; for (const p of pts) if (p.date > from && p.date <= to) out.push(p); out.push({ date: to, value: L.valueAt(pts, to) }); return out; };
  const ca = clip(pa), cs = clip(ps);
  const max = Math.max(S.dayMins, ...ca.map(p => p.value), ...cs.map(p => p.value)) * 1.06;
  const min = Math.min(0, ...ca.map(p => p.value), ...cs.map(p => p.value));
  const yOf = v => padTop + (1 - (v - min) / (max - min)) * (H - padTop - padBot);
  const path = list => list.map((p, i) => i ? `H${xOf(p.date).toFixed(1)}V${yOf(p.value).toFixed(1)}` : `M${xOf(p.date).toFixed(1)},${yOf(p.value).toFixed(1)}`).join('');
  const split = (list, v) => {
    const past = list.filter(p => p.date <= t).concat({ date: t, value: v });
    const fut = [{ date: t, value: v }].concat(list.filter(p => p.date > t));
    return [path(past), path(fut)];
  };
  const va = L.valueAt(pa, t), vs = L.valueAt(ps, t);
  const [aPast, aFut] = split(ca, va), [sPast, sFut] = split(cs, vs);
  const xt = xOf(t), showT = t >= from && t <= to;
  wrap.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    ${min < 0 ? `<line class="zero" x1="0" x2="${W}" y1="${yOf(0)}" y2="${yOf(0)}"/>` : ''}
    ${showT ? `<line class="today-line" x1="${xt}" x2="${xt}" y1="${padTop - 6}" y2="${H}"/>` : ''}
    <path class="ln s fut" d="${sFut}"/><path class="ln a fut" d="${aFut}"/>
    <path class="ln s past${animate ? ' draw' : ''}" d="${sPast}"/><path class="ln a past${animate ? ' draw' : ''}" d="${aPast}"/>
    ${showT ? `<circle class="pulse a" cx="${xt}" cy="${yOf(va)}" r="6"/><circle class="pulse s" cx="${xt}" cy="${yOf(vs)}" r="6"/>
    <circle class="dot a" id="nowA" cx="${xt}" cy="${yOf(va)}" r="5"/><circle class="dot s" id="nowS" cx="${xt}" cy="${yOf(vs)}" r="5"/>` : ''}
    <g class="cursor" id="cursor"><line id="curLine" x1="0" x2="0" y1="${padTop - 6}" y2="${H}"/>
      <circle class="dot a" id="curA" r="6"/><circle class="dot s" id="curS" r="6"/></g>
  </svg><div class="cur-date" id="curDate"></div>`;
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)
    wrap.querySelectorAll('.ln.past').forEach(p => { const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.setProperty('--len', len); });
  $('lblStart').textContent = L.fmtDate(from, { month: 'short', day: 'numeric', year: 'numeric' });
  $('lblEnd').textContent = L.fmtDate(to, { month: 'short', day: 'numeric', year: 'numeric' });
  chart = { pa, ps, from, to, t0, t1, W, padX, xOf, yOf };
}

let lastScrub = null;
function scrubAt(clientX) {
  if (!chart) return;
  const wrap = $('chart'), r = wrap.getBoundingClientRect();
  const x = Math.max(chart.padX, Math.min(chart.W - chart.padX, clientX - r.left));
  const ms = chart.t0 + (x - chart.padX) / (chart.W - 2 * chart.padX) * (chart.t1 - chart.t0);
  const date = L.iso(new Date(ms));
  const va = L.valueAt(chart.pa, date), vs = L.valueAt(chart.ps, date);
  wrap.classList.add('scrubbing');
  $('curLine').setAttribute('x1', x); $('curLine').setAttribute('x2', x);
  $('curA').setAttribute('cx', x); $('curA').setAttribute('cy', chart.yOf(va));
  $('curS').setAttribute('cx', x); $('curS').setAttribute('cy', chart.yOf(vs));
  const cd = $('curDate'); cd.textContent = L.fmtDate(date, { month: 'short', day: 'numeric', year: 'numeric' });
  cd.style.left = Math.max(44, Math.min(chart.W - 44, x)) + 'px';
  showDate(date, L.fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + (date > L.today() ? ', projected' : ''), false);
  const key = va + '|' + vs;
  if (lastScrub !== null && key !== lastScrub && navigator.vibrate) navigator.vibrate(5);
  lastScrub = key;
}
function endScrub() {
  const wrap = $('chart'); if (!wrap.classList.contains('scrubbing')) return;
  wrap.classList.remove('scrubbing'); lastScrub = null;
  showDate(L.today(), todayLabel(), true);
}
$('chart').addEventListener('pointerdown', e => { $('chart').setPointerCapture(e.pointerId); scrubAt(e.clientX); });
$('chart').addEventListener('pointermove', e => { if ($('chart').hasPointerCapture(e.pointerId) || e.pointerType === 'mouse') scrubAt(e.clientX); });
$('chart').addEventListener('pointerup', endScrub);
$('chart').addEventListener('pointercancel', endScrub);
$('chart').addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') endScrub(); });
$('ranges').addEventListener('click', e => {
  const b = e.target.closest('button[data-r]'); if (!b) return;
  range = b.dataset.r;
  $('ranges').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  drawChart(true);
});
window.addEventListener('resize', () => { if (view === 'home') drawChart(false); });

/* ---------- sheets ---------- */
let lastFocus = null;
function openSheet(title, html, onReady) {
  lastFocus = document.activeElement;
  $('sheetTitle').textContent = title;
  const inner = document.createElement('div'); inner.innerHTML = html;
  $('sheetBody').replaceChildren(inner); // fresh element so old listeners never stack up
  $('scrim').hidden = false; $('sheet').hidden = false;
  requestAnimationFrame(() => { $('scrim').classList.add('open'); $('sheet').classList.add('open'); });
  onReady && onReady(inner);
  setTimeout(() => $('sheet').focus({ preventScroll: true }), 50);
}
function closeSheet() {
  $('scrim').classList.remove('open'); $('sheet').classList.remove('open');
  setTimeout(() => { if (!$('sheet').classList.contains('open')) { $('scrim').hidden = true; $('sheet').hidden = true; $('sheetBody').replaceChildren(); } }, 260);
  lastFocus && lastFocus.focus({ preventScroll: true });
}
$('sheetCancel').addEventListener('click', closeSheet);
$('scrim').addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

/* ---------- log / edit time off ---------- */
/* Entries are stored one per day; days logged together share a `group` id. */
function groupUses() {
  const map = new Map();
  for (const u of [...S.uses].sort((x, y) => x.date.localeCompare(y.date))) {
    const k = u.group || u.id;
    if (!map.has(k)) map.set(k, { key: k, items: [], mins: 0 });
    const g = map.get(k); g.items.push(u); g.mins += u.mins;
  }
  return [...map.values()].sort((x, y) => y.items[0].date.localeCompare(x.items[0].date));
}
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
function fmtTime(hhmm) { const [h, m] = hhmm.split(':').map(Number); return `${(h % 12) || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; }
const isWeekend = d => { const w = L.parse(d).getDay(); return w === 0 || w === 6; };
function datesBetween(a, b) { const out = []; for (let d = a; d <= b && out.length < 120; d = L.iso(L.addDays(L.parse(d), 1))) out.push(d); return out; }

function openTimeOff(u) {
  const group = u ? S.uses.filter(x => (x.group || x.id) === (u.group || u.id)).sort((x, y) => x.date.localeCompare(y.date)) : [];
  const editing = group.length > 0;
  let type = editing ? group[0].type : 'annual';
  const from0 = editing ? group[0].date : L.today(), to0 = editing ? group[group.length - 1].date : from0;
  let excluded = new Set();                                   // weekdays the user tapped off
  let included = new Set();                                   // weekend days the user tapped on
  if (editing) for (const d of datesBetween(from0, to0)) {
    const has = group.some(x => x.date === d);
    if (!has && !isWeekend(d)) excluded.add(d);
    if (has && isWeekend(d)) included.add(d);
  }
  openSheet(editing ? 'Edit time off' : 'Log time off', `
    <div class="segmented" role="group" aria-label="Type" id="tType" style="margin-bottom:6px"><span class="thumb" aria-hidden="true"></span>
      <button aria-pressed="${type === 'annual'}" data-t="annual">Annual</button><button aria-pressed="${type === 'sick'}" data-t="sick">Sick</button></div>
    <div class="list">
      <div class="field"><label for="tFrom">From</label><input type="date" id="tFrom" value="${from0}"></div>
      <div class="field"><label for="tTo">To</label><input type="date" id="tTo" value="${to0}"></div>
    </div>
    <div class="days-picked" id="tDays" aria-label="Days counted"></div>
    <div class="list">
      <div class="field"><label for="tStart">Start time</label><span class="time-wrap"><input type="time" id="tStart" value="${editing && group[0].start ? group[0].start : ''}"><button class="clear-x" data-clear="tStart" aria-label="Clear start time">×</button></span></div>
      <div class="field"><label for="tEnd">End time</label><span class="time-wrap"><input type="time" id="tEnd" value="${editing && group[0].end ? group[0].end : ''}"><button class="clear-x" data-clear="tEnd" aria-label="Clear end time">×</button></span></div>
    </div>
    <p class="note" style="margin-top:4px">Leave the times blank for full days.</p>
    <div class="list" style="margin-top:8px"><div class="field"><input type="text" id="tNote" placeholder="Note (optional)" maxlength="80" aria-label="Note" value="${editing ? esc(group[0].note) : ''}"></div></div>
    <div class="summary" id="tSum"></div>
    <div class="actions"><button class="btn" id="tSave">${editing ? 'Save changes' : 'Log time off'}</button>
      ${editing ? '<button class="btn secondary" id="tDel" style="color:var(--danger)">Delete</button>' : ''}</div>`, body => {

    const counted = () => {
      let a = $('tFrom').value, b = $('tTo').value || a;
      if (!a) return [];
      if (b < a) b = a;
      return datesBetween(a, b).filter(d => isWeekend(d) ? included.has(d) : !excluded.has(d));
    };
    const perDay = () => {
      const st = $('tStart').value, en = $('tEnd').value;
      if (!st && !en) return { mins: S.dayMins, full: true };
      if (!st || !en) return { mins: 0, err: 'Add both a start and an end time, or clear both for full days.' };
      const m = toMin(en) - toMin(st);
      if (m <= 0) return { mins: 0, err: 'End time needs to be after start time.' };
      return { mins: Math.min(m, S.dayMins), full: false, capped: m > S.dayMins };
    };
    const render = () => {
      let a = $('tFrom').value, b = $('tTo').value;
      if (a && b && b < a) { $('tTo').value = a; b = a; }
      const all = a ? datesBetween(a, b || a) : [];
      const ds = new Set(counted());
      $('tDays').innerHTML = all.length > 1 ? all.map(d => {
        const dd = L.parse(d), on = ds.has(d);
        return `<button class="day-chip${on ? ' on' : ''}${isWeekend(d) ? ' wknd' : ''}" data-day="${d}" aria-pressed="${on}">
          <span>${dd.toLocaleDateString('en-US', { weekday: 'short' })}</span><b>${dd.getDate()}</b></button>`;
      }).join('') : '';
      const pd = perDay(), list = [...ds], total = pd.mins * list.length;
      let html;
      if (pd.err) html = `<span style="color:var(--warn)">${pd.err}</span>`;
      else if (!list.length) html = `<span style="color:var(--warn)">No workdays picked.</span>`;
      else {
        const times = `${fmtTime($('tStart').value)} to ${fmtTime($('tEnd').value)}`;
        const per = pd.full ? (list.length > 1 ? `${list.length} full days` : 'Full day')
          : (list.length > 1 ? `${list.length} days, ${times}` : times);
        html = `<div class="sum-big">${L.fmtHM(total)}<span>${per}</span></div>`;
        const lastDay = list[list.length - 1];
        if (lastDay <= S.anchor.date) html += `<div class="sum-sub">Before your balance date, so it's saved but not subtracted again.</div>`;
        else {
          const saved = S.uses; S.uses = S.uses.filter(x => !group.includes(x));
          const before = L.balanceOn(S, lastDay)[type]; S.uses = saved;
          const already = list.filter(d => d <= S.anchor.date).length * pd.mins;
          const after = before - (total - already);
          html += `<div class="sum-sub">${NAME[type]} left after: <strong class="${after < 0 ? 'neg' : ''}">${days(after)} ${dayWord(after)} (${L.fmtHM(after)})</strong>${after < 0 ? ', more than you\'ll have' : ''}</div>`;
        }
        const clash = S.uses.filter(x => !group.includes(x) && x.type === type && ds.has(x.date));
        if (clash.length) html += `<div class="sum-sub" style="color:var(--warn)">You already logged ${type} leave on ${clash.map(x => dShort(x.date)).join(', ')}.</div>`;
        if (pd.capped) html += `<div class="sum-sub">Capped at a ${L.fmtHM(S.dayMins)} workday.</div>`;
      }
      $('tSum').innerHTML = html;
      $('tSave').disabled = !!pd.err || !list.length;
    };
    requestAnimationFrame(() => placeThumb($('tType')));
    $('tType').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t; pressOne($('tType'), b); render(); });
    $('tFrom').addEventListener('change', () => { if (!$('tTo').value || $('tTo').value < $('tFrom').value) $('tTo').value = $('tFrom').value; render(); });
    $('tDays').addEventListener('click', e => {
      const c = e.target.closest('[data-day]'); if (!c) return; const d = c.dataset.day;
      if (isWeekend(d)) included.has(d) ? included.delete(d) : included.add(d);
      else excluded.has(d) ? excluded.delete(d) : excluded.add(d);
      render();
    });
    body.addEventListener('click', e => { const c = e.target.closest('[data-clear]'); if (c) { $(c.dataset.clear).value = ''; render(); } });
    body.addEventListener('input', render);
    body.addEventListener('change', render);

    $('tSave').addEventListener('click', () => {
      const pd = perDay(), list = counted(); if (pd.err || !list.length) return;
      const g = list.length > 1 ? newId() : undefined, st = $('tStart').value, en = $('tEnd').value, note = $('tNote').value.trim();
      const made = list.map(d => ({ id: newId(), date: d, type, mins: pd.mins, note, ...(g ? { group: g } : {}), ...(st && en ? { start: st, end: en } : {}) }));
      const old = group;
      S.uses = S.uses.filter(x => !old.includes(x)).concat(made);
      persist(); closeSheet(); refresh();
      snack(editing ? 'Changes saved' : `${L.fmtHM(pd.mins * list.length)} logged`, () => { S.uses = S.uses.filter(x => !made.includes(x)).concat(old); persist(); refresh(); });
    });
    if (editing) $('tDel').addEventListener('click', () => {
      S.uses = S.uses.filter(x => !group.includes(x)); persist(); closeSheet(); refresh();
      snack('Deleted', () => { S.uses = S.uses.concat(group); persist(); refresh(); });
    });
    render();
  });
}
$('logBtn').addEventListener('click', () => openTimeOff(null));
document.addEventListener('click', e => {
  const b = e.target.closest('[data-use]'); if (!b) return;
  const u = S.uses.find(x => x.id === b.dataset.use); if (u) openTimeOff(u);
});

/* ---------- settings ---------- */
const two = (a, s) => `<div class="row-value"><span style="color:var(--annual)">+${L.fmtHM(a)}</span> annual<small><span style="color:var(--sick);font-weight:600">+${L.fmtHM(s)}</span> sick</small></div>`;
function renderSettings() {
  $('balTitle').innerHTML = `<span style="color:var(--annual);font-weight:600">${L.fmtHM(S.anchor.annual)}</span> annual, <span style="color:var(--sick);font-weight:600">${L.fmtHM(S.anchor.sick)}</span> sick`;
  const fromStart = S.anchor.date < S.startDate;
  if (fromStart) { const b = L.balanceOn(S, L.today()); $('balTitle').innerHTML = `<span style="color:var(--annual);font-weight:600">${L.fmtHM(b.annual)}</span> annual, <span style="color:var(--sick);font-weight:600">${L.fmtHM(b.sick)}</span> sick`; }
  $('balSub').textContent = fromStart ? `Calculated from your first day, ${L.fmtDate(S.startDate)}` : `As of ${L.fmtDate(S.anchor.date)}`;
  const rs = sortedRates(), nowYM = L.today().slice(0, 7), cur = L.rateFor(S, nowYM);
  $('rateList').innerHTML = rs.map((r, i) => {
    const nx = rs[i + 1];
    const range = nx ? `${mLong(r.from)} to ${mLong(prevMonth(nx.from))}` : r.from > nowYM ? `Starting ${mLong(r.from)}` : `Since ${mLong(r.from)}`;
    const label = r.title || (r === cur ? 'Current' : r.from > nowYM ? 'Upcoming' : 'Earlier');
    return `<button class="row" data-rate="${r.from}"><div class="row-main"><div class="row-title">${esc(label)}${r === cur && r.title ? ' <span class="pill official">Now</span>' : ''}</div>
      <div class="row-sub">${range}</div></div>${two(r.annual, r.sick)}${CHEV}</button>`;
  }).join('') + `<button class="row action" data-rate="">${rs.length ? 'Add a change (new title or hours)' : 'Add your monthly hours'}</button>`;
  $('workSub').textContent = `${L.fmtHM(S.dayMins)} a day, started ${L.fmtDate(S.startDate)}`;
}

/* Balance from CityTime */
$('openBalance').addEventListener('click', () => {
  const t = L.today(), now = L.balanceOn(S, t);
  openSheet('Update balance', `
    <p class="note" style="margin:0 4px 14px">Type exactly what CityTime shows. The app counts from here, so nothing gets added or subtracted twice.</p>
    <div class="list">
      <div class="field"><span class="label">Annual</span>${durHTML('uA', now.annual)}</div>
      <div class="field"><span class="label">Sick</span>${durHTML('uS', now.sick)}</div>
      <div class="field"><label for="uD">As of</label><input type="date" id="uD" value="${t}"></div>
    </div>
    <p class="note" id="uPrev"></p>
    <div class="actions"><button class="btn" id="uSave">Save balance</button>
      <button class="btn secondary" id="uFromStart">Calculate from my first day</button></div>
    <p class="note" id="uStartNote"></p>`, body => {
    const fromStart = { date: L.iso(L.addDays(L.parse(S.startDate), -1)), annual: 0, sick: 0 };
    { const saved = S.anchor; S.anchor = fromStart; const b = L.balanceOn(S, t); S.anchor = saved;
      $('uStartNote').textContent = `Starts at zero on ${L.fmtDate(S.startDate)} and adds your monthly hours on each date, minus time off you logged. That gives ${L.fmtHM(b.annual)} annual and ${L.fmtHM(b.sick)} sick today.`; }
    $('uFromStart').addEventListener('click', () => {
      const old = { ...S.anchor }; S.anchor = fromStart;
      persist(); closeSheet(); refresh();
      snack('Calculated from your first day', () => { S.anchor = old; persist(); refresh(); });
    });
    const prev = () => {
      const d = $('uD').value || t;
      const after = S.uses.filter(u => u.date > d);
      const counted = S.uses.filter(u => u.date <= d && u.date > S.anchor.date);
      let txt = `Hours added and time off after ${dShort(d)} will be counted from this number.`;
      if (counted.length) txt += ` ${counted.length} logged entr${counted.length > 1 ? 'ies' : 'y'} on or before ${dShort(d)} will be treated as already in CityTime.`;
      if (after.length) txt += ` ${after.length} planned entr${after.length > 1 ? 'ies' : 'y'} after that will still be subtracted.`;
      $('uPrev').textContent = txt;
    };
    body.addEventListener('input', prev); prev();
    $('uSave').addEventListener('click', () => {
      const old = { ...S.anchor };
      S.anchor = { date: $('uD').value || t, annual: readDur('uA'), sick: readDur('uS') };
      persist(); closeSheet(); refresh();
      snack('Balance updated', () => { S.anchor = old; persist(); refresh(); });
    });
  });
});

/* Monthly hours and title changes */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rate]'); if (!b) return;
  openRate(S.rates.find(x => x.from === b.dataset.rate) || null);
});
function lastCountedMonth() {
  let ym = S.startDate.slice(0, 7), lc = null;
  for (let i = 0; i < 360 && L.postDate(S, ym) <= S.anchor.date; i++) { lc = ym; ym = L.nextMonth(ym); }
  return lc;
}
function openRate(r) {
  const rs = sortedRates(), cur = L.rateFor(S, L.today().slice(0, 7));
  const lc = lastCountedMonth();
  const firstOpen = lc ? L.nextMonth(lc) : S.startDate.slice(0, 7);
  const isFirst = r && rs[0] === r;
  const minFrom = !r && rs.length ? firstOpen : S.startDate.slice(0, 7);
  const defFrom = r ? r.from : rs.length ? firstOpen : S.startDate.slice(0, 7);
  const base = r || cur;
  openSheet(r ? 'Monthly hours' : 'Add a change', `
    <div class="list">
      <div class="field"><label for="rTitle">Title</label><input type="text" id="rTitle" placeholder="Optional, e.g. Intern" maxlength="40" value="${r ? esc(r.title) : ''}" style="text-align:right"></div>
      <div class="field"><label for="rFrom">Starting month</label><input type="month" id="rFrom" value="${defFrom}" min="${minFrom}" ${isFirst ? 'disabled' : ''}></div>
      <div class="field"><span class="label">Annual per month</span>${durHTML('rA', base ? base.annual : null)}</div>
      <div class="field"><span class="label">Sick per month</span>${durHTML('rS', base ? base.sick : null)}</div>
    </div>
    <p class="note" id="rPrev"></p>
    <div class="actions"><button class="btn" id="rSave">Save</button>
      ${r && S.rates.length > 1 ? '<button class="btn secondary" id="rDel" style="color:var(--danger)">Delete this change</button>' : ''}</div>`, body => {
    const prev = () => {
      const f = $('rFrom').value; if (!f) { $('rPrev').textContent = ''; return; }
      const others = S.rates.filter(x => x !== r).sort((a, b) => a.from.localeCompare(b.from));
      const before = others.filter(x => x.from < f).pop();
      const clash = others.find(x => x.from === f);
      let html = before ? `${mLong(prevMonth(f))} and earlier keep ${L.fmtHM(before.annual)} annual, ${L.fmtHM(before.sick)} sick.` : `Applies from ${mLong(f)} on.`;
      const tooEarly = !r && rs.length && f < firstOpen;
      if (tooEarly) html = `<span style="color:var(--warn)">Hours through ${mLong(lc)} are already in your CityTime balance. Pick ${mLong(firstOpen)} or later.</span>`;
      else if (lc && f <= lc) html += `<br>Hours through ${mLong(lc)} are already in your CityTime balance, so only ${mLong(firstOpen)} and later use these numbers.`;
      $('rSave').disabled = tooEarly;
      if (clash) html += `<br><span style="color:var(--warn)">This replaces the other change that starts ${mLong(f)}.</span>`;
      $('rPrev').innerHTML = html;
    };
    body.addEventListener('input', prev); prev();
    $('rSave').addEventListener('click', () => {
      const f = $('rFrom').value; if (!f || $('rSave').disabled) return;
      const old = JSON.parse(JSON.stringify(S.rates));
      S.rates = S.rates.filter(x => x !== r && x.from !== f).concat({ from: f, title: $('rTitle').value.trim(), annual: readDur('rA'), sick: readDur('rS') });
      persist(); closeSheet(); refresh();
      snack('Monthly hours saved', () => { S.rates = old; persist(); refresh(); });
    });
    if ($('rDel')) $('rDel').addEventListener('click', () => {
      const old = JSON.parse(JSON.stringify(S.rates));
      S.rates = S.rates.filter(x => x !== r); persist(); closeSheet(); refresh();
      snack('Change deleted', () => { S.rates = old; persist(); refresh(); });
    });
  });
}

/* Workday */
$('openWorkday').addEventListener('click', () => {
  openSheet('Workday and start date', `
    <div class="list">
      <div class="field"><span class="label">Hours in a workday</span>${durHTML('wD', S.dayMins)}</div>
      <div class="field"><label for="wS">First day</label><input type="date" id="wS" value="${S.startDate}"></div>
    </div>
    <p class="note">Used to turn hours into days. A 35-hour week is 7 hours a day.</p>
    <div class="actions"><button class="btn" id="wSave">Save</button></div>`, () => {
    $('wSave').addEventListener('click', () => {
      const d = readDur('wD'); if (d <= 0) return;
      S.dayMins = d; if ($('wS').value) S.startDate = $('wS').value;
      persist(); closeSheet(); refresh(); snack('Saved');
    });
  });
});

/* When hours are added */
function renderDates() {
  const t = L.today();
  let ym = S.startDate.slice(0, 7), end = `${thisYear + 1}-12`, html = '';
  for (let i = 0; i < 120 && ym <= end; i++) {
    const pd = L.postDate(S, ym), src = L.postSource(S, ym);
    const tag = pd <= t ? ['counted', 'Added'] : { edited: ['edited', 'Edited'], official: ['official', 'City schedule'], estimated: ['est', 'Estimated'], actual: ['counted', 'Added'] }[src];
    html += `<div class="field"${pd <= t ? ' style="opacity:.6"' : ''}><div class="label">${L.parse(ym + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} hours
      <div><span class="pill ${tag[0]}">${tag[1]}</span></div></div>
      <input type="date" data-ym="${ym}" value="${pd}" aria-label="Date ${mLong(ym)} hours get added"></div>`;
    ym = L.nextMonth(ym);
  }
  $('dateList').innerHTML = html;
}
$('dateList').addEventListener('change', e => {
  const ym = e.target.dataset.ym; if (!ym) return;
  if (!e.target.value || e.target.value === L.defaultPost(ym)) delete S.postOverrides[ym]; else S.postOverrides[ym] = e.target.value;
  persist(); renderDates(); snack('Date saved');
});
$('resetDates').addEventListener('click', () => {
  const prev = S.postOverrides; S.postOverrides = {}; persist(); renderDates();
  snack('Dates reset', () => { S.postOverrides = prev; persist(); renderDates(); });
});

/* ---------- first-run setup ---------- */
function renderSetup() {
  document.querySelectorAll('#view-setup [data-dur]').forEach(el => {
    el.outerHTML = durHTML(el.dataset.dur, el.dataset.dur === 'sDay' ? S.dayMins : null);
  });
  $('sStart').value = S.startDate;
}
$('setupSave').addEventListener('click', () => {
  S.startDate = $('sStart').value || L.today();
  S.anchor = { date: L.today(), annual: readDur('sA'), sick: readDur('sS') };
  if (!S.anchor.annual && !S.anchor.sick) S.anchor = { date: L.iso(L.addDays(L.parse(S.startDate), -1)), annual: 0, sick: 0 };
  const a = readDur('sRA'), s = readDur('sRS');
  S.rates = (a || s) ? [{ from: S.startDate.slice(0, 7), title: $('sTitle').value.trim(), annual: a, sick: s }] : [];
  const d = readDur('sDay'); if (d > 0) S.dayMins = d;
  S.setupDone = true; persist(); location.hash = ''; route(); snack('All set');
});

/* ---------- backup ---------- */
$('exportBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = `time-off-backup-${L.today()}.json`; document.body.appendChild(a); a.click(); a.remove();
});
const pickFile = () => $('importFile').click();
$('importBtn').addEventListener('click', pickFile);
$('setupImport').addEventListener('click', pickFile);
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text()); if (!data.anchor || !Array.isArray(data.uses)) throw 0;
    data.setupDone = true; localStorage.setItem(L.KEY, JSON.stringify(data)); S = L.load(); persist();
    location.hash = ''; route(); snack('Backup restored');
  } catch (err) { snack('That file is not a Time Off backup'); }
  e.target.value = '';
});

/* ---------- snackbar ---------- */
let snackT;
function snack(text, undo) {
  $('snackText').textContent = text;
  const btn = $('snackAction'); btn.hidden = !undo;
  btn.onclick = () => { $('snackbar').classList.remove('show'); undo && undo(); };
  $('snackbar').classList.add('show');
  clearTimeout(snackT); snackT = setTimeout(() => $('snackbar').classList.remove('show'), undo ? 5000 : 2000);
}

/* ---------- install / offline ---------- */
let deferred = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('installRow').hidden = false; });
$('installRow').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installRow').hidden = true; });
if (!(matchMedia('(display-mode: standalone)').matches || navigator.standalone) && /iphone|ipad|ipod/i.test(navigator.userAgent)) $('iosInstallRow').hidden = false;
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('../sw.js').then(r => r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !window.__reloaded) { window.__reloaded = true; location.reload(); } });
}

/* Block pinch zoom on iOS (Safari ignores user-scalable=no) */
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

applyTheme();
route();
})();
