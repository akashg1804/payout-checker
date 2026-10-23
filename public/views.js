// Insights and Flags. Each sentence is a template with holes, filled from insightFacts() and the flags in core.js, so it can be worded in any language.
// Nothing here says why something happened; each card says what it is counted from and how few orders it rests on.

// ---------- small charts ----------
// Horizontal bars with the label and the number as real text (so a screen reader reads each row).
function hbars(rows) {
  const max = Math.max(...rows.map(r => r.value), 0) || 1;
  return el('div', { class: 'hbars', role: 'list' }, rows.map(r => el('div', { class: 'hbar' + (r.hot ? ' hot' : ''), role: 'listitem' },
    el('span', { class: 'hb-l' }, r.label),
    el('span', { class: 'hb-t', 'aria-hidden': 'true' }, el('i', { style: 'width:' + (r.value > 0 ? Math.max(3, (100 * r.value) / max) : 0) + '%' + (r.color ? ';background:' + r.color : '') })),
    el('b', {}, r.text))));
}
// One bar split into parts, with a legend that says each part in words.
const STACK_COLORS = ['#075B49', '#62D2B0', '#f2a93b', '#7C9A8E', '#A9BFB5'];
function stacked(parts) {
  const live = parts.filter(p => p.value > 0);
  return el('div', {},
    el('div', { class: 'stackbar', 'aria-hidden': 'true' }, live.map((p, i) => el('i', { style: 'flex-grow:' + p.value + ';background:' + STACK_COLORS[i % STACK_COLORS.length], title: p.label }))),
    el('div', { class: 'bar-legend' }, live.map((p, i) => el('div', { class: 'legend-item' }, el('i', { class: 'legend-swatch', style: 'background:' + STACK_COLORS[i % STACK_COLORS.length] }), el('span', {}, p.label + ' · ' + p.text)))));
}
const insightCard = (kicker, headline, body, foot) => el('article', { class: 'insight-card' },
  el('div', { class: 'eyebrow' }, t(kicker)), el('h3', {}, headline), body || null, foot ? note(foot) : null);
// "under ₹200", "₹200–299", "₹400 and above": the bands are half-open, so the top of a middle band is one less than the next band's start
const rangeLabel = (b, unit, step) => b.min == null ? t('under {max}', { max: unit(b.max) }) : b.max == null ? t('{min} and above', { min: unit(b.min) }) : unit(b.min) + '–' + (step ? (b.max - step) : b.max);
const PAY_NAMES = { upiintent: 'UPI', upi: 'UPI', cash: 'Cash', card: 'Card', wallet: 'Wallet', netbanking: 'Net banking' };
const payName = k => t(PAY_NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1)));

