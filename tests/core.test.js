// Run with: npm test
// Fixtures are built in memory, so no statement files are needed (or committed).
// The expected numbers are worked out by hand in the comments.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../scripts/load-core');
const X = global.XLSX;

// Four delivered Swiggy orders, item total ₹200 each, 25% commission, 18% GST on the fee.
//  A, D: coupon SAVE, discount 40 -> bill 160, commission 40, GST 7.2, payout 112.8
//  B, C: no coupon -> bill 200, commission 50, GST 9, payout 141
// Sales 800, payout 507.6 -> keeps ₹63.45 of every ₹100.
const HEAD = ['Order ID', 'Order Date', 'Order Status', 'Coupon type applied', "Item's total", 'Packing charges', 'Restaurant discount share',
  'Net bill value', 'Commission charged on', 'Service fees %', 'Commission', 'GST on service fee', 'Total Swiggy fees', 'Net payout'];
const order = (id, date, coupon) => {
  const share = coupon ? 40 : 0, net = 200 - share, comm = net * 0.25, gst = comm * 0.18;
  return [id, date, 'Delivered', coupon, 200, 0, share, net, net, 25, comm, gst, comm + gst, net - comm - gst];
};
const ROWS = [
  order('1000000001', '2026-08-03 20:10:00', 'SAVE'),
  order('1000000002', '2026-08-04 20:30:00', ''),
  order('1000000003', '2026-08-05 13:00:00', ''),
  order('1000000004', '2026-08-09 21:00:00', 'SAVE')
];
function book(sheets) {
  const wb = X.utils.book_new();
  Object.entries(sheets).forEach(([name, aoa]) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), name));
  return X.read(X.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
}
const swiggy = (rows = ROWS, head = HEAD) => book({ 'Payout Breakup': [['Net Payout', rows.reduce((s, r) => s + r[13], 0)]], 'Order Level': [['Statement'], head, ...rows] });
const ZCSV = ['Metric,Aug 2026', 'Delivered orders,10', 'Sales (Rs),3000', 'Discount given (Rs),200',
  'Orders with offers,4', 'Gross sales from offers (Rs),1000', 'Effective discount (%),20'].join('\n');
const inp = { fc: 35, comm: 20 };
const codeOf = fn => { try { fn(); return 'NO ERROR'; } catch (e) { return e.code || e.message; } };
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, a + ' is not close to ' + b);

// ---------- Test 1: the numbers ----------
test('reads the Swiggy statement and works out what you keep', () => {
  const A = core.analyze(core.parseWorkbook(swiggy()));
  assert.equal(A.nDelivered, 4);
  near(A.gross, 800); near(A.kept, 507.6); near(A.keptPct, 63.45);
  assert.equal(A.allClear, true);
  assert.equal(A.buckets.find(b => b.key === 'resid'), undefined); // fully reconciles
});

test('decisions: coupon break-even, per-order comparison, break-even commission', () => {
  const A = core.analyze(core.parseWorkbook(swiggy()));
  const Z = core.parseZomatoCsv(ZCSV);
  const d = core.decide(A, Z, inp);
  // coupon orders keep 2 x 112.8 = 225.6, food cost 35% of 400 = 140 -> C = 85.6; f = 80 / (85.6 + 80)
  near(d.swCoupon.f, 80 / 165.6, 1e-9);
  near(d.swPer, (507.6 - 280) / 4);                         // 56.9
  near(d.z.per, ((2800 * (1 - 0.2 * 1.18)) - 1050) / 10);   // 108.92 (estimate)
  near(d.z.cStar, 100 * (1 - (56.9 * 10 + 1050) / 2800) / 1.18, 0.01); // about 35.7
  // at 30/35/40/45% food cost: 80/(225.6-120+80), 80/165.6, 80/(225.6-160+80), 80/(225.6-180+80)
  assert.deepEqual([...d.swCoupon.grid.map(g => Math.round(100 * g.f))], [43, 48, 55, 64]);
});

