// DSH session recovery: rebuild v3 artifacts from v4 artifacts.
//
// Reads ONLY from ~/.dsh (read-only). Writes staged output into
// <workspace>/_recovery/ for review; installing into ~/.dsh is a separate,
// explicitly approved step.
//
// Background: the running DSH build (0.1.5-rc.3) has SESSION_FORMAT_VERSION = 3.
// listArtifacts() silently `continue`s past any artifact whose header version is
// greater than that (SessionFormatUnsupportedError), and resolveGenerationInDirectory()
// selects the HIGHEST `.vN` generation. So every session whose newest generation is
// v4 is invisible: it never reaches the header index, so the workspace record can
// never own it and the sidebar drops it.
//
// The v4 payload is schema-identical to v3 — only the header's `version` differs —
// so re-stamping the header and presenting the bytes as generation v3 restores it.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DSH_SESSIONS = path.join(process.env.USERPROFILE, '.dsh', 'sessions');
const OUT = path.join(__dirname, '..', '_recovery');
const STAGE = path.join(OUT, 'staged');

const ZSTD_MAGIC = 4247762216;
const CHECKSUM_OPTIONS = { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } };
const HEADER_REQUIRED_KEYS = ['type', 'version', 'id', 'createdAt', 'isSeeded', 'delegationDepth'];
const HEADER_OPTIONAL_KEYS = ['cwd', 'parentSession', 'origin', 'agentPreset'];
const HEADER_KEYS = new Set([...HEADER_REQUIRED_KEYS, ...HEADER_OPTIONAL_KEYS]);

// --- src: DSH scanZstdFrames (structure-only, no decompression) -------------
function scanZstdFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return { frames, tornStart: start };
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`invalid frame magic at byte ${offset}`);
    }
    offset += 4;
    if (offset === buffer.length) return { frames, tornStart: start };
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) throw new Error(`reserved frame-header bit at byte ${offset - 1}`);
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) throw new Error(`reserved block type at byte ${offset - 3}`);
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start };
      offset += 4;
    }
    frames.push({ start, end: offset, checksum });
  }
  return { frames };
}

// Mirrors DSH isHeaderLine() for the observable surface we rely on.
function isHeaderLine(value) {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) &&
    HEADER_REQUIRED_KEYS.every((k) => Object.hasOwn(value, k)) &&
    Object.keys(value).every((k) => HEADER_KEYS.has(k)) &&
    value.type === 'session' &&
    typeof value.version === 'number' &&
    typeof value.id === 'string' &&
    typeof value.createdAt === 'number' && Number.isSafeInteger(value.createdAt) && value.createdAt >= 0 &&
    typeof value.delegationDepth === 'number' && Number.isSafeInteger(value.delegationDepth) && value.delegationDepth >= 0 &&
    (value.cwd === undefined || (typeof value.cwd === 'string' && path.isAbsolute(value.cwd))) &&
    (value.parentSession === undefined || typeof value.parentSession === 'string') &&
    typeof value.isSeeded === 'boolean' &&
    (value.origin === undefined || value.origin === 'subagent') &&
    (value.agentPreset === undefined || typeof value.agentPreset === 'string')
  );
}

function decodeFrames(buffer) {
  const { frames, tornStart } = scanZstdFrames(buffer);
  if (tornStart !== undefined) throw new Error(`torn final frame at byte ${tornStart}`);
  return frames.map((fr) => ({
    ...fr,
    plain: zlib.zstdDecompressSync(buffer.subarray(fr.start, fr.end)),
  }));
}

function listProjectDirs(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(root, e.name));
}

function listSessionDirs(project) {
  return fs.readdirSync(project, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(project, e.name));
}

const CANONICAL = /^session(?:\.v([1-9][0-9]*))?\.jsonl\.zstd$/u;

