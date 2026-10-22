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

// ---------- compact decision UI ----------
const note = (t, cls='') => el('p', {class:'note '+cls}, t);
const metric = (label,value,emphasis=false) => el('div',{class:'metric-row'},el('span',{},label),el('strong',{class:emphasis?'em':''},value));
const card = (num, kicker, title, sub, body) => {
  const details=el('details',{class:'info-card'});
  details.append(el('summary',{},el('div',{class:'card-num'},'0'+num+' · '+kicker),el('h2',{},title),el('p',{},sub),el('span',{class:'open'},'Open →')));
  details.append(el('div',{class:'card-body'},body));
  return details;
};
const adviceBlock = a => el('div',{class:'advice'},el('div',{class:'advice-item'},el('span',{},'DO'),el('strong',{},a.do||'No change needed.')),el('div',{class:'advice-item'},el('span',{},'MEASURE'),el('strong',{},a.measure||'Track the result.')),el('div',{class:'advice-item'},el('span',{},'STOP IF'),el('strong',{},a.stop||'The test fails.')),a.basis?el('p',{class:'basis'},a.basis):null);

function render(){
  const root=$('#board'); root.replaceChildren();
  if(!A){root.hidden=!Z;if(Z)root.append(note('Add the Swiggy payout too — the comparison needs both.'));return;}
  root.hidden=false;
  const d=decide(A,Z,inp); const adv=ADV=advise(A,Z,d,inp);
  const segs=A.buckets.filter(b=>b.amt>.005&&b.pct>0);
  const stack=el('div',{class:'money-bar'},...segs.map(b=>el('i',{class:'k-'+b.key,style:'flex-grow:'+b.pct,title:b.label})));
  // Keep the current result available to the separate actions page without storing order rows.
  localStorage.setItem('after_current', JSON.stringify({
    from:A.from,to:A.to,keptPct:A.keptPct,gross:A.gross,kept:A.kept,orders:A.nDelivered,
    couponShare:A.ins.coupon.share, parts:A.ins.parts.slice(0,6).map(x=>({label:x.label,n:x.n,share:x.share})),
    swiggyPer:d.swPer, zomatoPer:Z&&d.z?d.z.per:null, commission:inp.comm, decision:adv.d1.do||adv.d1.head,
    couponHead:adv.d1.head, platformHead:adv.d2.head, timingHead:adv.d3.head
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
  const sw=d.swCoupon;
  const d1body=el('div',{},metric('Coupon orders',sw.n+' of '+A.nDelivered+' ('+pct0(A.ins.coupon.share)+'%)'),metric('Coupon cost',inr(sw.cost)+' · '+pct1((100*sw.cost)/A.gross)+'% of sales'),metric('Keep per coupon order',sw.perCoupon!=null?inr(sw.perCoupon):'—'),sw.f!=null?metric('Break-even threshold',pct0(100*sw.f)+'% genuinely extra',true):null,el('p',{class:'explain-note'},'The statement cannot tell us which coupon orders were truly incremental. The threshold tells you what must be true for the discount to pay for itself.'));
  const d2body=el('div',{},Z?metric('Swiggy / order',inr0(d.swPer),true):metric('Zomato report','Not added'),Z?metric('Zomato / order','~'+inr0(d.z.per)+' estimate',true):null,Z?metric('Commission used',inp.comm+'% · your input'):null,Z&&d.z.cStar!=null?metric('Break-even commission',pct0(d.z.cStar)+'%'):null);
  const d3body=el('div',{},...A.ins.parts.slice(0,5).map(p=>metric(p.label,p.n+' orders · '+pct0(p.share)+'%')));
  root.append(el('section',{class:'cards-section'},el('div',{class:'section-head'},el('div',{class:'eyebrow'},'READ THE PAYOUT'),el('h2',{},'Three things worth knowing.')),el('div',{class:'card-grid'},card(1,'COUPONS',adv.d1.head,'Is the discount actually earning its keep?',d1body),card(2,'PLATFORMS',Z?adv.d2.head:'Compare the two apps','Which platform leaves more after the costs?',d2body),card(3,'TIMING',adv.d3.head,'When is demand strongest?',d3body))));
  root.append(el('section',{class:'action-section'},el('div',{class:'section-head'},el('div',{class:'eyebrow'},'NEXT · ACTIONS'),el('h2',{},'Now decide what to test.'),el('p',{},'The breakdown stays here. The deeper recommendations live on their own page so this screen stays easy to scan.')),el('a',{class:'button',href:'/actions.html'},'See what to do →')));
  const history=JSON.parse(localStorage.getItem('after_payouts')||'[]');
  const saveBtn=el('button',{class:'button',type:'button',onclick:()=>{const rec={id:Date.now(),saved:new Date().toISOString(),from:A.from,to:A.to,keptPct:A.keptPct,gross:A.gross,kept:A.kept,orders:A.nDelivered,couponShare:A.ins.coupon.share,decision:adv.d1.do||adv.d1.head};const next=[rec,...history.filter(x=>x.from!==rec.from||x.to!==rec.to)].slice(0,12);localStorage.setItem('after_payouts',JSON.stringify(next));saveBtn.textContent='Saved ✓';saveBtn.disabled=true;}},'Save this payout');
  root.append(el('section',{class:'memory-section'},el('div',{class:'memory-copy'},el('div',{class:'eyebrow'},'THE MEMORY LOOP'),el('h2',{},'The next payout should answer what happened last time.'),el('p',{},'Save this result. On the next run, the prototype can compare the period and decision in this browser. No order rows are stored.')),el('div',{class:'memory-actions'},saveBtn,el('a',{class:'button ghost',href:'/insights.html'},'Open payout memory →'))));
  const flagList=A.flags.map((f,i)=>el('article',{class:'flag'},el('h4',{},f.title),f.amount>0?el('strong',{},inr(f.amount)):null,el('p',{},f.why),f.lines.length?el('ul',{},f.lines.map(l=>el('li',{},l))):null,el('p',{},el('b',{},'Ask: '),f.ask),el('button',{class:'button ghost',type:'button',onclick:()=>{$('#flagSel').value=String(i);$('#draftBox').scrollIntoView({behavior:'smooth',block:'center'})}},'Draft message')));
  const ck=el('ul',{class:'checks'});A.checks.forEach(c=>ck.append(el('li',{},el('span',{class:'tick '+(c.ok===c.tot?'ok':'no')},c.ok===c.tot?'Matches':'Differs'),el('span',{},(c.tot>1?c.ok+' of '+c.tot+' orders: ':'')+c.label))));
  const flagOpts=A.flags.length?A.flags.map((f,i)=>el('option',{value:String(i)},f.title)):[el('option',{value:'-1'},'General question about this payout')];
  const draftOut=el('textarea',{id:'draftOut',rows:'8','aria-label':'Drafted message'});
  root.append(el('details',{class:'audit'},el('summary',{},'Need the audit trail? Open it.'),A.flags.length?flagList:note('Nothing unusual was detected.'),el('h4',{},'What I checked'),ck,el('div',{id:'draftBox',class:'draft'},el('h4',{},'Message to Swiggy support'),el('label',{for:'flagSel'},'About'),el('select',{id:'flagSel'},flagOpts),el('div',{class:'row'},el('button',{class:'button',id:'draftBtn',type:'button',onclick:doDraft},'Draft the message'),el('button',{class:'button ghost',type:'button',onclick:copyDraft},'Copy')),draftOut,el('p',{id:'draftNote',class:'ai-status'}))));
  root.append(note('Files are read in your browser. Calculations are deterministic; AI is only used to reword advice when available.','fine'));
  schedulePhrase();
}

async function askClaude(task,payload){try{const r=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task,lang,payload}),signal:AbortSignal.timeout(12000)});if(!r.ok)return null;const j=await r.json();return j&&typeof j.text==='string'&&j.text?j.text:null}catch(e){return null}}
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
$('#sampleBtn').addEventListener('click',()=>{D=makeSample();A=analyze(D);Z=makeZomatoSample();isSample=true;$('#err').textContent='';render();window.scrollTo({top:0,behavior:'smooth'})});
['fc','comm'].forEach(id=>$('#'+id).addEventListener('input',e=>{const v=parseFloat(e.target.value);if(Number.isFinite(v)&&v>=0&&v<100){inp[id]=v;if(A)render()}}));
