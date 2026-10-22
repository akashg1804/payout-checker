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

let A = null, D = null, Z = null, isSample = false, ADV = null, lang = 'English';
let meterGuess = 50, couponOpen = false; // the slider and the coupon card keep their state when the page redraws
const inp = { fc: 35, comm: 20 };
const LANG_NAMES = { English: 'English', Hindi: 'हिन्दी', Kannada: 'ಕನ್ನಡ' };
const LABELS = {
  English: { do: 'Do', measure: 'Measure', stop: 'Stop if' },
  Hindi: { do: 'क्या करें', measure: 'कैसे मापें', stop: 'कब रोकें' },
  Kannada: { do: 'ಏನು ಮಾಡಬೇಕು', measure: 'ಹೇಗೆ ಅಳೆಯಬೇಕು', stop: 'ಯಾವಾಗ ನಿಲ್ಲಿಸಬೇಕು' }
};
const SW_ERR = {
  LOOKS_LIKE_ZOMATO: () => 'This looks like the Zomato business report. Put it in the Zomato box instead.',
  NO_ORDER_SHEET: () => 'That doesn’t look like a Swiggy payout statement: there’s no “Order Level” sheet.',
  NO_HEADER: () => 'Found the “Order Level” sheet, but not its header row (the one with “Order ID”).',
  MISSING_COLUMNS: d => 'The “Order Level” sheet is missing ' + (d || []).join(', ') + '. Swiggy may have renamed the column.',
  EMPTY: () => 'This statement has no delivered orders, so there’s nothing to work out.',
  TOTALS_DONT_RECONCILE: d => 'This statement’s totals don’t add up: ' + inr(Math.max(Math.abs(d.unexplained), Math.abs(d.rowGap))) +
    ' can’t be matched to any charge. The file may be incomplete or a format this tool doesn’t know yet. Try downloading it again.'
};
const Z_ERR = {
  LOOKS_LIKE_SWIGGY: () => 'This looks like the Swiggy payout statement. Put it in the Swiggy box instead.',
  NO_METRICS: () => 'That doesn’t look like the Zomato business report (a CSV with Metric rows and monthly values).',
  EMPTY: () => 'This Zomato report has no delivered orders or sales, so there’s nothing to compare.'
};
const errText = (map, x, dflt) => (map[x && x.code] ? map[x.code](x.detail) : dflt) + ' Nothing was calculated from it.';

