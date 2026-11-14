(() => {
'use strict';
const L = window.Leave;
let S = L.load();
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
  if (view !== 'home') document.body.classList.remove('sick-mode');
  const el = $('view-' + view); el.classList.remove('view-enter'); void el.offsetWidth; el.classList.add('view-enter');
  $('scroller').scrollTop = 0;
  ({ home: () => { shown = null; renderHome(true); }, settings: () => { renderSettings(); applyTheme(); }, dates: renderDates, setup: renderSetup })[view]();
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
  S.theme = b.dataset.theme; persist(); applyTheme(); drawChart(false);
  if (navigator.standalone) snack('Close and reopen the app to update the top bar');
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); });

/* ---------- home ---------- */
let leaveType = 'annual';
let shown = null;          // number currently on screen (days), for count-up
let countRAF = 0;
function setBig(mins, animate) {
  const target = mins / S.dayMins;
  const el = $('bigNum');
  const fmt = v => (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  cancelAnimationFrame(countRAF);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || shown === null || reduce) { el.textContent = fmt(target); shown = target; }
  else {
    const from = shown, t0 = performance.now(), dur = 650;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      const v = from + (target - from) * e; el.textContent = fmt(v); shown = v;
      if (p < 1) countRAF = requestAnimationFrame(step);
    };
    countRAF = requestAnimationFrame(step);
  }
  el.classList.toggle('neg', mins < 0);
  $('bigUnit').textContent = Math.abs(target) === 1 ? 'day' : 'days';
  $('subHours').textContent = `${L.fmtHM(mins)} total`;
}
function setDeltaDefault() {
  const last = L.lastCredit(S, L.today()), d = $('delta');
  d.classList.remove('scrub');
  d.textContent = last ? `+${L.fmtHM(last[leaveType])} added ${L.fmtDate(last.date, { month: 'short', day: 'numeric' })}` : '';
}

$('typeToggle').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.dataset.t === leaveType) return;
  leaveType = b.dataset.t; pressOne($('typeToggle'), b);
  document.body.classList.toggle('sick-mode', leaveType === 'sick');
  renderHome(true);
});

function renderHome(animate) {
  const t = L.today(), b = L.balanceOn(S, t);
  document.body.classList.toggle('sick-mode', leaveType === 'sick');
  placeThumb($('typeToggle'));
  setBig(b[leaveType], animate !== false);
  setDeltaDefault();
  drawChart(true);

  const last = L.lastCredit(S, t), next = L.nextCredit(S, t);
  const row = (label, c, est) => c ? `<div class="row"><span class="badge-icon ${leaveType}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg></span>
      <div class="row-main"><div class="row-title">${label}</div>
      <div class="row-sub">${dShort(c.date)}, ${mName(c.ym)} hours${est ? ' (estimated)' : ''}</div></div>
      <div class="row-value credit-amt">+${L.fmtHM(c[leaveType])}</div></div>` : '';
  $('credits').innerHTML = (row('Last added', last) + row('Next', next, next && L.postSource(S, next.ym) === 'estimated'))
    || '<div class="empty">Add your monthly hours in Settings.</div>';

  const uses = [...S.uses].filter(u => u.type === leaveType).sort((x, y) => y.date.localeCompare(x.date));
  let counted = false;
  $('taken').innerHTML = uses.length ? uses.map(u => {
    const tag = u.date > t ? '<span class="pill planned">Planned</span>'
      : u.date <= S.anchor.date ? (counted = true, '<span class="pill counted">In CityTime</span>') : '';
    return `<li><button class="row" data-use="${u.id}">
      <span class="badge-icon ${u.type}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg></span>
      <div class="row-main"><div class="row-title">${dShort(u.date)} ${tag}</div>
      <div class="row-sub">${u.note ? esc(u.note) : NAME[u.type] + ' leave'}</div></div>
      <div class="row-value">−${L.fmtHM(u.mins)}<small>${days(u.mins)} ${dayWord(u.mins)}</small></div></button></li>`;
  }).join('') : `<li class="empty">No ${leaveType} time off logged yet.</li>`;
  $('takenFoot').hidden = !counted;
  $('takenFoot').textContent = `"In CityTime" means it's on or before ${dShort(S.anchor.date)}, the date of your balance, so it isn't subtracted again.`;
}