// ---------- Insights ----------
function insightsSection() {
  const F = insightFacts(A, Z), I = A.ins, cards = [], few = t('Slots under {n} orders are not compared.', { n: MIN_N });

  // when orders come in
  if (F.time) {
    const T = F.time, rows = I.parts.map(p => ({ label: t(p.label), value: p.n, text: p.n + ' · ' + pct0(p.share) + '%', hot: p.key === T.busiest.key }));
    let sub = '';
    if (T.hi && T.lo && T.hi.key !== T.lo.key) sub = t('You keep the most per order in {hi} ({hiK}) and the least in {lo} ({loK}).', { hi: t(T.hi.label), hiK: inr0(T.hi.avgKept), lo: t(T.lo.label), loK: inr0(T.lo.avgKept) }) + ' ';
    const zrows = F.zomato && F.zomato.partsTotal ? [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['snacks', 'Snacks'], ['dinner', 'Dinner'], ['late', 'Late night']].map(([k, label]) => ({ label: t(label), value: F.zomato.parts[k], text: F.zomato.parts[k] + ' · ' + pct0((100 * F.zomato.parts[k]) / F.zomato.partsTotal) + '%' })) : null;
    cards.push(insightCard('WHEN ORDERS COME IN', t('Busiest slot: {slot}, with {n} orders ({share}% of the total).', { slot: t(T.busiest.label), n: T.busiest.n, share: pct0(T.busiest.share) }),
      el('div', {}, hbars(rows), zrows ? el('p', { class: 'chart-sub' }, t('Zomato, from the report')) : null, zrows ? hbars(zrows) : null),
      sub + t('Based on {n} Swiggy orders that have a time.', { n: T.total }) + ' ' + few));
  }
  // which days
  if (F.dow) {
    const order = [1, 2, 3, 4, 5, 6, 0], max = Math.max(...I.dow.map(x => x.n)) || 1;
    const chart = el('div', { class: 'mini-chart', role: 'list' }, order.map(dw => { const x = I.dow[dw]; return el('div', { class: 'chart-col' + (dw === F.dow.busiest.dow ? ' hot' : ''), role: 'listitem' },
      el('strong', {}, String(x.n)), el('i', { style: 'height:' + Math.max(8, Math.round((90 * x.n) / max)) + 'px' }), el('span', {}, t(DAY_NAMES[dw]))); }));
    cards.push(insightCard('WHICH DAYS', t('Busiest day: {day}, with {n} orders. Weekends (Fri–Sun) bring {share}% of orders.', { day: t(DAY_NAMES[F.dow.busiest.dow]), n: F.dow.busiest.n, share: pct0(F.dow.weekendShare) }),
      chart, t('Based on {n} Swiggy orders that have a date.', { n: F.dow.total })));
  }
  // order value
  const bands = I.value.filter(b => b.n > 0);
  if (bands.length) {
    const unit = x => '₹' + x;
    const rows = bands.map(b => ({ label: rangeLabel(b, unit, 1), value: Math.max(0, b.avgKept), text: inr0(b.avgKept) + ' · ' + tn(b.n, '{n} order', '{n} orders') }));
    const prices = (I.prices || []).map(p => el('div', { class: 'price-row' }, el('div', {}, el('strong', {}, inr0(p.price)), el('span', {}, tn(p.n, '{n} order', '{n} orders'))), el('div', { class: 'price-values' }, el('span', {}, t('Avg. kept')), el('strong', {}, inr0(p.avgKept))), el('div', { class: 'price-values' }, el('span', {}, t('Kept per ₹100')), el('strong', {}, pct1(p.keptPct) + '%'))));
    cards.push(insightCard('ORDER VALUE', F.value ? t('By order value, you keep the most per order on {hi} orders ({x} each) and the least on {lo} orders ({y} each).', { hi: rangeLabel(F.value.hi, unit, 1), x: inr0(F.value.hi.avgKept), lo: rangeLabel(F.value.lo, unit, 1), y: inr0(F.value.lo.avgKept) }) : t('Not enough orders in different price bands to compare yet.'),
      el('div', {}, hbars(rows), prices.length ? el('p', { class: 'chart-sub' }, t('Most common item prices')) : null, prices.length ? el('div', { class: 'price-list' }, prices) : null),
      t('The bars show what you keep per order after the statement’s deductions, before food cost. Bands under {n} orders are not compared.', { n: MIN_N })));
  }
  // coupons against no coupon
  if (F.coupon) {
    const C = F.coupon, rows = [{ label: t('With a coupon'), value: C.with.keptPct, text: pct1(C.with.keptPct) + '%' }];
    if (C.without) rows.push({ label: t('Without a coupon'), value: C.without.keptPct, text: pct1(C.without.keptPct) + '%' });
    const codes = C.codes.map(c => metric(c.code, tn(c.n, '{n} order', '{n} orders') + ' · ' + inr0(c.disc)));
    cards.push(insightCard('COUPONS', C.without ? t('Coupon orders average {a} and keep {k1} each. Orders without a coupon average {b} and keep {k2} each.', { a: inr0(C.with.avgItem), k1: inr0(C.with.avgKept), b: inr0(C.without.avgItem), k2: inr0(C.without.avgKept) }) : t('Every order in this statement used a coupon.'),
      el('div', {}, el('p', { class: 'chart-sub' }, t('Kept per ₹100 of sales')), hbars(rows), codes.length ? el('p', { class: 'chart-sub' }, t('Coupon cost by code')) : null, ...codes),
      t('{share}% of orders used a coupon. Kept is after the statement’s deductions, before food cost.', { share: pct0(C.share) })));
  } else {
    cards.push(insightCard('COUPONS', t('No coupon orders in this statement.'), null, null));
  }
  // delivery distance
  const D2 = F.dist;
  if (D2) {
    const unit = x => x + ' km', rows = I.distBuckets.filter(b => b.n > 0).map(b => ({ label: rangeLabel(b, x => x + ' km', 0), value: b.n, text: tn(b.n, '{n} order', '{n} orders') + ' · ' + inr0(b.avgKept) }));
    cards.push(insightCard('DELIVERY DISTANCE', D2.compare ? t('{p}% of orders travelled over 4 km. Those keep {x} each, against {y} for shorter ones.', { p: pct0(D2.over4Share), x: inr0(D2.over.avgKept), y: inr0(D2.under.avgKept) }) : t('Average delivery distance is {avg} km; {p}% of orders went over 4 km.', { avg: D2.avg.toFixed(1), p: pct0(D2.over4Share) }),
      hbars(rows), t('Longest delivery: {max} km. Based on {n} orders with a distance. Each row shows orders and what you keep per order.', { max: D2.max.toFixed(1), n: D2.n })));
  } else {
    cards.push(insightCard('DELIVERY DISTANCE', t('This statement has no usable delivery-distance data.'), null, null));
  }
  // who orders and how they pay
  if (F.who.members || F.who.pay.length) {
    const parts = [];
    if (F.who.members) parts.push(stacked([{ label: t('Swiggy One members'), value: F.who.members.yes, text: F.who.members.yes }, { label: t('Other customers'), value: F.who.members.known - F.who.members.yes, text: F.who.members.known - F.who.members.yes }]));
    if (F.who.pay.length) { parts.push(el('p', { class: 'chart-sub' }, t('How they paid'))); parts.push(stacked(F.who.pay.map(p => ({ label: payName(p.key), value: p.n, text: pct0(p.share) + '%' })))); }
    cards.push(insightCard('WHO ORDERS', F.who.members ? t('Swiggy One members placed {yes} of {known} orders ({share}%).', { yes: F.who.members.yes, known: F.who.members.known, share: pct0(F.who.members.share) }) : t('How customers paid for these orders.'), el('div', {}, ...parts), null));
  }
  // cancellations and kitchen timing
  const O = F.ops, rowsOps = [metric(t('Cancelled orders'), t('{n} of {of} ({p}%)', { n: O.cancelled.n, of: O.cancelled.of, p: pct1(O.cancelled.rate) })), metric(t('Charged for cancellations'), inr(O.cancelled.cost))];
  if (O.mfr.known) rowsOps.push(metric(t('Food-ready marked not accurate'), t('{n} of {of}', { n: O.mfr.notAccurate, of: O.mfr.known })));
  if (O.mfr.pressKnown) rowsOps.push(metric(t('Food-ready not pressed'), t('{n} of {of}', { n: O.mfr.notPressed, of: O.mfr.pressKnown })));
  cards.push(insightCard('KITCHEN AND CANCELLATIONS', O.cancelled.n ? t('Cancelled: {n} of {of} orders ({p}%).', { n: O.cancelled.n, of: O.cancelled.of, p: pct1(O.cancelled.rate) }) : t('No cancelled orders in this statement.'), el('div', {}, ...rowsOps), t('“Food ready” is the marking the statement keeps for how the kitchen reported an order ready.')));

  // Zomato: from the business report, never from a payout statement
  if (F.zomato) {
    const Zf = F.zomato, names = { impressions: 'Impressions', menuOpens: 'Menu opens', cartBuilds: 'Carts built', placed: 'Orders placed', delivered: 'Delivered' };
    cards.push(insightCard('ZOMATO · FROM PEOPLE SEEING YOU TO ORDERING', Zf.cartLost != null ? t('Of {carts} carts built, {lost} did not become orders ({p}%).', { carts: Z.cartBuilds, lost: Zf.cartLost, p: pct0(Zf.cartLostPct) }) : t('How Zomato customers moved from seeing you to ordering.'),
      hbars(Zf.funnel.map(s => ({ label: t(names[s.key]), value: s.v, text: s.v + (s.rate != null ? ' · ' + t('{p}% of the step before', { p: pct0(s.rate) }) : '') }))),
      t('From the Zomato report. The report does not say why carts were left.')));
    if (Zf.users.total > 0) cards.push(insightCard('ZOMATO · CUSTOMERS', t('Repeat customers placed {share}% of Zomato orders ({r} of {total}).', { share: pct0(Zf.users.repeatShare), r: Zf.users.repeatU, total: Zf.users.total }),
      stacked([{ label: t('New'), value: Zf.users.newU, text: Zf.users.newU }, { label: t('Repeat'), value: Zf.users.repeatU, text: Zf.users.repeatU }, { label: t('Lapsed'), value: Zf.users.lapsedU, text: Zf.users.lapsedU }]),
      t('Orders by type of customer, as reported by Zomato.')));
    const adRows = [metric(t('Ads spend'), inr0(Zf.ads.spend)), metric(t('Sales Zomato credits to ads'), inr0(Zf.ads.sales))];
    if (Zf.offlineHrs != null) adRows.push(metric(t('Hours offline'), String(Math.round(Zf.offlineHrs))));
    if (Zf.lostSales != null) adRows.push(metric(t('Lost sales (reported)'), inr0(Zf.lostSales)));
    if (Zf.rating) adRows.push(metric(t('Average rating'), Number(Zf.rating).toFixed(1) + (Zf.ratedOrders ? ' · ' + tn(Zf.ratedOrders, '{n} rated order', '{n} rated orders') : '')));
    cards.push(insightCard('ZOMATO · ADS AND UPTIME', Zf.ads.spend > 0 ? t('Zomato ads cost {spend}; the report credits them with {sales} in sales.', { spend: inr0(Zf.ads.spend), sales: inr0(Zf.ads.sales) }) : t('No Zomato ad spend in this report.'), el('div', {}, ...adRows), t('All figures here are as reported by Zomato.')));
  }
  return el('section', { class: 'insights-section', id: 'insights-grid' },
    el('div', { class: 'section-head' }, el('div', { class: 'eyebrow' }, t('WHAT THE DATA SHOWS')), el('h2', {}, t('Patterns in this payout.')), el('p', {}, t('Each card is counted from your files. It shows what happened, not why, and says how many orders it rests on.'))),
    el('div', { class: 'insight-grid' }, cards));
}