// ---------- made-up sample data (clearly labelled) ----------
function makeSample() {
  const items = [249, 289, 149, 349, 199, 449, 179, 299, 249, 399, 149, 229, 329, 189, 269, 159, 349, 219, 399, 149, 279, 239, 319];
  const hours = [20, 21, 0, 22, 13, 19, 23, 20, 1, 21, 12, 22, 19, 20];
  // 6 orders in the partial first week (Aug 4-9), then 8, 6 and 3 in complete weeks, so the falling-orders line shows
  const days = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15, 16, 17, 18, 19, 20, 22, 23, 24, 27, 30];
  const kms = [3.1, 4.7, 2.8, 5.2, 3.6, 4.1, 6.3, 3.3, 4.9, 2.9, 3.8, 4.4, 5.6, 3.0];
  const rows = [];
  const mk = (i, item, pack, coupon, rate, commOverride, status, cancelledBy) => {
    const delivered = status === 'delivered';
    const share = delivered && coupon ? Math.min(Math.round(item * 0.2 * 100) / 100, 50) : 0;
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
      id: '99000000' + String(i).padStart(7, '0'), date: '2026-08-' + String(days[(i - 1) % days.length]).padStart(2, '0') + ' ' + hh + ':10:00', status, cancelledBy: cancelledBy || '', coupon: delivered ? coupon : '',
      item: delivered ? item : 0, pack: delivered ? pack : 0, share, net, gst, paid: payable, payable, base: net, rate, comm, longDist: 0, pocket: 0, one: 0, pcc, canc, call: 0, sponsored: 0, bolt: 0,
      gstFee, totalFees, complaint: 0, gstDed: gst, tcs: 0, tds, taxes, netPayout: payable - totalFees - taxes, hasNet: true, hasRate: true, hasPayable: true,
      km: delivered ? kms[(i - 1) % kms.length] : 0, swOne: i % 5 === 0 ? 'no' : 'yes', pay: i % 7 === 0 ? 'cash' : 'upiintent', mfrAcc: i % 3 === 0 ? 'no' : 'yes', mfrPress: 'no'
    };
  };
  items.forEach((it, i) => {
    const coupon = (i % 3 === 0 || it === 149) ? 'WELCOME20' : '';
    rows.push(mk(i + 1, it, 10, coupon, 24, i === 5 ? ((it + 10) * 0.26) : null, 'delivered'));
  });
  rows.push(mk(items.length + 1, 0, 0, '', 24, null, 'cancelled', 'RESTAURANT'));
  const breakup = { 'net payout': rows.reduce((s, r) => s + r.netPayout, 0), 'total customer paid': rows.reduce((s, r) => s + r.paid, 0) };
  const coupons = [{ code: 'WELCOME20', share: 100, orders: 0, discount: 0, threshold: 149, text: 'Use code WELCOME20 & get 20% off on orders above \u20B9149. Maximum discount: \u20B950.' }];
  const adjustments = [
    { kind: 'ad', type: 'Ads investment', start: '2026-08-05', end: '2026-08-12', total: 690, invoice: 'SAMPLE-INV-1', remarks: '' },
    { kind: 'ad', type: 'Ads investment', start: '2026-08-05', end: '2026-08-12', total: 690, invoice: 'SAMPLE-INV-2', remarks: '' }
  ];
  return { rows, breakup, coupons, adjustments, platform: 'Swiggy' };
}
function makeZomatoSample() {
  return {
    platform: 'Zomato', delivered: 60, sales: 17200, discount: 910, placed: 63, offerOrders: 30, offerSales: 8900, swapped: false,
    adsSales: 14800, adsSpend: 340, impressions: 11000, adsImpressions: 8800, menuOpens: 800, cartBuilds: 150, newU: 30, repeatU: 26, lapsedU: 7,
    parts: { breakfast: 1, lunch: 12, snacks: 4, dinner: 26, late: 20 }, rating: 4.4, ratedOrders: 9, offlineHrs: 90, lostSales: 400
  };
}

// ---------- loading files ----------
function setStatus(id, text, ok) { const s = $(id); s.textContent = text; s.className = 'status ' + (ok ? 'ok' : ''); }
function handleSwiggy(file) {
  const err = $('#err'); err.textContent = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => { err.textContent = 'Couldn\u2019t read the Swiggy file. Try downloading it again.'; };
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      D = parseWorkbook(wb); A = analyze(D); isSample = false;
      setStatus('#swStatus', 'Read ' + plural(A.nDelivered, 'delivered order', 'delivered orders') + ', ' + A.from + ' to ' + A.to, true);
      render();
    } catch (x) {
      A = null; D = null; setStatus('#swStatus', 'Not read', false);
      err.textContent = errText(SW_ERR, x, 'Couldn\u2019t read that as a Swiggy payout statement (.xlsx).');
      render();
    }
  };
  reader.readAsArrayBuffer(file);
}
function handleZomato(file) {
  const err = $('#err'); err.textContent = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => { err.textContent = 'Couldn\u2019t read the Zomato file. Try downloading it again.'; };
  reader.onload = e => {
    try {
      const bytes = new Uint8Array(e.target.result);
      const isExcel = (bytes[0] === 0x50 && bytes[1] === 0x4B) || (bytes[0] === 0xD0 && bytes[1] === 0xCF); // .xlsx or old .xls
      Z = isExcel ? parseZomato(XLSX.read(bytes, { type: 'array' })) : parseZomatoCsv(new TextDecoder().decode(bytes)); isSample = false;
      setStatus('#zStatus', 'Read ' + plural(Z.delivered, 'delivered order', 'delivered orders') + (Z.swapped ? '. Two labels looked swapped, so I read them by checking the maths.' : ''), true);
      render();
    } catch (x) {
      Z = null; setStatus('#zStatus', 'Not read', false);
      err.textContent = errText(Z_ERR, x, 'Couldn\u2019t read that as the Zomato business report (.csv).');
      render();
    }
  };
  reader.readAsArrayBuffer(file);
}

