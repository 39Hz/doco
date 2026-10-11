// Inspect raw byte structure of a session file to detect frame layout / padding.
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const buf = fs.readFileSync(file);
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

console.log('file:', file);
console.log('size:', buf.length);
console.log('first32:', buf.subarray(0, 32).toString('hex'));

// count frame magics
let count = 0;
const offsets = [];
for (let i = 0; i + 4 <= buf.length; i++) {
  if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) {
    count++;
    if (offsets.length < 20) offsets.push(i);
  }
}
console.log('zstd magic occurrences:', count);
console.log('first offsets:', offsets.join(','));

// zero byte analysis
let zeros = 0;
for (let i = 0; i < buf.length; i++) if (buf[i] === 0) zeros++;
console.log('zero bytes:', zeros, `(${((zeros / buf.length) * 100).toFixed(2)}%)`);

// tail
console.log('last32:', buf.subarray(Math.max(0, buf.length - 32)).toString('hex'));

// unique byte histogram top 5
const hist = new Array(256).fill(0);
for (let i = 0; i < buf.length; i++) hist[buf[i]]++;
const top = hist.map((n, b) => [b, n]).sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log('top bytes:', top.map(([b, n]) => `0x${b.toString(16)}=${n}`).join(' '));
