const $ = (s, root) => (root || document).querySelector(s);
const el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) e.setAttribute(k, v);
  });
  kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
};
const inr = x => '\u20B9' + Number(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = x => '\u20B9' + Math.round(x).toLocaleString('en-IN');
const pct1 = x => (Math.round(x * 10) / 10).toString();
const pct0 = x => Math.round(x).toString();
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

let A = null, D = null, Z = null, isSample = false, ADV = null;
let meterGuess = 50, couponOpen = false; // the slider and the coupon card keep their state when the page redraws
const inp = { fc: 35, comm: 20 };
// Error messages for a wrong file. Each says what is wrong and that nothing was calculated.
const SW_ERR = {
  LOOKS_LIKE_ZOMATO: () => t('This looks like the Zomato business report. Put it in the Zomato box instead.'),
  NO_ORDER_SHEET: () => t('That doesn’t look like a Swiggy payout statement: there’s no “Order Level” sheet.'),
  NO_HEADER: () => t('Found the “Order Level” sheet, but not its header row (the one with “Order ID”).'),
  MISSING_COLUMNS: d => t('The “Order Level” sheet is missing {cols}. Swiggy may have renamed the column.', { cols: (d || []).join(', ') }),
  EMPTY: () => t('This statement has no delivered orders, so there’s nothing to work out.'),
  TOTALS_DONT_RECONCILE: d => t('This statement’s totals don’t add up: {amt} can’t be matched to any charge. The file may be incomplete or a format this tool doesn’t know yet. Try downloading it again.', { amt: inr(Math.max(Math.abs(d.unexplained), Math.abs(d.rowGap))) })
};
const Z_ERR = {
  LOOKS_LIKE_SWIGGY: () => t('This looks like the Swiggy payout statement. Put it in the Swiggy box instead.'),
  NO_METRICS: () => t('That doesn’t look like the Zomato business report (a CSV with Metric rows and monthly values).'),
  EMPTY: () => t('This Zomato report has no delivered orders or sales, so there’s nothing to compare.')
};
const errText = (map, x, dflt) => (map[x && x.code] ? map[x.code](x.detail) : dflt) + ' ' + t('Nothing was calculated from it.');

// ---------- made-up sample data (clearly labelled) ----------
// Four weekly payouts (Mon to Sun, no overlap) that tell one story, so the graphs and the memory comparison have something to show:
//   week1: a 20% coupon on most orders      week2: the coupon halved to 10%, orders hold up
//   week3: coupons off, orders drop         week4: a small 10% coupon is back, orders recover
const SAMPLE_WEEKS = {
  week1: { start: '2026-08-03', code: 'WELCOME20', rate: 0.20, items: [249, 289, 149, 349, 199, 449, 179, 299, 249, 399, 149, 229], days: [0, 0, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6], coupons: [0, 2, 3, 5, 6, 8, 10, 11], cancelled: true, mismatch: true, ads: true },
  week2: { start: '2026-08-10', code: 'WELCOME10', rate: 0.10, items: [249, 289, 179, 349, 199, 449, 179, 299, 249, 399, 229, 329, 189], days: [0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6], coupons: [0, 3, 6, 9, 11, 12], cancelled: false },
  week3: { start: '2026-08-17', code: '', rate: 0, items: [249, 349, 299, 199, 449, 249, 399, 329], days: [0, 1, 2, 3, 4, 5, 5, 6], coupons: [], cancelled: true },
  week4: { start: '2026-08-24', code: 'WELCOME10', rate: 0.10, items: [249, 289, 349, 199, 449, 299, 249, 399, 229, 329, 189], days: [0, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6], coupons: [1, 5, 8, 10], cancelled: false }
};
const SAMPLE_ORDER = ['week1', 'week2', 'week3', 'week4'];
function makeSample(variant = 'week1') {
  const W = SAMPLE_WEEKS[variant] || SAMPLE_WEEKS.week1;
  const hours = [20, 21, 0, 22, 13, 19, 23, 20, 1, 21, 12, 22, 19, 20];
  const kms = [3.1, 4.7, 2.8, 5.2, 3.6, 4.1, 6.3, 3.3, 4.9, 2.9, 3.8, 4.4, 5.6, 3.0];
  const rows = [];
  const mk = (i, dayOff, item, pack, coupon, rate, commOverride, status, cancelledBy) => {
    const delivered = status === 'delivered';
    const share = delivered && coupon ? Math.min(Math.round(item * W.rate * 100) / 100, 50) : 0;
    const net = delivered ? item + pack - share : 0;
    const gst = delivered ? net * 0.05 : 0;
    const comm = delivered ? (commOverride != null ? commOverride : (net * rate) / 100) : 0;
    const pcc = delivered ? net * 0.02 : 0;
    const canc = delivered ? 0 : 12.62;
    const gstFee = 0.18 * (comm + pcc + canc);
    const totalFees = comm + pcc + canc + gstFee;
    const tds = net * 0.001;
    const taxes = gst + tds;
    const payable = net + gst;
    const hh = String(hours[(i - 1) % hours.length]).padStart(2, '0');
    return {
      id: '99000000' + String(i).padStart(7, '0'), date: addDays(W.start, dayOff) + ' ' + hh + ':10:00', status, cancelledBy: cancelledBy || '', coupon: delivered ? coupon : '',
      item: delivered ? item : 0, pack: delivered ? pack : 0, share, net, gst, paid: payable, payable, base: net, rate, comm, longDist: 0, pocket: 0, one: 0, pcc, canc, call: 0, sponsored: 0, bolt: 0,
      gstFee, totalFees, complaint: 0, gstDed: gst, tcs: 0, tds, taxes, netPayout: payable - totalFees - taxes, hasNet: true, hasRate: true, hasPayable: true,
      km: delivered ? kms[(i - 1) % kms.length] : 0, swOne: i % 5 === 0 ? 'no' : 'yes', pay: i % 7 === 0 ? 'cash' : 'upiintent', mfrAcc: i % 3 === 0 ? 'no' : 'yes', mfrPress: 'no'
    };
  };
  W.items.forEach((it, i) => {
    const coupon = W.coupons.includes(i) ? W.code : '';
    rows.push(mk(i + 1, W.days[i], it, 10, coupon, 24, W.mismatch && i === 5 ? (it + 10) * 0.26 : null, 'delivered'));
  });
  if (W.cancelled) rows.push(mk(W.items.length + 1, 3, 0, 0, '', 24, null, 'cancelled', 'RESTAURANT'));
  const breakup = { 'net payout': rows.reduce((s, r) => s + r.netPayout, 0), 'total customer paid': rows.reduce((s, r) => s + r.paid, 0) };
  const coupons = W.code ? [{ code: W.code, share: 100, orders: 0, discount: 0, threshold: 149, text: 'Use code ' + W.code + ' & get ' + Math.round(W.rate * 100) + '% off on orders above ₹149. Maximum discount: ₹50.' }] : [];
  const adjustments = W.ads ? [
    { kind: 'ad', type: 'Ads investment', start: '2026-08-04', end: '2026-08-10', total: 690, invoice: 'SAMPLE-INV-1', remarks: '' },
    { kind: 'ad', type: 'Ads investment', start: '2026-08-04', end: '2026-08-10', total: 690, invoice: 'SAMPLE-INV-2', remarks: '' }
  ] : [];
  return { rows, breakup, coupons, adjustments, platform: 'Swiggy' };
}
// A made-up Zomato report for the same week. Each week is scaled from week 1, to follow the Swiggy volume.
function makeZomatoSample(variant = 'week1') {
  const f = { week1: 1, week2: 1.1, week3: 0.65, week4: 0.9 }[variant] || 1;
  const sc = (v, min = 0) => Math.max(min, Math.round(v * f));
  return {
    platform: 'Zomato', delivered: sc(14, 1), sales: sc(3900), discount: sc(210), placed: sc(15, 1), offerOrders: sc(7), offerSales: sc(2050), swapped: false,
    adsSales: sc(3300), adsSpend: sc(80), impressions: sc(2600), adsImpressions: sc(2100), menuOpens: sc(190), cartBuilds: sc(36), newU: sc(7), repeatU: sc(6), lapsedU: sc(2),
    parts: { breakfast: 0, lunch: sc(3), snacks: sc(1), dinner: sc(6), late: sc(4) }, rating: 4.4, ratedOrders: sc(2), offlineHrs: sc(21), lostSales: sc(95)
  };
}

// ---------- loading files ----------
// A status line remembers its English template and values, so it can be shown again in another language.
function setStatus(id, key, ok, vars) { const s = $(id); s.dataset.k = key; s.dataset.v = JSON.stringify(vars || {}); s.textContent = t(key, vars); s.className = 'status ' + (ok ? 'ok' : ''); }
function refreshStatuses() { ['#swStatus', '#zStatus'].forEach(id => { const s = $(id); if (s && s.dataset.k) s.textContent = t(s.dataset.k, JSON.parse(s.dataset.v || '{}')); }); }
// The moment the owner brings a real file the demo goes away, so made-up numbers never sit beside real ones
// (before this, a real Swiggy file was compared with the demo's made-up Zomato numbers).
function leaveDemo() {
  if (!isSample) return;
  A = null; D = null; Z = null; isSample = false;
  setStatus('#swStatus', 'No Swiggy file', false); setStatus('#zStatus', 'No Zomato file', false);
}
function handleSwiggy(file) {
  const err = $('#err'); err.textContent = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => { err.textContent = t('Couldn’t read the Swiggy file. Try downloading it again.'); };
  reader.onload = e => {
    leaveDemo(); currentTab = 'analysis';
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      D = parseWorkbook(wb); A = analyze(D); isSample = false;
      setStatus('#swStatus', A.nDelivered === 1 ? 'Read {n} delivered order, {from} to {to}' : 'Read {n} delivered orders, {from} to {to}', true, { n: A.nDelivered, from: A.from, to: A.to });
      render();
    } catch (x) {
      A = null; D = null; setStatus('#swStatus', 'Not read', false);
      err.textContent = errText(SW_ERR, x, t('Couldn’t read that as a Swiggy payout statement (.xlsx).'));
      render();
    }
  };
  reader.readAsArrayBuffer(file);
}
function handleZomato(file) {
  const err = $('#err'); err.textContent = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => { err.textContent = t('Couldn’t read the Zomato file. Try downloading it again.'); };
  reader.onload = e => {
    leaveDemo();
    try {
      const bytes = new Uint8Array(e.target.result);
      const isExcel = (bytes[0] === 0x50 && bytes[1] === 0x4B) || (bytes[0] === 0xD0 && bytes[1] === 0xCF); // .xlsx or old .xls
      Z = isExcel ? parseZomato(XLSX.read(bytes, { type: 'array' })) : parseZomatoCsv(new TextDecoder().decode(bytes)); isSample = false;
      setStatus('#zStatus', Z.swapped ? 'Read {n} delivered orders. Two labels looked swapped, so I read them by checking the maths.' : (Z.delivered === 1 ? 'Read {n} delivered order' : 'Read {n} delivered orders'), true, { n: Z.delivered });
      render();
    } catch (x) {
      Z = null; setStatus('#zStatus', 'Not read', false);
      err.textContent = errText(Z_ERR, x, t('Couldn’t read that as the Zomato business report (.csv).'));
      render();
    }
  };
  reader.readAsArrayBuffer(file);
}

