// Generate the corrected ~/.dsh/storages/workspace.json (staged, not installed).
//
// Mirrors what WorkspaceRegistry.bootstrap() would produce: for every workspace
// record, `sessionIds` = all session headers whose canonical cwd resolves to the
// record's path, sorted by compareHeaders (createdAt desc, then id asc).
//
// A restart alone does NOT repair this, because bootstrap() only runs when
// `state.initialized === false`; the live record already has initialized: true,
// so init only refreshes the header index and never re-owns orphaned sessions.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DSH = path.join(process.env.USERPROFILE, '.dsh');
const SESSIONS = path.join(DSH, 'sessions');
const WORKSPACE_JSON = path.join(DSH, 'storages', 'workspace.json');
const OUT = path.join(__dirname, '..', '_recovery');

const ZSTD_MAGIC = 4247762216;
const CANONICAL = /^session(?:\.v([1-9][0-9]*))?\.jsonl\.zstd$/u;

function scanFirstFrame(buffer) {
  // Only frame 0 is needed: the header is guaranteed to be its first line.
  if (buffer.length < 6 || buffer.readUInt32LE(0) !== ZSTD_MAGIC) return undefined;
  const descriptor = buffer.readUInt8(4);
  const contentSizeFlag = descriptor >>> 6;
  const singleSegment = (descriptor & 32) !== 0;
  const checksum = (descriptor & 4) !== 0;
  const dictionaryFlag = descriptor & 3;
  const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
  const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
  let offset = 5 + (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
  for (;;) {
    const blockHeader = buffer.readUIntLE(offset, 3);
    offset += 3;
    const lastBlock = (blockHeader & 1) !== 0;
    const blockType = (blockHeader >>> 1) & 3;
    const blockSize = blockHeader >>> 3;
    offset += blockType === 1 ? 1 : blockSize;
    if (lastBlock) break;
  }
  if (checksum) offset += 4;
  return zlib.zstdDecompressSync(buffer.subarray(0, offset));
}

function readHeader(sessionDir) {
  const gens = fs.readdirSync(sessionDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => ({ name: e.name, m: CANONICAL.exec(e.name) }))
    .filter((e) => e.m !== null)
    .map((e) => ({ name: e.name, version: e.m[1] === undefined ? 0 : Number(e.m[1]) }))
    .sort((a, b) => b.version - a.version);
  if (gens.length === 0) return undefined;
  const plain = scanFirstFrame(fs.readFileSync(path.join(sessionDir, gens[0].name)));
  if (plain === undefined) return undefined;
  const line = plain.subarray(0, plain.indexOf(0x0a)).toString('utf8');
  return { header: JSON.parse(line), generation: gens[0].name, generationVersion: gens[0].version };
}

// Collect every session header with its canonical cwd (the app's membership rule).
const sessions = [];
for (const project of fs.readdirSync(SESSIONS, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  for (const sd of fs.readdirSync(path.join(SESSIONS, project.name), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const dir = path.join(SESSIONS, project.name, sd.name);
    const r = readHeader(dir);
    if (r === undefined || r.header.cwd === undefined) continue;
    let cwd;
    try { cwd = fs.realpathSync.native(r.header.cwd); } catch { continue; }
    if (!fs.statSync(cwd).isDirectory()) continue;
    sessions.push({ id: r.header.id, createdAt: r.header.createdAt, cwd, generation: r.generation, generationVersion: r.generationVersion, origin: r.header.origin });
  }
}

const doc = JSON.parse(fs.readFileSync(WORKSPACE_JSON, 'utf8'));
const compareHeaders = (l, r) => r.createdAt - l.createdAt || String(l.id).localeCompare(String(r.id));

const changes = [];
for (const [id, record] of Object.entries(doc.tables.workspaces)) {
  let recordPath;
  try { recordPath = fs.realpathSync.native(record.path); } catch { recordPath = record.path; }
  const owned = sessions
    .filter((s) => s.cwd.toLowerCase() === recordPath.toLowerCase())
    .sort(compareHeaders)
    .map((s) => s.id);
  // Preserve any accounted id we could not resolve, exactly as bootstrap keeps
  // current.sessionIds entries that are absent from the historical set.
  const extra = record.sessionIds.filter((sid) => !owned.includes(sid));
  const next = [...owned, ...extra];
  changes.push({
    workspaceId: id,
    path: record.path,
    before: [...record.sessionIds],
    after: next,
    added: next.filter((s) => !record.sessionIds.includes(s)),
  });
  if (next.length !== record.sessionIds.length || next.some((s, i) => s !== record.sessionIds[i])) {
    record.sessionIds = next;
    record.updatedAt = new Date().toISOString();
  }
}

// Sanity: a session may never be accounted by two workspaces.
const seen = new Map();
for (const [id, record] of Object.entries(doc.tables.workspaces)) {
  for (const sid of record.sessionIds) {
    if (seen.has(sid)) throw new Error(`session ${sid} accounted by both ${seen.get(sid)} and ${id}`);
    seen.set(sid, id);
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'workspace.json'), JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  sessionsOnDisk: sessions.map((s) => ({ id: s.id, createdAt: new Date(s.createdAt).toISOString(), cwd: s.cwd, generation: s.generation, origin: s.origin ?? null })),
  preservedGlobal: doc.global,
  changes,
}, null, 2));
