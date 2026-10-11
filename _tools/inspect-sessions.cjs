// Read-only diagnostic: inspect DSH session files (multi-frame zstd aware).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(process.env.USERPROFILE, '.dsh', 'sessions');
const ONLY = process.argv[2] || '';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.jsonl.zstd') || e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

function decompressStream(file) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const rs = fs.createReadStream(file);
    const zs = zlib.createZstdDecompress();
    rs.on('error', reject);
    zs.on('error', reject);
    zs.on('data', (c) => chunks.push(c));
    zs.on('end', () => resolve(Buffer.concat(chunks)));
    rs.pipe(zs);
  });
}

(async () => {
  const files = walk(ROOT).sort().filter((f) => !ONLY || f.includes(ONLY));
  console.log('files:', files.length, '\n');
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const size = fs.statSync(f).size;
    let text;
    try {
      text = (await decompressStream(f)).toString('utf8');
    } catch (err) {
      console.log(`### ${rel}  compressed=${size}  FAILED: ${err.message}\n`);
      continue;
    }
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const types = {};
    let header = null;
    let lastTs = null;
    for (const l of lines) {
      let o;
      try { o = JSON.parse(l); } catch { types['<unparsed>'] = (types['<unparsed>'] || 0) + 1; continue; }
      types[o.type] = (types[o.type] || 0) + 1;
      if (!header) header = o;
      if (typeof o.time === 'number') lastTs = o.time;
      else if (typeof o.timestamp === 'number') lastTs = o.timestamp;
    }
    console.log(`### ${rel}`);
    console.log(`    compressed=${size}B  raw=${text.length}B  records=${lines.length}`);
    console.log(`    types=${JSON.stringify(types)}`);
    if (lastTs) console.log(`    lastEventTime=${new Date(lastTs).toISOString()}`);
    console.log(`    header=${JSON.stringify(header)}`);
    console.log('');
  }
})();