function generations(sessionDir) {
  const out = [];
  for (const e of fs.readdirSync(sessionDir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const m = CANONICAL.exec(e.name);
    if (m === null) continue;
    out.push({ name: e.name, version: m[1] === undefined ? 0 : Number(m[1]), path: path.join(sessionDir, e.name) });
  }
  return out.sort((a, b) => b.version - a.version);
}

// --- discovery --------------------------------------------------------------
const report = { scanned: [], v4Sessions: [], untouched: [] };

for (const project of listProjectDirs(DSH_SESSIONS)) {
  for (const sessionDir of listSessionDirs(project)) {
    const gens = generations(sessionDir);
    if (gens.length === 0) continue;
    const selected = gens[0];
    const entry = {
      project: path.basename(project),
      sessionDir: path.basename(sessionDir),
      selected: selected.name,
      selectedVersion: selected.version,
      generations: gens.map((g) => g.name),
    };
    report.scanned.push(entry);
    if (selected.version >= 4) report.v4Sessions.push({ ...entry, ...selected, sessionDirPath: sessionDir, projectDir: project });
    else report.untouched.push(entry);
  }
}

// --- stage conversions ------------------------------------------------------
fs.mkdirSync(STAGE, { recursive: true });
const manifest = [];

for (const s of report.v4Sessions) {
  const original = fs.readFileSync(s.path);
  const frames = decodeFrames(original);

  // 1. Re-stamp the header line (frame 0, first line) from version N to 3.
  let first = frames[0].plain;
  let fullFirst = first;
  const nl = fullFirst.indexOf(0x0a);
  if (nl < 0) throw new Error(`${s.sessionDir}: first frame holds no header line`);
  const headerLine = fullFirst.subarray(0, nl).toString('utf8');
  const rest = fullFirst.subarray(nl); // includes the newline
  const header = JSON.parse(headerLine);
  if (header.type !== 'session') throw new Error(`${s.sessionDir}: first line is not a session header`);
  if (header.version !== s.selectedVersion) {
    throw new Error(`${s.sessionDir}: filename says v${s.selectedVersion} but header says v${header.version}`);
  }
  const stamped = { ...header, version: 3 };
  if (!isHeaderLine(stamped)) throw new Error(`${s.sessionDir}: re-stamped header fails DSH isHeaderLine()`);
  const newFirst = Buffer.concat([Buffer.from(JSON.stringify(stamped), 'utf8'), rest]);

  // 2. Re-compress each frame independently, preserving frame boundaries and
  //    enabling the checksum flag the app writes with.
  const outFrames = [];
  for (let i = 0; i < frames.length; i++) {
    const plain = i === 0 ? newFirst : frames[i].plain;
    outFrames.push(zlib.zstdCompressSync(plain, CHECKSUM_OPTIONS));
  }
  const outBuf = Buffer.concat(outFrames);

  // 3. Verify: canonical name, single clean frame run, valid header, identical
  //    payload apart from the header line.
  const verify = decodeFrames(outBuf);
  const verifyHeader = JSON.parse(verify[0].plain.subarray(0, verify[0].plain.indexOf(0x0a)).toString('utf8'));
  if (verifyHeader.version !== 3) throw new Error('verify: version not restamped');
  if (!isHeaderLine(verifyHeader)) throw new Error('verify: header rejected');
  if (verifyHeader.id !== header.id) throw new Error('verify: id changed');
  if (verifyHeader.createdAt !== header.createdAt) throw new Error('verify: createdAt changed');
  const originalPayload = Buffer.concat(frames.map((f) => f.plain)).subarray(nl);
  const verifyPayload = Buffer.concat(verify.map((f) => f.plain)).subarray(verify[0].plain.indexOf(0x0a));
  if (!originalPayload.equals(verifyPayload)) throw new Error('verify: payload bytes changed');
  if (verify.length !== frames.length) throw new Error('verify: frame count changed');

  const targetDir = path.join(STAGE, s.project, s.sessionDir);
  fs.mkdirSync(targetDir, { recursive: true });
  const targetName = 'session.v3.jsonl.zstd';
  fs.writeFileSync(path.join(targetDir, targetName), outBuf);

  manifest.push({
    project: s.project,
    sessionDir: s.sessionDir,
    id: header.id,
    createdAt: new Date(header.createdAt).toISOString(),
    sourceGeneration: s.selected,
    sourceBytes: original.length,
    sourceFrames: frames.length,
    stagedName: targetName,
    stagedBytes: outBuf.length,
    stagedFrames: verify.length,
    records: Buffer.concat(verify.map((f) => f.plain)).toString('utf8').split('\n').filter((l) => l.trim()).length,
    existingGenerations: s.generations,
  });
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(JSON.stringify({ scanned: report.scanned.length, converted: manifest.length, manifest }, null, 2));
