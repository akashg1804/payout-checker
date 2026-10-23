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
  assert.equal(adv.lead.head, 'You keep \u20b963.5 of every \u20b9100 sold on Swiggy.');
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

// ---------- break-even meter ----------
// Same four-order fixture: the two coupon orders keep 2 x 112.8 = 225.6 and food cost at 35% is 0.35 x 400 = 140,
// so C = 85.6. The discount given is D = 2 x 40 = 80. earn(f) = f x 85.6 - (1 - f) x 80, break-even f = 80 / 165.6.
test('meter: earn = f x C - (1 - f) x D, checked by hand', () => {
  const A = core.analyze(core.parseWorkbook(swiggy()));
  const sw = core.decide(A, null, inp).swCoupon;
  near(sw.C, 85.6); near(sw.cost, 80);
  near(core.couponEarn(sw, 0), -80);          // no order was extra: all discount, no gain
  near(core.couponEarn(sw, 1), 85.6);         // every order was extra: the coupon orders all count
  near(core.couponEarn(sw, 0.5), 2.8);        // 42.8 - 40
  near(core.couponEarn(sw, 0.25), -38.6);     // 21.4 - 60
  near(core.couponEarn(sw, 0.4), -13.76);     // 34.24 - 48
  assert.ok(core.couponEarn(sw, 0.6) > core.couponEarn(sw, 0.5), 'earn rises as more orders were extra');
});

test('meter: exactly zero at the break-even share decide() reports', () => {
  const A = core.analyze(core.parseWorkbook(swiggy()));
  const sw = core.decide(A, null, inp).swCoupon;
  near(sw.f, 80 / 165.6, 1e-9);
  near(core.couponEarn(sw, sw.f), 0, 1e-9);
  near(core.couponEarn(sw, sw.f + 0.1) + core.couponEarn(sw, sw.f - 0.1), 0, 1e-9); // a straight line through zero here
  // a different food cost moves C and D stays: at 50% food cost C = 225.6 - 200 = 25.6, break-even 80 / 105.6
  const hi = core.decide(A, null, { fc: 50, comm: 20 }).swCoupon;
  near(hi.f, 80 / 105.6, 1e-9);
  near(core.couponEarn(hi, hi.f), 0, 1e-9);
});

// ---------- week by week ----------
const wk = (start, n, partial = false) => ({ start, n, partial, days: partial ? 3 : 7 });
const trendOf = weeks => core.ordersTrend({ ins: { weeks } });

test('weeks: "orders fell" only for complete weeks, and only by half or more', () => {
  const fell = trendOf([wk('2026-08-03', 6, true), wk('2026-08-10', 8), wk('2026-08-17', 6), wk('2026-08-24', 3)]);
  assert.equal(fell.line, 'Orders fell from 8 a week to 3. Worth asking what changed.');
  assert.equal(trendOf([wk('2026-08-10', 8), wk('2026-08-17', 4)]).line, 'Orders fell from 8 a week to 4. Worth asking what changed.'); // exactly half counts
  assert.equal(trendOf([wk('2026-08-10', 8), wk('2026-08-17', 5)]), null);                  // 5 is more than half of 8
  assert.equal(trendOf([wk('2026-08-10', 8), wk('2026-08-17', 8), wk('2026-08-24', 1, true)]), null); // a short last week is ignored
  assert.equal(trendOf([wk('2026-08-10', 8)]), null);                                        // one complete week: nothing to compare
  assert.equal(trendOf([wk('2026-08-03', 8, true), wk('2026-08-10', 2, true)]), null);       // no complete weeks
  assert.equal(trendOf([wk('2026-08-10', 5), wk('2026-08-17', 9), wk('2026-08-24', 4)]).line, 'Orders fell from 9 a week to 4. Worth asking what changed.'); // busiest earlier week, not the first
  assert.equal(trendOf([wk('2026-08-10', 5), wk('2026-08-17', 9), wk('2026-08-24', 12)]), null); // a rise is not a fall
});

