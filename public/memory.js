// Payout memory. Plain script (loaded after core.js), no DOM, no network.
// A snapshot is a SUMMARY of one Swiggy statement: dates and totals only.
// It never holds order rows, order IDs or anything about customers.
// Where it is kept (the owner's browser, or memory for the sample demo) is decided by the caller, who passes a `store`
// with getItem / setItem / removeItem, like localStorage.
const MEM_KEY = 'payoutChecker.history.v1';
const MEM_COST_KEYS = ['disc', 'comm', 'pcc', 'other', 'gstf', 'tds', 'ads'];
const MEM_COST_NAMES = {
  disc: 'coupons you funded', comm: 'commission', pcc: 'payment collection', other: 'other Swiggy fees',
  gstf: 'GST on Swiggy fees', tds: 'TDS', ads: 'ads and adjustments'
};

// Same stand-in for localStorage, kept in this tab only. Used for the sample demo so made-up data never reaches the real history.
function memStore() {
  const m = {};
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; }
  };
}

// Build the summary for one analysed statement. All numbers come from analyze() and decide().
function memSnapshot(A, d, when) {
  const pct = {};
  A.buckets.forEach(b => { pct[b.key] = A.gross ? (100 * b.amt) / A.gross : 0; });
  MEM_COST_KEYS.forEach(k => { if (pct[k] == null) pct[k] = 0; });
  const days = periodDays(A), weeks = days / 7, sw = d.swCoupon;
  const snap = {
    v: 1, id: 'swiggy|' + A.from + '|' + A.to, platform: 'swiggy', from: A.from, to: A.to, days,
    sales: A.gross, orders: A.nDelivered, net: A.kept, keptPct: A.keptPct,
    netPerOrder: A.nDelivered ? A.kept / A.nDelivered : 0,
    discounts: sw.cost, discountOrders: sw.n, pct, flags: A.flags.length,
    breakEven: sw.f == null ? null : sw.f,
    decision: null,
    savedAt: (when || new Date()).toISOString()
  };
  // The coupon decision, so the next statement can say whether acting on it worked. Same formulas as advise().
  if (sw.n && sw.f != null) {
    const rule = sw.f >= 0.5 ? 'pause' : sw.f >= 0.25 ? 'halve' : 'keep';
    snap.decision = {
      block: 'coupons', rule,
      ordersPerWeek: Math.max(1, Math.round(A.nDelivered / weeks)),
      stopDrop: Math.max(1, Math.round((sw.f * sw.n) / weeks)),
      couponPerWeek: sw.cost / weeks
    };
  }
  return snap;
}

const isNum = x => typeof x === 'number' && Number.isFinite(x);
function memValid(s) {
  return !!s && s.v === 1 && typeof s.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(s.to || '') &&
    ['days', 'sales', 'orders', 'net', 'keptPct', 'netPerOrder', 'discounts'].every(k => isNum(s[k])) && s.days > 0 && !!s.pct && typeof s.pct === 'object';
}
function memLoad(store) {
  try {
    const raw = store.getItem(MEM_KEY);
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a.filter(memValid).sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : 0)) : [];
  } catch (e) { return []; }
}
// Saving the same period again replaces it, so uploading a file twice never makes two entries.
function memSave(store, snap) {
  const list = memLoad(store).filter(s => s.id !== snap.id);
  list.push(snap);
  list.sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
  store.setItem(MEM_KEY, JSON.stringify(list));
  return list;
}
function memClear(store) { store.removeItem(MEM_KEY); }
// The latest saved statement that ended before this one began.
function memPrevious(list, cur) {
  const earlier = list.filter(s => s.id !== cur.id && s.to < cur.from);
  return earlier.length ? earlier[earlier.length - 1] : null;
}

