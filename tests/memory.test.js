// Run with: npm test
// Payout memory: all expected numbers are worked out by hand in the comments.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../scripts/load-core');

const snap = (o) => Object.assign({
  v: 1, id: 'swiggy|' + o.from + '|' + o.to, platform: 'swiggy', days: 30, flags: 0, breakEven: null, decision: null, savedAt: '2026-09-01T00:00:00.000Z',
  pct: { disc: 10, comm: 20, pcc: 2, other: 0, gstf: 5, tds: 0.1, ads: 0 }
}, o);
const AUG = snap({ from: '2026-08-01', to: '2026-08-30', sales: 1000, orders: 10, net: 600, keptPct: 60, netPerOrder: 60, discounts: 100 });
const SEP = snap({ from: '2026-09-01', to: '2026-09-30', sales: 1200, orders: 12, net: 684, keptPct: 57, netPerOrder: 57, discounts: 180,
  pct: { disc: 15, comm: 20, pcc: 2, other: 0, gstf: 5, tds: 0.1, ads: 0 } });
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, a + ' is not close to ' + b);

test('what changed: sales and orders up 20%, coupons up 80%, kept down 3 points', () => {
  const c = core.memCompare(AUG, SEP);
  assert.equal(c.comparable, true);
  const r = Object.fromEntries(c.rows.map(x => [x.key, x]));
  near(r.sales.change, 20); near(r.orders.change, 20); near(r.discounts.change, 80);
  near(r.keptPct.delta, -3); near(r.netPerOrder.change, -5);                       // 60 -> 57 is -5%
  assert.equal(r.sales.good, true);                                               // more sales is good
  assert.equal(r.discounts.good, false);                                          // more coupon funding is not
  assert.equal(r.keptPct.good, false); assert.equal(r.netPerOrder.good, false);
  assert.equal(c.headline, 'down');
  assert.equal(c.driver.key, 'disc');                                             // 10 -> 15 of every ₹100 is the biggest rise
  assert.equal(c.sentence, 'You kept 3 less of every ₹100. The cost that moved most was coupons you funded: ₹10 of every ₹100 before, ₹15 now. Orders were up 20%.');
});

test('what changed: a rise in take-home names the cost that fell most', () => {
  const better = snap({ from: '2026-09-01', to: '2026-09-30', sales: 1000, orders: 10, net: 650, keptPct: 65, netPerOrder: 65, discounts: 50,
    pct: { disc: 5, comm: 20, pcc: 2, other: 0, gstf: 5, tds: 0.1, ads: 0 } });
  const c = core.memCompare(AUG, better);
  assert.equal(c.headline, 'up'); assert.equal(c.driver.key, 'disc');
  assert.equal(c.sentence, 'You kept 5 more of every ₹100. The cost that fell most was coupons you funded: ₹10 of every ₹100 before, ₹5 now.'); // orders unchanged, so no orders sentence
});

test('what changed: small moves count as steady', () => {
  const same = snap({ from: '2026-09-01', to: '2026-09-30', sales: 1000, orders: 10, net: 603, keptPct: 60.3, netPerOrder: 60.3, discounts: 100 });
  const c = core.memCompare(AUG, same);
  assert.equal(c.headline, 'steady'); assert.equal(c.driver, null);
  assert.equal(c.sentence, 'What you kept of every ₹100 held steady: ₹60 before, ₹60.3 now.');
});

test('what changed: a 7-day file is never set against a 30-day one', () => {
  const week = snap({ from: '2026-09-01', to: '2026-09-07', days: 7, sales: 700, orders: 7, net: 420, keptPct: 60, netPerOrder: 60, discounts: 70 });
  const c = core.memCompare(week, SEP);
  assert.equal(c.comparable, false);
  const r = Object.fromEntries(c.rows.map(x => [x.key, x]));
  assert.equal(r.sales.label, 'Sales per week');
  near(r.sales.prev, 700); near(r.sales.cur, 1200 * 7 / 30);                      // 280 a week now
  near(r.orders.cur, 12 * 7 / 30);
});

test('previous statement: the latest one that ended before this one began', () => {
  const OCT = snap({ from: '2026-10-01', to: '2026-10-30', sales: 1, orders: 1, net: 1, keptPct: 1, netPerOrder: 1, discounts: 0 });
  const list = [AUG, SEP];
  assert.equal(core.memPrevious(list, OCT).id, SEP.id);
  assert.equal(core.memPrevious(list, SEP).id, AUG.id);       // itself is skipped
  assert.equal(core.memPrevious(list, AUG), null);            // baseline
  const overlap = snap({ from: '2026-09-15', to: '2026-10-15', sales: 1, orders: 1, net: 1, keptPct: 1, netPerOrder: 1, discounts: 0 });
  assert.equal(core.memPrevious(list, overlap).id, AUG.id);   // September overlaps it, so it is not "before"
});

test('saving: same period replaces, list stays in date order, bad entries are ignored, clear empties', () => {
  const store = core.memStore();
  assert.deepEqual([...core.memLoad(store)], []);
  core.memSave(store, SEP); core.memSave(store, AUG);
  assert.deepEqual([...core.memLoad(store).map(s => s.id)], [AUG.id, SEP.id]);
  const again = core.memSave(store, Object.assign({}, SEP, { sales: 9999, orders: 99 }));
  assert.equal(again.length, 2); assert.equal(again[1].sales, 9999);   // replaced, not duplicated
  store.setItem(core.MEM_KEY, '{not json');
  assert.deepEqual([...core.memLoad(store)], []);                      // corrupt data is ignored, never thrown
  store.setItem(core.MEM_KEY, JSON.stringify([AUG, { v: 1, id: 'x' }, 'junk', null]));
  assert.deepEqual([...core.memLoad(store).map(s => s.id)], [AUG.id]);       // invalid entries filtered out
  core.memClear(store);
  assert.deepEqual([...core.memLoad(store)], []);
});