// ---------- building blocks (every visible word goes through t(), so it follows the chosen language) ----------
const note = (txt, cls = '') => el('p', { class: 'note ' + cls }, txt);
const metric = (label, value, emphasis = false) => el('div', { class: 'metric-row' }, el('span', {}, label), el('strong', { class: emphasis ? 'em' : '' }, value));
const card = (num, kicker, title, sub, body) => {
  const details = el('details', { class: 'info-card' });
  details.append(el('summary', {}, el('div', { class: 'card-num' }, '0' + num + ' · ' + t(kicker)), el('h2', {}, title), el('p', {}, t(sub)), el('span', { class: 'open' }, t('Open →'))));
  details.append(el('div', { class: 'card-body' }, body));
  return details;
};
const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const goTo = node => { if (node) node.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
// "4–9 Aug": the days of the week that the statement actually covers
function weekLabel(w) {
  const a = w.start < A.from ? A.from : w.start, e0 = addDays(w.start, 6), b = e0 > A.to ? A.to : e0;
  const [, m1, d1] = a.split('-').map(Number), [, m2, d2] = b.split('-').map(Number);
  const mo1 = t(MONTHS[m1 - 1]), mo2 = t(MONTHS[m2 - 1]);
  return m1 === m2 ? (d1 === d2 ? d1 + ' ' + mo1 : d1 + '–' + d2 + ' ' + mo1) : d1 + ' ' + mo1 + ' – ' + d2 + ' ' + mo2;
}
// A payout that covers a single week has one weekly bar, so show the days instead: delivered orders per day, counted from the order rows.
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function daysSection() {
  const counts = {};
  ((D && D.rows) || []).filter(r => r.status === 'delivered' && r.date).forEach(r => { const k = r.date.slice(0, 10); counts[k] = (counts[k] || 0) + 1; });
  const days = [];
  for (let d = A.from; d && d <= A.to && days.length < 14; d = addDays(d, 1)) days.push({ ymd: d, n: counts[d] || 0 });
  if (!days.length) return null;
  const max = Math.max(...days.map(x => x.n)) || 1, best = days.reduce((m, x) => (x.n > m.n ? x : m), days[0]);
  const label = x => t(DAY_NAMES[new Date(x.ymd + 'T00:00:00Z').getUTCDay()]) + ' ' + Number(x.ymd.slice(8));
  const chart = el('div', { class: 'mini-chart', 'aria-hidden': 'true' }, days.map(x => el('div', { class: 'chart-col' },
    el('strong', {}, String(x.n)), el('i', { style: 'height:' + Math.max(8, Math.round((90 * x.n) / max)) + 'px' }), el('span', {}, label(x)))));
  return el('section', { class: 'weeks-section', id: 'weeks' },
    el('div', { class: 'eyebrow' }, t('ORDERS · DAY BY DAY')),
    el('h2', {}, t('How many orders each day?')),
    el('p', { class: 'weeks-sub' }, t('Delivered orders per day. This payout covers one week ({range}), so the days are shown instead of weeks.', { range: weekLabel(A.ins.weeks[0]) })),
    chart,
    note(t('Busiest day: {day} with {n} orders. Save more payouts and the Memory page shows week against week.', { day: label(best), n: best.n })));
}
// Demo only: save the four made-up weeks in order, so the Memory page has a history to compare and graph.
function saveDemoHistory(button, status) {
  const keep = { D, A, Z, ADV, isSample };
  try {
    SAMPLE_ORDER.forEach(v => {
      D = makeSample(v); A = analyze(D); Z = makeZomatoSample(v); isSample = true;
      ADV = advise(A, Z, decide(A, Z, inp), inp, LANG);
      savePayout({}, true);
    });
  } finally { D = keep.D; A = keep.A; Z = keep.Z; ADV = keep.ADV; isSample = keep.isSample; }
  button.textContent = t('Saved four demo weeks'); button.disabled = true;
  if (status) status.textContent = t('Four made-up weeks are saved. Open Payout memory to see them side by side.');
}
// Orders per week, partial weeks marked, and the falling-orders line when the latest complete week is half or less of an earlier one.
function weeksSection(trend) {
  const W = (A.ins && A.ins.weeks) || [];
  if (!W.length || !A.from) return null;
  if (W.length === 1 && !W[0].partial) { const daily = daysSection(); if (daily) return daily; }
  const max = Math.max(...W.map(w => w.n)) || 1;
  // a bar per week; the table below has the same numbers, so the bars are decoration for screen readers
  const chart = el('div', { class: 'mini-chart', 'aria-hidden': 'true' }, W.map(w => el('div', { class: 'chart-col' + (w.partial ? ' part' : '') },
    el('strong', {}, String(w.n)), el('i', { style: 'height:' + Math.max(8, Math.round((90 * w.n) / max)) + 'px' }), el('span', {}, weekLabel(w)))));
  const rows = W.map(w => el('tr', { class: w.partial ? 'part' : '' },
    el('td', {}, el('span', { class: 'wk' }, weekLabel(w)), w.partial ? el('span', { class: 'wk-note' }, tn(w.days, 'partial week · {n} day', 'partial week · {n} days')) : null),
    el('td', {}, el('span', { class: 'wk-cell' }, el('span', { class: 'wk-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, (100 * w.n) / max) + '%' })), el('b', {}, String(w.n)))),
    el('td', {}, inr0(w.sales))));
  return el('section', { class: 'weeks-section', id: 'weeks' },
    el('div', { class: 'eyebrow' }, t('ORDERS · WEEK BY WEEK')),
    el('h2', {}, t('How many orders each week?')),
    el('p', { class: 'weeks-sub' }, t('Delivered orders per week in this statement. A partial week covers fewer days, so do not set it against a complete one.')),
    chart,
    el('div', { class: 'scroll' }, el('table', { class: 'week-table' }, el('thead', {}, el('tr', {}, el('th', {}, t('Week')), el('th', {}, t('Orders')), el('th', {}, t('Sales')))), el('tbody', {}, rows))),
    W.length === 1 ? note(t('This file covers one week, so there is nothing to compare yet.')) : null,
    trend ? el('p', { class: 'trend-line' }, trend.line) : null,
    trend ? note(trend.basis) : null);
}
// The break-even meter: drag to a guess, read what the coupons would earn. All maths is couponEarn() in core.js.
function meterBlock(sw) {
  const input = el('input', { type: 'range', id: 'meterRange', min: '0', max: '100', step: '1', value: String(meterGuess) });
  const out = el('p', { class: 'meter-out', id: 'meterOut' });
  const update = () => {
    const v = +input.value, earn = couponEarn(sw, v / 100), amt = Math.round(Math.abs(earn));
    meterGuess = v;
    out.textContent = amt === 0 ? t('If {v}% were extra, the coupons earn you about the same as no coupons.', { v })
      : t(earn > 0 ? 'If {v}% were extra, the coupons earn you about {amt} more than no coupons.' : 'If {v}% were extra, the coupons earn you about {amt} less than no coupons.', { v, amt: inr0(amt) });
    input.setAttribute('aria-valuetext', out.textContent);
  };
  input.addEventListener('input', update); update();
  return el('div', { class: 'meter', id: 'meter' },
    el('label', { class: 'meter-label', for: 'meterRange' }, t('How many of my coupon orders were extra?')),
    el('div', { class: 'meter-track' },
      sw.f != null ? el('div', { class: 'meter-mark', style: '--f:' + sw.f }, el('span', {}, t('Break-even {p}%', { p: pct0(100 * sw.f) })), el('i')) : null,
      input),
    el('div', { class: 'meter-scale' }, el('span', {}, '0%'), el('span', {}, '100%')),
    out,
    el('p', { class: 'meter-sub' }, sw.f != null
      ? t('Over this statement’s {n} coupon orders, after {fc}% food cost. “Extra” means orders that would not have come without the coupon.', { n: sw.n, fc: inp.fc })
      : t('At {fc}% food cost these coupon orders do not cover their ingredients, so no share of extra orders makes them pay.', { fc: inp.fc })));
}

// What the "Ask about my numbers" box sends to the AI: only figures computed from the statement, never order rows.
function questionPayload(question) {
  const d = decide(A, Z, inp), sw = d.swCoupon, F = insightFacts(A, Z);
  return { question, period: A.from + ' to ' + A.to, language: LANG, metrics: { currencyDenominator:100, distanceThresholdKm:4, percentScale:100,
    sales: A.gross, payout: A.kept, keptPer100: A.keptPct, deliveredOrders: A.nDelivered, foodCostPercent: inp.fc, zomatoCommissionPercent: inp.comm,
    couponOrders: sw.n, couponCost: sw.cost, couponBreakEvenExtraPercent: sw.f == null ? null : sw.f * 100,
    deductions: A.buckets.map(b => ({ label: b.label, amount: b.amt, percent: b.pct })),
    prices: (A.ins.prices || []).map(p => ({ itemPrice: p.price, orders: p.n, averagePayout: p.avgKept, keptPercent: p.keptPct })),
    orderValueBands: A.ins.value.filter(b => b.n).map(b => ({ fromPrice: b.min, belowPrice: b.max, orders: b.n, averagePayout: b.avgKept, keptPercent: b.keptPct })),
    daysOfWeek: A.ins.dow.filter(x => x.n).map(x => ({ day: DAY_NAMES[x.dow], orders: x.n, averagePayout: x.avgKept })),
    delivery: A.ins.distance ? { averageKm: A.ins.distance.avg, longestKm: A.ins.distance.max, overFourKmPercent: A.ins.distance.over4, ordersWithDistance: A.ins.distance.n } : null,
    couponVersusNone: F.coupon ? { couponOrders: F.coupon.with.n, couponAveragePayout: F.coupon.with.avgKept, couponKeptPercent: F.coupon.with.keptPct, otherOrders: F.coupon.without ? F.coupon.without.n : 0, otherAveragePayout: F.coupon.without ? F.coupon.without.avgKept : null, otherKeptPercent: F.coupon.without ? F.coupon.without.keptPct : null } : null,
    cancelledOrders: F.ops.cancelled.n,
    zomatoFunnel: F.zomato ? F.zomato.funnel.map(s => ({ step: s.key, count: s.v })) : null,
    weeks: (A.ins.weeks || []).map(w => ({ weekStarting: w.start, deliveredOrders: w.n, partialWeek: w.partial })),
    orderPeriods: A.ins.parts.map(p => ({ period: p.label, orders: p.n, sharePercent: p.share })),
    decisions: { coupon: ADV.d1.head, platform: ADV.d2.head, timing: ADV.d3.head }
  }};
}
function askNumbersSection() {
  const question = el('textarea', { id: 'numbersQuestion', rows: '2', maxlength: '500', placeholder: t('e.g. Which price point leaves me with more after delivery deductions?'), 'aria-label': t('Ask a question about this payout') });
  const answer = el('div', { class: 'answer-box', id: 'numbersAnswer', role: 'status', 'aria-live': 'polite' }, t('The answer will use the calculated figures above.'));
  const button = el('button', { class: 'button', type: 'button', onclick: () => askAboutNumbers(button, question, answer) }, t('Ask about my numbers'));
  return el('section', { class: 'ask-section', id: 'ask-numbers' },
    el('div', { class: 'ask-copy' }, el('div', { class: 'eyebrow' }, t('ASK ABOUT THIS PAYOUT')), el('h2', {}, t('One number unclear? Ask.')), el('p', {}, t('Answers use the figures above. Any unsupported number is rejected and the verified summary is shown instead.')),
      el('label', { class: 'sr-only', for: 'numbersQuestion' }, t('Your question')), question, button), answer,
    el('div', { class: 'ask-meta' }, t('AI answers are optional. Without a configured key, AFTER. shows a verified summary.')));
}

function verifiedAnswer(payload) {
  const m = payload.metrics;
  return t('AI is not connected here yet. For {period}, you kept {payout} from {sales} in sales ({kept} per ₹100) across {n} delivered orders. The detailed figures and estimates are shown above.', { period: payload.period, payout: inr(m.payout), sales: inr(m.sales), kept: pct1(m.keptPer100), n: m.deliveredOrders });
}
async function askAboutNumbers(button, question, answer) {
  const q = question.value.trim();
  if (!q) { answer.textContent = t('Type a question first.'); question.focus(); return; }
  button.disabled = true; answer.textContent = t('Checking the payout figures...');
  const payload = questionPayload(q), text = await askClaude('ask', payload);
  if (text) { const checked = checkText(text, { period: payload.period, metrics: payload.metrics }); answer.textContent = checked.ok ? text : verifiedAnswer(payload) + ' ' + t('An unsupported number was detected, so the verified summary is shown.'); }
  else answer.textContent = verifiedAnswer(payload);
  button.disabled = false;
}
async function copySummary(status) {
  const d = decide(A, Z, inp), trend = ordersTrend(A, LANG);
  const top = A.buckets.filter(b => b.key !== 'kept' && b.amt > 0).slice().sort((a, b) => b.amt - a.amt).slice(0, 3).map(b => t(b.label) + ': ' + inr(b.amt)).join('; ');
  const txt = [t('AFTER. payout summary | {from} to {to}', { from: A.from, to: A.to }),
    t('Sales: {sales} | payout: {payout} | kept: {kept} per ₹100', { sales: inr(A.gross), payout: inr(A.kept), kept: pct1(A.keptPct) }),
    t('Delivered orders: {n}', { n: A.nDelivered }), top ? t('Largest deductions: {list}', { list: top }) : '',
    d.swCoupon.f != null ? t('Coupon break-even: about {p}% of coupon orders would need to be genuinely extra.', { p: pct0(100 * d.swCoupon.f) }) : '',
    Z && d.z ? t('Zomato comparison: about {x} per order (estimate using {comm}% commission).', { x: inr0(d.z.per), comm: inp.comm }) : '',
    trend ? trend.line + ' ' + t('This is a signal to investigate, not a proven cause.') : '',
    t('Calculated from the payout statement. Zomato figures, if shown, are estimates.')].filter(Boolean).join('\n');
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(txt);
    else { const ta = el('textarea', { class: 'copy-buffer' }); ta.value = txt; document.body.append(ta); ta.select(); if (!document.execCommand('copy')) throw new Error('copy failed'); ta.remove(); }
    status.textContent = t('Summary copied. Paste it into WhatsApp or a message to your accountant.');
  } catch (e) { status.textContent = t('Could not copy automatically. Select and copy this summary:'); let fallback = status.parentElement.querySelector('.copy-manual'); if (!fallback) { fallback = el('textarea', { class: 'copy-manual', rows: '7', 'aria-label': t('Summary to copy') }); status.after(fallback); } fallback.value = txt; fallback.hidden = false; fallback.focus(); fallback.select(); }
}

const adviceBlock = a => el('div', { class: 'advice' },
  el('div', { class: 'advice-item' }, el('span', {}, t('DO')), el('strong', {}, a.do || t('No change needed.'))),
  el('div', { class: 'advice-item' }, el('span', {}, t('MEASURE')), el('strong', {}, a.measure || t('Track the result.'))),
  el('div', { class: 'advice-item' }, el('span', {}, t('STOP IF')), el('strong', {}, a.stop || t('The test fails.'))),
  a.basis ? el('p', { class: 'basis' }, a.basis) : null);

function metricSnapshot(source, decisions) {
  const weeks=(Date.parse(source.to+'T00:00:00Z')-Date.parse(source.from+'T00:00:00Z')+86400000)/604800000;
  const d=decisions||decide(source,Z,inp),sw=d.swCoupon;
  return {
    sales:source.gross,payout:source.kept,keptPer100:source.keptPct,keptPct:source.keptPct,deliveredOrders:source.nDelivered,
    ordersPerWeek:Math.round(source.nDelivered/Math.max(1,weeks)*10)/10,
    avgOrderPayout:source.nDelivered?source.kept/source.nDelivered:null,
    couponOrders:sw.n,couponDiscount:sw.cost,couponBreakEvenExtraPercent:sw.f==null?null:100*sw.f,
    couponShare:source.ins.coupon.share,dinnerShare:(source.ins.parts.find(p=>p.label.toLowerCase().includes('dinner'))||{}).share||null,
    avgDeliveryKm:source.ins.distance?source.ins.distance.avg:null,
    deductions:source.buckets.map(b=>({label:b.label,amount:b.amt,percent:b.pct})),
    pricePoints:(source.ins.prices||[]).map(p=>({price:p.price,orders:p.n,averagePayout:p.avgKept,keptPer100:p.keptPct})),
    delivery:source.ins.distance?{averageKm:source.ins.distance.avg,longestKm:source.ins.distance.max,overFourKmPercent:source.ins.distance.over4,orders:source.ins.distance.n}:null,
    weeks:(source.ins.weeks||[]).map(w=>({start:w.start,orders:w.n,sales:w.sales,partial:w.partial,days:w.days})),
    orderPeriods:source.ins.parts.map(p=>({period:p.label,orders:p.n,share:p.share})),
    zomato:Z&&d.z?{sales:Z.sales,kept:d.z.kept,keptPer100:d.z.keptPct,deliveredOrders:Z.delivered,perOrder:d.z.per,discount:Z.discount,commissionPercent:inp.comm,ads:Z.adsSpend}:null
  };
}
function savedProfile() {
  try { return JSON.parse(localStorage.getItem('after_profile')||'null')||{restaurant:'',outlet:'',platform:'Swiggy'}; }
  catch(e) { return {restaurant:'',outlet:'',platform:'Swiggy'}; }
}
function outcomeFor(test, record) {
  const startedOn=test&&(test.startedOn||(test.startedAt?test.startedAt.slice(0,10):''));
  if(!test||test.outcome||test.baselinePeriod===record.period||(startedOn&&record.from<=startedOn))return false;
  const before=test.baseline&&test.baseline[test.watch],after=record.metrics&&record.metrics[test.watch],target=test.target&&Number(test.target.value);
  let outcome='inconclusive';
  if(!test.baselineIsDemo&&Number.isFinite(target)&&Number.isFinite(after))
    outcome=test.target.direction==='atMost'?(after<=target?'worked':'did-not-work'):(after>=target?'worked':'did-not-work');
  const show=v=>v==null?'no data':Number(v).toFixed(1);
  test.outcome=outcome;test.completedAt=new Date().toISOString();test.nextPayout={from:record.from,to:record.to,period:record.period,observed:after==null?null:after};
  test.evidenceData={baseline:test.baselinePeriod,next:record.period,label:test.watchLabel,before:before==null?null:before,after:after==null?null:after,target:test.target&&Number.isFinite(Number(test.target.value))?Number(test.target.value):null,direction:test.target?test.target.direction:null};
  test.evidence=test.baselineIsDemo?'The starting payout was made-up demo data, so AFTER. did not score the result.':
    'Baseline '+test.baselinePeriod+': '+test.watchLabel+' '+show(before)+'. Next payout '+record.period+': '+test.watchLabel+' '+show(after)+'. '+(test.target?'Target: '+(test.target.direction==='atMost'?'at most ':'at least ')+show(target)+'.':'No target was set, so the result is inconclusive.');
  localStorage.setItem('after_test',JSON.stringify(test));
  return true;
}
function savePayout(button, skipTest) {
  const d=decide(A,Z,inp),test=skipTest?null:JSON.parse(localStorage.getItem('after_test')||'null'),period=A.from+' to '+A.to,all=adviceAll(d),en=advise(A,Z,d,inp,'English');
  const record={id:Date.now(),saved:new Date().toISOString(),from:A.from,to:A.to,period,sourcePlatform:'Swiggy',comparisonPlatform:Z?'Zomato estimate':null,
    profile:savedProfile(),isSample,metrics:metricSnapshot(A,d),inputAssumptions:{foodCostPercent:inp.fc,zomatoCommissionPercent:inp.comm},
    decision:test&&!test.outcome?test.action:all.English.decision,decisionL10n:{Hindi:all.Hindi.decision,Kannada:all.Kannada.decision},decisionDetails:{coupon:en.d1.do,platform:en.d2.do,timing:en.d3.do},
    testId:test&&!test.outcome?test.id:null,evidence:{deductions:A.buckets.map(b=>({label:b.label,amount:b.amt,percent:b.pct})),arithmeticChecks:A.checks.map(c=>({label:c.label,ok:c.ok===c.tot}))}};
  const scored=outcomeFor(test,record),history=JSON.parse(localStorage.getItem('after_payouts')||'[]');
  const next=[record,...history.filter(x=>x.from!==record.from||x.to!==record.to)].slice(0,50);
  localStorage.setItem('after_payouts',JSON.stringify(next));
  button.textContent=scored?'Saved - test outcome recorded':'Saved';button.disabled=true;
}

// The advice in every language, so pages that do not load core.js (What to do, Memory) can still show it in the language the owner chose.
function adviceAll(d) {
  const out = {};
  Object.keys(I18N_LANGS).forEach(l => { const a = advise(A, Z, d, inp, l), tr = ordersTrend(A, l); out[l] = { couponHead: a.d1.head, platformHead: a.d2.head, timingHead: a.d3.head, decision: a.d1.do || a.d1.head, trendLine: tr ? tr.line : null }; });
  return out;
}

function render() {
  const root = $('#board'); const openCard = $('#card-coupons'); if (openCard) couponOpen = openCard.open; root.replaceChildren();
  if (!A) { root.hidden = !Z; if (Z) root.append(note(t('Add the Swiggy payout too — the comparison needs both.'))); return; }
  root.hidden = false;
  const d = decide(A, Z, inp), adv = ADV = advise(A, Z, d, inp, LANG), trend = ordersTrend(A, LANG);
  const segs = A.buckets.filter(b => b.amt > .005 && b.pct > 0);
  const stack = el('div', { class: 'money-bar' }, ...segs.map(b => el('i', { class: 'k-' + b.key, style: 'flex-grow:' + b.pct, title: t(b.label) })));
  // Keep the current result available to the What to do page without storing order rows. The headings are kept in all three languages.
  const currentMetrics = metricSnapshot(A, d), all = adviceAll(d), en = all.English;
  localStorage.setItem('after_current', JSON.stringify({
    from: A.from, to: A.to, isSample, keptPct: A.keptPct, gross: A.gross, kept: A.kept, orders: A.nDelivered,
    couponShare: A.ins.coupon.share, parts: A.ins.parts.slice(0, 6).map(x => ({ label: x.label, n: x.n, share: x.share })),
    swiggyPer: d.swPer, zomatoPer: Z && d.z ? d.z.per : null, commission: inp.comm, decision: en.decision,
    couponHead: en.couponHead, platformHead: en.platformHead, timingHead: en.timingHead, heads: all,
    metrics: currentMetrics, trendLine: en.trendLine
  }));
  root.append(el('section', { class: 'result-hero' },
    el('div', { class: 'eyebrow' }, t('YOUR PAYOUT') + ' · ' + A.from + ' → ' + A.to),
    el('h1', {}, adv.lead.head),
    el('p', { class: 'result-sub' }, tn(A.nDelivered, '{n} delivered order', '{n} delivered orders') + ' · ' + t('sales {x}', { x: inr0(A.gross) }) + ' · ' + t('payout {x}', { x: inr(A.kept) })),
    el('div', { class: 'breakup-head' }, el('div', { class: 'eyebrow' }, t('BREAKUP · WHERE THE MONEY WENT')), el('p', {}, t('This is the payout in one line: what you kept, and everything deducted before it reached you.'))),
    stack,
    el('div', { class: 'bar-legend' }, ...segs.map(b => el('div', { class: 'legend-item' }, el('i', { class: 'legend-swatch k-' + b.key }), el('span', {}, t(b.label) + ' · ' + pct1(b.pct) + '%')))),
    isSample ? el('div', { class: 'demo-pill' }, t('DEMO MODE · made-up numbers')) : null,
    el('div', { class: 'ai-status', id: 'aiStatus' }, t('Verified from the numbers in your payout.'))
  ));
  const weeksEl = weeksSection(trend); if (weeksEl) root.append(weeksEl);
  root.append(insightsSection());
  const sw = d.swCoupon;
  const d1body = el('div', {}, metric(t('Coupon orders'), t('{n} of {of} ({p}%)', { n: sw.n, of: A.nDelivered, p: pct0(A.ins.coupon.share) })), metric(t('Coupon cost'), inr(sw.cost) + ' · ' + t('{p}% of sales', { p: pct1((100 * sw.cost) / A.gross) })), metric(t('Keep per coupon order'), sw.perCoupon != null ? inr(sw.perCoupon) : '—'), sw.f != null ? metric(t('Break-even threshold'), t('{p}% genuinely extra', { p: pct0(100 * sw.f) }), true) : null, el('p', { class: 'explain-note' }, t('The statement cannot tell us which coupon orders were truly incremental. The threshold tells you what must be true for the discount to pay for itself.')), sw.n ? meterBlock(sw) : null);
  const d2body = el('div', {}, Z ? metric(t('Swiggy / order'), inr0(d.swPer), true) : metric(t('Zomato report'), t('Not added')), Z ? metric(t('Zomato / order'), '~' + inr0(d.z.per) + ' ' + t('estimate'), true) : null, Z ? metric(t('Commission used'), inp.comm + '% · ' + t('your input')) : null, Z && d.z.cStar != null ? metric(t('Break-even commission'), pct0(d.z.cStar) + '%') : null);
  const d3body = el('div', {}, ...A.ins.parts.slice(0, 5).map(p => metric(t(p.label), tn(p.n, '{n} order', '{n} orders') + ' · ' + pct0(p.share) + '%')));
  const c1 = card(1, 'COUPONS', adv.d1.head, 'Is the discount actually earning its keep?', d1body); c1.id = 'card-coupons'; c1.open = couponOpen;
  root.append(el('section', { class: 'cards-section' }, el('div', { class: 'section-head' }, el('div', { class: 'eyebrow' }, t('READ THE PAYOUT')), el('h2', {}, t('Three things worth knowing.'))),
    el('div', { class: 'card-grid' }, c1, card(2, 'PLATFORMS', Z ? adv.d2.head : t('Compare the two apps'), 'Which platform leaves more after the costs?', d2body), card(3, 'TIMING', adv.d3.head, 'When is demand strongest?', d3body))));
  root.append(el('section', { class: 'action-section' }, el('div', { class: 'section-head' }, el('div', { class: 'eyebrow' }, t('NEXT · ACTIONS')), el('h2', {}, t('Now decide what to test.')), el('p', {}, t('The breakdown stays here. The deeper recommendations live on their own page so this screen stays easy to scan.'))), el('a', { class: 'button', href: '/actions.html' }, t('See what to do →'))));
  root.append(flagsSection());
  root.append(askNumbersSection());
  const copyStatus = el('p', { class: 'copy-status', role: 'status' });
  const copyBtn = el('button', { class: 'button ghost', type: 'button', onclick: () => copySummary(copyStatus) }, t('Copy a summary'));
  const saveBtn = el('button', { class: 'button', type: 'button', onclick: e => savePayout(e.currentTarget) }, t('Save this payout'));
  const demoHistoryBtn = isSample ? el('button', { class: 'button ghost', type: 'button', onclick: e => saveDemoHistory(e.currentTarget, copyStatus) }, t('Save all four demo weeks')) : null;
  root.append(el('section', { class: 'memory-section' }, el('div', { class: 'memory-copy' }, el('div', { class: 'eyebrow' }, t('THE MEMORY LOOP')), el('h2', {}, t('The next payout should answer what happened last time.')), el('p', {}, t('Save this result. On the next run, the prototype can compare the period and decision in this browser. No order rows are stored.'))), el('div', { class: 'memory-actions' }, copyBtn, saveBtn, demoHistoryBtn, copyStatus, el('a', { class: 'button ghost', href: '/insights.html' }, t('Open payout memory →')))));
  root.append(note(t('Files are read in your browser. Every figure is calculated by code. AI, when switched on, only answers questions and drafts the message to Swiggy.'), 'fine'));
  if (isSample) {
    const steps = [
      ['See the payout', () => { showTab('analysis'); goTo($('.result-hero')); }],
      ['Read the decisions', () => { showTab('analysis'); goTo($('.cards-section')); }],
      ['Keep the memory', () => { showTab('insights'); goTo($('.memory-section')); }],
      ['Test your own guess', () => { showTab('analysis'); c1.open = true; couponOpen = true; goTo($('#meter')); const m = $('#meterRange'); if (m) m.focus({ preventScroll: true }); }]
    ];
    const btns = steps.map(([label, fn], i) => el('button', { type: 'button', onclick: e => { btns.forEach(b => b.removeAttribute('aria-current')); e.currentTarget.setAttribute('aria-current', 'step'); fn(); } }, el('b', {}, String(i + 1)), t(label)));
    root.prepend(el('nav', { class: 'demo-guide', 'aria-label': t('Demo steps') }, el('span', { class: 'dg-label' }, t('Demo guide')), ...btns));
  }
  setupProductTabs();
}

// The three views of a payout: Analysis, Flags, Insights. One switcher for the sidebar, the tab bar and the demo guide.
let currentTab = 'analysis';
const TAB_GROUPS = { analysis: ['result-hero', 'cards-section', 'action-section'], flags: ['flags-section', 'ask-section'], insights: ['weeks-section', 'insights-section', 'memory-section'] };
function showTab(tab) {
  if (!TAB_GROUPS[tab]) tab = 'analysis';
  currentTab = tab;
  const root = $('#board'); if (root) {
    root.querySelectorAll('.product-tab').forEach(x => { const on = x.dataset.tab === tab; x.classList.toggle('active', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
    root.querySelectorAll('[data-tab-panel]').forEach(x => { const on = x.dataset.tabPanel === tab; x.classList.toggle('active', on); x.hidden = !on; });
  }
  document.querySelectorAll('[data-workspace-tab]').forEach(x => { const on = x.dataset.workspaceTab === tab; x.classList.toggle('active', on); if (on) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
}
function setupProductTabs() {
  const root = $('#board'); if (!root) return;
  Object.entries(TAB_GROUPS).forEach(([tab, classes]) => classes.forEach(cls => root.querySelectorAll('.' + cls).forEach(node => { node.dataset.tabPanel = tab; })));
  const tabs = el('nav', { class: 'product-tabs', 'aria-label': t('Payout workspace') }, ...Object.keys(TAB_GROUPS).map(tab => {
    const b = el('button', { type: 'button', class: 'product-tab', 'data-tab': tab, 'aria-selected': 'false' }, t(tab[0].toUpperCase() + tab.slice(1)));
    b.addEventListener('click', () => showTab(tab));
    return b;
  }));
  root.prepend(tabs);
  showTab(currentTab); // a redraw (food cost, language) keeps the view the owner was on
}
// The optional AI helper. The prompt is built on the server; only computed figures are sent. `toLang` is the language of the answer.
async function askClaude(task, payload, toLang) {
  try {
    const r = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, lang: toLang || LANG, payload }), signal: AbortSignal.timeout(task === 'ask' ? 23000 : 12000) });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j.text === 'string' && j.text ? j.text : null;
  } catch (e) { return null; }
}
const whyPlain = c => c.bad.length ? t('AI wording had an unsupported number ({n}), so the verified plain version is shown.', { n: c.bad[0] })
  : c.banned ? t('AI wording used a banned term (“{w}”), so the verified plain version is shown.', { w: c.banned })
  : t('AI wording left something out, so the verified plain version is shown.');
function draftContext(i) { if (i < 0 || !A.flags[i]) return { title: 'General question about this payout statement', why: '', ask: '', orders: [], lines: [] }; return A.flags[i]; }
function fallbackDraft(f) { return `Subject: Request for explanation, payout ${A.from} to ${A.to}

Hello,

I run [Restaurant name] (Restaurant ID: [Restaurant ID]). While reviewing our payout statement for ${A.from} to ${A.to}, I’d like to understand the following:

• ${f.neutral || f.title}
${f.orders.length ? '  Order IDs: ' + f.orders.slice(0, 12).join(', ') + (f.orders.length > 12 ? ' and ' + (f.orders.length - 12) + ' more' : '') + '\n' : ''}
Could you please confirm the basis for these amounts and let me know in writing whether they are correct?

Thank you,
[Your name]
[Phone]`; }
// The message goes to Swiggy support, so it is always written in English.
async function doDraft() {
  const out = $('#draftOut'), btn = $('#draftBtn'), why = $('#draftNote'); btn.disabled = true; out.value = t('Drafting…'); why.textContent = '';
  const f = draftContext(parseInt($('#flagSel').value, 10));
  const payload = { period: A.from + ' to ' + A.to, item: f.neutral || f.title, detail: f.why, notes: f.lines || [], orders: f.orders.slice(0, 15), more_orders: Math.max(0, f.orders.length - 15) };
  const text = await askClaude('draft', payload, 'English');
  const c = text ? checkText(text, payload) : null;
  if (c && c.ok) out.value = text; else { out.value = fallbackDraft(f); why.textContent = c ? whyPlain(c) : t('AI isn’t available right now, so this is a plain verified template.'); }
  btn.disabled = false;
}
function copyDraft() { const ta = $('#draftOut'); ta.select(); try { navigator.clipboard.writeText(ta.value); } catch (e) { document.execCommand('copy'); } }

document.querySelectorAll('[data-workspace-tab]').forEach(b => b.addEventListener('click', () => { if (!A) return; showTab(b.dataset.workspaceTab); goTo($('.product-tabs')); }));
showTab('analysis');
$('#sampleSet')?.addEventListener('change', () => { if (isSample) $('#sampleBtn').click(); });
$('#swFile').addEventListener('change', e => handleSwiggy(e.target.files[0]));
$('#zFile').addEventListener('change', e => handleZomato(e.target.files[0]));
// the Sample menu picks which made-up week to run; changing it re-runs the demo, but never replaces real files
$('#sampleBtn').addEventListener('click', () => { currentTab = 'analysis'; const wk = ($('#sampleSet') || {}).value || 'week1'; D = makeSample(wk); A = analyze(D); Z = makeZomatoSample(wk); isSample = true; $('#err').textContent = ''; render(); goTo($('#board')); });
['fc', 'comm'].forEach(id => $('#' + id).addEventListener('input', e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0 && v < 100) { inp[id] = v; if (A) render(); } }));
// a new language: show the status lines again and redraw the board (the static page text is handled by i18n.js)
window.addEventListener('after:lang', () => { refreshStatuses(); if (A) render(); });
