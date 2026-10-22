// Usage: npm run check -- path/to/swiggy-payout.xlsx [path/to/zomato-report.csv] [foodCost%] [zomatoCommission%]
// Prints the analysis, the decisions and the advice so you can compare them with the page.
// Keep real statements outside this folder. Never commit them.
const fs = require('fs');
const core = require('./load-core');
const [file, zFile, fcArg, commArg] = process.argv.slice(2);
if (!file) { console.error('Pass the path to a Swiggy payout .xlsx (and optionally the Zomato .csv)'); process.exit(1); }
const inp = { fc: fcArg ? +fcArg : 35, comm: commArg ? +commArg : 20 };
let a, z = null;
try { a = core.analyze(core.parseWorkbook(XLSX.readFile(file))); }
catch (e) { console.error('Swiggy file not read:', e.code || e.message, e.detail || ''); process.exit(1); }
if (zFile) {
  try { z = core.parseZomatoCsv(fs.readFileSync(zFile, 'utf8')); }
  catch (e) { console.error('Zomato file not read:', e.code || e.message); process.exit(1); }
}
console.log('Period:', a.from, 'to', a.to, '| delivered:', a.nDelivered, '| cancelled:', a.nCancelled);
console.log('Sales:', a.gross, '| payout:', a.kept, '| kept per 100:', a.keptPct.toFixed(1));
a.buckets.forEach(b => console.log(' ', b.label.padEnd(24), b.pct.toFixed(1).padStart(6), b.amt.toFixed(2)));
console.log('All arithmetic checks pass:', a.allClear);
a.flags.forEach(f => console.log('FLAG', f.key, f.amount.toFixed(2), f.title));

// Totals reconciliation: used to choose the cut-off for "totals don't reconcile" before it is enforced.
const resid = a.buckets.find(b => b.key === 'resid');
const sumnet = a.checks.find(c => c.key === 'sumnet');
console.log('\nRECONCILE');
console.log('  Unexplained after all deductions: ₹' + (resid ? resid.amt.toFixed(2) : '0.00') + ' (' + (resid ? resid.pct.toFixed(2) : '0.00') + '% of sales)');
console.log('  Order rows vs summary net payout:', sumnet ? (sumnet.ok ? 'match' : 'differ by ₹' + sumnet.detail) : 'no summary sheet');

const d = core.decide(a, z, inp);
const adv = core.advise(a, z, d, inp);
console.log('\nDECISIONS at food cost ' + inp.fc + '% and Zomato commission ' + inp.comm + '%');
console.log('  Coupon break-even:', d.swCoupon.f == null ? 'n/a' : (100 * d.swCoupon.f).toFixed(1) + '% of coupon orders must be extra');
console.log('  Swiggy left per order:', d.swPer == null ? 'n/a' : d.swPer.toFixed(2));
if (d.z) console.log('  Zomato left per order (estimate):', d.z.per.toFixed(2), '| break-even commission:', d.z.cStar == null ? 'n/a' : d.z.cStar.toFixed(1) + '%');
['lead', 'd1', 'd2', 'd3'].forEach(k => {
  console.log('\n[' + k + (adv[k].rule ? ' / ' + adv[k].rule : '') + ']');
  core.PHRASE_FIELDS.forEach(f => { if (adv[k][f]) console.log('  ' + f.padEnd(8), adv[k][f]); });
});
