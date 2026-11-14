/* Leave model: balances, accruals and NYC posting schedule. Shared by the tracker and the dashboard. */
(function (global) {
  'use strict';
  const KEY = 'nycdep.timeoff.v1';

  /* Dates are local YYYY-MM-DD strings. */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = () => iso(new Date());
  const nextMonth = ym => { let [y, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${pad(m)}`; };

  /* Official OPA PMS Monthly Leave Processing Schedule, CY2027 (UB #069-26).
     Key = accrual month, value = processing date (a Saturday). */
  const OFFICIAL = {
    '2027-01': '2027-02-13', '2027-02': '2027-03-13', '2027-03': '2027-04-10', '2027-04': '2027-05-08',
    '2027-05': '2027-06-12', '2027-06': '2027-07-10', '2027-07': '2027-08-07', '2027-08': '2027-09-11',
    '2027-09': '2027-10-09', '2027-10': '2027-11-13', '2027-11': '2027-12-11', '2027-12': '2028-01-08'
  };

  /* Rule from the OPA schedule: leave runs the Saturday that ends the first full week of the
     next month (matches all 12 official 2027 dates). Hours show in CityTime the Monday after. */
  function processDate(ym) {
    if (OFFICIAL[ym]) return OFFICIAL[ym];
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m, 1);
    const firstSun = addDays(first, (7 - first.getDay()) % 7);
    return iso(addDays(firstSun, 6));
  }
  const defaultPost = ym => iso(addDays(parse(processDate(ym)), 2));

  /* Nothing personal lives in the code: every value below is entered on first launch
     and saved only in this browser's localStorage. */
  const DEFAULT = {
    version: 3,
    setupDone: false,
    startDate: null,
    dayMins: 420,
    anchor: { date: null, annual: 0, sick: 0 },
    rates: [],          // [{from:'YYYY-MM', title, annual, sick}] minutes per month; each applies until the next one
    postOverrides: {},  // {'YYYY-MM': 'YYYY-MM-DD'}
    uses: []            // [{id, date, type:'annual'|'sick', mins, note}]
  };

  function load() {
    let S;
    try { S = Object.assign(JSON.parse(JSON.stringify(DEFAULT)), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch (e) { S = JSON.parse(JSON.stringify(DEFAULT)); }
    if (!S.startDate) S.startDate = today();
    if (!S.anchor || !S.anchor.date) S.anchor = { date: today(), annual: 0, sick: 0 };
    if (S.version !== 3) { S.postOverrides = {}; S.version = 3; } // older versions used paycheck dates
    return S;
  }
  function save(S) { try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) { return false; } }

  function rateFor(S, ym) {
    let r = null;
    for (const x of [...S.rates].sort((a, b) => a.from.localeCompare(b.from))) if (x.from <= ym) r = x;
    return r;
  }
  const postDate = (S, ym) => S.postOverrides[ym] || defaultPost(ym);
  const postSource = (S, ym) => S.postOverrides[ym] ? 'edited' : OFFICIAL[ym] ? 'official' : 'estimated';

  /* All balance changes after the anchor date, up to `until`. */
  function events(S, until) {
    const ev = [];
    let ym = S.startDate.slice(0, 7);
    for (let i = 0; i < 360; i++) {
      const pd = postDate(S, ym);
      if (pd > until) break;
      const r = rateFor(S, ym);
      if (r && pd > S.anchor.date && (r.annual || r.sick))
        ev.push({ kind: 'credit', date: pd, ym, annual: r.annual, sick: r.sick, source: postSource(S, ym) });
      ym = nextMonth(ym);
    }
    for (const u of S.uses)
      if (u.date > S.anchor.date && u.date <= until)
        ev.push({ kind: 'use', date: u.date, id: u.id, type: u.type, mins: u.mins, note: u.note,
          annual: u.type === 'annual' ? -u.mins : 0, sick: u.type === 'sick' ? -u.mins : 0 });
    ev.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'credit' ? -1 : 1));
    let a = S.anchor.annual, s = S.anchor.sick;
    for (const e of ev) { a += e.annual; s += e.sick; e.balAnnual = a; e.balSick = s; }
    return ev;
  }
  function balanceOn(S, date) {
    let a = S.anchor.annual, s = S.anchor.sick;
    if (date >= S.anchor.date) for (const e of events(S, date)) { a += e.annual; s += e.sick; }
    return { annual: a, sick: s };
  }
  function lastCredit(S, onOrBefore) {
    let ym = S.startDate.slice(0, 7), last = null;
    for (let i = 0; i < 360; i++) {
      const pd = postDate(S, ym), r = rateFor(S, ym);
      if (pd > onOrBefore) break;
      if (r && (r.annual || r.sick)) last = { ym, date: pd, annual: r.annual, sick: r.sick };
      ym = nextMonth(ym);
    }
    return last;
  }
  function nextCredit(S, after) {
    let ym = S.startDate.slice(0, 7);
    for (let i = 0; i < 360; i++) {
      const pd = postDate(S, ym), r = rateFor(S, ym);
      if (pd > after && r && (r.annual || r.sick)) return { ym, date: pd, annual: r.annual, sick: r.sick };
      ym = nextMonth(ym);
    }
    return null;
  }

  /* Formatting */
  const fmtHM = mins => {
    const neg = mins < 0; mins = Math.abs(Math.round(mins));
    const h = Math.floor(mins / 60), m = mins % 60;
    return (neg ? '−' : '') + (m ? `${h}h ${m}m` : `${h}h`);
  };
  const toDays = (mins, dayMins) => mins / dayMins;
  const fmtDays = (mins, dayMins) => {
    const d = toDays(mins, dayMins);
    return (Math.round(d * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  };
  const fmtDate = (s, opts) => parse(s).toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtMonth = ym => parse(ym + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  global.Leave = { KEY, DEFAULT, OFFICIAL, load, save, iso, parse, addDays, today, nextMonth,
    defaultPost, postDate, postSource, rateFor, events, balanceOn, nextCredit, lastCredit,
    fmtHM, fmtDays, toDays, fmtDate, fmtMonth };
})(window);
