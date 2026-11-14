(() => {
'use strict';
const L = window.Leave;
let S = L.load();
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const persist = () => { if (!L.save(S)) snack('Could not save on this device'); };
const NAME = { annual: 'Annual', sick: 'Sick' };
const dateLong = d => L.fmtDate(d, L.parse(d).getFullYear() === new Date().getFullYear()
  ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
const monthName = ym => L.parse(ym + '-01').toLocaleDateString('en-US', { month: 'long' });
const days = m => L.fmtDays(m, S.dayMins);

/* duration inputs */
const readDur = id => (parseInt($(id + '_h').value, 10) || 0) * 60 + Math.min(59, parseInt($(id + '_m').value, 10) || 0);
const setDur = (id, mins) => { $(id + '_h').value = Math.floor(mins / 60); $(id + '_m').value = mins % 60; };

/* ---------- routing ---------- */
let view = 'home';
function route() {
  const h = location.hash.slice(1);
  view = !S.setupDone ? 'edit' : ['edit', 'dates'].includes(h) ? h : 'home';
  for (const v of ['home', 'edit', 'dates']) $('view-' + v).hidden = v !== view;
  const setup = !S.setupDone;
  $('backBtn').hidden = view === 'home' || setup;
  $('editBtn').hidden = view !== 'home';
  $('barTitle').textContent = setup ? 'Set up' : { home: 'My time off', edit: 'Edit', dates: 'Dates hours get added' }[view];
  $('editTitle').textContent = setup ? 'Set up' : 'Edit';
  $('setupIntro').hidden = !setup;
  $('moreSection').hidden = setup;
  $('setupImport').hidden = !setup;
  $('rFromRow').hidden = setup; $('rFromFoot').hidden = setup;
  $('saveEdit').textContent = setup ? 'Start tracking' : 'Save';
  window.scrollTo(0, 0);
  $('snackbar').classList.remove('show');
  if (view === 'home') renderHome();
  if (view === 'edit') fillEdit();
  if (view === 'dates') renderDates();
}
window.addEventListener('hashchange', route);
$('editBtn').addEventListener('click', () => { location.hash = 'edit'; });
$('backBtn').addEventListener('click', () => { location.hash = view === 'dates' ? 'edit' : ''; });
window.addEventListener('scroll', () => $('appbar').classList.toggle('scrolled', window.scrollY > 40), { passive: true });

/* ---------- home ---------- */
function strip(mins) {
  const d = Math.max(0, mins / S.dayMins), whole = Math.floor(d), frac = d - whole;
  let h = '<i></i>'.repeat(Math.min(whole, 30));
  if (whole < 30 && frac > 0.001) h += `<i style="--p:${Math.round(frac * 100)}%"></i>`;
  return h;
}
function renderHome() {
  const t = L.today(), b = L.balanceOn(S, t);
  $('balances').innerHTML = ['annual', 'sick'].map(k => `
    <section class="bal ${k}" aria-label="${NAME[k]}">
      <h2>${NAME[k]}</h2>
      <div class="days ${b[k] < 0 ? 'neg' : ''}">${days(b[k])}<span>days</span></div>
      <div class="hours">${L.fmtHM(b[k])}<span>total</span></div>
      <div class="strip" aria-hidden="true">${strip(b[k])}</div>
    </section>`).join('');

  const last = L.lastCredit(S, t), next = L.nextCredit(S, t);
  const creditRow = (label, c, est) => c ? `<div class="row"><div class="row-main">
      <div class="row-title">${label}: ${dateLong(c.date)}</div>
      <div class="row-sub">${monthName(c.ym)} hours${est ? ', estimated date' : ''}</div></div>
      <div class="credit-amt"><span class="a">+${L.fmtHM(c.annual)}</span> annual<br><span class="s">+${L.fmtHM(c.sick)}</span> sick</div></div>` : '';
  $('credits').innerHTML = creditRow('Last added', last) + creditRow('Next', next, next && L.postSource(S, next.ym) === 'estimated')
    || '<div class="empty">Add your monthly hours in Edit.</div>';

  const uses = [...S.uses].sort((x, y) => y.date.localeCompare(x.date));
  $('taken').innerHTML = uses.length ? uses.map(u => `<li><button class="row has-icon" data-use="${u.id}">
      <span class="badge-icon ${u.type}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg></span>
      <div class="row-main"><div class="row-title">${NAME[u.type]}${u.date > t ? ' (planned)' : ''}</div>
      <div class="row-sub">${dateLong(u.date)}${u.note ? ', ' + esc(u.note) : ''}</div></div>
      <div class="row-value"><strong>−${L.fmtHM(u.mins)}</strong><small>${days(u.mins)} day${days(u.mins) === '1' ? '' : 's'}</small></div></button></li>`).join('')
    : '<li class="empty">Nothing logged yet.</li>';
}

/* ---------- sheets ---------- */
let lastFocus = null;
function openSheet(title, html, onReady) {
  lastFocus = document.activeElement;
  $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html;
  $('scrim').hidden = false; $('sheet').hidden = false;
  requestAnimationFrame(() => { $('scrim').classList.add('open'); $('sheet').classList.add('open'); });
  document.body.style.overflow = 'hidden';
  onReady && onReady($('sheetBody'));
  setTimeout(() => $('sheet').focus({ preventScroll: true }), 50);
}
function closeSheet() {
  $('scrim').classList.remove('open'); $('sheet').classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { if (!$('sheet').classList.contains('open')) { $('scrim').hidden = true; $('sheet').hidden = true; $('sheetBody').innerHTML = ''; } }, 260);
  lastFocus && lastFocus.focus({ preventScroll: true });
}
$('sheetCancel').addEventListener('click', closeSheet);
$('scrim').addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

const durHTML = (id, mins) => `<span class="duration"><input type="number" inputmode="numeric" min="0" id="${id}_h" value="${Math.floor(mins / 60)}" aria-label="Hours"><span>h</span><input type="number" inputmode="numeric" min="0" max="59" id="${id}_m" value="${mins % 60}" aria-label="Minutes"><span>m</span></span>`;

$('logBtn').addEventListener('click', () => {
  let type = 'annual';
  openSheet('Log time off', `
    <div class="segmented" role="group" aria-label="Type" id="lType" style="margin-bottom:14px">
      <button aria-pressed="true" data-t="annual">Annual</button><button aria-pressed="false" data-t="sick">Sick</button></div>
    <div class="list">
      <div class="field"><label for="lDate">Date</label><input type="date" id="lDate" value="${L.today()}"></div>
      <div class="field"><span class="label">Time off</span>${durHTML('lHrs', S.dayMins)}</div>
      <div class="chips" style="padding-top:2px"><button class="chip" data-q="${S.dayMins}">Full day</button><button class="chip" data-q="${Math.round(S.dayMins / 2)}">Half day</button><button class="chip" data-q="60">1 hour</button></div>
    </div>
    <div class="list" style="margin-top:12px"><div class="field"><input type="text" id="lNote" placeholder="Note (optional)" maxlength="80" aria-label="Note"></div></div>
    <p class="preview" id="lPrev"></p>
    <div class="sheet-actions"><button class="btn" id="lSave">Log time off</button></div>`, body => {
    const prev = () => {
      const date = $('lDate').value || L.today(), mins = readDur('lHrs');
      const before = L.balanceOn(S, date)[type], after = date > S.anchor.date ? before - mins : before;
      $('lPrev').innerHTML = date <= S.anchor.date
        ? 'This date is before your current balance date, so it is saved but not subtracted again.'
        : `${NAME[type]} left after this: <strong class="${after < 0 ? 'neg' : ''}">${days(after)} days (${L.fmtHM(after)})</strong>`;
      $('lSave').disabled = mins <= 0;
    };
    $('lType').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t;
      $('lType').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); prev(); });
    body.querySelector('.chips').addEventListener('click', e => { if (e.target.dataset.q) { setDur('lHrs', +e.target.dataset.q); prev(); } });
    body.addEventListener('input', prev);
    $('lSave').addEventListener('click', () => {
      const mins = readDur('lHrs'), date = $('lDate').value; if (!date || mins <= 0) return;
      const u = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, type, mins, note: $('lNote').value.trim() };
      S.uses.push(u); persist(); closeSheet(); renderHome();
      snack('Time off logged', () => { S.uses = S.uses.filter(x => x !== u); persist(); renderHome(); });
    });
    prev();
  });
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-use]'); if (!b) return;
  const u = S.uses.find(x => x.id === b.dataset.use); if (!u) return;
  openSheet(`${NAME[u.type]} time off`, `
    <div class="list">
      <div class="row"><div class="row-main">Date</div><div class="row-value">${L.fmtDate(u.date, { weekday: 'long', month: 'long', day: 'numeric' })}</div></div>
      <div class="row"><div class="row-main">Time off</div><div class="row-value">${L.fmtHM(u.mins)}</div></div>
      ${u.note ? `<div class="row"><div class="row-main">Note</div><div class="row-value">${esc(u.note)}</div></div>` : ''}
    </div>
    <div class="sheet-actions"><button class="btn secondary" id="uDel" style="color:var(--danger)">Delete</button></div>`, () => {
    $('uDel').addEventListener('click', () => {
      const i = S.uses.indexOf(u); S.uses.splice(i, 1); persist(); closeSheet(); renderHome();
      snack('Deleted', () => { S.uses.splice(i, 0, u); persist(); renderHome(); });
    });
  });
});

