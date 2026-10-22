const N = s => String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/[\u2018\u2019`]/g, "'").trim().toLowerCase();
const num = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const x = parseFloat(String(v == null ? '' : v).replace(/[\u20B9,%\s]/g, ''));
  return Number.isFinite(x) ? x : 0;
};
const r2 = x => Math.round(x * 100) / 100;
const TOL = 0.06;

function findCols(header) {
  const h = header.map(N);
  const eq = t => h.findIndex(x => x === t);
  const sw = t => h.findIndex(x => x.startsWith(t));
  return {
    id: eq('order id'), date: eq('order date'), status: eq('order status'), cancelledBy: sw('cancelled by'),
    coupon: sw('coupon type applied'), item: sw("item's total"), pack: sw('packing charges'),
    share: sw('restaurant discount share'), net: sw('net bill value'), gst: eq('gst collected'),
    paid: sw('total customer paid'), payable: sw('total customer payable'), base: sw('commission charged on'),
    rate: sw('service fees'), comm: eq('commission'), longDist: sw('long distance charges'),
    pocket: sw('pocket hero fees'), one: sw('swiggy one fees'), pcc: sw('payment collection'),
    canc: sw('restaurant cancellation charges'), call: sw('call center charges'),
    sponsored: sw('delivery fee sponsored'), bolt: eq('bolt fees'), gstFee: sw('gst on service fee'),
    totalFees: sw('total swiggy fees'), complaint: sw('complaint & cancellation charges'),
    gstDed: eq('gst deduction'), tcs: eq('tcs'), tds: eq('tds'), taxes: sw('total taxes'),
    netPayout: sw('net payout'), km: sw('last mile'), swOne: sw('swiggy one customer'),
    pay: sw('order payment type'), mfrAcc: sw('mfr accurate'), mfrPress: sw('mfr pressed')
  };
}

// Errors carry a code the page turns into a plain message. `detail` lists what was missing.
function fail(code, detail) { const e = new Error(code); e.code = code; e.detail = detail || null; return e; }
const hasMetricRow = wb => wb.SheetNames.some(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null }).slice(0, 30).some(r => r.some(c => N(c) === 'metric')));

function parseWorkbook(wb) {
  const olName = wb.SheetNames.find(n => N(n).startsWith('order level'));
  if (!olName) throw fail(hasMetricRow(wb) ? 'LOOKS_LIKE_ZOMATO' : 'NO_ORDER_SHEET');
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[olName], { header: 1, defval: null, raw: true });
  const hi = aoa.findIndex(r => r.some(c => N(c) === 'order id'));
  if (hi < 0) throw fail('NO_HEADER');
  const col = findCols(aoa[hi]);
  const missing = [['id', 'Order ID'], ['netPayout', 'Net Payout'], ['comm', 'Commission']].filter(([k]) => col[k] < 0).map(([, l]) => l);
  if (missing.length) throw fail('MISSING_COLUMNS', missing);
  const g = (r, k) => (col[k] >= 0 ? r[col[k]] : null);
  const rows = [];
  for (let i = hi + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || g(r, 'id') == null || String(g(r, 'id')).trim() === '') continue;
    const o = {
      id: String(g(r, 'id')), date: g(r, 'date') == null ? '' : String(g(r, 'date')),
      status: N(g(r, 'status')), cancelledBy: String(g(r, 'cancelledBy') || '').trim(),
      coupon: g(r, 'coupon') == null ? '' : String(g(r, 'coupon')).trim(),
      swOne: N(g(r, 'swOne')), pay: N(g(r, 'pay')), mfrAcc: N(g(r, 'mfrAcc')), mfrPress: N(g(r, 'mfrPress'))
    };
    ['item', 'pack', 'share', 'net', 'gst', 'paid', 'payable', 'base', 'comm', 'longDist', 'pocket', 'one',
      'pcc', 'canc', 'call', 'sponsored', 'bolt', 'gstFee', 'totalFees', 'complaint', 'gstDed', 'tcs', 'tds',
      'taxes', 'netPayout', 'km'].forEach(k => { o[k] = num(g(r, k)); });
    o.rate = num(g(r, 'rate'));
    o.hasNet = col.net >= 0; o.hasRate = col.rate >= 0; o.hasPayable = col.payable >= 0;
    rows.push(o);
  }
  if (!rows.some(r => r.status === 'delivered')) throw fail('EMPTY');
  const breakup = {};
  const bName = wb.SheetNames.find(n => N(n).startsWith('payout breakup'));
  if (bName) {
    const b = XLSX.utils.sheet_to_json(wb.Sheets[bName], { header: 1, defval: null, raw: true });
    b.forEach(r => {
      const li = r.findIndex(c => typeof c === 'string' && c.trim() !== '');
      if (li < 0) return;
      const vals = r.slice(li + 1).filter(c => typeof c === 'number');
      if (vals.length) breakup[N(r[li])] = vals[vals.length - 1];
    });
  }
  const coupons = [];
  const dName = wb.SheetNames.find(n => N(n).startsWith('discount summary'));
  if (dName) {
    const d = XLSX.utils.sheet_to_json(wb.Sheets[dName], { header: 1, defval: null, raw: true });
    const dh = d.findIndex(r => N(r[0]) === 'coupon');
    if (dh >= 0) {
      for (let i = dh + 1; i < d.length; i++) {
        const r = d[i];
        if (!r || typeof r[0] !== 'string' || !r[0].trim()) continue;
        const text = r[0].trim();
        const code = text.split(/[\s\[]/)[0];
        const th = /above\s*\u20B9?\s*(\d+)/i.exec(text);
        coupons.push({ code, text, share: num(r[1]), orders: num(r[2]), discount: num(r[3]), threshold: th ? parseInt(th[1], 10) : null });
      }
    }
  }
  // Ad campaigns and other adjustments (for the repeat-charge check)
  const adjustments = [];
  const gName = wb.SheetNames.find(n => N(n).startsWith('growth investment'));
  if (gName) {
    const gg = XLSX.utils.sheet_to_json(wb.Sheets[gName], { header: 1, defval: null, raw: true });
    let hdr = null;
    gg.forEach(r => {
      const cells = r.map(N);
      if (cells.some(c => c === 'adjustment type' || c === 'adjusment type')) { hdr = cells; return; }
      if (!hdr) return;
      const ti = hdr.indexOf('total amount');
      const tyi = hdr.findIndex(h => h.startsWith('adjus'));
      if (ti < 0 || tyi < 0 || typeof r[ti] !== 'number') return;
      const type = String(r[tyi] == null ? '' : r[tyi]).trim();
      if (!type || /^(total|growth investment|other charges)/i.test(type)) return;
      const at = k => { const j = hdr.indexOf(k); return j >= 0 && r[j] != null ? String(r[j]) : ''; };
      adjustments.push({
        kind: hdr.indexOf('campaign start date') >= 0 ? 'ad' : 'adjustment', type, start: at('campaign start date'), end: at('campaign end date'),
        total: r[ti], invoice: at('invoice number'), remarks: at('remarks')
      });
    });
  }
  return { rows, breakup, coupons, adjustments, platform: 'Swiggy' };
}

function modal(arr) {
  const m = new Map();
  arr.forEach(v => m.set(v, (m.get(v) || 0) + 1));
  let best = null, bc = 0;
  m.forEach((c, v) => { if (c > bc) { best = v; bc = c; } });
  return { value: best, count: bc };
}

function parseWhen(s) {
  const d = /(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!d) return null;
  const t = /(\d{1,2}):(\d{2})/.exec((s || '').slice(10));
  const dt = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
  return { ymd: d[1] + '-' + d[2] + '-' + d[3], hour: t ? parseInt(t[1], 10) : null, dow: dt.getUTCDay(), t: dt.getTime() };
}
function mondayOf(w) {
  const back = (w.dow + 6) % 7;
  const m = new Date(w.t - back * 86400000);
  return m.toISOString().slice(0, 10);
}
const PARTS = [
  { key: 'late', label: 'After midnight (12\u20135 am)', test: h => h >= 0 && h < 5 },
  { key: 'morn', label: 'Morning (5\u201311 am)', test: h => h >= 5 && h < 11 },
  { key: 'lunch', label: 'Lunch (11 am\u20134 pm)', test: h => h >= 11 && h < 16 },
  { key: 'snack', label: 'Evening snacks (4\u20137 pm)', test: h => h >= 16 && h < 19 },
  { key: 'dinner', label: 'Dinner (7\u201310 pm)', test: h => h >= 19 && h < 22 },
  { key: 'night', label: 'Late night (10 pm\u201312 am)', test: h => h >= 22 && h < 24 }
];

function analyze(data) {
  const rows = data.rows, B = data.breakup, coupons = data.coupons, adj = data.adjustments || [];
  const delivered = rows.filter(r => r.status === 'delivered');
  const sum = (arr, k) => arr.reduce((s, r) => s + (r[k] || 0), 0);
  const gross = sum(delivered, 'item') + sum(delivered, 'pack');
  const discounts = sum(delivered, 'share');
  const commission = sum(rows, 'comm');
  const pcc = sum(rows, 'pcc');
  const otherFees = ['longDist', 'pocket', 'one', 'canc', 'call', 'bolt', 'sponsored'].reduce((s, k) => s + sum(rows, k), 0);
  const gstFees = sum(rows, 'gstFee');
  const tdsTcs = sum(rows, 'tds') + sum(rows, 'tcs');
  const adsOther = Math.abs(B['growth investment in ads'] || 0) + Math.abs(B['other charges and refunds'] || 0);
  const kept = B['net payout'] != null ? B['net payout'] : sum(rows, 'netPayout');
  const residual = gross - discounts - commission - pcc - otherFees - gstFees - tdsTcs - adsOther - kept;
  // Stop if the totals don't reconcile. A good statement is off by paise (rounding); the cut-off is far above that.
  const recTol = Math.max(10, 0.01 * gross);
  const rowGap = B['net payout'] != null ? sum(rows, 'netPayout') - B['net payout'] : 0;
  if (Math.abs(residual) > recTol || Math.abs(rowGap) > recTol) throw fail('TOTALS_DONT_RECONCILE', { unexplained: r2(residual), rowGap: r2(rowGap) });
  const buckets = [
    { key: 'kept', label: 'You kept', amt: kept },
    { key: 'disc', label: 'Coupons you funded', amt: discounts },
    { key: 'comm', label: 'Commission', amt: commission },
    { key: 'pcc', label: 'Payment collection', amt: pcc },
    { key: 'other', label: 'Other Swiggy fees', amt: otherFees },
    { key: 'gstf', label: 'GST on Swiggy fees', amt: gstFees },
    { key: 'tds', label: 'TDS / TCS', amt: tdsTcs },
    { key: 'ads', label: 'Ads and adjustments', amt: adsOther },
    { key: 'resid', label: Math.abs(residual) / (gross || 1) < 0.005 ? 'GST rounding' : 'Unmatched', amt: residual }
  ].filter(b => Math.abs(b.amt) >= 0.005 || b.key === 'kept');
  buckets.forEach(b => { b.pct = gross ? (100 * b.amt) / gross : 0; });

  // ---- arithmetic checks ----
  const checks = [];
  const bad = [];
  const feeSum = r => r.comm + r.longDist + r.pocket + r.one + r.pcc + r.canc + r.call + r.bolt + r.sponsored;
  const defs = [
    { key: 'net', label: 'Bill after discounts = items + packaging \u2212 discount', applies: r => r.hasNet, diff: r => r.item + r.pack - r.share - r.net },
    { key: 'comm', label: 'Commission = stated % of the bill', applies: r => r.hasRate && r.rate > 0 && r.base > 0, diff: r => r.comm - (r.base * r.rate) / 100 },
    { key: 'gstf', label: 'GST on Swiggy\u2019s fees = 18% of the fees', applies: () => true, diff: r => r.gstFee - 0.18 * feeSum(r) },
    { key: 'tfees', label: 'Total Swiggy fees = fees + GST on fees', applies: () => true, diff: r => r.totalFees - (feeSum(r) + r.gstFee) },
    { key: 'taxes', label: 'Total taxes = GST deduction + TCS + TDS', applies: () => true, diff: r => r.taxes - (r.gstDed + r.tcs + r.tds) },
    { key: 'pay', label: 'Net payout = amount payable \u2212 fees \u2212 taxes', applies: r => r.hasPayable, diff: r => r.netPayout - (r.payable - r.totalFees - r.complaint - r.taxes) }
  ];
  defs.forEach(d => {
    let ok = 0, tot = 0;
    rows.forEach(r => {
      if (!d.applies(r)) return;
      tot++;
      const df = d.diff(r);
      if (Math.abs(df) <= TOL) ok++; else bad.push({ row: r, check: d.key, label: d.label, diff: r2(df) });
    });
    if (tot) checks.push({ key: d.key, label: d.label, ok, tot });
  });
  const sumNet = sum(rows, 'netPayout');
  if (B['net payout'] != null) {
    checks.push({ key: 'sumnet', label: 'Order rows add up to the payout summary (\u20B9' + r2(B['net payout']).toFixed(2) + ')', ok: Math.abs(sumNet - B['net payout']) <= 0.1 ? 1 : 0, tot: 1, detail: r2(sumNet - B['net payout']) });
  }
  const rates = delivered.filter(r => r.hasRate && r.rate > 0).map(r => r.rate);
  const mr = modal(rates);
  const rateOut = delivered.filter(r => r.hasRate && r.rate > 0 && mr.value != null && r.rate !== mr.value);
  const pccRates = delivered.filter(r => r.base > 0).map(r => Math.round((r.pcc / r.base) * 10000) / 100);
  const mp = modal(pccRates);

  // ---- repeat ad / adjustment charges ----
  const groups = {};
  adj.forEach(a => { const k = [a.kind, N(a.type), a.start, a.end, r2(a.total)].join('|'); (groups[k] = groups[k] || []).push(a); });
  const repeats = Object.values(groups).filter(g => g.length > 1 && g[0].total > 0);
  const adCheck = { rows: adj.length, repeats: repeats.length };

  // ---- flags (things to raise with Swiggy) ----
  const flags = [];
  const used = {};
  delivered.forEach(r => { if (r.coupon && r.share > 0) { (used[r.coupon] = used[r.coupon] || []).push(r); } });
  const couponTotal = Object.values(used).reduce((s, a) => s + sum(a, 'share'), 0);
  if (couponTotal > 0) {
    const lines = Object.keys(used).map(code => {
      const meta = coupons.find(c => c.code === code);
      const own = meta ? (meta.share >= 100 ? 'you pay all of it' : 'you pay ' + meta.share + '%') : 'who funds it isn\u2019t stated in the file';
      return code + ': ' + used[code].length + (used[code].length === 1 ? ' order, ' : ' orders, ') + '\u20B9' + r2(sum(used[code], 'share')).toFixed(2) + ' (' + own + ')';
    });
    flags.push({
      key: 'coupons', title: 'Coupons took \u20B9' + r2(couponTotal).toFixed(2) + ' from your payout', amount: couponTotal,
      neutral: 'Coupon discounts totalling \u20B9' + r2(couponTotal).toFixed(2) + ' across ' + Object.values(used).flat().length + ' orders (' + Object.keys(used).join(', ') + '), shown as restaurant-funded in the payout',
      why: (100 * couponTotal / (gross || 1)).toFixed(1) + '% of your sales went to customer coupons that appear in the Discount Summary.',
      lines, ask: 'Check you meant to run these. If you didn\u2019t switch them on, ask which campaign they belong to.',
      orders: Object.values(used).flat().map(r => r.id)
    });
  }
  const edge = [];
  coupons.forEach(c => {
    if (c.threshold == null) return;
    (used[c.code] || []).forEach(r => { if (r.item <= c.threshold) edge.push({ r, c }); });
  });
  if (edge.length) {
    const codes = [...new Set(edge.map(e => e.c.code))].join(', ');
    flags.push({
      key: 'threshold', title: edge.length + ' coupon ' + (edge.length === 1 ? 'order was' : 'orders were') + ' at or below the coupon\u2019s stated minimum', amount: sum(edge.map(e => e.r), 'share'),
      neutral: edge.length + ' orders where coupon ' + codes + ' was applied at or below its stated minimum of \u20B9' + edge[0].c.threshold,
      why: 'The coupon text says \u201Cabove \u20B9' + edge[0].c.threshold + '\u201D, but ' + edge.length + ' orders had an item total of \u20B9' + edge[0].r.item + ' or less (' + codes + ').',
      lines: ['It may still be valid if packaging counts toward the minimum. This is a question, not a finding.'],
      ask: 'Ask how the minimum is calculated.', orders: edge.map(e => e.r.id)
    });
  }
  const cancelled = rows.filter(r => r.canc > 0 || (r.status !== 'delivered' && r.totalFees > 0));
  if (cancelled.length) {
    const amt = sum(cancelled, 'canc') + sum(cancelled, 'gstFee');
    flags.push({
      key: 'cancel', title: 'Cancellation charges of \u20B9' + r2(amt).toFixed(2), amount: amt,
      neutral: 'Cancellation charges of \u20B9' + r2(amt).toFixed(2) + ' (including GST) on ' + cancelled.length + ' order' + (cancelled.length > 1 ? 's' : '') + (cancelled[0].cancelledBy ? ' marked as cancelled by ' + cancelled[0].cancelledBy.toLowerCase() : ''),
      why: cancelled.length + ' order' + (cancelled.length > 1 ? 's were' : ' was') + ' cancelled' + (cancelled[0].cancelledBy ? ' (marked as cancelled by ' + cancelled[0].cancelledBy.toLowerCase() + ')' : '') + ' and charged to you, including GST.',
      lines: [], ask: 'Confirm the cancellation was yours. If it wasn\u2019t, ask for the reason code.', orders: cancelled.map(r => r.id)
    });
  }
  if (repeats.length) {
    const extra = repeats.reduce((s, g) => s + g[0].total * (g.length - 1), 0);
    const g0 = repeats[0][0];
    flags.push({
      key: 'dupe', title: repeats.length === 1 ? 'The same ad charge appears ' + repeats[0].length + ' times' : repeats.length + ' ad charges appear more than once', amount: extra,
      neutral: 'An ad charge of \u20B9' + r2(g0.total).toFixed(2) + (g0.start ? ' for the campaign dated ' + g0.start + ' to ' + g0.end : '') + ' listed ' + repeats[0].length + ' times' + (repeats.length > 1 ? ' (and ' + (repeats.length - 1) + ' more repeated charge' + (repeats.length > 2 ? 's' : '') + ')' : ''),
      why: 'Same type, campaign dates and amount, listed more than once. The extra copies add up to \u20B9' + r2(extra).toFixed(2) + '.',
      lines: repeats.slice(0, 5).map(g => g[0].type + ' \u20B9' + r2(g[0].total).toFixed(2) + ' (' + g.length + ' times' + (g.map(x => x.invoice).filter(Boolean).length ? '; invoices ' + g.map(x => x.invoice).filter(Boolean).join(', ') : '') + ')'),
      ask: 'Check if you really ran this campaign twice. If not, ask Swiggy why it was billed more than once.', orders: []
    });
  }
  if (bad.length) {
    const ids = [...new Set(bad.map(b => b.row.id))];
    flags.push({
      key: 'mismatch', title: ids.length + ' order' + (ids.length > 1 ? 's' : '') + ' where a figure doesn\u2019t recompute', amount: bad.filter(b => b.check === 'comm').reduce((s, b) => s + Math.abs(b.diff), 0),
      neutral: ids.length + ' order' + (ids.length > 1 ? 's' : '') + ' where a figure does not match the statement\u2019s own formula',
      why: 'These rows disagree with the statement\u2019s own formulas. That means \u201Cunexplained\u201D, and is a question to ask, not a finding.',
      lines: bad.slice(0, 8).map(b => '\u2026' + b.row.id.slice(-6) + ': ' + b.label + ' (off by \u20B9' + Math.abs(b.diff).toFixed(2) + ')'),
      ask: 'Ask for the calculation basis for these orders.', orders: ids
    });
  }
  if (rateOut.length) {
    flags.push({
      key: 'rate', title: rateOut.length + ' order' + (rateOut.length > 1 ? 's' : '') + ' at a different commission rate', amount: 0,
      neutral: rateOut.length + ' order' + (rateOut.length > 1 ? 's' : '') + ' charged at a commission rate different from the usual ' + mr.value + '%',
      why: 'Most orders are at ' + mr.value + '%, but these differ.',
      lines: rateOut.slice(0, 8).map(r => '\u2026' + r.id.slice(-6) + ': ' + r.rate + '%'), ask: 'Ask why the rate differs.', orders: rateOut.map(r => r.id)
    });
  }
  if (adsOther > 0) {
    flags.push({
      key: 'ads', title: 'Ads and other charges of \u20B9' + r2(adsOther).toFixed(2), amount: adsOther,
      neutral: 'Ads and other charges of \u20B9' + r2(adsOther).toFixed(2) + ' in the payout summary',
      why: 'The payout summary lists ad spend or other adjustments.', lines: [], ask: 'Match this to campaigns you started.', orders: []
    });
  }
  flags.sort((a, b) => b.amount - a.amount);

  // ---- marketing and operations insights ----
  const ins = { n: delivered.length };
  const stat = arr => {
    const s = arr.reduce((a, r) => a + r.item + r.pack, 0);
    return { n: arr.length, avgItem: arr.length ? sum(arr, 'item') / arr.length : 0, avgKept: arr.length ? sum(arr, 'netPayout') / arr.length : 0, keptPct: s ? (100 * sum(arr, 'netPayout')) / s : 0 };
  };
  const withC = delivered.filter(r => r.coupon && r.share > 0), noC = delivered.filter(r => !(r.coupon && r.share > 0));
  ins.coupon = { with: stat(withC), without: stat(noC), share: delivered.length ? (100 * withC.length) / delivered.length : 0,
    codes: Object.keys(used).map(c => ({ code: c, n: used[c].length, disc: sum(used[c], 'share') })).sort((a, b) => b.disc - a.disc) };
  const stamped = delivered.map(r => ({ r, w: parseWhen(r.date) })).filter(x => x.w);
  const timed = stamped.filter(x => x.w.hour != null);
  ins.parts = PARTS.map(p => {
    const a = timed.filter(x => p.test(x.w.hour)).map(x => x.r);
    return Object.assign({ key: p.key, label: p.label }, stat(a), { share: timed.length ? (100 * a.length) / timed.length : 0 });
  }).filter(p => p.n > 0);
  const weekend = stamped.filter(x => x.w.dow === 5 || x.w.dow === 6 || x.w.dow === 0).length;
  ins.weekend = { n: weekend, of: stamped.length, share: stamped.length ? (100 * weekend) / stamped.length : 0 };
  const wk = {};
  stamped.forEach(x => { const k = mondayOf(x.w); (wk[k] = wk[k] || []).push(x.r); });
  const dates = rows.map(r => r.date).filter(Boolean).sort();
  const from = dates[0] ? dates[0].slice(0, 10) : '', to = dates.length ? dates[dates.length - 1].slice(0, 10) : '';
  ins.weeks = Object.keys(wk).sort().map(k => {
    const start = new Date(k + 'T00:00:00Z').getTime(), end = start + 6 * 86400000;
    const f = from ? new Date(from + 'T00:00:00Z').getTime() : start, t = to ? new Date(to + 'T00:00:00Z').getTime() : end;
    const days = Math.round((Math.min(end, t) - Math.max(start, f)) / 86400000) + 1;
    return { start: k, n: wk[k].length, sales: sum(wk[k], 'item') + sum(wk[k], 'pack'), couponShare: (100 * wk[k].filter(r => r.coupon && r.share > 0).length) / wk[k].length, partial: days < 7, days };
  });
  const pp = {};
  delivered.forEach(r => { const k = Math.round(r.item); (pp[k] = pp[k] || []).push(r); });
  ins.prices = Object.keys(pp).map(k => Object.assign({ price: +k }, stat(pp[k]))).sort((a, b) => b.n - a.n || a.price - b.price).slice(0, 4);
  const kms = delivered.filter(r => r.km > 0).map(r => r.km);
  ins.distance = kms.length ? { avg: kms.reduce((a, b) => a + b, 0) / kms.length, max: Math.max(...kms), over4: (100 * kms.filter(k => k > 4).length) / kms.length, n: kms.length } : null;
  ins.members = { yes: delivered.filter(r => r.swOne === 'yes').length, known: delivered.filter(r => r.swOne === 'yes' || r.swOne === 'no').length };
  const pays = {}; delivered.forEach(r => { if (r.pay) pays[r.pay] = (pays[r.pay] || 0) + 1; });
  ins.pay = pays;
  ins.mfr = { notAccurate: delivered.filter(r => r.mfrAcc === 'no').length, known: delivered.filter(r => r.mfrAcc === 'yes' || r.mfrAcc === 'no').length,
    notPressed: delivered.filter(r => r.mfrPress === 'no').length, pressKnown: delivered.filter(r => r.mfrPress === 'yes' || r.mfrPress === 'no').length };
  ins.cancelled = { n: rows.length - delivered.length, cost: r2(sum(cancelled, 'canc') + sum(cancelled, 'gstFee')) };

  return {
    n: rows.length, nDelivered: delivered.length, nCancelled: rows.length - delivered.length,
    itemTotal: r2(sum(delivered, 'item')), gross: r2(gross), kept: r2(kept), keptPct: gross ? (100 * kept) / gross : 0, buckets, checks, flags, ins,
    modalRate: mr.value, modalPcc: mp.value, modalPccCount: mp.count, nBase: pccRates.length, adCheck,
    from, to, coupons: coupons, allClear: bad.length === 0
  };
}


// ---------- Zomato business report (CSV) ----------
function parseZomatoCsv(text) { return parseZomato(XLSX.read(text, { type: 'string' })); }
function parseZomato(wb) {
  if (wb.SheetNames.some(n => N(n).startsWith('order level'))) throw fail('LOOKS_LIKE_SWIGGY');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const hi = aoa.findIndex(r => r.some(c => N(c) === 'metric'));
  if (hi < 0) throw fail('NO_METRICS');
  const h = aoa[hi].map(N);
  const mi = h.indexOf('metric');
  let vi = -1;
  for (let j = mi + 1; j < h.length; j++) { if (h[j]) { vi = j; break; } }
  if (vi < 0) throw fail('NO_METRICS');
  const m = {};
  for (let i = hi + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r[mi] == null) continue;
    const v = r[vi];
    const x = typeof v === 'number' ? v : (v != null && v !== '' && !isNaN(parseFloat(v)) ? parseFloat(v) : null);
    if (x != null) m[N(r[mi])] = x;
  }
  const get = k => (m[N(k)] == null ? null : m[N(k)]);
  const delivered = get('delivered orders'), sales = get('sales (rs)'), discount = get('discount given (rs)');
  if (delivered == null || sales == null || discount == null) throw fail('NO_METRICS');
  if (!(delivered > 0) || !(sales > 0)) throw fail('EMPTY');
  let offerOrders = get('orders with offers'), offerSales = get('gross sales from offers (rs)'), swapped = false;
  const eff = get('effective discount (%)');
  if (offerOrders != null && offerSales != null && eff != null) {
    const asLabelled = offerSales > 0 ? (100 * discount) / offerSales : null;
    const ifSwapped = offerOrders > 0 ? (100 * discount) / offerOrders : null;
    if (ifSwapped != null && Math.abs(ifSwapped - eff) < 0.05 && !(asLabelled != null && Math.abs(asLabelled - eff) < 0.05)) {
      const t = offerOrders; offerOrders = offerSales; offerSales = t; swapped = true;
    }
  }
  const placed = get('placed orders') || delivered;
  return {
    platform: 'Zomato', delivered, sales, discount, placed, offerOrders: offerOrders || 0, offerSales: offerSales || 0, swapped,
    adsSales: get('sales from ads (rs)') || 0, adsSpend: get('ads spend (rs)') || 0, impressions: get('impressions') || 0, adsImpressions: get('ads impressions') || 0,
    menuOpens: get('menu opens') || 0, cartBuilds: get('cart builds') || 0, newU: get('new user orders') || 0, repeatU: get('repeat user orders') || 0, lapsedU: get('lapsed user orders') || 0,
    parts: { breakfast: get('breakfast orders') || 0, lunch: get('lunch orders') || 0, snacks: get('snacks orders') || 0, dinner: get('dinner orders') || 0, late: get('late night orders') || 0 },
    rating: get('average rating'), ratedOrders: get('rated orders') || 0, offlineHrs: get('offline time (in hours)'), lostSales: get('lost sales (rs)')
  };
}

// ---------- decisions (all arithmetic in code) ----------
const GST_ON_COMMISSION = 1.18; // GST on fees is 18% on the Swiggy statement; assumed the same for Zomato
function decide(A, Z, inp) {
  const fc = inp.fc / 100, c = inp.comm / 100;
  const out = { fc: inp.fc, comm: inp.comm };
  const cp = A.ins.coupon;
  const D = cp.codes.reduce((s, x) => s + x.disc, 0);
  const sw = { n: cp.with.n, cost: D };
  sw.C = cp.with.n * cp.with.avgKept - fc * cp.with.n * cp.with.avgItem;
  sw.f = sw.C > 0 && D > 0 ? D / (sw.C + D) : null;
  sw.grid = [30, 35, 40, 45].map(p => { const Cp = cp.with.n * cp.with.avgKept - (p / 100) * cp.with.n * cp.with.avgItem; return { fc: p, f: Cp > 0 && D > 0 ? D / (Cp + D) : null }; });
  sw.perCoupon = cp.with.n ? cp.with.avgKept - fc * cp.with.avgItem : null;
  sw.perFull = cp.without.n ? cp.without.avgKept - fc * cp.without.avgItem : null;
  out.swCoupon = sw;
  out.swPer = A.nDelivered ? (A.kept - fc * A.itemTotal) / A.nDelivered : null;
  if (Z) {
    const S = Z.sales, Dz = Z.discount, So = Z.offerSales;
    const z = {};
    z.C = (So - Dz) * (1 - c * GST_ON_COMMISSION) - fc * So;
    z.f = So > 0 && Dz > 0 && z.C > 0 ? Dz / (z.C + Dz) : null;
    z.grid = [15, 20, 25, 30].map(cc => { const Cc = (So - Dz) * (1 - (cc / 100) * GST_ON_COMMISSION) - fc * So; return { comm: cc, f: So > 0 && Cc > 0 ? Dz / (Cc + Dz) : null }; });
    z.kept = (S - Dz) * (1 - c * GST_ON_COMMISSION) - Z.adsSpend;
    z.keptPct = S ? (100 * z.kept) / S : 0;
    z.per = Z.delivered ? (z.kept - fc * S) / Z.delivered : null;
    z.perDiscounted = Z.offerOrders ? Dz / Z.offerOrders : null;
    z.discPct = S ? (100 * Dz) / S : 0;
    z.adsPct = S ? (100 * Z.adsSpend) / S : 0;
    z.adsShare = S ? (100 * Z.adsSales) / S : 0;
    z.share = (100 * Z.delivered) / (Z.delivered + A.nDelivered);
    z.cStar = null;
    if (out.swPer != null && S - Dz > 0) {
      const cs = (1 - (out.swPer * Z.delivered + Z.adsSpend + fc * S) / (S - Dz)) / GST_ON_COMMISSION;
      z.cStar = 100 * cs;
    }
    out.z = z;
  }
  return out;
}

// ---------- advice (rules in code pick it; Claude may only re-word it) ----------
const rs0 = x => '₹' + Math.round(x).toLocaleString('en-IN');
const p0 = x => String(Math.round(x));
const p1 = x => String(Math.round(x * 10) / 10);
function periodDays(A) {
  if (!A.from || !A.to) return 7;
  return Math.max(1, Math.round((Date.parse(A.to + 'T00:00:00Z') - Date.parse(A.from + 'T00:00:00Z')) / 86400000) + 1);
}
function advise(A, Z, d, inp) {
  const days = periodDays(A), weeks = days / 7;
  const perWeek = n => Math.max(1, Math.round(n / weeks));
  const W = perWeek(A.nDelivered);
  const out = {};
  out.lead = {
    head: 'You keep about ₹' + p1(A.keptPct) + ' of every ₹100 you sell on Swiggy.',
    basis: Z && d.z ? 'Zomato estimate: about ₹' + p0(d.z.keptPct) + ' of every ₹100 at the ' + inp.comm + '% commission you entered, before gateway fees and TDS.' : ''
  };

  // Decision 1: Swiggy coupons
  const sw = d.swCoupon, cpw = sw.n ? perWeek(sw.n) : 0;
  const d1 = { rule: '' };
  d1.basis = 'Based on ' + A.nDelivered + ' delivered orders over ' + days + ' days' + (sw.n ? ', ' + sw.n + ' of them with a coupon' : '') + '.' + (sw.n && sw.n < 20 ? ' That is few orders, so treat this as a first guess.' : '');
  if (!sw.n) {
    d1.rule = 'none';
    d1.head = 'No coupons ran on Swiggy in this statement.';
    d1.do = 'Nothing to change.';
    d1.measure = 'If you start a coupon, note your orders now: about ' + W + ' a week.';
    d1.stop = 'Stop a new coupon if weekly orders are not above ' + W + ' after 2 weeks.';
  } else if (sw.f == null) {
    d1.rule = 'loss';
    d1.head = 'At ' + inp.fc + '% food cost, the coupon orders don’t cover their ingredients.';
    d1.do = 'Pause the coupon for 2 weeks.';
    d1.measure = 'Count Swiggy orders each week and compare with about ' + W + ' a week now.';
    d1.stop = 'If your real food cost is below ' + inp.fc + '%, change it above first: the answer may change.';
  } else {
    const F = p0(100 * sw.f), T = Math.max(1, Math.round(sw.f * sw.n / weeks));
    d1.head = 'Your Swiggy coupons only pay off if at least ' + F + '% of those orders were extra.';
    d1.measure = 'Count Swiggy orders each week and compare with about ' + W + ' a week now (' + cpw + ' a week used a coupon).';
    if (sw.f >= 0.5) {
      d1.rule = 'pause';
      d1.do = 'Pause the coupon for 2 weeks. Needing ' + F + '% extra orders is a lot to expect.';
      d1.stop = 'Bring the coupon back if orders fall by more than ' + T + ' a week. That would mean it was bringing extra orders.';
    } else if (sw.f >= 0.25) {
      d1.rule = 'halve';
      d1.do = 'Halve the discount for 2 weeks rather than stopping it.';
      d1.stop = 'Go back to the full discount if orders fall by more than ' + T + ' a week.';
    } else {
      d1.rule = 'keep';
      d1.do = 'Keep the coupon. It pays off if only ' + F + '% of coupon orders were extra.';
      d1.measure = 'Check each week that coupon orders stay near ' + cpw + ' out of about ' + W + '.';
      d1.stop = 'Pause it if coupon orders grow but total orders don’t. Then it is going to people who would order anyway.';
    }
  }
  out.d1 = d1;

  // Decision 2: Swiggy or Zomato (Zomato is always an estimate)
  const d2 = { rule: 'nozomato' };
  if (!Z || !d.z || d.swPer == null || d.z.per == null) {
    d2.head = 'Which app leaves you more per order?';
    d2.do = 'Add the Zomato business report to compare the two apps.';
    d2.measure = ''; d2.stop = ''; d2.basis = '';
  } else {
    const diff = d.z.per - d.swPer, gap = rs0(Math.abs(diff));
    const cs = d.z.cStar != null && d.z.cStar > 0 ? p0(d.z.cStar) : null;
    d2.basis = 'Swiggy: ' + A.nDelivered + ' orders from your statement. Zomato: ' + Z.delivered + ' orders, take-home estimated at ' + inp.comm + '% commission and ' + inp.fc + '% food cost.';
    // The commission is the owner's guess, so the advice is conditional on it and says so.
    d2.measure = 'Ask your Zomato account manager for your exact commission, put it in the box above, and read this again.';
    d2.head = diff >= 0
      ? 'Zomato leaves you about ' + gap + ' more per order than Swiggy (estimate)' + (cs ? ', unless its commission is above ' + cs + '%.' : '.')
      : 'At a ' + inp.comm + '% commission, Zomato leaves you about ' + gap + ' less per order than Swiggy (estimate).';
    if (Math.abs(diff) < 10) {
      d2.rule = 'same';
      d2.do = 'The two apps leave about the same per order. Ask your Zomato account manager for your exact commission before moving anything.';
      d2.stop = cs ? 'If your commission is above ' + cs + '%, Swiggy leaves more.' : 'Check again once you know your real commission.';
    } else if (diff > 0) {
      d2.rule = 'zomato';
      d2.do = (cs ? 'If your real Zomato commission is below ' + cs + '%, put' : 'Put') + ' next month’s offer budget on Zomato rather than Swiggy. At the ' + inp.comm + '% you entered, Zomato leaves about ' + gap + ' more per order (estimate).';
      d2.stop = cs ? 'Keep it on Swiggy if your real commission is ' + cs + '% or more. Then Swiggy leaves more.' : 'Switch back if next month’s files show Swiggy leaving more.';
    } else {
      d2.rule = 'swiggy';
      d2.do = (cs ? 'If your real Zomato commission is above ' + cs + '%, put' : 'Put') + ' next month’s offer budget on Swiggy rather than Zomato. At the ' + inp.comm + '% you entered, Zomato leaves about ' + gap + ' less per order (estimate).';
      d2.stop = cs ? 'Look again if your real commission is ' + cs + '% or less. Then Zomato leaves more.' : 'Look again if next month’s files show Zomato leaving more.';
    }
  }
  out.d2 = d2;

  // Decision 3: when to push
  const d3 = { rule: 'notimes' };
  const parts = A.ins.parts.slice().sort((a, b) => b.n - a.n);
  const zLost = Z && Z.lostSales > 0 && Z.offlineHrs > 0 && Z.lostSales >= 0.02 * Z.sales;
  const short = l => l.replace(/\s*\(.*\)$/, '');
  if (parts.length) {
    const late = parts.filter(p => ['dinner', 'night', 'late'].includes(p.key)).reduce((s, p) => s + p.share, 0);
    d3.head = late >= 60 ? 'Most Swiggy orders come after 7 pm.' : 'Your busiest time on Swiggy is ' + short(parts[0].label).toLowerCase() + '.';
  } else d3.head = 'Orders by time of day';
  d3.basis = 'Based on ' + A.nDelivered + ' Swiggy orders over ' + days + ' days' + (Z ? ' and Zomato’s daypart counts.' : '.');
  if (zLost) {
    d3.rule = 'offline';
    d3.do = 'Cut Zomato offline time. The report shows ' + p0(Z.offlineHrs) + ' hours offline and about ' + rs0(Z.lostSales) + ' in lost sales.';
    d3.measure = 'Check offline hours and lost sales in next month’s report.';
    d3.stop = 'Done when offline hours are close to zero during your busiest time, ' + (parts.length ? short(parts[0].label).toLowerCase() : 'dinner') + '.';
  } else if (parts.length >= 2) {
    d3.rule = 'slot';
    const a = parts[0], b = parts[1], K = perWeek(b.n);
    d3.do = 'Be online and fully stocked for ' + a.label + ', which brings ' + p0(a.share) + '% of Swiggy orders. Try one offer in ' + b.label + ' (' + p0(b.share) + '%) for 2 weeks.';
    d3.measure = 'Count ' + short(b.label).toLowerCase() + ' orders each week: about ' + K + ' a week now.';
    d3.stop = 'Stop the offer if ' + short(b.label).toLowerCase() + ' is not above ' + K + ' orders a week after 2 weeks.';
  } else if (parts.length === 1) {
    d3.rule = 'oneslot';
    d3.do = 'All timed orders came in ' + parts[0].label + '. Be online and fully stocked then.';
    d3.measure = ''; d3.stop = '';
  } else {
    d3.do = 'Order times are missing from this statement, so there is no time-of-day advice.';
    d3.measure = ''; d3.stop = '';
  }
  out.d3 = d3;
  return out;
}
const PHRASE_FIELDS = ['head', 'do', 'measure', 'stop', 'basis'];
// What Claude is sent for re-wording: only the plain-English text, block by block.
function phrasePayload(adv) {
  const p = {};
  ['lead', 'd1', 'd2', 'd3'].forEach(k => { p[k] = {}; PHRASE_FIELDS.forEach(f => { if (adv[k][f]) p[k][f] = adv[k][f]; }); });
  return p;
}

// ---------- number checker ----------
// Every number in Claude's text must exist in what Claude was sent. Fails closed.
const toAscii = s => String(s)
  .replace(/[०-९]/g, c => String(c.charCodeAt(0) - 0x0966))
  .replace(/[೦-೯]/g, c => String(c.charCodeAt(0) - 0x0CE6));
function numbersIn(s) {
  let t = toAscii(s);
  const found = [];
  t = t.replace(/\d{4}-\d{2}-\d{2}/g, m => { found.push({ raw: m, date: true }); return ' '; });
  (t.match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(m => {
    const raw = m.replace(/,+$/, ''), clean = raw.replace(/,/g, '');
    const dot = clean.indexOf('.');
    found.push({ raw, digits: clean, value: parseFloat(clean), dp: dot < 0 ? 0 : clean.length - dot - 1 });
  });
  return found;
}
function allowedFrom(payload) {
  const vals = [], strs = new Set();
  const walk = v => {
    if (v == null) return;
    if (typeof v === 'number') { if (Number.isFinite(v)) { vals.push(Math.abs(v)); strs.add(String(Math.abs(v))); } return; }
    if (typeof v === 'string') {
      numbersIn(v).forEach(n => {
        if (n.date) { strs.add(n.raw); n.raw.split('-').forEach(x => vals.push(parseInt(x, 10))); } // "1 Aug 2026" is fine too
        else { strs.add(n.digits); vals.push(n.value); }
      });
      return;
    }
    if (Array.isArray(v)) v.forEach(walk); else if (typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(payload);
  return { vals, strs };
}
// English, Hindi (galat, dhokha) and Kannada (tappu, mosa) words the app must never use.
const BANNED = /overcharg|\bwrong\b|\berror\b|\bmistake|\bcheat|\bfraud|\bscam|गलत|ग़लत|धोखा|ತಪ್ಪು|ಮೋಸ/i;
function checkText(text, payload) {
  const allow = allowedFrom(payload);
  const bad = [];
  numbersIn(text).forEach(n => {
    if (n.date) { if (!allow.strs.has(n.raw)) bad.push(n.raw); return; }
    if (n.dp === 0 && n.digits.length >= 10) { if (!allow.strs.has(n.digits)) bad.push(n.raw); return; } // order IDs
    const ok = allow.vals.some(a => Math.abs(Math.round(a * 10 ** n.dp) / 10 ** n.dp - n.value) < 1e-9);
    if (!ok) bad.push(n.raw);
  });
  const bw = BANNED.exec(toAscii(text));
  return { ok: !bad.length && !bw, bad, banned: bw ? bw[0] : null };
}