test('Zomato swapped labels are caught by the arithmetic', () => {
  const swapped = ZCSV.replace('Orders with offers,4', 'Orders with offers,1000').replace('Gross sales from offers (Rs),1000', 'Gross sales from offers (Rs),4');
  const Z = core.parseZomatoCsv(swapped);
  assert.equal(Z.swapped, true); assert.equal(Z.offerOrders, 4); assert.equal(Z.offerSales, 1000);
  assert.equal(core.parseZomatoCsv(ZCSV).swapped, false);
});

// ---------- Test 2: advice picked by rules ----------
test('advice: rules pick Do / Measure / Stop from computed numbers', () => {
  const A = core.analyze(core.parseWorkbook(swiggy()));
  const Z = core.parseZomatoCsv(ZCSV);
  const adv = core.advise(A, Z, core.decide(A, Z, inp), inp);
  assert.equal(adv.lead.head, 'You keep about ₹63.5 of every ₹100 you sell on Swiggy.');
  assert.equal(adv.d1.rule, 'halve');                  // 48% sits between 25% and 50%
  assert.match(adv.d1.head, /48% of those orders/);
  assert.match(adv.d1.stop, /more than 1 a week/);     // 0.48 x 2 coupon orders in 1 week, at least 1
  assert.equal(adv.d2.rule, 'zomato');                 // Zomato about ₹52 more per order
  assert.match(adv.d2.head, /₹52 more per order .*\(estimate\).*above 36%/);
  // the commission is a guess, so the advice is conditional on it and labelled an estimate
  assert.match(adv.d2.do, /^If your real Zomato commission is below 36%, put .* At the 20% you entered, .*\(estimate\)\.$/);
  assert.match(adv.d2.stop, /36% or more/);
  assert.match(adv.lead.basis, /^Zomato estimate: .*20% commission you entered/);
  assert.equal(adv.d3.rule, 'slot');
  assert.match(adv.d3.do, /Dinner \(7–10 pm\), which brings 75%/);
  assert.match(adv.d3.stop, /lunch is not above 1 orders a week/);
  ['d1', 'd2', 'd3'].forEach(k => ['do', 'measure', 'stop'].forEach(f => assert.ok(adv[k][f], k + '.' + f + ' is empty')));
  assert.ok(!/overcharg|wrong/i.test(JSON.stringify(adv)));
});

test('advice: other coupon rules and missing Zomato', () => {
  const A = core.analyze(core.parseWorkbook(swiggy()));
  assert.equal(core.advise(A, null, core.decide(A, null, { fc: 20, comm: 20 }), { fc: 20, comm: 20 }).d1.rule, 'halve');
  assert.equal(core.advise(A, null, core.decide(A, null, { fc: 50, comm: 20 }), { fc: 50, comm: 20 }).d1.rule, 'pause');
  assert.equal(core.advise(A, null, core.decide(A, null, { fc: 80, comm: 20 }), { fc: 80, comm: 20 }).d1.rule, 'loss');
  const noCoupons = core.analyze(core.parseWorkbook(swiggy(ROWS.map(r => { const o = order(r[0], r[1], ''); return o; }))));
  assert.equal(core.advise(noCoupons, null, core.decide(noCoupons, null, inp), inp).d1.rule, 'none');
  const adv = core.advise(A, null, core.decide(A, null, inp), inp);
  assert.equal(adv.d2.rule, 'nozomato');
  assert.equal(adv.lead.basis, '');
});

// ---------- Test 2: the number checker ----------
test('checker: accepts numbers that are in the data', () => {
  const p = { head: 'You keep about ₹60.2 of every ₹100 you sell on Swiggy.', stop: 'more than 39% and 1,23,456 orders' };
  assert.equal(core.checkText('You keep about ₹60 of every ₹100.', p).ok, true);       // 60.2 rounded
  assert.equal(core.checkText('₹60.2 के हर ₹100 में', p).ok, true);
  assert.equal(core.checkText('₹६० of ₹१००', p).ok, true);   // Hindi digits
  assert.equal(core.checkText('₹೬೦', p).ok, true);                                // Kannada digits
  assert.equal(core.checkText('1,23,456 orders, 39%', p).ok, true);
  assert.equal(core.checkText('123456 orders', p).ok, true);
  assert.equal(core.checkText('39%', { f: 38.6 }).ok, true);                                    // number values round too
});