/* ---------- edit ---------- */
function fillEdit() {
  setDur('bA', S.anchor.annual); setDur('bS', S.anchor.sick); $('bD').value = S.anchor.date;
  const r = L.rateFor(S, L.today().slice(0, 7)) || S.rates[S.rates.length - 1] || { from: S.startDate.slice(0, 7), annual: 0, sick: 0 };
  setDur('rA', r.annual); setDur('rS', r.sick); $('rFrom').value = r.from;
  setDur('wD', S.dayMins); $('wS').value = S.startDate;
}
$('saveEdit').addEventListener('click', () => {
  S.anchor = { date: $('bD').value || L.today(), annual: readDur('bA'), sick: readDur('bS') };
  if ($('wS').value) S.startDate = $('wS').value;
  const from = (!S.setupDone ? '' : $('rFrom').value) || S.startDate.slice(0, 7);
  S.rates = S.rates.filter(x => x.from !== from).concat({ from, annual: readDur('rA'), sick: readDur('rS') });
  const d = readDur('wD'); if (d > 0) S.dayMins = d;
  if ($('wS').value) S.startDate = $('wS').value;
  const first = !S.setupDone; S.setupDone = true;
  persist();
  if (location.hash) location.hash = ''; else route();
  snack(first ? 'All set' : 'Saved');
});

function renderDates() {
  const t = L.today();
  let ym = S.startDate.slice(0, 7), end = `${new Date().getFullYear() + 1}-12`, html = '';
  for (let i = 0; i < 120 && ym <= end; i++) {
    const pd = L.postDate(S, ym), src = L.postSource(S, ym);
    const tag = { official: ['official', 'Official'], estimated: ['est', 'Estimated'], edited: ['edited', 'Edited'] }[src];
    html += `<div class="field"${pd <= t ? ' style="opacity:.55"' : ''}><div class="label">${L.parse(ym + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} hours
      <div><span class="pill ${tag[0]}">${pd <= t ? 'Added' : tag[1]}</span></div></div>
      <input type="date" data-ym="${ym}" value="${pd}" aria-label="Date ${L.fmtMonth(ym)} hours get added"></div>`;
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

/* ---------- backup ---------- */
$('exportBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = `time-off-backup-${L.today()}.json`; document.body.appendChild(a); a.click(); a.remove();
});
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importBtn2').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text()); if (!data.anchor || !Array.isArray(data.uses)) throw 0;
    data.setupDone = true; localStorage.setItem(L.KEY, JSON.stringify(data)); S = L.load(); persist(); route(); snack('Backup imported');
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});

route();
})();