test('the sample store is separate from the real one', () => {
  const real = core.memStore(), sample = core.memStore();
  core.memSave(sample, AUG);
  assert.equal(core.memLoad(real).length, 0);
});

// A snapshot is built from a real analysis: four orders of ₹200, two with a ₹40 coupon (see core.test.js).
const X = global.XLSX;
const HEAD = ['Order ID', 'Order Date', 'Order Status', 'Coupon type applied', "Item's total", 'Packing charges', 'Restaurant discount share',
  'Net bill value', 'Commission charged on', 'Service fees %', 'Commission', 'GST on service fee', 'Total Swiggy fees', 'Net payout'];
const order = (id, date, coupon) => {
  const share = coupon ? 40 : 0, net = 200 - share, comm = net * 0.25, gst = comm * 0.18;
  return [id, date, 'Delivered', coupon, 200, 0, share, net, net, 25, comm, gst, comm + gst, net - comm - gst];
};
const ROWS = [order('1000000001', '2026-08-03 20:10:00', 'SAVE'), order('1000000002', '2026-08-04 20:30:00', ''),
  order('1000000003', '2026-08-05 13:00:00', ''), order('1000000004', '2026-08-09 21:00:00', 'SAVE')];
const wb = () => { const w = X.utils.book_new();
  X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['Net Payout', ROWS.reduce((s, r) => s + r[13], 0)]]), 'Payout Breakup');
  X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['Statement'], HEAD, ...ROWS]), 'Order Level');
  return X.read(X.write(w, { type: 'array', bookType: 'xlsx' }), { type: 'array' }); };

test('snapshot: summary numbers only, nothing about orders or customers', () => {
  const A = core.analyze(core.parseWorkbook(wb()));
  const d = core.decide(A, null, { fc: 35, comm: 20 });
  const s = core.memSnapshot(A, d, new Date('2026-09-01T10:00:00Z'));
  assert.equal(s.id, 'swiggy|2026-08-03|2026-08-09'); assert.equal(s.days, 7);
  near(s.sales, 800); assert.equal(s.orders, 4); near(s.net, 507.6); near(s.keptPct, 63.45); near(s.netPerOrder, 126.9);
  near(s.discounts, 80); assert.equal(s.discountOrders, 2);
  near(s.pct.disc, 10);                                                              // 80 of 800
  assert.equal(s.decision.rule, 'halve');                                           // 48% sits between 25% and 50%
  assert.equal(s.decision.ordersPerWeek, 4); assert.equal(s.decision.stopDrop, 1); near(s.decision.couponPerWeek, 80);
  assert.equal(s.savedAt, '2026-09-01T10:00:00.000Z');
  assert.equal(core.memValid(JSON.parse(JSON.stringify(s))), true);
  assert.ok(!JSON.stringify(s).includes('1000000001'));                              // no order IDs
});

// ---------- did it work? ----------
const DEC = { block: 'coupons', rule: 'halve', ordersPerWeek: 10, stopDrop: 3, couponPerWeek: 100 };
const before = snap({ from: '2026-08-01', to: '2026-08-07', days: 7, sales: 1, orders: 10, net: 1, keptPct: 60, netPerOrder: 60, discounts: 100, decision: DEC });
const after = o => snap(Object.assign({ from: '2026-08-08', to: '2026-08-14', days: 7, sales: 1, net: 1, keptPct: 60, netPerOrder: 57 }, o));

test('did it work: coupon cut, orders held', () => {
  const v = core.memVerdict(before, after({ discounts: 60, orders: 9 }));          // cut 40%, orders down 1 (limit 3)
  assert.equal(v.state, 'resolved'); assert.equal(v.result, 'worked');
  assert.equal(v.text, 'Coupon funding fell 40% (₹100 to ₹60 a week). Orders held at about 9 a week (the limit was a fall of 3), and your net per order moved from ₹60 to ₹57.');
});
test('did it work: coupon cut, orders fell past the limit', () => {
  const v = core.memVerdict(before, after({ discounts: 60, orders: 5 }));          // orders down 5 (limit 3)
  assert.equal(v.state, 'resolved'); assert.equal(v.result, 'reverse');
  assert.match(v.text, /Orders fell from about 10 to 5 a week, more than the 3 a week we said to watch for/);
  assert.match(v.text, /consider bringing it back/);
});
test('did it work: coupon not cut means nothing to judge yet', () => {
  const v = core.memVerdict(before, after({ discounts: 95, orders: 9 }));          // cut only 5%
  assert.equal(v.state, 'open'); assert.equal(v.result, null);
  assert.match(v.text, /^Coupon funding is about the same \(₹95 a week, against ₹100 before\), so there is nothing to judge yet\.$/);
});
test('did it work: no verdict without a pause or halve decision', () => {
  assert.equal(core.memVerdict(Object.assign({}, before, { decision: null }), after({ discounts: 60, orders: 9 })), null);
  assert.equal(core.memVerdict(Object.assign({}, before, { decision: Object.assign({}, DEC, { rule: 'keep' }) }), after({ discounts: 60, orders: 9 })), null);
});