// What changed between two statements. Totals are compared as they are when both cover about the same number of days,
// and per week when they don't, so a 7-day file is never set against a 30-day one.
function memCompare(prev, cur) {
  const comparable = Math.abs(prev.days - cur.days) <= 3;
  const sp = comparable ? 1 : 7 / prev.days, sc = comparable ? 1 : 7 / cur.days;
  const row = (key, label, p, c, kind, badWhenUp) => {
    const delta = c - p, change = kind === 'pp' ? delta : (p ? (100 * delta) / p : null);
    const sig = kind === 'pp' ? Math.abs(delta) >= 0.5 : (change != null && Math.abs(change) >= 5);
    const good = !sig ? null : (badWhenUp ? delta < 0 : delta > 0);
    return { key, label, prev: p, cur: c, delta, change, kind, significant: sig, good };
  };
  const rows = [
    row('sales', comparable ? 'Sales' : 'Sales per week', prev.sales * sp, cur.sales * sc, 'money', false),
    row('orders', comparable ? 'Orders' : 'Orders per week', prev.orders * sp, cur.orders * sc, 'count', false),
    row('discounts', comparable ? 'Coupons you funded' : 'Coupons you funded per week', prev.discounts * sp, cur.discounts * sc, 'money', true),
    row('keptPct', 'Kept of every ₹100', prev.keptPct, cur.keptPct, 'pp', false),
    row('netPerOrder', 'Net per order', prev.netPerOrder, cur.netPerOrder, 'money', false)
  ];
  // Which cost moved most, in rupees of every ₹100 sold.
  const moves = MEM_COST_KEYS.map(k => ({ key: k, name: MEM_COST_NAMES[k], prev: prev.pct[k] || 0, cur: cur.pct[k] || 0, delta: (cur.pct[k] || 0) - (prev.pct[k] || 0) }));
  const up = moves.slice().sort((a, b) => b.delta - a.delta)[0], down = moves.slice().sort((a, b) => a.delta - b.delta)[0];
  const kept = rows[3], ord = rows[1];
  const r1 = x => Math.round(x * 10) / 10;
  let sentence;
  if (kept.delta <= -0.5 && up.delta >= 0.5) {
    sentence = 'You kept ' + r1(Math.abs(kept.delta)) + ' less of every ₹100. The cost that moved most was ' + up.name + ': ₹' + r1(up.prev) + ' of every ₹100 before, ₹' + r1(up.cur) + ' now.';
  } else if (kept.delta >= 0.5 && down.delta <= -0.5) {
    sentence = 'You kept ' + r1(kept.delta) + ' more of every ₹100. The cost that fell most was ' + down.name + ': ₹' + r1(down.prev) + ' of every ₹100 before, ₹' + r1(down.cur) + ' now.';
  } else {
    sentence = 'What you kept of every ₹100 held steady: ₹' + r1(prev.keptPct) + ' before, ₹' + r1(cur.keptPct) + ' now.';
  }
  if (ord.significant) sentence += ' Orders were ' + (ord.delta > 0 ? 'up ' : 'down ') + Math.round(Math.abs(ord.change)) + '%.';
  const headline = kept.delta <= -0.5 ? 'down' : kept.delta >= 0.5 ? 'up' : 'steady';
  return { comparable, rows, sentence, headline, driver: headline === 'down' ? up : headline === 'up' ? down : null, prevDays: prev.days, curDays: cur.days };
}

// Did acting on last time's coupon advice work? Read from the two statements; the owner doesn't have to say what they did.
function memVerdict(prev, cur) {
  const dec = prev && prev.decision;
  if (!dec || dec.block !== 'coupons' || (dec.rule !== 'pause' && dec.rule !== 'halve')) return null;
  const wk = cur.days / 7;
  const couponNow = cur.discounts / wk, ordersNow = cur.orders / wk;
  const cut = dec.couponPerWeek > 0 ? (dec.couponPerWeek - couponNow) / dec.couponPerWeek : 0;
  const r0 = Math.round;
  const asked = dec.rule === 'pause' ? 'pausing' : 'halving';
  const v = { state: 'open', result: null, asked, cutPct: 100 * cut, couponBefore: dec.couponPerWeek, couponNow, ordersBefore: dec.ordersPerWeek, ordersNow, limit: dec.stopDrop,
    netPerOrderBefore: prev.netPerOrder, netPerOrderNow: cur.netPerOrder };
  if (cut < 0.2) {
    v.text = 'Coupon funding is about the same (₹' + r0(couponNow) + ' a week, against ₹' + r0(dec.couponPerWeek) + ' before), so there is nothing to judge yet.';
    return v;
  }
  const drop = dec.ordersPerWeek - ordersNow;
  v.state = 'resolved';
  if (drop > dec.stopDrop) {
    v.result = 'reverse';
    v.text = 'Coupon funding fell ' + r0(100 * cut) + '% (₹' + r0(dec.couponPerWeek) + ' to ₹' + r0(couponNow) + ' a week). Orders fell from about ' + dec.ordersPerWeek + ' to ' + r0(ordersNow) + ' a week, more than the ' + dec.stopDrop + ' a week we said to watch for. That suggests the coupon was bringing extra orders, so consider bringing it back.';
  } else {
    v.result = 'worked';
    v.text = 'Coupon funding fell ' + r0(100 * cut) + '% (₹' + r0(dec.couponPerWeek) + ' to ₹' + r0(couponNow) + ' a week). Orders held at about ' + r0(ordersNow) + ' a week (the limit was a fall of ' + dec.stopDrop + '), and your net per order moved from ₹' + r0(prev.netPerOrder) + ' to ₹' + r0(cur.netPerOrder) + '.';
  }
  return v;
}