// ---------- compact decision UI ----------
const note = (t, cls='') => el('p', {class:'note '+cls}, t);
const metric = (label,value,emphasis=false) => el('div',{class:'metric-row'},el('span',{},label),el('strong',{class:emphasis?'em':''},value));
const card = (num, kicker, title, sub, body) => {
  const details=el('details',{class:'info-card'});
  details.append(el('summary',{},el('div',{class:'card-num'},'0'+num+' · '+kicker),el('h2',{},title),el('p',{},sub),el('span',{class:'open'},'Open →')));
  details.append(el('div',{class:'card-body'},body));
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
  return m1 === m2 ? (d1 === d2 ? d1 + ' ' + MONTHS[m1 - 1] : d1 + '–' + d2 + ' ' + MONTHS[m1 - 1]) : d1 + ' ' + MONTHS[m1 - 1] + ' – ' + d2 + ' ' + MONTHS[m2 - 1];
}
// Orders per week, partial weeks marked, and the falling-orders line when the latest complete week is half or less of an earlier one.
function weeksSection(trend) {
  const W = (A.ins && A.ins.weeks) || [];
  if (!W.length || !A.from) return null;
  const max = Math.max(...W.map(w => w.n)) || 1;
  const rows = W.map(w => el('tr', { class: w.partial ? 'part' : '' },
    el('td', {}, el('span', { class: 'wk' }, weekLabel(w)), w.partial ? el('span', { class: 'wk-note' }, 'partial week · ' + plural(w.days, 'day', 'days')) : null),
    el('td', {}, el('span', { class: 'wk-cell' }, el('span', { class: 'wk-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, (100 * w.n) / max) + '%' })), el('b', {}, String(w.n)))),
    el('td', {}, inr0(w.sales))));
  return el('section', { class: 'weeks-section', id: 'weeks' },
    el('div', { class: 'eyebrow' }, 'ORDERS · WEEK BY WEEK'),
    el('h2', {}, 'How many orders each week?'),
    el('p', { class: 'weeks-sub' }, 'Delivered orders per week in this statement. A partial week covers fewer days, so do not set it against a complete one.'),
    el('div', { class: 'scroll' }, el('table', { class: 'week-table' }, el('thead', {}, el('tr', {}, el('th', {}, 'Week'), el('th', {}, 'Orders'), el('th', {}, 'Sales'))), el('tbody', {}, rows))),
    W.length === 1 ? note('This file covers one week, so there is nothing to compare yet.') : null,
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
    out.textContent = amt === 0 ? 'If ' + v + '% were extra, the coupons earn you about the same as no coupons.'
      : 'If ' + v + '% were extra, the coupons earn you about ' + inr0(amt) + (earn > 0 ? ' more' : ' less') + ' than no coupons.';
    input.setAttribute('aria-valuetext', out.textContent);
  };
  input.addEventListener('input', update); update();
  return el('div', { class: 'meter', id: 'meter' },
    el('label', { class: 'meter-label', for: 'meterRange' }, 'How many of my coupon orders were extra?'),
    el('div', { class: 'meter-track' },
      sw.f != null ? el('div', { class: 'meter-mark', style: '--f:' + sw.f }, el('span', {}, 'Break-even ' + pct0(100 * sw.f) + '%'), el('i')) : null,
      input),
    el('div', { class: 'meter-scale' }, el('span', {}, '0%'), el('span', {}, '100%')),
    out,
    el('p', { class: 'meter-sub' }, sw.f != null
      ? 'Over this statement’s ' + plural(sw.n, 'coupon order', 'coupon orders') + ', after ' + inp.fc + '% food cost. “Extra” means orders that would not have come without the coupon.'
      : 'At ' + inp.fc + '% food cost these coupon orders do not cover their ingredients, so no share of extra orders makes them pay.'));
}

function priceDistanceSection() {
  const prices = A.ins.prices || [], distance = A.ins.distance;
  const priceRows = prices.map(p => el('div', { class: 'price-row' },
    el('div', {}, el('strong', {}, inr0(p.price)), el('span', {}, plural(p.n, 'order', 'orders'))),
    el('div', { class: 'price-values' }, el('span', {}, 'Avg. kept'), el('strong', {}, inr0(p.avgKept))),
    el('div', { class: 'price-values' }, el('span', {}, 'Kept / \u20B9100'), el('strong', {}, pct1(p.keptPct) + '%'))));
  const distanceCard = distance
    ? el('div', { class: 'distance-card' }, el('div', { class: 'eyebrow' }, 'DELIVERY DISTANCE'), el('strong', { class: 'distance-number' }, distance.avg.toFixed(1) + ' km'), el('p', {}, 'Average across ' + plural(distance.n, 'order', 'orders') + ' with distance data.'), el('div', { class: 'distance-stats' }, metric('Longest', distance.max.toFixed(1) + ' km'), metric('Over 4 km', pct0(distance.over4) + '% of orders')))
    : el('div', { class: 'distance-card' }, el('div', { class: 'eyebrow' }, 'DELIVERY DISTANCE'), el('p', {}, 'This statement has no usable delivery-distance data.'));
  return el('section', { class: 'context-section', id: 'order-economics' },
    el('div', { class: 'section-head' }, el('div', { class: 'eyebrow' }, 'ORDER ECONOMICS'), el('h2', {}, 'Price changes what you keep.'), el('p', {}, 'Higher order value does not automatically mean higher profit. These payout amounts are before food cost.')),
    el('div', { class: 'context-grid' }, el('div', { class: 'price-card' }, el('div', { class: 'eyebrow' }, 'PRICE POINTS'), prices.length ? el('div', { class: 'price-list' }, ...priceRows) : note('No item price points were available in this statement.'), el('p', { class: 'note' }, 'Average kept is the payout per order after statement deductions; it does not subtract ingredients or other operating costs.')), distanceCard));
}
function questionPayload(question) {
  const d = decide(A, Z, inp), sw = d.swCoupon;
  return { question, period: A.from + ' to ' + A.to, metrics: { currencyDenominator:100, distanceThresholdKm:4, percentScale:100,
    sales: A.gross, payout: A.kept, keptPer100: A.keptPct, deliveredOrders: A.nDelivered, foodCostPercent: inp.fc, zomatoCommissionPercent: inp.comm,
    couponOrders: sw.n, couponCost: sw.cost, couponBreakEvenExtraPercent: sw.f == null ? null : sw.f * 100,
    deductions: A.buckets.map(b => ({ label: b.label, amount: b.amt, percent: b.pct })),
    prices: (A.ins.prices || []).map(p => ({ itemPrice: p.price, orders: p.n, averagePayout: p.avgKept, keptPercent: p.keptPct })),
    delivery: A.ins.distance ? { averageKm: A.ins.distance.avg, longestKm: A.ins.distance.max, overFourKmPercent: A.ins.distance.over4, ordersWithDistance: A.ins.distance.n } : null,
    weeks: (A.ins.weeks || []).map(w => ({ weekStarting: w.start, deliveredOrders: w.n, partialWeek: w.partial })),
    orderPeriods: A.ins.parts.map(p => ({ period: p.label, orders: p.n, sharePercent: p.share })),
    decisions: { coupon: ADV.d1.head, platform: ADV.d2.head, timing: ADV.d3.head }
  }};
}
function askNumbersSection() {
  const question = el('textarea', { id: 'numbersQuestion', rows: '2', maxlength: '500', placeholder: 'e.g. Which price point leaves me with more after delivery deductions?', 'aria-label': 'Ask a question about this payout' });
  const answer = el('div', { class: 'answer-box', id: 'numbersAnswer', role: 'status', 'aria-live': 'polite' }, 'The answer will use the calculated figures above.');
  const button = el('button', { class: 'button', type: 'button', onclick: () => askAboutNumbers(button, question, answer) }, 'Ask about my numbers');
  return el('section', { class: 'ask-section', id: 'ask-numbers' },
    el('div', { class: 'ask-copy' }, el('div', { class: 'eyebrow' }, 'ASK ABOUT THIS PAYOUT'), el('h2', {}, 'One number unclear? Ask.'), el('p', {}, 'Answers use the figures above. Any unsupported number is rejected and the verified summary is shown instead.'),
      el('label', { class: 'sr-only', for: 'numbersQuestion' }, 'Your question'), question, button), answer,
    el('div', { class: 'ask-meta' }, 'AI answers are optional. Without a configured key, AFTER. shows a verified summary.'));
}

function verifiedAnswer(payload) {
  const m = payload.metrics;
  return 'AI is not connected here yet. For ' + payload.period + ', you kept ' + inr(m.payout) + ' from ' + inr(m.sales) + ' in sales (' + pct1(m.keptPer100) + ' per \u20B9100) across ' + m.deliveredOrders + ' delivered orders. The detailed figures and estimates are shown above.';
}
async function askAboutNumbers(button, question, answer) {
  const q = question.value.trim();
  if (!q) { answer.textContent = 'Type a question first.'; question.focus(); return; }
  button.disabled = true; answer.textContent = 'Checking the payout figures...';
  const payload = questionPayload(q), text = await askClaude('ask', payload);
  if (text) { const checked = checkText(text, { period: payload.period, metrics: payload.metrics }); answer.textContent = checked.ok ? text : verifiedAnswer(payload) + ' An unsupported number was detected, so the verified summary is shown.'; }
  else answer.textContent = verifiedAnswer(payload);
  button.disabled = false;
}
async function copySummary(status) {
  const d = decide(A, Z, inp), trend = ordersTrend(A);
  const top = A.buckets.filter(b => b.key !== 'kept' && b.amt > 0).slice().sort((a, b) => b.amt - a.amt).slice(0, 3).map(b => b.label + ': ' + inr(b.amt)).join('; ');
  const txt = ['AFTER. payout summary | ' + A.from + ' to ' + A.to,
    'Sales: ' + inr(A.gross) + ' | payout: ' + inr(A.kept) + ' | kept: ' + pct1(A.keptPct) + ' per \u20B9100',
    'Delivered orders: ' + A.nDelivered, top ? 'Largest deductions: ' + top : '',
    d.swCoupon.f != null ? 'Coupon break-even: about ' + pct0(100 * d.swCoupon.f) + '% of coupon orders would need to be genuinely extra.' : '',
    Z && d.z ? 'Zomato comparison: about ' + inr0(d.z.per) + ' per order (estimate using ' + inp.comm + '% commission).' : '',
    trend ? trend.line + ' This is a signal to investigate, not a proven cause.' : '',
    'Calculated from the payout statement. Zomato figures, if shown, are estimates.'].filter(Boolean).join('\n');
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(txt);
    else { const t = el('textarea', { class: 'copy-buffer' }); t.value = txt; document.body.append(t); t.select(); if (!document.execCommand('copy')) throw new Error('copy failed'); t.remove(); }
    status.textContent = 'Summary copied. Paste it into WhatsApp or a message to your accountant.';
  } catch (e) { status.textContent = 'Could not copy automatically. Select and copy this summary:'; let fallback=status.parentElement.querySelector('.copy-manual'); if(!fallback){fallback=el('textarea',{class:'copy-manual',rows:'7','aria-label':'Summary to copy'});status.after(fallback);} fallback.value=txt; fallback.hidden=false; fallback.focus(); fallback.select(); }
}

const adviceBlock = a => el('div',{class:'advice'},el('div',{class:'advice-item'},el('span',{},'DO'),el('strong',{},a.do||'No change needed.')),el('div',{class:'advice-item'},el('span',{},'MEASURE'),el('strong',{},a.measure||'Track the result.')),el('div',{class:'advice-item'},el('span',{},'STOP IF'),el('strong',{},a.stop||'The test fails.')),a.basis?el('p',{class:'basis'},a.basis):null);

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
    orderPeriods:source.ins.parts.map(p=>({period:p.label,orders:p.n,share:p.share})),\n    zomato:Z&&d.z?{sales:Z.sales,kept:d.z.kept,keptPer100:d.z.keptPct,deliveredOrders:Z.delivered,perOrder:d.z.per,discount:Z.discount,commissionPercent:inp.comm,ads:Z.adsSpend}:null
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
  test.evidence=test.baselineIsDemo?'The starting payout was made-up demo data, so AFTER. did not score the result.':
    'Baseline '+test.baselinePeriod+': '+test.watchLabel+' '+show(before)+'. Next payout '+record.period+': '+test.watchLabel+' '+show(after)+'. '+(test.target?'Target: '+(test.target.direction==='atMost'?'at most ':'at least ')+show(target)+'.':'No target was set, so the result is inconclusive.');
  localStorage.setItem('after_test',JSON.stringify(test));
  return true;
}
function savePayout(button) {
  const d=decide(A,Z,inp),test=JSON.parse(localStorage.getItem('after_test')||'null'),period=A.from+' to '+A.to;
  const record={id:Date.now(),saved:new Date().toISOString(),from:A.from,to:A.to,period,sourcePlatform:'Swiggy',comparisonPlatform:Z?'Zomato estimate':null,
    profile:savedProfile(),isSample,metrics:metricSnapshot(A,d),inputAssumptions:{foodCostPercent:inp.fc,zomatoCommissionPercent:inp.comm},
    decision:test&&!test.outcome?test.action:(ADV.d1.do||ADV.d1.head),decisionDetails:{coupon:ADV.d1.do,platform:ADV.d2.do,timing:ADV.d3.do},
    testId:test&&!test.outcome?test.id:null,evidence:{deductions:A.buckets.map(b=>({label:b.label,amount:b.amt,percent:b.pct})),arithmeticChecks:A.checks.map(c=>({label:c.label,ok:c.ok===c.tot}))}};
  const scored=outcomeFor(test,record),history=JSON.parse(localStorage.getItem('after_payouts')||'[]');
  const next=[record,...history.filter(x=>x.from!==record.from||x.to!==record.to)].slice(0,50);
  localStorage.setItem('after_payouts',JSON.stringify(next));
  button.textContent=scored?'Saved - test outcome recorded':'Saved';button.disabled=true;
}

function render(){
  const root=$('#board'); const openCard=$('#card-coupons'); if(openCard)couponOpen=openCard.open; root.replaceChildren();
  if(!A){root.hidden=!Z;if(Z)root.append(note('Add the Swiggy payout too — the comparison needs both.'));return;}
  root.hidden=false;
  const d=decide(A,Z,inp); const adv=ADV=advise(A,Z,d,inp); const trend=ordersTrend(A);
  const segs=A.buckets.filter(b=>b.amt>.005&&b.pct>0);
  const stack=el('div',{class:'money-bar'},...segs.map(b=>el('i',{class:'k-'+b.key,style:'flex-grow:'+b.pct,title:b.label})));
  // Keep the current result available to the separate actions page without storing order rows.
  const currentMetrics=metricSnapshot(A,d);
  localStorage.setItem('after_current', JSON.stringify({
    from:A.from,to:A.to,isSample,keptPct:A.keptPct,gross:A.gross,kept:A.kept,orders:A.nDelivered,
    couponShare:A.ins.coupon.share, parts:A.ins.parts.slice(0,6).map(x=>({label:x.label,n:x.n,share:x.share})),
    swiggyPer:d.swPer, zomatoPer:Z&&d.z?d.z.per:null, commission:inp.comm, decision:adv.d1.do||adv.d1.head,
    couponHead:adv.d1.head, platformHead:adv.d2.head, timingHead:adv.d3.head,
    metrics:currentMetrics,
    trendLine:trend?trend.line:null
  }));
  root.append(el('section',{class:'result-hero'},
    el('div',{class:'eyebrow'},'YOUR PAYOUT · '+A.from+' → '+A.to),
    el('h1',{},adv.lead.head),
    el('p',{class:'result-sub'},plural(A.nDelivered,'delivered order','delivered orders')+' · sales '+inr0(A.gross)+' · payout '+inr(A.kept)),
    el('div',{class:'breakup-head'},el('div',{class:'eyebrow'},'BREAKUP · WHERE THE MONEY WENT'),el('p',{},'This is the payout in one line: what you kept, and everything deducted before it reached you.')),
    stack,
    el('div',{class:'bar-legend'},...segs.map(b=>el('div',{class:'legend-item'},el('i',{class:'legend-swatch k-'+b.key}),el('span',{},b.label+' · '+pct1(b.pct)+'%')))),
    isSample?el('div',{class:'demo-pill'},'DEMO MODE · made-up numbers'):null,
    el('div',{class:'ai-status',id:'aiStatus'},'Verified from the numbers in your payout.')
  ));
  const weeksEl=weeksSection(trend); if(weeksEl)root.append(weeksEl);
  root.append(priceDistanceSection());
  const sw=d.swCoupon;
  const d1body=el('div',{},metric('Coupon orders',sw.n+' of '+A.nDelivered+' ('+pct0(A.ins.coupon.share)+'%)'),metric('Coupon cost',inr(sw.cost)+' · '+pct1((100*sw.cost)/A.gross)+'% of sales'),metric('Keep per coupon order',sw.perCoupon!=null?inr(sw.perCoupon):'—'),sw.f!=null?metric('Break-even threshold',pct0(100*sw.f)+'% genuinely extra',true):null,el('p',{class:'explain-note'},'The statement cannot tell us which coupon orders were truly incremental. The threshold tells you what must be true for the discount to pay for itself.'),sw.n?meterBlock(sw):null);
  const d2body=el('div',{},Z?metric('Swiggy / order',inr0(d.swPer),true):metric('Zomato report','Not added'),Z?metric('Zomato / order','~'+inr0(d.z.per)+' estimate',true):null,Z?metric('Commission used',inp.comm+'% · your input'):null,Z&&d.z.cStar!=null?metric('Break-even commission',pct0(d.z.cStar)+'%'):null);
  const d3body=el('div',{},...A.ins.parts.slice(0,5).map(p=>metric(p.label,p.n+' orders · '+pct0(p.share)+'%')));
  const c1=card(1,'COUPONS',adv.d1.head,'Is the discount actually earning its keep?',d1body); c1.id='card-coupons'; c1.open=couponOpen;
  root.append(el('section',{class:'cards-section'},el('div',{class:'section-head'},el('div',{class:'eyebrow'},'READ THE PAYOUT'),el('h2',{},'Three things worth knowing.')),el('div',{class:'card-grid'},c1,card(2,'PLATFORMS',Z?adv.d2.head:'Compare the two apps','Which platform leaves more after the costs?',d2body),card(3,'TIMING',adv.d3.head,'When is demand strongest?',d3body))));
  root.append(el('section',{class:'action-section'},el('div',{class:'section-head'},el('div',{class:'eyebrow'},'NEXT · ACTIONS'),el('h2',{},'Now decide what to test.'),el('p',{},'The breakdown stays here. The deeper recommendations live on their own page so this screen stays easy to scan.')),el('a',{class:'button',href:'/actions.html'},'See what to do →')));
  root.append(askNumbersSection());
  const copyStatus=el('p',{class:'copy-status',role:'status'});
  const copyBtn=el('button',{class:'button ghost',type:'button',onclick:()=>copySummary(copyStatus)},'Copy a summary');
  root.append(el('section',{class:'memory-section'},el('div',{class:'memory-copy'},el('div',{class:'eyebrow'},'THE MEMORY LOOP'),el('h2',{},'The next payout should answer what happened last time.'),el('p',{},'Save this result. On the next run, the prototype can compare the period and decision in this browser. No order rows are stored.')),el('div',{class:'memory-actions'},copyBtn,saveBtn,copyStatus,el('a',{class:'button ghost',href:'/insights.html'},'Open payout memory →'))));
  const flagList=A.flags.map((f,i)=>el('article',{class:'flag'},el('h4',{},f.title),f.amount>0?el('strong',{},inr(f.amount)):null,el('p',{},f.why),f.lines.length?el('ul',{},f.lines.map(l=>el('li',{},l))):null,el('p',{},el('b',{},'Ask: '),f.ask),el('button',{class:'button ghost',type:'button',onclick:()=>{$('#flagSel').value=String(i);$('#draftBox').scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'center'})}},'Draft message')));
  const ck=el('ul',{class:'checks'});A.checks.forEach(c=>ck.append(el('li',{},el('span',{class:'tick '+(c.ok===c.tot?'ok':'no')},c.ok===c.tot?'Matches':'Differs'),el('span',{},(c.tot>1?c.ok+' of '+c.tot+' orders: ':'')+c.label))));
  const flagOpts=A.flags.length?A.flags.map((f,i)=>el('option',{value:String(i)},f.title)):[el('option',{value:'-1'},'General question about this payout')];
  const draftOut=el('textarea',{id:'draftOut',rows:'8','aria-label':'Drafted message'});
  root.append(el('details',{class:'audit'},el('summary',{},'Need the audit trail? Open it.'),A.flags.length?flagList:note('Nothing unusual was detected.'),el('h4',{},'What I checked'),ck,el('div',{id:'draftBox',class:'draft'},el('h4',{},'Message to Swiggy support'),el('label',{for:'flagSel'},'About'),el('select',{id:'flagSel'},flagOpts),el('div',{class:'row'},el('button',{class:'button',id:'draftBtn',type:'button',onclick:doDraft},'Draft the message'),el('button',{class:'button ghost',type:'button',onclick:copyDraft},'Copy')),draftOut,el('p',{id:'draftNote',class:'ai-status'}))));
  root.append(note('Files are read in your browser. Calculations are deterministic; AI is only used to reword advice when available.','fine'));
  if(isSample){
    const steps=[
      ['See the payout',()=>goTo($('.result-hero'))],
      ['Read the decisions',()=>goTo($('.cards-section'))],
      ['Keep the memory',()=>goTo($('.memory-section'))],
      ['Test your own guess',()=>{c1.open=true;couponOpen=true;goTo($('#meter'));const m=$('#meterRange');if(m)m.focus({preventScroll:true})}]
    ];
    const btns=steps.map(([label,fn],i)=>el('button',{type:'button',onclick:e=>{btns.forEach(b=>b.removeAttribute('aria-current'));e.currentTarget.setAttribute('aria-current','step');fn()}},el('b',{},String(i+1)),label));
    root.prepend(el('nav',{class:'demo-guide','aria-label':'Demo steps'},el('span',{class:'dg-label'},'Demo guide'),...btns));
  }
  schedulePhrase();
}

