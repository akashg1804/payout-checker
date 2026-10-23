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
    checks.push({ key: 'sumnet', label: 'Order rows add up to the payout summary (\u20B9' + r2(B['net payout']).toFixed(2) + ')', ok: Math.abs(sumNet - B['net payout']) <= 0.1 ? 1 : 0, tot: 1, detail: r2(sumNet - B['net payout']), net: r2(B['net payout']) });
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

  // ---- flags (things to raise with Swiggy). Each carries `kind` (money or signal), `vars` and `items`, so the screen can word it in any language ----
  const flags = [];
  const used = {};
  delivered.forEach(r => { if (r.coupon && r.share > 0) { (used[r.coupon] = used[r.coupon] || []).push(r); } });
  const couponTotal = Object.values(used).reduce((s, a) => s + sum(a, 'share'), 0);
  if (couponTotal > 0) {
    const items = Object.keys(used).map(code => { const meta = coupons.find(c => c.code === code); return { code, n: used[code].length, amt: sum(used[code], 'share'), own: meta ? (meta.share >= 100 ? 'all' : meta.share) : null }; });
    const lines = Object.keys(used).map(code => {
      const meta = coupons.find(c => c.code === code);
      const own = meta ? (meta.share >= 100 ? 'you pay all of it' : 'you pay ' + meta.share + '%') : 'who funds it isn’t stated in the file';
      return code + ': ' + used[code].length + (used[code].length === 1 ? ' order, ' : ' orders, ') + '₹' + r2(sum(used[code], 'share')).toFixed(2) + ' (' + own + ')';
    });
    flags.push({
      key: 'coupons', kind: 'money', title: 'Coupons took ₹' + r2(couponTotal).toFixed(2) + ' from your payout', amount: couponTotal,
      neutral: 'Coupon discounts totalling ₹' + r2(couponTotal).toFixed(2) + ' across ' + Object.values(used).flat().length + ' orders (' + Object.keys(used).join(', ') + '), shown as restaurant-funded in the payout',
      why: (100 * couponTotal / (gross || 1)).toFixed(1) + '% of your sales went to customer coupons that appear in the Discount Summary.',
      lines, ask: 'Check you meant to run these. If you didn’t switch them on, ask which campaign they belong to.',
      orders: Object.values(used).flat().map(r => r.id),
      vars: { amt: couponTotal, pct: (100 * couponTotal) / (gross || 1), n: Object.values(used).flat().length, codes: Object.keys(used).join(', ') }, items
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
      key: 'threshold', kind: 'money', title: edge.length + ' coupon ' + (edge.length === 1 ? 'order was' : 'orders were') + ' at or below the coupon’s stated minimum', amount: sum(edge.map(e => e.r), 'share'),
      neutral: edge.length + ' orders where coupon ' + codes + ' was applied at or below its stated minimum of ₹' + edge[0].c.threshold,
      why: 'The coupon text says “above ₹' + edge[0].c.threshold + '”, but ' + edge.length + ' orders had an item total of ₹' + edge[0].r.item + ' or less (' + codes + ').',
      lines: ['It may still be valid if packaging counts toward the minimum. This is a question, not a finding.'],
      ask: 'Ask how the minimum is calculated.', orders: edge.map(e => e.r.id),
      vars: { n: edge.length, th: edge[0].c.threshold, codes, amt: sum(edge.map(e => e.r), 'share') }, items: []
    });
  }
  const cancelled = rows.filter(r => r.canc > 0 || (r.status !== 'delivered' && r.totalFees > 0));
  if (cancelled.length) {
    const amt = sum(cancelled, 'canc') + sum(cancelled, 'gstFee');
    flags.push({
      key: 'cancel', kind: 'money', title: 'Cancellation charges of ₹' + r2(amt).toFixed(2), amount: amt,
      neutral: 'Cancellation charges of ₹' + r2(amt).toFixed(2) + ' (including GST) on ' + cancelled.length + ' order' + (cancelled.length > 1 ? 's' : '') + (cancelled[0].cancelledBy ? ' marked as cancelled by ' + cancelled[0].cancelledBy.toLowerCase() : ''),
      why: cancelled.length + ' order' + (cancelled.length > 1 ? 's were' : ' was') + ' cancelled' + (cancelled[0].cancelledBy ? ' (marked as cancelled by ' + cancelled[0].cancelledBy.toLowerCase() + ')' : '') + ' and charged to you, including GST.',
      lines: [], ask: 'Confirm the cancellation was yours. If it wasn’t, ask for the reason code.', orders: cancelled.map(r => r.id),
      vars: { amt, n: cancelled.length, by: cancelled[0].cancelledBy ? cancelled[0].cancelledBy.toLowerCase() : '' }, items: []
    });
  }
  if (repeats.length) {
    const extra = repeats.reduce((s, g) => s + g[0].total * (g.length - 1), 0);
    const g0 = repeats[0][0];
    flags.push({
      key: 'dupe', kind: 'money', title: repeats.length === 1 ? 'The same ad charge appears ' + repeats[0].length + ' times' : repeats.length + ' ad charges appear more than once', amount: extra,
      neutral: 'An ad charge of ₹' + r2(g0.total).toFixed(2) + (g0.start ? ' for the campaign dated ' + g0.start + ' to ' + g0.end : '') + ' listed ' + repeats[0].length + ' times' + (repeats.length > 1 ? ' (and ' + (repeats.length - 1) + ' more repeated charge' + (repeats.length > 2 ? 's' : '') + ')' : ''),
      why: 'Same type, campaign dates and amount, listed more than once. The extra copies add up to ₹' + r2(extra).toFixed(2) + '.',
      lines: repeats.slice(0, 5).map(g => g[0].type + ' ₹' + r2(g[0].total).toFixed(2) + ' (' + g.length + ' times' + (g.map(x => x.invoice).filter(Boolean).length ? '; invoices ' + g.map(x => x.invoice).filter(Boolean).join(', ') : '') + ')'),
      ask: 'Check if you really ran this campaign twice. If not, ask Swiggy why it was billed more than once.', orders: [],
      vars: { count: repeats.length, times: repeats[0].length, extra, each: g0.total },
      items: repeats.slice(0, 5).map(g => ({ type: g[0].type, total: g[0].total, times: g.length, invoices: g.map(x => x.invoice).filter(Boolean) }))
    });
  }
  if (bad.length) {
    const ids = [...new Set(bad.map(b => b.row.id))];
    flags.push({
      key: 'mismatch', kind: 'money', title: ids.length + ' order' + (ids.length > 1 ? 's' : '') + ' where a figure doesn’t recompute', amount: bad.filter(b => b.check === 'comm').reduce((s, b) => s + Math.abs(b.diff), 0),
      neutral: ids.length + ' order' + (ids.length > 1 ? 's' : '') + ' where a figure does not match the statement’s own formula',
      why: 'These rows disagree with the statement’s own formulas. That means “unexplained”, and is a question to ask, not a finding.',
      lines: bad.slice(0, 8).map(b => '…' + b.row.id.slice(-6) + ': ' + b.label + ' (off by ₹' + Math.abs(b.diff).toFixed(2) + ')'),
      ask: 'Ask for the calculation basis for these orders.', orders: ids,
      vars: { n: ids.length }, items: bad.slice(0, 8).map(b => ({ id6: b.row.id.slice(-6), label: b.label, diff: Math.abs(b.diff) }))
    });
  }
  if (rateOut.length) {
    flags.push({
      key: 'rate', kind: 'money', title: rateOut.length + ' order' + (rateOut.length > 1 ? 's' : '') + ' at a different commission rate', amount: 0,
      neutral: rateOut.length + ' order' + (rateOut.length > 1 ? 's' : '') + ' charged at a commission rate different from the usual ' + mr.value + '%',
      why: 'Most orders are at ' + mr.value + '%, but these differ.',
      lines: rateOut.slice(0, 8).map(r => '…' + r.id.slice(-6) + ': ' + r.rate + '%'), ask: 'Ask why the rate differs.', orders: rateOut.map(r => r.id),
      vars: { n: rateOut.length, usual: mr.value }, items: rateOut.slice(0, 8).map(r => ({ id6: r.id.slice(-6), rate: r.rate }))
    });
  }
  if (adsOther > 0) {
    flags.push({
      key: 'ads', kind: 'money', title: 'Ads and other charges of ₹' + r2(adsOther).toFixed(2), amount: adsOther,
      neutral: 'Ads and other charges of ₹' + r2(adsOther).toFixed(2) + ' in the payout summary',
      why: 'The payout summary lists ad spend or other adjustments.', lines: [], ask: 'Match this to campaigns you started.', orders: [],
      vars: { amt: adsOther }, items: []
    });
  }
  // smaller fees on top of commission and payment collection (cancellation charges have their own flag)
  const feeDefs = [['longDist', 'Long-distance charges'], ['pocket', 'Pocket Hero fees'], ['one', 'Swiggy One fees'], ['call', 'Call-centre charges'], ['bolt', 'Bolt fees'], ['sponsored', 'Delivery fee sponsored']];
  const feeItems = feeDefs.map(([k, label]) => ({ key: k, label, amt: sum(rows, k), n: rows.filter(r => r[k] > 0).length })).filter(x => x.amt > 0);
  const feeTotal = feeItems.reduce((s, x) => s + x.amt, 0);
  const feeRows = rows.filter(r => feeDefs.some(([k]) => r[k] > 0));
  if (feeTotal > 0) {
    flags.push({
      key: 'fees', kind: 'money', title: 'Smaller Swiggy fees of ₹' + r2(feeTotal).toFixed(2) + ' on ' + feeRows.length + ' orders', amount: feeTotal,
      neutral: 'Smaller Swiggy fees (' + feeItems.map(x => x.label.toLowerCase()).join(', ') + ') totalling ₹' + r2(feeTotal).toFixed(2) + ' on ' + feeRows.length + ' orders',
      why: 'Fees on top of commission and payment collection. They are charged on some orders only.',
      lines: feeItems.map(x => x.label + ': ₹' + r2(x.amt).toFixed(2) + ' (' + x.n + (x.n === 1 ? ' order' : ' orders') + ')'),
      ask: 'Check you opted into each one. If you didn’t, ask what it is for.', orders: feeRows.map(r => r.id),
      vars: { amt: feeTotal, n: feeRows.length }, items: feeItems
    });
  }
  // kitchen timing signals ("MFR" is the statement's food-ready marking); a signal, not money
  const mfrBad = delivered.filter(r => r.mfrAcc === 'no'), mfrKnown = delivered.filter(r => r.mfrAcc === 'yes' || r.mfrAcc === 'no').length;
  const mfrNoPress = delivered.filter(r => r.mfrPress === 'no'), pressKnown = delivered.filter(r => r.mfrPress === 'yes' || r.mfrPress === 'no').length;
  if (mfrBad.length || mfrNoPress.length) {
    flags.push({
      key: 'mfr', kind: 'signal', title: 'Food-ready timing is worth checking', amount: 0,
      neutral: 'Food-ready was marked not accurate on ' + mfrBad.length + ' of ' + mfrKnown + ' orders and not pressed on ' + mfrNoPress.length + ' of ' + pressKnown,
      why: 'The statement marks some orders as “not accurate” or “not pressed” for food-ready.',
      lines: [], ask: 'Check how your kitchen presses “food ready”, and ask Swiggy what the marking is used for.', orders: [...new Set([...mfrBad, ...mfrNoPress].map(r => r.id))],
      vars: { bad: mfrBad.length, known: mfrKnown, notPressed: mfrNoPress.length, pressKnown }, items: []
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
  // orders by day of week (Sun = 0 ... Sat = 6), by order value and by delivery distance
  ins.dow = [0, 1, 2, 3, 4, 5, 6].map(dw => Object.assign({ dow: dw }, stat(stamped.filter(x => x.w.dow === dw).map(x => x.r))));
  const bucketed = (list, defs, pick) => defs.map(b => Object.assign({ key: b.key, min: b.min == null ? null : b.min, max: b.max == null ? null : b.max },
    stat(list.filter(r => (b.min == null || pick(r) >= b.min) && (b.max == null || pick(r) < b.max)))));
  ins.value = bucketed(delivered, [{ key: 'v1', max: 200 }, { key: 'v2', min: 200, max: 300 }, { key: 'v3', min: 300, max: 400 }, { key: 'v4', min: 400 }], r => r.item);
  const withKm = delivered.filter(r => r.km > 0);
  ins.distBuckets = bucketed(withKm, [{ key: 'd1', max: 2 }, { key: 'd2', min: 2, max: 4 }, { key: 'd3', min: 4, max: 6 }, { key: 'd4', min: 6 }], r => r.km);
  ins.dist4 = { over: stat(withKm.filter(r => r.km > 4)), under: stat(withKm.filter(r => r.km <= 4)) };
  ins.fees = feeItems;

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
// ---------- wording: English templates with {name} holes. Hindi and Kannada come from I18N_DICT (public/i18n.js), keyed by the English template ----------
function M(tpl, vars, lang) {
  const dict = (typeof I18N_DICT !== 'undefined' && lang && lang !== 'English' && I18N_DICT[lang]) || null;
  const s = (dict && dict[tpl]) || tpl;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
}
function advise(A, Z, d, inp, lang) {
  const m = (tpl, vars) => M(tpl, vars, lang);
  const days = periodDays(A), weeks = days / 7;
  const perWeek = n => Math.max(1, Math.round(n / weeks));
  const W = perWeek(A.nDelivered);
  const out = {};
  out.lead = {
    head: m('You keep ₹{kept} of every ₹100 sold on Swiggy.', { kept: p1(A.keptPct) }),
    basis: Z && d.z ? m('Zomato estimate: about ₹{z} of every ₹100 at the {comm}% commission you entered, before gateway fees and TDS.', { z: p0(d.z.keptPct), comm: inp.comm }) : ''
  };

  // Decision 1: Swiggy coupons
  const sw = d.swCoupon, cpw = sw.n ? perWeek(sw.n) : 0;
  const d1 = { rule: '' };
  d1.basis = m(sw.n ? 'Based on {n} delivered orders over {days} days, {cn} of them with a coupon.' : 'Based on {n} delivered orders over {days} days.', { n: A.nDelivered, days, cn: sw.n })
    + (sw.n && sw.n < 20 ? ' ' + m('That is few orders, so treat this as a first guess.') : '');
  if (!sw.n) {
    d1.rule = 'none';
    d1.head = m('No coupons ran on Swiggy in this statement.');
    d1.do = m('Nothing to change.');
    d1.measure = m('If you start a coupon, note your orders now: about {W} a week.', { W });
    d1.stop = m('Stop a new coupon if weekly orders are not above {W} after 2 weeks.', { W });
  } else if (sw.f == null) {
    d1.rule = 'loss';
    d1.head = m('At {fc}% food cost, the coupon orders don’t cover their ingredients.', { fc: inp.fc });
    d1.do = m('Pause the coupon for 2 weeks.');
    d1.measure = m('Count Swiggy orders each week and compare with about {W} a week now.', { W });
    d1.stop = m('If your real food cost is below {fc}%, change it above first: the answer may change.', { fc: inp.fc });
  } else {
    const F = p0(100 * sw.f), T = Math.max(1, Math.round(sw.f * sw.n / weeks));
    d1.head = m('Your Swiggy coupons only pay off if at least {F}% of those orders were extra.', { F });
    d1.measure = m('Count Swiggy orders each week and compare with about {W} a week now ({cpw} a week used a coupon).', { W, cpw });
    if (sw.f >= 0.5) {
      d1.rule = 'pause';
      d1.do = m('Pause the coupon for 2 weeks. Needing {F}% extra orders is a lot to expect.', { F });
      d1.stop = m('Bring the coupon back if orders fall by more than {T} a week. That would mean it was bringing extra orders.', { T });
    } else if (sw.f >= 0.25) {
      d1.rule = 'halve';
      d1.do = m('Halve the discount for 2 weeks rather than stopping it.');
      d1.stop = m('Go back to the full discount if orders fall by more than {T} a week.', { T });
    } else {
      d1.rule = 'keep';
      d1.do = m('Keep the coupon. It pays off if only {F}% of coupon orders were extra.', { F });
      d1.measure = m('Check each week that coupon orders stay near {cpw} out of about {W}.', { cpw, W });
      d1.stop = m('Pause it if coupon orders grow but total orders don’t. Then it is going to people who would order anyway.');
    }
  }
  out.d1 = d1;

  // Decision 2: Swiggy or Zomato (Zomato is always an estimate)
  const d2 = { rule: 'nozomato' };
  if (!Z || !d.z || d.swPer == null || d.z.per == null) {
    d2.head = m('Which app leaves you more per order?');
    d2.do = m('Add the Zomato business report to compare the two apps.');
    d2.measure = ''; d2.stop = ''; d2.basis = '';
  } else {
    const diff = d.z.per - d.swPer, gap = rs0(Math.abs(diff));
    const cs = d.z.cStar != null && d.z.cStar > 0 ? p0(d.z.cStar) : null;
    const v = { gap, cs, comm: inp.comm };
    d2.basis = m('Swiggy: {n} orders from your statement. Zomato: {zn} orders, take-home estimated at {comm}% commission and {fc}% food cost.', { n: A.nDelivered, zn: Z.delivered, comm: inp.comm, fc: inp.fc });
    // The commission is the owner's guess, so the advice is conditional on it and says so.
    d2.measure = m('Ask your Zomato account manager for your exact commission, put it in the box above, and read this again.');
    d2.head = diff >= 0
      ? m(cs ? 'Zomato leaves you about {gap} more per order than Swiggy (estimate), unless its commission is above {cs}%.' : 'Zomato leaves you about {gap} more per order than Swiggy (estimate).', v)
      : m('At a {comm}% commission, Zomato leaves you about {gap} less per order than Swiggy (estimate).', v);
    if (Math.abs(diff) < 10) {
      d2.rule = 'same';
      d2.do = m('The two apps leave about the same per order. Ask your Zomato account manager for your exact commission before moving anything.');
      d2.stop = m(cs ? 'If your commission is above {cs}%, Swiggy leaves more.' : 'Check again once you know your real commission.', v);
    } else if (diff > 0) {
      d2.rule = 'zomato';
      d2.do = m(cs ? 'If your real Zomato commission is below {cs}%, put next month’s offer budget on Zomato rather than Swiggy. At the {comm}% you entered, Zomato leaves about {gap} more per order (estimate).'
        : 'Put next month’s offer budget on Zomato rather than Swiggy. At the {comm}% you entered, Zomato leaves about {gap} more per order (estimate).', v);
      d2.stop = m(cs ? 'Keep it on Swiggy if your real commission is {cs}% or more. Then Swiggy leaves more.' : 'Switch back if next month’s files show Swiggy leaving more.', v);
    } else {
      d2.rule = 'swiggy';
      d2.do = m(cs ? 'If your real Zomato commission is above {cs}%, put next month’s offer budget on Swiggy rather than Zomato. At the {comm}% you entered, Zomato leaves about {gap} less per order (estimate).'
        : 'Put next month’s offer budget on Swiggy rather than Zomato. At the {comm}% you entered, Zomato leaves about {gap} less per order (estimate).', v);
      d2.stop = m(cs ? 'Look again if your real commission is {cs}% or less. Then Zomato leaves more.' : 'Look again if next month’s files show Zomato leaving more.', v);
    }
  }
  out.d2 = d2;

  // Decision 3: when to push
  const d3 = { rule: 'notimes' };
  const parts = A.ins.parts.slice().sort((a, b) => b.n - a.n);
  const zLost = Z && Z.lostSales > 0 && Z.offlineHrs > 0 && Z.lostSales >= 0.02 * Z.sales;
  const slot = lb => m(lb).replace(/\s*\(.*\)$/, '').toLowerCase();
  if (parts.length) {
    const late = parts.filter(p => ['dinner', 'night', 'late'].includes(p.key)).reduce((s, p) => s + p.share, 0);
    d3.head = late >= 60 ? m('Most Swiggy orders come after 7 pm.') : m('Your busiest time on Swiggy is {slot}.', { slot: slot(parts[0].label) });
  } else d3.head = m('Orders by time of day');
  d3.basis = m(Z ? 'Based on {n} Swiggy orders over {days} days and Zomato’s daypart counts.' : 'Based on {n} Swiggy orders over {days} days.', { n: A.nDelivered, days });
  if (zLost) {
    d3.rule = 'offline';
    d3.do = m('Cut Zomato offline time. The report shows {h} hours offline and about {lost} in lost sales.', { h: p0(Z.offlineHrs), lost: rs0(Z.lostSales) });
    d3.measure = m('Check offline hours and lost sales in next month’s report.');
    d3.stop = m('Done when offline hours are close to zero during your busiest time, {slot}.', { slot: parts.length ? slot(parts[0].label) : m('dinner') });
  } else if (parts.length >= 2) {
    d3.rule = 'slot';
    const a = parts[0], b = parts[1], K = perWeek(b.n);
    d3.do = m('Be online and fully stocked for {a}, which brings {pa}% of Swiggy orders. Try one offer in {b} ({pb}%) for 2 weeks.', { a: m(a.label), pa: p0(a.share), b: m(b.label), pb: p0(b.share) });
    d3.measure = m('Count {slot} orders each week: about {K} a week now.', { slot: slot(b.label), K });
    d3.stop = m('Stop the offer if {slot} is not above {K} orders a week after 2 weeks.', { slot: slot(b.label), K });
  } else if (parts.length === 1) {
    d3.rule = 'oneslot';
    d3.do = m('All timed orders came in {a}. Be online and fully stocked then.', { a: m(parts[0].label) });
    d3.measure = ''; d3.stop = '';
  } else {
    d3.do = m('Order times are missing from this statement, so there is no time-of-day advice.');
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

// ---------- week by week ----------
// Complete weeks only: a partial week has fewer days, so it would look like a fall just because it is short.
// "Fell" means the latest complete week is half or less of the busiest complete week before it.
function ordersTrend(A, lang) {
  const full = ((A.ins && A.ins.weeks) || []).filter(w => !w.partial);
  if (full.length < 2) return null;
  const last = full[full.length - 1], before = full.slice(0, -1);
  const peak = before.reduce((m, w) => (w.n > m.n ? w : m), before[0]);
  if (!(peak.n > 0) || last.n * 2 > peak.n) return null;
  const total = full.reduce((s, w) => s + w.n, 0);
  return {
    from: peak.n, to: last.n, fromWeek: peak.start, toWeek: last.start, total, weeks: full.length,
    line: M('Orders fell from {from} a week to {to}. Worth asking what changed.', { from: peak.n, to: last.n }, lang),
    basis: M('Complete weeks only: {total} orders across {weeks} weeks.', { total, weeks: full.length }, lang) + (total < 20 ? ' ' + M('That is few orders, so treat this as something to check, not a conclusion.', null, lang) : '')
  };
}

// ---------- break-even meter ----------
// If a share f (0 to 1) of the coupon orders were extra (they would not have come without the coupon),
// what the coupons earn compared with running no coupons:   earn = f x C - (1 - f) x D
//   C = what the coupon orders keep after food cost, D = the discount given (both from decide()).
// The extra orders add C. The rest, (1 - f) of the orders, would have come anyway at full price, so the discount on them is lost.
// At the break-even share D / (C + D) it is exactly 0.
function couponEarn(sw, f) { return f * sw.C - (1 - f) * sw.cost; }

// ---------- insights: the facts behind each chart, all computed from the statement (and the Zomato report if added) ----------
// Nothing here says why something happened. A comparison needs at least MIN_N orders on each side, or it is left out.
const MIN_N = 3;
function insightFacts(A, Z) {
  const I = A.ins, f = {};
  const pickMax = (list, key) => list.reduce((m, x) => (x[key] > m[key] ? x : m), list[0]);
  const pickMin = (list, key) => list.reduce((m, x) => (x[key] < m[key] ? x : m), list[0]);
  // time of day
  const slots = I.parts, enoughSlots = slots.filter(p => p.n >= MIN_N);
  f.time = slots.length ? {
    total: slots.reduce((s, p) => s + p.n, 0), busiest: pickMax(slots, 'n'),
    hi: enoughSlots.length >= 2 ? pickMax(enoughSlots, 'avgKept') : null, lo: enoughSlots.length >= 2 ? pickMin(enoughSlots, 'avgKept') : null
  } : null;
  // day of week
  const dowTotal = I.dow.reduce((s, x) => s + x.n, 0);
  f.dow = dowTotal ? { total: dowTotal, busiest: pickMax(I.dow, 'n'), weekendShare: I.weekend.share } : null;
  // order value
  const vb = I.value.filter(b => b.n >= MIN_N);
  f.value = vb.length >= 2 ? { hi: pickMax(vb, 'avgKept'), lo: pickMin(vb, 'avgKept') } : null;
  // coupons: the same statement, orders with a coupon against orders without
  f.coupon = I.coupon.with.n ? { with: I.coupon.with, without: I.coupon.without.n ? I.coupon.without : null, share: I.coupon.share, codes: I.coupon.codes } : null;
  // distance
  const dist = I.distance;
  f.dist = dist ? { n: dist.n, avg: dist.avg, max: dist.max, over4Share: dist.over4, over: I.dist4.over, under: I.dist4.under, compare: I.dist4.over.n >= MIN_N && I.dist4.under.n >= MIN_N } : null;
  // who orders and how they pay
  const payTotal = Object.values(I.pay).reduce((s, n) => s + n, 0);
  f.who = {
    members: I.members.known ? { yes: I.members.yes, known: I.members.known, share: (100 * I.members.yes) / I.members.known } : null,
    pay: Object.keys(I.pay).map(k => ({ key: k, n: I.pay[k], share: payTotal ? (100 * I.pay[k]) / payTotal : 0 })).sort((a, b) => b.n - a.n)
  };
  // operations
  f.ops = { cancelled: { n: I.cancelled.n, of: A.n, rate: A.n ? (100 * I.cancelled.n) / A.n : 0, cost: I.cancelled.cost }, mfr: I.mfr };
  // Zomato
  if (Z) {
    const steps = [['impressions', Z.impressions], ['menuOpens', Z.menuOpens], ['cartBuilds', Z.cartBuilds], ['placed', Z.placed], ['delivered', Z.delivered]].filter(([, v]) => v > 0);
    const usersTotal = Z.newU + Z.repeatU + Z.lapsedU, partsTotal = Object.values(Z.parts).reduce((s, v) => s + v, 0);
    f.zomato = {
      funnel: steps.map(([key, v], i) => ({ key, v, rate: i && steps[i - 1][1] > 0 ? (100 * v) / steps[i - 1][1] : null })),
      cartLost: Z.cartBuilds > 0 ? Math.max(0, Z.cartBuilds - Z.placed) : null,
      cartLostPct: Z.cartBuilds > 0 ? (100 * Math.max(0, Z.cartBuilds - Z.placed)) / Z.cartBuilds : null,
      users: { newU: Z.newU, repeatU: Z.repeatU, lapsedU: Z.lapsedU, total: usersTotal, repeatShare: usersTotal ? (100 * Z.repeatU) / usersTotal : null },
      ads: { spend: Z.adsSpend, sales: Z.adsSales },
      rating: Z.rating, ratedOrders: Z.ratedOrders, offlineHrs: Z.offlineHrs, lostSales: Z.lostSales,
      parts: Z.parts, partsTotal
    };
  } else f.zomato = null;
  return f;
}

// Flags that come from the shape of the data rather than from a statement line: a fall in orders, an abandoned cart, offline hours, a high cancel rate.
function extraFlags(A, Z, lang) {
  const out = [], f = insightFacts(A, Z), trend = ordersTrend(A, lang);
  if (trend) out.push({ key: 'trend', kind: 'signal', amount: 0, title: trend.line, why: trend.basis, ask: 'Look at what changed in those weeks: menu, prices, coupons, offline hours, delivery area.', vars: { from: trend.from, to: trend.to, total: trend.total, weeks: trend.weeks } });
  if (f.ops.cancelled.n > 0 && f.ops.cancelled.rate >= 10) out.push({ key: 'cancelrate', kind: 'signal', amount: 0, title: M('{n} of {of} orders were cancelled', { n: f.ops.cancelled.n, of: f.ops.cancelled.of }, lang), why: '', ask: 'Check the reasons for the cancellations with Swiggy.', vars: { n: f.ops.cancelled.n, of: f.ops.cancelled.of, pct: f.ops.cancelled.rate } });
  if (f.zomato && f.zomato.cartLostPct != null && f.zomato.cartLostPct >= 50) out.push({ key: 'carts', kind: 'signal', amount: 0, title: 'Most Zomato carts did not become orders', why: '', ask: 'The report does not say why. Look at prices, delivery fee and delivery time on Zomato.', vars: { pct: f.zomato.cartLostPct, lost: f.zomato.cartLost, carts: Z.cartBuilds } });
  if (f.zomato && f.zomato.offlineHrs > 0 && f.zomato.lostSales > 0) out.push({ key: 'offline', kind: 'signal', amount: f.zomato.lostSales, title: 'Zomato shows offline time and lost sales', why: '', ask: 'Check when the outlet went offline and whether it was planned.', vars: { hrs: f.zomato.offlineHrs, lost: f.zomato.lostSales } });
  if (f.zomato && f.zomato.rating != null && f.zomato.rating > 0 && f.zomato.rating < 4) out.push({ key: 'rating', kind: 'signal', amount: 0, title: 'Zomato rating is below 4', why: '', ask: 'Read the recent low ratings for a common theme.', vars: { rating: f.zomato.rating, rated: f.zomato.ratedOrders } });
  return out;
}