// ---------- Flags ----------
// English templates; Hindi and Kannada are in the dictionaries. `vars` and `items` come from the flag itself (core.js).
const FLAG_TPL = {
  coupons: ['Coupons took {amt} from your payout', '{pct}% of your sales went to customer coupons that appear in the Discount Summary.', 'Check you meant to run these. If you didn’t switch them on, ask which campaign they belong to.'],
  threshold: ['Coupon orders at or below the coupon’s stated minimum: {n}', 'The coupon text says “above {th}”, but {n} orders had an item total of {th} or less ({codes}).', 'Ask how the minimum is calculated.'],
  cancel: ['Cancellation charges of {amt}', 'Cancelled orders charged to you, including GST: {n}.', 'Confirm the cancellation was yours. If it wasn’t, ask for the reason code.'],
  dupe: ['Ad charges listed more than once: {count}', 'Same type, campaign dates and amount, listed more than once. The extra copies add up to {extra}.', 'Check if you really ran this campaign twice. If not, ask Swiggy why it was billed more than once.'],
  mismatch: ['Orders where a figure doesn’t recompute: {n}', 'These rows disagree with the statement’s own formulas. That means “unexplained”, and is a question to ask, not a finding.', 'Ask for the calculation basis for these orders.'],
  rate: ['Orders at a different commission rate: {n}', 'Most orders are at {usual}%, but these differ.', 'Ask why the rate differs.'],
  ads: ['Ads and other charges of {amt}', 'The payout summary lists ad spend or other adjustments.', 'Match this to campaigns you started.'],
  fees: ['Smaller Swiggy fees of {amt} on {n} orders', 'Fees on top of commission and payment collection. They are charged on some orders only.', 'Check you opted into each one. If you didn’t, ask what it is for.'],
  mfr: ['Food-ready timing is worth checking', 'The statement marks some orders as “not accurate” or “not pressed” for food-ready.', 'Check how your kitchen presses “food ready”, and ask Swiggy what the marking is used for.'],
  trend: ['Orders fell from {from} a week to {to}. Worth asking what changed.', '{basis}', 'Look at what changed in those weeks: menu, prices, coupons, offline hours, delivery area.'],
  cancelrate: ['{n} of {of} orders were cancelled ({pct}%)', '', 'Check the reasons for the cancellations with Swiggy.'],
  carts: ['Most Zomato carts did not become orders', '{lost} of {carts} carts built were not ordered ({pct}%). The report does not say why.', 'Look at prices, delivery fee and delivery time on Zomato.'],
  offline: ['Zomato shows offline time and lost sales', 'About {hrs} hours offline and {lost} in lost sales, as reported by Zomato.', 'Check when the outlet went offline and whether it was planned.'],
  rating: ['Zomato rating is below 4', 'Average rating {rating} from {rated} rated orders.', 'Read the recent low ratings for a common theme.']
};
function flagVars(f, trend) {
  const v = f.vars || {};
  return Object.assign({}, v, {
    amt: v.amt != null ? inr(v.amt) : '', extra: v.extra != null ? inr(v.extra) : '', pct: v.pct != null ? (f.key === 'coupons' ? pct1(v.pct) : pct0(v.pct)) : '',
    th: v.th != null ? '₹' + v.th : '', lost: f.key === 'carts' ? v.lost : (v.lost != null ? inr0(v.lost) : ''), hrs: v.hrs != null ? Math.round(v.hrs) : '', basis: trend ? trend.basis : ''
  });
}
function flagLines(f) {
  const it = f.items || [];
  if (f.key === 'coupons') return it.map(i => t('{code}: {n} orders · {amt} ({own})', { code: i.code, n: i.n, amt: inr(i.amt), own: i.own === 'all' ? t('you pay all of it') : i.own == null ? t('who funds it isn’t stated in the file') : t('you pay {p}%', { p: i.own }) }));
  if (f.key === 'threshold') return [t('It may still be valid if packaging counts toward the minimum. This is a question, not a finding.')];
  if (f.key === 'dupe') return it.map(i => t('{type} {amt}: {times} times', { type: i.type, amt: inr(i.total), times: i.times }) + (i.invoices.length ? ' · ' + t('invoices {list}', { list: i.invoices.join(', ') }) : ''));
  if (f.key === 'mismatch') return it.map(i => t('…{id}: {label} (off by {diff})', { id: i.id6, label: t(i.label), diff: inr(i.diff) }));
  if (f.key === 'rate') return it.map(i => t('…{id}: {rate}%', { id: i.id6, rate: i.rate }));
  if (f.key === 'fees') return it.map(i => t('{label}: {amt} ({n} orders)', { label: t(i.label), amt: inr(i.amt), n: i.n }));
  if (f.key === 'mfr') { const v = f.vars, out = []; if (v.bad) out.push(t('Marked not accurate on {bad} of {known} orders.', v)); if (v.notPressed) out.push(t('Not pressed on {notPressed} of {pressKnown} orders.', v)); return out; }
  if (f.key === 'cancel' && f.vars.by) return [t('Marked as cancelled by {by}.', { by: t(f.vars.by) })];
  return [];
}
function flagCard(f, trend, index) {
  const tpl = FLAG_TPL[f.key];
  if (!tpl) return null;
  const v = flagVars(f, trend), lines = flagLines(f);
  return el('article', { class: 'flag flag-' + f.kind },
    el('div', { class: 'flag-top' }, el('h4', {}, t(tpl[0], v)), f.amount > 0 ? el('strong', { class: 'flag-amt' }, inr(f.amount)) : null),
    tpl[1] ? el('p', { class: 'flag-why' }, t(tpl[1], v)) : null,
    lines.length ? el('ul', {}, lines.map(l => el('li', {}, l))) : null,
    el('p', { class: 'flag-ask' }, el('b', {}, t('What to do:') + ' '), t(tpl[2], v)),
    index != null ? el('button', { class: 'button ghost', type: 'button', onclick: () => { $('#flagSel').value = String(index); $('#draftBox').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }); } }, t('Draft message')) : null);
}
function flagsSection() {
  const trend = ordersTrend(A, LANG), extra = extraFlags(A, Z, LANG);
  const money = A.flags.map((f, i) => ({ f, i })).filter(x => x.f.kind === 'money'), signals = A.flags.map((f, i) => ({ f, i })).filter(x => x.f.kind === 'signal').concat(extra.map(f => ({ f, i: null })));
  const group = (title, items) => items.length ? el('div', { class: 'flag-group' }, el('h3', {}, t(title)), ...items.map(x => flagCard(x.f, trend, x.i)).filter(Boolean)) : null;
  const total = money.length + signals.length;
  const ck = el('ul', { class: 'checks' });
  A.checks.forEach(c => ck.append(el('li', {}, el('span', { class: 'tick ' + (c.ok === c.tot ? 'ok' : 'no') }, t(c.ok === c.tot ? 'Matches' : 'Differs')),
    el('span', {}, (c.tot > 1 ? t('{ok} of {tot} orders: ', { ok: c.ok, tot: c.tot }) : '') + (c.key === 'sumnet' ? t('Order rows add up to the payout summary ({amt})', { amt: inr(c.net) }) : t(c.label))))));
  const flagOpts = A.flags.length ? A.flags.map((f, i) => el('option', { value: String(i) }, t((FLAG_TPL[f.key] || [f.title])[0], flagVars(f, null)))) : [el('option', { value: '-1' }, t('General question about this payout'))];
  return el('section', { class: 'flags-section', id: 'flags-list' },
    el('div', { class: 'section-head' }, el('div', { class: 'eyebrow' }, t('FLAGS')),
      el('h2', {}, total ? t('Worth checking.') : t('Nothing unusual was detected.')),
      el('p', {}, total ? t('{m} to check with Swiggy and {s} signals from your data. Each one is a question to ask, not a claim that anything is wrong.', { m: money.length, s: signals.length }) : t('Every figure recomputes and no unusual charges showed up. Passing these checks means the arithmetic is internally consistent. It doesn’t prove each charge was agreed to.'))),
    group('Worth checking with Swiggy', money), group('Signals from your data', signals),
    el('div', { id: 'draftBox', class: 'draft' }, el('h3', {}, t('Message to Swiggy support')), el('p', { class: 'note' }, t('The message is written in English, because it goes to Swiggy support. You send it yourself.')),
      el('label', { for: 'flagSel' }, t('About')), el('select', { id: 'flagSel' }, flagOpts),
      el('div', { class: 'row' }, el('button', { class: 'button', id: 'draftBtn', type: 'button', onclick: doDraft }, t('Draft the message')), el('button', { class: 'button ghost', type: 'button', onclick: copyDraft }, t('Copy'))),
      el('textarea', { id: 'draftOut', rows: '8', 'aria-label': t('Drafted message') }), el('p', { id: 'draftNote', class: 'ai-status' })),
    el('div', { class: 'checks-block' }, el('h3', {}, t('What I checked')), ck, note(t('Passing these checks means the arithmetic is internally consistent. It doesn’t prove each charge was agreed to.'))));
}
