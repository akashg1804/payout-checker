// Language support for every page. English text is the key; Hindi and Kannada come from the dictionaries in i18n-hi.js and i18n-kn.js.
// A string that has no translation yet simply stays in English, so a gap never breaks a page.
const I18N_DICT = { Hindi: {}, Kannada: {} };
const I18N_LANGS = { English: 'English', Hindi: 'हिन्दी', Kannada: 'ಕನ್ನಡ' };
const I18N_CODE = { English: 'en', Hindi: 'hi', Kannada: 'kn' };
let LANG = 'English';
try { const saved = localStorage.getItem('after_lang'); if (saved && I18N_CODE[saved]) LANG = saved; } catch (e) { /* storage blocked: stay in English */ }

function t(en, vars) {
  const dict = LANG !== 'English' ? I18N_DICT[LANG] : null;
  const s = (dict && dict[en]) || en;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
}
// "1 order" against "3 orders": choose the template by the count; both are listed in the dictionaries
const tn = (n, one, many, vars) => t(n === 1 ? one : many, Object.assign({ n }, vars || {}));

// Hindi and Kannada need their own fonts; load them only when one of those is chosen
function i18nFonts() {
  if (LANG === 'English' || document.getElementById('i18n-fonts')) return;
  const link = document.createElement('link');
  link.id = 'i18n-fonts'; link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Sans+Kannada:wght@400;500;600;700&family=Noto+Serif+Devanagari:wght@400;500;600&family=Noto+Serif+Kannada:wght@400;500;600&display=swap';
  document.head.append(link);
  const css = document.createElement('style');
  css.id = 'i18n-font-rules';
  css.textContent = 'html[lang=hi] body,html[lang=hi] button,html[lang=hi] input,html[lang=hi] select,html[lang=hi] textarea{font-family:"Noto Sans Devanagari","Nirmala UI","Mangal",Inter,sans-serif}' +
    'html[lang=kn] body,html[lang=kn] button,html[lang=kn] input,html[lang=kn] select,html[lang=kn] textarea{font-family:"Noto Sans Kannada","Nirmala UI","Tunga",Inter,sans-serif}' +
    'html[lang=hi] h1,html[lang=hi] h2,html[lang=hi] h3,html[lang=hi] .big{font-family:"Noto Serif Devanagari","Nirmala UI",Newsreader,serif;letter-spacing:0;line-height:1.25}' +
    'html[lang=kn] h1,html[lang=kn] h2,html[lang=kn] h3,html[lang=kn] .big{font-family:"Noto Serif Kannada","Nirmala UI",Newsreader,serif;letter-spacing:0;line-height:1.3}' +
    'html[lang=hi] h1,html[lang=kn] h1{font-size:clamp(2.4rem,5vw,4.4rem)!important}html[lang=hi] .info-card h2,html[lang=kn] .info-card h2{font-size:26px!important}' +
    'html[lang=hi] .card h2,html[lang=kn] .card h2{font-size:30px!important}html[lang=hi] .section-head h2,html[lang=kn] .section-head h2{font-size:clamp(2rem,4vw,3.4rem)!important}';
  document.head.append(css);
}

// Static page text: walk the text nodes and attributes, remember the English original, and show the chosen language
const I18N_TEXT = new WeakMap(), I18N_ATTR = new WeakMap();
const I18N_ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
function applyI18n(root) {
  root = root || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement && /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    const orig = I18N_TEXT.has(n) ? I18N_TEXT.get(n) : n.nodeValue;
    const key = orig.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    if (!key) return;
    const dict = LANG !== 'English' ? I18N_DICT[LANG] : null;
    if (dict && dict[key]) { if (!I18N_TEXT.has(n)) I18N_TEXT.set(n, orig); n.nodeValue = orig.replace(orig.trim(), dict[key]); }
    else if (I18N_TEXT.has(n)) n.nodeValue = I18N_TEXT.get(n);
  });
  root.querySelectorAll('[' + I18N_ATTRS.join('],[') + ']').forEach(el => {
    const saved = I18N_ATTR.get(el) || {};
    I18N_ATTRS.forEach(a => {
      if (!el.hasAttribute(a)) return;
      if (!(a in saved)) saved[a] = el.getAttribute(a);
      const dict = LANG !== 'English' ? I18N_DICT[LANG] : null;
      el.setAttribute(a, (dict && dict[saved[a]]) || saved[a]);
    });
    I18N_ATTR.set(el, saved);
  });
  if (!document.documentElement.dataset.enTitle) document.documentElement.dataset.enTitle = document.title;
  const dict = LANG !== 'English' ? I18N_DICT[LANG] : null;
  document.title = (dict && dict[document.documentElement.dataset.enTitle]) || document.documentElement.dataset.enTitle;
}

function setLang(next) {
  if (!I18N_CODE[next]) next = 'English';
  LANG = next;
  try { localStorage.setItem('after_lang', next); } catch (e) { /* ignore */ }
  document.documentElement.lang = I18N_CODE[next];
  i18nFonts();
  document.querySelectorAll('select.lang-select').forEach(s => { s.value = next; });
  applyI18n(document.body);
  window.dispatchEvent(new CustomEvent('after:lang', { detail: next }));
}

// One language picker in the top bar of every page
function i18nMount() {
  document.documentElement.lang = I18N_CODE[LANG];
  if (!document.getElementById('lang-switch-style')) {
    const css = document.createElement('style'); css.id = 'lang-switch-style';
    css.textContent = 'header.top{flex-wrap:wrap!important}.lang-switch{display:inline-flex;align-items:center;margin-left:auto}.lang-switch span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
      '.lang-switch select{background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:9px 14px;font:600 12px Inter,system-ui,sans-serif;cursor:pointer}.lang-switch select option{color:#103c32;background:#fff}.lang-switch select:focus-visible{outline:2px solid var(--green);outline-offset:3px}';
    document.head.append(css);
  }
  const host = document.querySelector('header.top');
  if (host && !host.querySelector('.lang-switch')) {
    const label = document.createElement('label');
    label.className = 'lang-switch';
    const text = document.createElement('span'); text.textContent = 'Language';
    const select = document.createElement('select'); select.className = 'lang-select'; select.setAttribute('aria-label', 'Language');
    Object.keys(I18N_LANGS).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = I18N_LANGS[k]; select.append(o); });
    select.value = LANG;
    select.addEventListener('change', () => setLang(select.value));
    label.append(text, select);
    host.append(label);
  }
  i18nFonts();
  applyI18n(document.body);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', i18nMount); else i18nMount();
