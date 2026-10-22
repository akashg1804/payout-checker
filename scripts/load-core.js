// Loads public/core.js (a plain browser script) into Node for scripts and tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.XLSX = require('xlsx');
const NAMES = ['parseWorkbook', 'analyze', 'parseZomato', 'parseZomatoCsv', 'decide', 'advise', 'phrasePayload', 'PHRASE_FIELDS', 'numbersIn', 'checkText',
  'memStore', 'memSnapshot', 'memValid', 'memLoad', 'memSave', 'memClear', 'memPrevious', 'memCompare', 'memVerdict', 'MEM_KEY'];
const ctx = vm.createContext({ XLSX: global.XLSX, console });
const read = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
module.exports = vm.runInContext(read('core.js') + '\n' + read('memory.js') +
  '\n;({' + NAMES.join(',') + '})', ctx, { filename: 'core.js' });
