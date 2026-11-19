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

  /* City schedule (OPA PMS Monthly Leave Processing Schedule, 2026 and 2027): hours show up on the
     processing Saturday. Key = accrual month, value = processing date. */
  const OFFICIAL = {
    '2026-01': '2026-02-07', '2026-02': '2026-03-07', '2026-03': '2026-04-11', '2026-04': '2026-05-09',
    '2026-05': '2026-06-13', '2026-06': '2026-07-11', '2026-07': '2026-08-08', '2026-08': '2026-09-12',
    '2026-09': '2026-10-10', '2026-10': '2026-11-07', '2026-11': '2026-12-12', '2026-12': '2027-01-09',
    '2027-01': '2027-02-13', '2027-02': '2027-03-13', '2027-03': '2027-04-10', '2027-04': '2027-05-08',
    '2027-05': '2027-06-12', '2027-06': '2027-07-10', '2027-07': '2027-08-07', '2027-08': '2027-09-11',
    '2027-09': '2027-10-09', '2027-10': '2027-11-13', '2027-11': '2027-12-11', '2027-12': '2028-01-08'
  };
  /* First two months as a new employee came later than the schedule; keep what actually happened. */
  const PAST = { '2026-06': '2026-07-18', '2026-07': '2026-08-15' };
  /* After 2027: the schedule's rule, the Saturday ending the first full week of the next month
     (matches every official 2026 and 2027 date). */
  function ruleDate(ym) {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m, 1);
    const firstSun = addDays(first, (7 - first.getDay()) % 7);
    return iso(addDays(firstSun, 6));
  }
  const defaultPost = ym => PAST[ym] || OFFICIAL[ym] || ruleDate(ym);

  /* Nothing personal lives in the code: every value below is entered on first launch
     and saved only in this browser's localStorage. */
  const DEFAULT = {
    version: 4,
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
    if (!S.version || S.version < 3) { S.postOverrides = {}; S.version = 3; } // older versions used paycheck dates
    // v4: count from the first day (zero balance) using the monthly hours, instead of an
    // entered starting balance. Deposits have matched the monthly rate exactly.
    if (S.version < 4) {
      if (S.startDate) S.anchor = { date: iso(addDays(parse(S.startDate), -1)), annual: 0, sick: 0 };
      S.version = 4;
    }
    // drop edited dates that now match the built-in pattern
    for (const ym of Object.keys(S.postOverrides || {})) if (S.postOverrides[ym] === defaultPost(ym)) delete S.postOverrides[ym];
    return S;
  }
  function save(S) { try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) { return false; } }

  function rateFor(S, ym) {
    let r = null;
    for (const x of [...S.rates].sort((a, b) => a.from.localeCompare(b.from))) if (x.from <= ym) r = x;
    return r;
  }
  const postDate = (S, ym) => S.postOverrides[ym] || defaultPost(ym);
  const postSource = (S, ym) => S.postOverrides[ym] ? 'edited' : PAST[ym] ? 'actual' : OFFICIAL[ym] ? 'official' : 'estimated';

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
  /* Step series of one balance from the start date to `to`, for the chart.
     Before the CityTime balance date it works backward from that balance; after it, forward.
     Returns [{date, value}] where each point is the balance from that date on. */
  function series(S, type, to) {
    const changes = [];
    let ym = S.startDate.slice(0, 7);
    for (let i = 0; i < 360; i++) {
      const pd = postDate(S, ym); if (pd > to) break;
      const r = rateFor(S, ym);
      if (r && r[type] && pd >= S.startDate) changes.push({ date: pd, delta: r[type] });
      ym = nextMonth(ym);
    }
    for (const u of S.uses) if (u.type === type && u.date <= to && u.date >= S.startDate) changes.push({ date: u.date, delta: -u.mins });
    changes.sort((a, b) => a.date.localeCompare(b.date));
    const anchorVal = S.anchor[type], ad = S.anchor.date;
    // balance at start = anchor minus everything that happened on or before the anchor date
    let v = anchorVal;
    for (const c of changes) if (c.date <= ad) v -= c.delta;
    const pts = [{ date: S.startDate, value: v }];
    for (const c of changes) { v += c.delta; pts.push({ date: c.date, value: c.date <= ad ? null : v, raw: v }); }
    // values on or before the anchor date come from the backward pass; after it, from the anchor forward
    for (const p of pts.slice(1)) { if (p.value === null) p.value = p.raw; delete p.raw; }
    // make sure the line passes exactly through the CityTime number on its date
    if (ad >= S.startDate && ad <= to) pts.push({ date: ad, value: valueAt(pts, ad) });
    pts.sort((a, b) => a.date.localeCompare(b.date));
    pts.push({ date: to, value: valueAt(pts, to) });
    return pts;
  }
  function valueAt(pts, date) {
    let v = pts.length ? pts[0].value : 0;
    for (const p of pts) { if (p.date <= date) v = p.value; else break; }
    return v;
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

  global.Leave = { KEY, DEFAULT, load, save, iso, parse, addDays, today, nextMonth,
    defaultPost, postDate, postSource, rateFor, events, balanceOn, nextCredit, lastCredit, series, valueAt,
    fmtHM, fmtDays, toDays, fmtDate, fmtMonth };
})(window);
