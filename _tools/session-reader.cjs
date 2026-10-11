// Multi-frame zstd session reader, mirroring DSH's scanZstdFrames + per-frame decode.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ZSTD_MAGIC = 4247762216;

function scanZstdFrames(buffer, maxFrames = Number.POSITIVE_INFINITY) {
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
    frames.push({ start, end: offset });
    if (frames.length === maxFrames) return { frames };
  }
  return { frames };
}

function readSession(file) {
  const buf = fs.readFileSync(file);
  const { frames, tornStart } = scanZstdFrames(buf);
  let plain = '';
  let bad = 0;
  for (const fr of frames) {
    try {
      plain += zlib.zstdDecompressSync(buf.subarray(fr.start, fr.end)).toString('utf8');
    } catch {
      bad++;
    }
  }
  const records = [];
  for (const line of plain.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { records.push(JSON.parse(t)); } catch { /* partial tail */ }
  }
  return { bytes: buf.length, frames: frames.length, badFrames: bad, tornStart, records };
}

if (require.main === module) {
  const target = process.argv[2];
  if (target) {
    const r = readSession(target);
    console.log(JSON.stringify({
      file: target,
      bytes: r.bytes,
      frames: r.frames,
      badFrames: r.badFrames,
      tornStart: r.tornStart,
      records: r.records.length,
    }, null, 2));
    console.log('--- record types ---');
    const types = {};
    for (const rec of r.records) types[rec.type] = (types[rec.type] || 0) + 1;
    console.log(types);
    console.log('--- first 3 ---');
    console.log(JSON.stringify(r.records.slice(0, 3), null, 2).slice(0, 3000));
    console.log('--- last 3 ---');
    console.log(JSON.stringify(r.records.slice(-3), null, 2).slice(0, 3000));
  }
}

module.exports = { scanZstdFrames, readSession };