test('weeks: the analysis marks partial weeks and the trend reads from it', () => {
  const at = (id, day) => order(id, '2026-08-' + day + ' 13:00:00', '');
  // Aug 4 (Tue) to Aug 17 (Mon): week of Aug 3 covers 6 days, week of Aug 10 covers 7, week of Aug 17 covers 1
  const A = core.analyze(core.parseWorkbook(swiggy([at('2000000001', '04'), at('2000000002', '05'), at('2000000003', '10'), at('2000000004', '11'), at('2000000005', '17')])));
  assert.deepEqual([...A.ins.weeks.map(w => w.n)], [2, 2, 1]);
  assert.deepEqual([...A.ins.weeks.map(w => w.partial)], [true, false, true]);
  assert.deepEqual([...A.ins.weeks.map(w => w.days)], [6, 7, 1]);
  assert.equal(core.ordersTrend(A), null);
  // Aug 3 to Aug 23: three complete weeks of 4, 3 and 2 orders
  const rows = [at('2000000011', '03'), at('2000000012', '04'), at('2000000013', '05'), at('2000000014', '06'),
    at('2000000015', '10'), at('2000000016', '12'), at('2000000017', '14'), at('2000000018', '17'), at('2000000019', '23')];
  const B = core.analyze(core.parseWorkbook(swiggy(rows)));
  assert.deepEqual([...B.ins.weeks.map(w => w.n)], [4, 3, 2]);
  assert.deepEqual([...B.ins.weeks.map(w => w.partial)], [false, false, false]);
  const t = core.ordersTrend(B);
  assert.equal(t.line, 'Orders fell from 4 a week to 2. Worth asking what changed.');
  assert.match(t.basis, /^Complete weeks only: 9 orders across 3 weeks\. That is few orders/);
  assert.equal(core.ordersTrend(core.analyze(core.parseWorkbook(swiggy(rows.slice(0, 8).concat([at('2000000020', '23'), at('2000000021', '22'), at('2000000022', '21')]))))), null); // 4, 3, 4: no fall
});

// ---------- richer insights: day of week, order value, distance, small fees, food-ready, Zomato ----------
// Six delivered orders, item total 200 each, commission 25% (50). Aug 3, 2026 is a Monday.
//  #  when              km   long-dist fee  food-ready accurate / pressed   Swiggy One   pays
//  1  Mon 3 Aug 20:00   1.5  -             yes / yes                       yes          upi
//  2  Mon 3 Aug 21:00   3.0  -             no  / yes                       no           cash
//  3  Tue 4 Aug 13:00   4.5  10            yes / no                        yes          upi
//  4  Sat 8 Aug 20:00   5.0  10            no  / no                        yes          upi
//  5  Sat 8 Aug 22:30   7.0  -             yes / yes                       no           cash
//  6  Sun 9 Aug 12:00   2.0  -             yes / yes                       yes          upi
const HEAD2 = HEAD.concat(['Long distance charges', 'Last Mile (in km)', 'MFR Accurate?', 'MFR Pressed?', 'Swiggy One Customer?', 'Order Payment Type']);
const order2 = (id, date, km, ld, acc, press, one, pay) => {
  const comm = 50, gstFee = 0.18 * (comm + ld), fees = comm + ld + gstFee;
  return [id, date, 'Delivered', '', 200, 0, 0, 200, 200, 25, comm, gstFee, fees, 200 - fees, ld, km, acc, press, one, pay];
};
const ROWS2 = [
  order2('3000000001', '2026-08-03 20:00:00', 1.5, 0, 'yes', 'yes', 'yes', 'upiintent'),
  order2('3000000002', '2026-08-03 21:00:00', 3.0, 0, 'no', 'yes', 'no', 'cash'),
  order2('3000000003', '2026-08-04 13:00:00', 4.5, 10, 'yes', 'no', 'yes', 'upiintent'),
  order2('3000000004', '2026-08-08 20:00:00', 5.0, 10, 'no', 'no', 'yes', 'upiintent'),
  order2('3000000005', '2026-08-08 22:30:00', 7.0, 0, 'yes', 'yes', 'no', 'cash'),
  order2('3000000006', '2026-08-09 12:00:00', 2.0, 0, 'yes', 'yes', 'yes', 'upiintent')
];
const A2 = () => core.analyze(core.parseWorkbook(swiggy(ROWS2, HEAD2)));

test('insights: orders by day of week, order value and delivery distance are counted from the rows', () => {
  const A = A2();
  assert.deepEqual([...A.ins.dow.map(x => x.n)], [1, 2, 1, 0, 0, 0, 2]);          // Sun..Sat: Sun 1, Mon 2, Tue 1, Sat 2
  assert.equal(A.ins.weekend.n, 3);                                                // Fri, Sat, Sun: 2 + 1
  assert.deepEqual([...A.ins.value.map(b => b.n)], [0, 6, 0, 0]);                  // every item total is 200: the 200-299 band
  assert.deepEqual([...A.ins.distBuckets.map(b => b.n)], [1, 2, 2, 1]);            // <2: 1.5 | 2-4: 3.0, 2.0 | 4-6: 4.5, 5.0 | 6+: 7.0
  assert.equal(A.ins.dist4.over.n, 3); assert.equal(A.ins.dist4.under.n, 3);       // over 4 km: 4.5, 5, 7
  near(A.ins.distBuckets[3].avgKept, 200 - 50 - 0.18 * 50);                        // the 7 km order keeps 141
});

