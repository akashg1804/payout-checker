// Finds every English phrase the app can show and checks that Hindi and Kannada have a translation for each.
// Usage: node scripts/check-i18n.js          (prints what is missing; exits 1 if anything is)
//        node scripts/check-i18n.js --list   (prints every phrase, to start a new dictionary)
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, '..', 'public');
const read = f => fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n');

// All string literals ('...' or "...") inside a piece of source text
function literals(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { s += src.slice(j, j + 2); j += 2; } else { s += src[j]; j++; } }
      out.push(s); i = j + 1;
    } else if (c === '`') { let j = i + 1; while (j < src.length && src[j] !== '`') j += src[j] === '\\' ? 2 : 1; i = j + 1; }
    else i++;
  }
  return out;
}
const unescape = s => s.replace(/\\u([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');

// The text between the parentheses of a call that starts at `open`, split at top-level commas
function callArgs(src, open) {
  const args = []; let depth = 0, cur = '', i = open + 1, quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) { cur += c; if (c === '\\') { cur += src[++i]; } else if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') { if (depth === 0) { args.push(cur); return args; } depth--; }
    if (c === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
    cur += c;
  }
  return args;
}
function fromCalls(src, names, argIndexes) {
  const found = [];
  names.forEach(name => {
    const re = new RegExp('(^|[^\\w$.])' + name + '\\(', 'g'); let m;
    while ((m = re.exec(src))) {
      const args = callArgs(src, m.index + m[0].length - 1);
      argIndexes.forEach(ix => { if (args[ix] != null) literals(args[ix]).forEach(s => found.push(unescape(s))); });
    }
  });
  return found;
}

const keys = new Set();
const add = arr => arr.forEach(s => { if (s && /[A-Za-z\u0900-\u0DFF]/.test(s)) keys.add(s); });

// 1. calls to t(), tn() and the wording function m()/M()
const sources = ['app.js', 'views.js', 'core.js', 'memory-sync.js'].map(f => [f, read(f)]);
['demo.html', 'actions.html', 'insights.html'].forEach(f => { const h = read(f); [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => sources.push([f, m[1]])); });
sources.forEach(([f, src]) => {
  add(fromCalls(src, ['t', 'T'], [0]));
  add(fromCalls(src, ['tn'], [1, 2]));
  add(fromCalls(src, ['m', 'M'], [0]));
  add(fromCalls(src, ['card'], [1, 3]));       // decision card: kicker and subtitle
  add(fromCalls(src, ['insightCard'], [0]));   // insight card: kicker
  add(fromCalls(src, ['group'], [0]));         // flag group titles
  add(fromCalls(src, ['setStatus'], [1]));      // status lines under the file pickers
});
// 2. lists of names that are translated later with t(variable)
const core = read('core.js'), views = read('views.js'), app = read('app.js'), actions = read('actions.html'), insights = read('insights.html');
const list = (src, re) => { const m = src.match(re); return m ? literals(m[1]).map(unescape) : []; };
add(list(core, /const PARTS = \[([\s\S]*?)\n\];/).filter(s => /\(|am|pm/.test(s)));            // time-of-day slots
add([...core.matchAll(/label: '([^']+)'/g)].map(m => unescape(m[1])));                          // bucket, check and fee labels in the analysis
add([...core.matchAll(/'((?:Long-distance charges|Pocket Hero fees|Swiggy One fees|Call-centre charges|Bolt fees|Delivery fee sponsored))'/g)].map(m => m[1]));
add(list(app, /const MONTHS = \[([^\]]*)\]/)); add(list(app, /const DAY_NAMES = \[([^\]]*)\]/));
add(list(views, /const PAY_NAMES = \{([^}]*)\}/).filter(s => !/^[a-z]+$/.test(s)));
add([...views.matchAll(/\['(\w+)', '([A-Z][^']*)'\]/g)].map(m => m[2]));                         // Zomato daypart names
add(list(actions, /const MEASURES = \[([\s\S]*?)\];/).filter(s => /\s/.test(s)));
add(['At least', 'At most']);
add([...actions.matchAll(/action: '([^']+)'/g)].map(m => unescape(m[1])));                       // the moves a test can start from
[...views.matchAll(/(\w+): \['([^\]]*?)', '([^\]]*?)', '([^\]]*?)'\]/g)].forEach(m => add([m[2], m[3], m[4]].map(unescape))); // FLAG_TPL
add(['Demo steps', 'Demo guide', 'See the payout', 'Read the decisions', 'Keep the memory', 'Test your own guess', 'Analysis', 'Flags', 'Insights', 'Payout workspace']);
add(['restaurant', 'customer', 'swiggy', 'UPI', 'Cash', 'Card', 'Wallet', 'Net banking']);
add(['Impressions', 'Menu opens', 'Carts built', 'Orders placed', 'Delivered']);
// 3. the fixed text on each page
['demo.html', 'actions.html', 'insights.html'].forEach(f => {
  const body = read(f).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  [...body.matchAll(/>([^<>]+)</g)].map(m => m[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()).filter(s => s && !/^[\W\d]+$/.test(s)).forEach(s => keys.add(s));
  [...body.matchAll(/\b(placeholder|aria-label|title|alt)="([^"]+)"/g)].forEach(m => keys.add(m[2]));
  const title = read(f).match(/<title>([^<]*)<\/title>/); if (title) keys.add(title[1].trim());
});
add(['GST rounding', 'Unmatched', 'Language', 'Not read']);
// code values and fragments that are never shown to a person
['AFTER.', 'English', 'T00:00:00Z', 'atMost', 'worked', 'did-not-work', 'inconclusive', 'Order rows add up to the payout summary (₹'].forEach(k => keys.delete(k));

function loadDict(file, name) { const o = {}; const ctx = { I18N_DICT: { Hindi: o, Kannada: o }, Object }; new Function('I18N_DICT', 'Object', read(file))(ctx.I18N_DICT, Object); return o; }
const hi = loadDict('i18n-hi.js'), kn = loadDict('i18n-kn.js');
const all = [...keys].sort();
if (process.argv.includes('--list')) { console.log(JSON.stringify(all, null, 1)); process.exit(0); }
const missingHi = all.filter(k => !hi[k]), missingKn = all.filter(k => !kn[k]);
const placeholders = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
const wrongHoles = all.filter(k => hi[k] && placeholders(hi[k]) !== placeholders(k)).map(k => 'Hindi: ' + k).concat(all.filter(k => kn[k] && placeholders(kn[k]) !== placeholders(k)).map(k => 'Kannada: ' + k));
console.log('phrases found: ' + all.length + ' | Hindi missing: ' + missingHi.length + ' | Kannada missing: ' + missingKn.length + ' | placeholder mismatches: ' + wrongHoles.length);
if (missingHi.length) console.log('\nMISSING IN HINDI:\n' + missingHi.map(s => '  ' + JSON.stringify(s)).join('\n'));
if (missingKn.length) console.log('\nMISSING IN KANNADA:\n' + missingKn.map(s => '  ' + JSON.stringify(s)).join('\n'));
if (wrongHoles.length) console.log('\nTRANSLATION DOES NOT KEEP THE {holes}:\n' + wrongHoles.map(s => '  ' + s).join('\n'));
process.exit(missingHi.length || missingKn.length || wrongHoles.length ? 1 : 0);