/* ---------- chart: balance at the end of each month, drag or tap a bar ---------- */
let chart = null;
function monthEnd(ym) { const [y, m] = ym.split('-').map(Number); return L.iso(new Date(y, m, 0)); }
function drawChart(animate) {
  const wrap = $('chart'); if (!wrap || wrap.offsetParent === null) return;
  const t = L.today(), nowYM = t.slice(0, 7);
  let first = S.startDate.slice(0, 7);
  // keep about 12 bars: up to 6 past months, this month, 5 ahead
  const back = []; let ym = nowYM;
  for (let i = 0; i < 6 && ym > first; i++) { ym = (([y, m]) => m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`)(ym.split('-').map(Number)); back.unshift(ym); }
  const months = [...back, nowYM]; ym = nowYM;
  for (let i = 0; i < 5; i++) { ym = L.nextMonth(ym); months.push(ym); }
  const endDate = monthEnd(months[months.length - 1]);
  const pts = L.series(S, leaveType, endDate);
  const bars = months.map(m => {
    const date = m === nowYM ? t : monthEnd(m);
    return { ym: m, date, value: L.valueAt(pts, date), future: m > nowYM, now: m === nowYM };
  });
  const max = Math.max(S.dayMins, ...bars.map(b => b.value));
  wrap.innerHTML = `<div class="bars">${bars.map((b, i) => `
      <div class="bar-col${b.future ? ' future' : ''}${b.now ? ' now' : ''}" data-i="${i}">
        <div class="bar${animate ? ' grow' : ''}" style="height:${Math.max(2, Math.max(0, b.value) / max * 100)}%;animation-delay:${i * 35}ms"></div>
        <span class="bar-lbl">${L.parse(b.ym + '-01').toLocaleDateString('en-US', { month: 'narrow' })}</span>
      </div>`).join('')}</div>`;
  $('lblStart').textContent = L.fmtMonth(months[0]).replace(/ (\d{4})$/, ' $1');
  $('lblEnd').textContent = L.fmtMonth(months[months.length - 1]);
  chart = { bars };
}
let selBar = null;
function scrubAt(clientX) {
  if (!chart) return;
  const cols = [...$('chart').querySelectorAll('.bar-col')];
  let i = cols.findIndex(c => { const r = c.getBoundingClientRect(); return clientX >= r.left - 2 && clientX <= r.right + 2; });
  if (i < 0) { const r0 = cols[0].getBoundingClientRect(); i = clientX < r0.left ? 0 : cols.length - 1; }
  if (i === selBar) return;
  if (selBar !== null && navigator.vibrate) navigator.vibrate(4);
  selBar = i;
  cols.forEach((c, k) => c.classList.toggle('sel', k === i));
  $('chart').classList.add('scrubbing');
  const b = chart.bars[i];
  setBig(b.value, true);
  const d = $('delta'); d.classList.add('scrub');
  d.textContent = b.now ? 'Today' : `End of ${L.fmtMonth(b.ym)}${b.future ? ', projected' : ''}`;
}
function endScrub() {
  const wrap = $('chart'); if (!wrap.classList.contains('scrubbing')) return;
  wrap.classList.remove('scrubbing'); selBar = null;
  wrap.querySelectorAll('.bar-col.sel').forEach(c => c.classList.remove('sel'));
  setBig(L.balanceOn(S, L.today())[leaveType], true); setDeltaDefault();
}
let scrubbing = false;
$('chart').addEventListener('pointerdown', e => { scrubbing = true; $('chart').setPointerCapture(e.pointerId); scrubAt(e.clientX); });
$('chart').addEventListener('pointermove', e => { if (scrubbing) scrubAt(e.clientX); });
$('chart').addEventListener('pointerup', () => { scrubbing = false; setTimeout(endScrub, 900); });
$('chart').addEventListener('pointercancel', () => { scrubbing = false; endScrub(); });
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
function openTimeOff(u) {
  const editing = !!u;
  let type = u ? u.type : leaveType;
  openSheet(editing ? 'Edit time off' : 'Log time off', `
    <div class="segmented" role="group" aria-label="Type" id="tType" style="margin-bottom:14px"><span class="thumb" aria-hidden="true"></span>
      <button aria-pressed="${type === 'annual'}" data-t="annual">Annual</button><button aria-pressed="${type === 'sick'}" data-t="sick">Sick</button></div>
    <div class="list">
      <div class="field"><label for="tDate">Date</label><input type="date" id="tDate" value="${u ? u.date : L.today()}"></div>
      <div class="field"><span class="label">Time off</span>${durHTML('tHrs', u ? u.mins : S.dayMins)}</div>
      <div class="chips" style="padding-top:2px"><button class="chip" data-q="${S.dayMins}">Full day</button><button class="chip" data-q="${Math.round(S.dayMins / 2)}">Half day</button><button class="chip" data-q="60">1 hour</button></div>
    </div>
    <div class="list" style="margin-top:12px"><div class="field"><input type="text" id="tNote" placeholder="Note (optional)" maxlength="80" aria-label="Note" value="${u ? esc(u.note) : ''}"></div></div>
    <p class="note" id="tPrev"></p>
    <div class="actions"><button class="btn" id="tSave">${editing ? 'Save changes' : 'Log time off'}</button>
      ${editing ? '<button class="btn secondary" id="tDel" style="color:var(--danger)">Delete</button>' : ''}</div>`, body => {
    const prev = () => {
      const date = $('tDate').value || L.today(), mins = readDur('tHrs');
      const others = S.uses.filter(x => x !== u);
      const dup = others.find(x => x.date === date && x.type === type);
      let html;
      if (date <= S.anchor.date) {
        html = `This is on or before ${dShort(S.anchor.date)}, the date of your CityTime balance, so it's already counted there. It's saved for your records but not subtracted again.`;
      } else {
        const saved = S.uses; S.uses = others;
        const before = L.balanceOn(S, date)[type]; S.uses = saved;
        const after = before - mins;
        html = `${NAME[type]} left after this: <strong class="${after < 0 ? 'neg' : ''}">${days(after)} ${dayWord(after)} (${L.fmtHM(after)})</strong>` +
          (after < 0 ? '. That\'s more than you\'ll have on that date.' : '');
      }
      if (dup) html += `<br><span style="color:var(--warn)">You already logged ${L.fmtHM(dup.mins)} of ${type} leave on this date.</span>`;
      $('tPrev').innerHTML = html;
      $('tSave').disabled = mins <= 0;
    };
    requestAnimationFrame(() => placeThumb($('tType')));
    $('tType').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t;
      pressOne($('tType'), b); prev(); });
    body.querySelector('.chips').addEventListener('click', e => { if (e.target.dataset.q) { setDur('tHrs', +e.target.dataset.q); prev(); } });
    body.addEventListener('input', prev);
    $('tSave').addEventListener('click', () => {
      const mins = readDur('tHrs'), date = $('tDate').value; if (!date || mins <= 0) return;
      const data = { date, type, mins, note: $('tNote').value.trim() };
      if (editing) {
        const old = { ...u }; Object.assign(u, data); persist(); closeSheet(); refresh();
        snack('Changes saved', () => { Object.assign(u, old); persist(); refresh(); });
      } else {
        const n = { id: newId(), ...data }; S.uses.push(n); persist(); closeSheet(); refresh();
        snack('Time off logged', () => { S.uses = S.uses.filter(x => x !== n); persist(); refresh(); });
      }
    });
    if (editing) $('tDel').addEventListener('click', () => {
      const i = S.uses.indexOf(u); S.uses.splice(i, 1); persist(); closeSheet(); refresh();
      snack('Deleted', () => { S.uses.splice(i, 0, u); persist(); refresh(); });
    });
    prev();
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
  $('balSub').textContent = `As of ${L.fmtDate(S.anchor.date)}`;
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
    <div class="actions"><button class="btn" id="uSave">Save balance</button></div>`, body => {
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

/* Dates hours get added */
function renderDates() {
  const t = L.today();
  let ym = S.startDate.slice(0, 7), end = `${thisYear + 1}-12`, html = '';
  for (let i = 0; i < 120 && ym <= end; i++) {
    const pd = L.postDate(S, ym), src = L.postSource(S, ym);
    const tag = pd <= t ? ['counted', 'Added'] : { official: ['official', 'Official'], estimated: ['est', 'Estimated'], edited: ['edited', 'Edited'] }[src];
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

applyTheme();
route();
})();