async function askClaude(task,payload){try{const r=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task,lang,payload}),signal:AbortSignal.timeout(task==='ask'?23000:12000)});if(!r.ok)return null;const j=await r.json();return j&&typeof j.text==='string'&&j.text?j.text:null}catch(e){return null}}
const whyPlain=c=>c.bad.length?'AI wording had an unsupported number ('+c.bad[0]+'), so the verified plain version is shown.':c.banned?'AI wording used a banned term (“'+c.banned+'”), so the verified plain version is shown.':'AI wording left something out, so the verified plain version is shown.';
let phraseTimer=null;function schedulePhrase(){clearTimeout(phraseTimer);phraseTimer=setTimeout(phraseBoard,300)}function phraseBoard(){if(!ADV||!$('#aiStatus'))return;$('#aiStatus').textContent=lang==='English'?'Verified from the numbers in your payout.':'Claude wording is optional; the calculations are verified.'}
function draftContext(i){if(i<0||!A.flags[i])return{title:'General question about this payout statement',why:'',ask:'',orders:[],lines:[]};return A.flags[i]}
function fallbackDraft(f){return `Subject: Request for explanation, payout ${A.from} to ${A.to}

Hello,

I run [Restaurant name] (Restaurant ID: [Restaurant ID]). While reviewing our payout statement for ${A.from} to ${A.to}, I’d like to understand the following:

• ${f.neutral||f.title}
${f.orders.length?'  Order IDs: '+f.orders.slice(0,12).join(', ')+(f.orders.length>12?' and '+(f.orders.length-12)+' more':'')+'\n':''}
Could you please confirm the basis for these amounts and let me know in writing whether they are correct?

Thank you,
[Your name]
[Phone]`}
async function doDraft(){const out=$('#draftOut'),btn=$('#draftBtn'),why=$('#draftNote');btn.disabled=true;out.value='Drafting…';why.textContent='';const f=draftContext(parseInt($('#flagSel').value,10));const payload={period:A.from+' to '+A.to,item:f.neutral||f.title,detail:f.why,notes:f.lines||[],orders:f.orders.slice(0,15),more_orders:Math.max(0,f.orders.length-15)};const t=await askClaude('draft',payload);const c=t?checkText(t,payload):null;if(c&&c.ok)out.value=t;else{out.value=fallbackDraft(f);why.textContent=c?whyPlain(c):'Claude isn’t available right now, so this is a plain verified template.'}btn.disabled=false}
function copyDraft(){const t=$('#draftOut');t.select();try{navigator.clipboard.writeText(t.value)}catch(e){document.execCommand('copy')}}

$('#swFile').addEventListener('change',e=>handleSwiggy(e.target.files[0]));
$('#zFile').addEventListener('change',e=>handleZomato(e.target.files[0]));
$('#sampleBtn').addEventListener('click',()=>{D=makeSample();A=analyze(D);Z=makeZomatoSample();isSample=true;$('#err').textContent='';render();window.scrollTo({top:0,behavior:reduceMotion()?'auto':'smooth'})});
['fc','comm'].forEach(id=>$('#'+id).addEventListener('input',e=>{const v=parseFloat(e.target.value);if(Number.isFinite(v)&&v>=0&&v<100){inp[id]=v;if(A)render()}}));

