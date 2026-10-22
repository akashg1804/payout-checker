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
  const items = [249, 289, 149, 349, 199, 449, 179, 299, 249, 399, 149, 229, 329, 189];
  const hours = [20, 21, 0, 22, 13, 19, 23, 20, 1, 21, 12, 22, 19, 20];
  const days = [4, 5, 6, 8, 10, 11, 13, 14, 17, 18, 20, 22, 24, 26, 27];
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
  rows.push(mk(20, 0, 0, '', 24, null, 'cancelled', 'RESTAURANT'));
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

// ---------- small building blocks ----------
const bar = (pct, cls) => el('span', { class: 'mbar' }, el('i', { class: cls || '', style: 'width:' + Math.max(1, Math.min(100, pct)) + '%' }));
const kv = (rows, head) => el('div', { class: 'scroll' }, el('table', { class: 'lt' },
  head ? el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: i ? 'n' : '' }, h)))) : null,
  el('tbody', {}, rows.map(r => el('tr', {}, r.map((c, i) => el('td', { class: i ? 'n' : '' }, c)))))));
const section = (id, block, kicker, headline, ...rest) => el('section', { class: 'dec', id, 'data-block': block }, el('p', { class: 'kicker' }, kicker), el('h3', { class: 'hl', 'data-f': 'head' }, headline), rest);
const note = (t, cls) => el('p', { class: 'note ' + (cls || '') }, t);
// Do / Measure / Stop if, picked by advise() in core.js. AI model may re-word it later (phraseBoard).
const adviceBlock = a => el('div', { class: 'advice' },
  el('dl', {}, ['do', 'measure', 'stop'].filter(f => a[f]).flatMap(f => [el('dt', { 'data-l': f }, LABELS.English[f]), el('dd', { 'data-f': f }, a[f])])),
  a.basis ? el('p', { class: 'basis', 'data-f': 'basis' }, a.basis) : null,
  el('p', { class: 'ainote', 'aria-live': 'polite' }));