test('checker: rejects numbers that are not in the data, and banned words', () => {
  const p = { head: 'You keep about ₹60.2 of every ₹100.', stop: 'more than 39%' };
  assert.deepEqual([...core.checkText('You keep about ₹61 of every ₹100.', p).bad], ['61']);
  assert.equal(core.checkText('40%', { f: 38.6 }).ok, false);
  assert.equal(core.checkText('about 1.2 lakh', p).ok, false);                                    // fails closed
  assert.equal(core.checkText('₹६१', p).ok, false);                                 // Hindi 61
  assert.equal(core.checkText('Swiggy overcharged you ₹60', p).banned, 'overcharg');
  assert.equal(core.checkText('यह गलत है', p).ok, false);     // Hindi "galat"
  assert.equal(core.checkText('ಇದು ತಪ್ಪು', p).ok, false); // Kannada "tappu"
});

test('checker: order IDs and dates in drafts', () => {
  const p = { period: '2026-08-03 to 2026-08-09', orders: ['219876543210'] };
  assert.equal(core.checkText('Order 219876543210, period 2026-08-03 to 2026-08-09 (3 Aug 2026)', p).ok, true);
  assert.equal(core.checkText('Order 219876543211', p).ok, false);
  assert.equal(core.checkText('on 2026-08-04', p).ok, false);
});

test('every number in the plain advice passes the checker against itself', () => {
  const A = core.analyze(core.parseWorkbook(swiggy()));
  const Z = core.parseZomatoCsv(ZCSV);
  const payload = core.phrasePayload(core.advise(A, Z, core.decide(A, Z, inp), inp));
  Object.keys(payload).forEach(k => assert.equal(core.checkText(Object.values(payload[k]).join('\n'), payload[k]).ok, true, k));
});

// ---------- Test 3: wrong files ----------
test('wrong files give a specific error code, never numbers', () => {
  const zAsWorkbook = X.read(ZCSV, { type: 'string' });
  assert.equal(codeOf(() => core.parseWorkbook(zAsWorkbook)), 'LOOKS_LIKE_ZOMATO');
  assert.equal(codeOf(() => core.parseZomato(swiggy())), 'LOOKS_LIKE_SWIGGY');
  assert.equal(codeOf(() => core.parseWorkbook(book({ Sheet1: [['hello', 1]] }))), 'NO_ORDER_SHEET');
  assert.equal(codeOf(() => core.parseWorkbook(book({ 'Order Level': [['nothing here']] }))), 'NO_HEADER');
  const noComm = HEAD.map(h => (h === 'Commission' ? 'Fee' : h));
  const e = (() => { try { core.parseWorkbook(swiggy(ROWS, noComm)); } catch (x) { return x; } })();
  assert.equal(e.code, 'MISSING_COLUMNS'); assert.deepEqual([...e.detail], ['Commission']);
  assert.equal(codeOf(() => core.parseWorkbook(swiggy([]))), 'EMPTY');
  // Totals: the summary says ₹400 but the orders add up to ₹507.60, so ₹107.60 is unexplained (cut-off max(₹10, 1% of ₹800) = ₹10).
  const off = b => book({ 'Payout Breakup': [['Net Payout', b]], 'Order Level': [['Statement'], HEAD, ...ROWS] });
  assert.equal(codeOf(() => core.analyze(core.parseWorkbook(off(400)))), 'TOTALS_DONT_RECONCILE');
  assert.equal(codeOf(() => core.analyze(core.parseWorkbook(off(497)))), 'TOTALS_DONT_RECONCILE'); // ₹10.60 off
  assert.equal(codeOf(() => core.analyze(core.parseWorkbook(off(507.41)))), 'NO ERROR');           // ₹0.19 off, like a real statement
  assert.equal(codeOf(() => core.parseZomatoCsv('a,b\n1,2')), 'NO_METRICS');
  assert.equal(codeOf(() => core.parseZomatoCsv('%PDF-1.4 \u0000\u0001 binary junk')), 'NO_METRICS');
  assert.equal(codeOf(() => core.parseZomatoCsv(ZCSV.replace('Delivered orders,10', 'Delivered orders,0'))), 'EMPTY');
});
