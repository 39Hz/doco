// Structural compatibility check: is a v4 artifact's event vocabulary identical
// to v3's? The v3 build restores artifacts through restoreReleasedV3Artifact(),
// so a converted file is only safe if the event shapes match exactly.

const fs = require('fs');
const path = require('path');
const { readSession } = require('./session-reader.cjs');

const dir = path.join(
  process.env.USERPROFILE, '.dsh', 'sessions',
  '--C-Users-wangbujue-Desktop-yuanmeng--',
  'session-005c8147-59d4-41ca-babc-f8c6ef085dfe',
);

function signatures(file) {
  const { records } = readSession(file);
  const byType = new Map();
  for (const r of records) {
    const keys = Object.keys(r).sort().join(',');
    const dataKeys = r.data && typeof r.data === 'object' && !Array.isArray(r.data)
      ? Object.keys(r.data).sort().join(',')
      : '';
    const sig = `keys[${keys}] data[${dataKeys}]`;
    if (!byType.has(r.type)) byType.set(r.type, new Set());
    byType.get(r.type).add(sig);
    // also record nested value kinds for the union surface
  }
  const out = new Map();
  for (const [t, set] of byType) out.set(t, [...set].sort());
  return { records, byType: out };
}

const v3 = signatures(path.join(dir, 'session.v3.jsonl.zstd'));
const v4 = signatures(path.join(dir, 'session.v4.jsonl.zstd'));

const types = [...new Set([...v3.byType.keys(), ...v4.byType.keys()])].sort();
let differences = 0;

console.log(`v3 records=${v3.records.length}  v4 records=${v4.records.length}\n`);
for (const t of types) {
  const a = v3.byType.get(t) ?? [];
  const b = v4.byType.get(t) ?? [];
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (!same) {
    differences++;
    console.log(`DIFF  ${t}`);
    console.log(`   v3: ${a.join(' | ') || '(absent)'}`);
    console.log(`   v4: ${b.join(' | ') || '(absent)'}`);
  }
}
console.log(`\ntypes compared=${types.length}  differing=${differences}`);

// Sequence sanity for the v4 artifact: seq must be a dense 0..N-1 run unless the
// log was compacted (compaction/prune legitimately removes seq ranges).
const seqs = v4.records.filter((r) => typeof r.seq === 'number').map((r) => r.seq);
const unique = new Set(seqs);
const sorted = [...unique].sort((x, y) => x - y);
const missing = [];
for (let i = sorted[0]; i <= sorted[sorted.length - 1]; i++) if (!unique.has(i)) missing.push(i);
console.log(`v4 seq: n=${seqs.length} unique=${unique.size} range=${sorted[0]}..${sorted[sorted.length - 1]} gaps=${missing.length}`);
const prune = v4.records.filter((r) => r.type === 'compaction/prune').length;
console.log(`v4 compaction/prune records=${prune} (each removes a seq range, explaining gaps)`);
