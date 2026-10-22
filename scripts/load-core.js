// Loads public/core.js (a plain browser script) into Node for scripts and tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.XLSX = require('xlsx');
const NAMES = ['parseWorkbook', 'analyze', 'parseZomato', 'parseZomatoCsv', 'decide', 'advise', 'phrasePayload', 'PHRASE_FIELDS', 'numbersIn', 'checkText'];
const ctx = vm.createContext({ XLSX: global.XLSX, console });
module.exports = vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'core.js'), 'utf8') +
  '\n;({' + NAMES.join(',') + '})', ctx, { filename: 'core.js' });