test('flags: small Swiggy fees and food-ready timing are raised as questions, with their numbers', () => {
  const A = A2();
  const fees = [...A.flags].find(f => f.key === 'fees'), mfr = [...A.flags].find(f => f.key === 'mfr');
  near(fees.vars.amt, 20); assert.equal(fees.vars.n, 2);                           // 10 + 10 on two orders
  assert.equal(fees.kind, 'money'); assert.equal(fees.items[0].key, 'longDist'); assert.equal(fees.items[0].n, 2);
  assert.deepEqual({ ...mfr.vars }, { bad: 2, known: 6, notPressed: 2, pressKnown: 6 });
  assert.equal(mfr.kind, 'signal'); assert.equal(mfr.amount, 0);
  assert.equal(A.allClear, true);                                                  // the fixture reconciles, so no mismatch flag
  // every flag carries what the screen needs to word it in another language
  A.flags.forEach(f => { assert.ok(f.kind === 'money' || f.kind === 'signal'); assert.ok(f.vars, f.key + ' has vars'); });
});

test('insightFacts: comparisons need at least 3 orders on each side', () => {
  const A = A2(), f = core.insightFacts(A, null);
  assert.equal(f.dow.total, 6); assert.equal(f.dow.busiest.dow, 1);                // Monday and Saturday tie at 2: the first one wins
  near(f.dow.weekendShare, 50);
  assert.equal(f.time.busiest.key, 'dinner'); assert.equal(f.time.busiest.n, 3);   // 20:00, 21:00, 20:00
  assert.equal(f.time.hi, null);                                                   // only one slot has 3 orders: nothing to compare
  assert.equal(f.value, null);                                                     // only one order-value band is used
  assert.equal(f.dist.compare, true); assert.equal(f.dist.over.n, 3);
  near(f.who.members.share, (100 * 4) / 6);                                        // 4 of 6 are Swiggy One members
  assert.equal(f.who.pay[0].key, 'upiintent'); assert.equal(f.who.pay[0].n, 4);
  assert.equal(f.zomato, null);
});

test('extraFlags: Zomato carts, offline time and rating, and a fall in orders', () => {
  const Z = core.parseZomatoCsv(ZCSV + '\nCart builds,40\nPlaced orders,16\nMenu opens,120\nImpressions,900\nOffline time (in hours),12\nLost sales (Rs),500\nAverage rating,3.8\nNew user orders,3\nRepeat user orders,5\nLapsed user orders,2');
  const A = A2(), flags = [...core.extraFlags(A, Z)], keys = flags.map(f => f.key);
  assert.ok(keys.includes('carts') && keys.includes('offline') && keys.includes('rating'));
  const carts = flags.find(f => f.key === 'carts'); near(carts.vars.pct, 60); assert.equal(carts.vars.lost, 24);   // 40 carts, 16 orders
  near(flags.find(f => f.key === 'offline').amount, 500);
  const z = core.insightFacts(A, Z).zomato;
  assert.deepEqual([...z.funnel.map(s => s.key)], ['impressions', 'menuOpens', 'cartBuilds', 'placed', 'delivered']);
  near(z.funnel[1].rate, (100 * 120) / 900); near(z.users.repeatShare, 50);        // 5 of 10 users repeat
  assert.equal(core.extraFlags(A, null).length, 0);                                // no Zomato report and orders are steady: nothing extra
});

test('wording: the same advice comes back in another language when a dictionary is present', () => {
  const A = core.analyze(core.parseWorkbook(swiggy())), d = core.decide(A, null, inp);
  const en = core.advise(A, null, d, inp), hi = core.advise(A, null, d, inp, 'Hindi');
  assert.equal(en.lead.head, 'You keep ₹63.5 of every ₹100 sold on Swiggy.');
  assert.equal(hi.lead.head, en.lead.head);                                        // no dictionary loaded here, so English is the fallback
  assert.equal(core.M('Hello {name}', { name: 'Asha' }), 'Hello Asha');
});