// ---------- the board ----------
function render() {
  const root = $('#board'); root.replaceChildren();
  if (!A) { root.hidden = !Z; if (Z) root.append(note('Add the Swiggy payout statement too. The comparison needs both.')); return; }
  root.hidden = false;
  const d = decide(A, Z, inp);
  const adv = ADV = advise(A, Z, d, inp);
  if (isSample) root.append(el('p', { class: 'sample' }, 'Sample data. Every number here is made up to show how the board works. Add your own files to see yours.'));
  const langSel = el('select', { id: 'lang', 'aria-label': 'Language', onchange: e => { lang = e.target.value; phraseBoard(); } },
    Object.keys(LANG_NAMES).map(k => el('option', { value: k, selected: k === lang ? '' : null }, LANG_NAMES[k])));
  root.append(el('div', { class: 'langbar' }, el('label', { for: 'lang' }, 'Advice in'), langSel, el('span', { id: 'aiStatus', class: 'aistatus', 'aria-live': 'polite' })));

  // lead
  const segs = A.buckets.filter(b => b.amt > 0.005 && b.pct > 0);
  const stack = el('div', { class: 'stack', role: 'img', 'aria-label': 'Where each \u20B9100 of Swiggy sales went: ' + segs.map(b => b.label + ' \u20B9' + pct1(b.pct)).join(', ') });
  segs.forEach(b => stack.append(el('i', { class: 'k-' + b.key, style: 'flex-grow:' + b.pct, title: b.label })));
  const where = kv(A.buckets.filter(b => Math.abs(b.pct) >= 0.005 || b.key === 'kept').map(b => [el('span', { class: 'lbl' }, el('span', { class: 'sw k-' + b.key }), b.label), '\u20B9' + pct1(b.pct), inr(b.amt)]), ['Where \u20B9100 of sales went', 'Per \u20B9100', 'Amount']);
  root.append(el('section', { class: 'lead', 'data-block': 'lead' },
    el('p', { class: 'kicker' }, 'Swiggy, ' + A.from + ' to ' + A.to),
    el('h2', { class: 'big', 'data-f': 'head' }, adv.lead.head),
    adv.lead.basis ? el('p', { class: 'zline', 'data-f': 'basis' }, adv.lead.basis) : null,
    el('p', { class: 'sub' }, plural(A.nDelivered, 'delivered order', 'delivered orders') + ' \u00B7 sales ' + inr0(A.gross) + ' \u00B7 payout ' + inr(A.kept)),
    stack, where, el('p', { class: 'ainote', 'aria-live': 'polite' })));

  // decision 1: Swiggy coupons
  const sw = d.swCoupon;
  const dec1 = section('dec-coupons', 'd1', 'Decision 1 \u00B7 Swiggy coupons', adv.d1.head);
  if (sw.n) {
    dec1.append(kv([
      ['Orders that used a coupon', sw.n + ' of ' + A.nDelivered + ' (' + pct0(A.ins.coupon.share) + '%)'],
      ['What the coupons cost you', inr(sw.cost) + ' (' + pct1((100 * sw.cost) / A.gross) + '% of sales)'],
      ['You keep per coupon order, after food cost', sw.perCoupon != null ? inr(sw.perCoupon) : '\u2013'],
      ['You keep per full-price order, after food cost', sw.perFull != null ? inr(sw.perFull) + ' (' + A.ins.coupon.without.n + ' orders)' : 'no full-price orders to compare']]));
    if (sw.f != null) {
      dec1.append(note('\u201CExtra\u201D means orders that wouldn\u2019t have come without the coupon. If fewer than ' + pct0(100 * sw.f) + ' in 100 coupon orders were extra, you\u2019re paying discounts to people who would have ordered anyway. The statement can\u2019t tell you which it is. You can.'));
      dec1.append(kv([['Must be extra to break even', ...sw.grid.map(g => g.f == null ? 'never' : pct0(100 * g.f) + '%')]], ['If food cost is', ...sw.grid.map(g => g.fc + '%')]));
    }
  }
  dec1.append(adviceBlock(adv.d1));
  root.append(dec1);

  // decision 2: which app
  const dec2 = section('dec-apps', 'd2', 'Decision 2 \u00B7 Swiggy or Zomato', adv.d2.head);
  if (!Z) {
    dec2.append(note('Add the Zomato business report above to compare the two apps. Zomato\u2019s report has no commission or fees, so its take-home is estimated from the commission you enter.'));
  } else {
    const z = d.z;
    const swAds = (A.buckets.find(b => b.key === 'ads') || {}).amt || 0;
    dec2.append(kv([
      ['Delivered orders', A.nDelivered, Z.delivered + ' (' + pct0(z.share) + '% of your orders)'],
      ['Average order', inr0(A.gross / A.nDelivered), inr0(Z.sales / Z.delivered)],
      ['Orders with a discount', pct0(A.ins.coupon.share) + '%', Z.placed ? pct0((100 * Z.offerOrders) / Z.delivered) + '%' : '\u2013'],
      ['Discount you fund', inr0(sw.cost) + ' (' + pct1((100 * sw.cost) / A.gross) + '% of sales)', inr0(Z.discount) + ' (' + pct1(z.discPct) + '% of sales)'],
      ['Cost per discounted order', sw.n ? inr0(sw.cost / sw.n) : '\u2013', z.perDiscounted != null ? inr0(z.perDiscounted) : '\u2013'],
      ['Ads', swAds > 0 ? inr0(swAds) + ' (' + pct1((100 * swAds) / A.gross) + '% of sales)' : 'none in this payout', inr0(Z.adsSpend) + ' (' + pct1(z.adsPct) + '% of sales)'],
      ['You keep, % of sales', pct1(A.keptPct) + '%', '~' + pct1(z.keptPct) + '% (estimate)'],
      ['Left per order after food cost', inr0(d.swPer), '~' + inr0(z.per) + ' (estimate)']], ['', 'Swiggy', 'Zomato']));
    dec2.append(note('Swiggy figures come from your payout statement. Zomato\u2019s are estimates: they use the ' + inp.comm + '% commission and ' + inp.fc + '% food cost you entered, add 18% GST on the commission (as on the Swiggy statement), and leave out gateway fees and TDS, so they look a little better than reality. Change the numbers above and the answer moves.'));
    if (z.f != null) dec2.append(note('Zomato offers pay off if at least ' + pct0(100 * z.f) + '% of discounted orders were extra (at ' + inp.comm + '% commission).' + ' At 15%, 20%, 25% and 30% commission that is ' + z.grid.map(g => g.f == null ? 'never' : pct0(100 * g.f) + '%').join(', ') + '.'));
    if (Z.cartBuilds) dec2.append(note('On Zomato, ' + pct0((100 * (Z.cartBuilds - Z.placed)) / Z.cartBuilds) + '% of carts built didn\u2019t become orders (' + (Z.cartBuilds - Z.placed) + ' of ' + Z.cartBuilds + '). The report doesn\u2019t say why.'));
  }
  dec2.append(adviceBlock(adv.d2));
  root.append(dec2);

  // decision 3: when to push
  const sp = A.ins.parts;
  const dec3 = section('dec-time', 'd3', 'Decision 3 \u00B7 When to push', adv.d3.head);
  dec3.append(el('div', { class: 'two' },
    el('div', {}, el('h4', {}, 'Swiggy'), kv(sp.map(p => [p.label, p.n, el('span', {}, bar(p.share, 'a'), ' ' + pct0(p.share) + '%')]))),
    Z ? el('div', {}, el('h4', {}, 'Zomato'), kv([['Breakfast', 'breakfast'], ['Lunch', 'lunch'], ['Snacks', 'snacks'], ['Dinner', 'dinner'], ['Late night', 'late']].map(([l, k]) => {
      const tot = Z.parts.breakfast + Z.parts.lunch + Z.parts.snacks + Z.parts.dinner + Z.parts.late || 1;
      return [l, Z.parts[k], el('span', {}, bar((100 * Z.parts[k]) / tot, 'a'), ' ' + pct0((100 * Z.parts[k]) / tot) + '%')];
    }))) : null));
  const bigBill = sp.length ? sp.reduce((m, p) => (p.avgItem > m.avgItem ? p : m)) : null;
  dec3.append(note('Swiggy slots come from order times' + (Z ? '; Zomato\u2019s come from the report\u2019s daypart counts' : '') + '.' +
    (bigBill && sp.length > 1 ? ' The biggest average bill on Swiggy was ' + bigBill.label + ': ' + inr0(bigBill.avgItem) + ' across ' + plural(bigBill.n, 'order', 'orders') + '.' : '') +
    ' Check that your kitchen, menu and offline hours match when people actually order.'));
  dec3.append(adviceBlock(adv.d3));
  root.append(dec3);

  // side panel: what to ask Swiggy
  const flagList = A.flags.map((f, i) => el('article', { class: 'flag' },
    el('div', { class: 'fh' }, el('h4', {}, f.title), f.amount > 0 ? el('span', { class: 'n' }, inr(f.amount)) : null),
    el('p', {}, f.why), f.lines.length ? el('ul', {}, f.lines.map(l => el('li', {}, l))) : null,
    el('p', { class: 'ask' }, el('strong', {}, 'What to do: '), f.ask),
    el('button', { class: 'btn ghost', type: 'button', onclick: () => { $('#flagSel').value = String(i); $('#draftBox').scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 'Draft a message about this')));
  const ck = el('ul', { class: 'checks' });
  A.checks.forEach(c => ck.append(el('li', {}, el('span', { class: 'tick ' + (c.ok === c.tot ? 'ok' : 'no') }, c.ok === c.tot ? 'Matches' : 'Differs'), el('span', {}, (c.tot > 1 ? c.ok + ' of ' + c.tot + ' orders: ' : '') + c.label))));
  ck.append(el('li', {}, el('span', { class: 'tick ' + (A.adCheck.repeats ? 'no' : 'ok') }, A.adCheck.repeats ? 'Repeated' : 'Checked'), el('span', {}, A.adCheck.rows ? 'Ad charges checked for repeats: ' + (A.adCheck.repeats ? plural(A.adCheck.repeats, 'repeated charge', 'repeated charges') + ' found.' : 'none repeated.') : 'No ad charges in this statement, so nothing to check for repeats.')));
  const flagOpts = A.flags.length ? A.flags.map((f, i) => el('option', { value: String(i) }, f.title)) : [el('option', { value: '-1' }, 'General question about this statement')];
  const draftOut = el('textarea', { id: 'draftOut', rows: '10', 'aria-label': 'Drafted message' });
  root.append(el('details', { class: 'dec fold', id: 'dec-disputes', open: A.flags.some(f => f.key === 'dupe' || f.key === 'mismatch') ? '' : null },
    el('summary', {}, 'What to ask Swiggy about'),
    A.flags.length ? flagList : note('Nothing to raise: every figure recomputes and no unusual charges showed up.'),
    el('h4', {}, 'What I checked'), ck,
    note('Passing these checks means the arithmetic is internally consistent. It doesn\u2019t prove each charge was agreed to.'),
    el('div', { id: 'draftBox', class: 'draft' },
      el('h4', {}, 'Message to Swiggy support'),
      el('label', { for: 'flagSel' }, 'About'), el('select', { id: 'flagSel' }, flagOpts),
      el('div', { class: 'row' }, el('button', { class: 'btn', id: 'draftBtn', type: 'button', onclick: doDraft }, 'Draft the message'), el('button', { class: 'btn ghost', type: 'button', onclick: copyDraft }, 'Copy')),
      draftOut, el('p', { id: 'draftNote', class: 'ainote', 'aria-live': 'polite' }), note('You send it yourself through Swiggy\u2019s own channel. This tool never contacts anyone.'))));
  root.append(note('Your files are read in this browser and not uploaded. To word the advice, AI model is sent only the sentences above (no order details). \u201CDraft the message\u201D also sends the order IDs for the item you chose. Every number AI model writes is checked against your data. This is one outlet and one period, so treat everything as patterns to test, not conclusions.', 'fine'));
  schedulePhrase();
}

// ---------- AI model (optional) with plain fallbacks ----------
// The server builds the prompt from the task name; we send only the data it needs.
// Returns the text, or null if AI model is unavailable, fails or takes longer than 12 seconds.
async function askAI(task, payload) {
  try {
    const r = await fetch('/api/claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, lang, payload }), signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j.text === 'string' && j.text ? j.text : null;
  } catch (e) { return null; }
}
const readJson = t => { const a = t.indexOf('{'), b = t.lastIndexOf('}'); try { return a >= 0 ? JSON.parse(t.slice(a, b + 1)) : null; } catch (e) { return null; } };
const whyPlain = c => c.bad.length ? 'AI model\u2019s wording had a number that isn\u2019t in your data (' + c.bad[0] + '), so this is the plain version.'
  : c.banned ? 'AI model\u2019s wording used a word this app doesn\u2019t use (\u201C' + c.banned + '\u201D), so this is the plain version.'
  : 'AI model\u2019s reply left something out, so this is the plain version.';
let phraseTimer = null, phraseSeq = 0;
const phraseCache = new Map();
function schedulePhrase() { clearTimeout(phraseTimer); phraseTimer = setTimeout(phraseBoard, 600); }
// Re-words each block in the chosen language. A block is used only if every number in it passes checkText().
async function phraseBoard() {
  if (!ADV || !$('#aiStatus')) return;
  const seq = ++phraseSeq, payload = phrasePayload(ADV), key = lang + '|' + JSON.stringify(payload);
  const status = $('#aiStatus');
  status.textContent = 'Wording it in ' + LANG_NAMES[lang] + '\u2026';
  let reply = phraseCache.get(key);
  if (reply === undefined) { reply = await askAI('phrase', payload); if (reply != null) phraseCache.set(key, reply); }
  if (seq !== phraseSeq) return; // inputs changed while we waited
  const blocks = Object.keys(payload);
  const reset = k => { // plain English from code
    const box = $('[data-block="' + k + '"]'); if (!box) return null;
    PHRASE_FIELDS.forEach(f => { const n = $('[data-f="' + f + '"]', box); if (n && ADV[k][f]) n.textContent = ADV[k][f]; });
    box.querySelectorAll('[data-l]').forEach(n => { n.textContent = LABELS.English[n.dataset.l]; });
    box.querySelectorAll('.ainote').forEach(n => { n.textContent = ''; });
    return box;
  };
  blocks.forEach(reset);
  if (reply == null) {
    status.textContent = lang === 'English' ? 'Plain wording: AI model isn\u2019t available right now. The numbers are the same either way.' : 'AI model isn\u2019t available right now, so this is in plain English.';
    return;
  }
  const got = readJson(reply);
  if (!got) { status.textContent = 'AI model\u2019s reply couldn\u2019t be read, so this is the plain wording.'; return; }
  let used = 0;
  blocks.forEach(k => {
    const box = $('[data-block="' + k + '"]'); if (!box) return;
    const g = got[k] || {}, fields = Object.keys(payload[k]);
    const complete = fields.every(f => typeof g[f] === 'string' && g[f].trim());
    const c = complete ? checkText(fields.map(f => g[f]).join('\n'), payload[k]) : { ok: false, bad: [], banned: null };
    if (!c.ok) { const n = box.querySelector('.ainote'); if (n) n.textContent = whyPlain(c); return; }
    fields.forEach(f => { const n = $('[data-f="' + f + '"]', box); if (n) n.textContent = g[f].trim(); });
    box.querySelectorAll('[data-l]').forEach(n => { n.textContent = LABELS[lang][n.dataset.l]; });
    used++;
  });
  status.textContent = used === blocks.length ? 'Worded by AI model. Every number was checked against your data.'
    : used ? 'Worded by AI model, except where a note says otherwise. Every number shown was checked against your data.'
    : 'AI model\u2019s wording didn\u2019t pass the number check, so this is the plain wording.';
}
function draftContext(i) {
  if (i < 0 || !A.flags[i]) return { title: 'General question about this payout statement', why: '', ask: '', orders: [], lines: [] };
  return A.flags[i];
}
function fallbackDraft(f) {
  return 'Subject: Request for explanation, payout ' + A.from + ' to ' + A.to + '\n\nHello,\n\nI run [Restaurant name] (Restaurant ID: [Restaurant ID]). While reviewing our payout statement for ' + A.from + ' to ' + A.to + ', I\u2019d like to understand the following:\n\n\u2022 ' + (f.neutral || f.title) + '\n' +
    (f.orders.length ? '  Order IDs: ' + f.orders.slice(0, 12).join(', ') + (f.orders.length > 12 ? ' and ' + (f.orders.length - 12) + ' more' : '') + '\n' : '') +
    '\nCould you please confirm the basis for these amounts and let me know in writing whether they are correct?\n\nThank you,\n[Your name]\n[Phone]';
}
async function doDraft() {
  const out = $('#draftOut'), btn = $('#draftBtn'), why = $('#draftNote'); btn.disabled = true; out.value = 'Drafting\u2026'; why.textContent = '';
  const f = draftContext(parseInt($('#flagSel').value, 10));
  const payload = { period: A.from + ' to ' + A.to, item: f.neutral || f.title, detail: f.why, notes: f.lines || [],
    orders: f.orders.slice(0, 15), more_orders: Math.max(0, f.orders.length - 15) };
  const t = await askAI('draft', payload);
  const c = t ? checkText(t, payload) : null;
  if (c && c.ok) out.value = t;
  else { out.value = fallbackDraft(f); why.textContent = c ? whyPlain(c) : 'AI model isn\u2019t available right now, so this is a plain template.'; }
  btn.disabled = false;
}
function copyDraft() { const t = $('#draftOut'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand('copy'); } }

// ---------- wire up ----------
$('#swFile').addEventListener('change', e => handleSwiggy(e.target.files[0]));
$('#zFile').addEventListener('change', e => handleZomato(e.target.files[0]));
$('#sampleBtn').addEventListener('click', () => {
  D = makeSample(); A = analyze(D); Z = makeZomatoSample(); isSample = true;
  setStatus('#swStatus', 'Sample data (made up)', true); setStatus('#zStatus', 'Sample data (made up)', true); $('#err').textContent = ''; render();
});
['fc', 'comm'].forEach(id => $('#' + id).addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  if (Number.isFinite(v) && v >= 0 && v < 100) { inp[id] = v; if (A) render(); }
}));
['swDrop', 'zDrop'].forEach(id => {
  const dz = $('#' + id);
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (id === 'swDrop') handleSwiggy(f); else handleZomato(f); });
});
