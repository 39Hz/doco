// Normalize the collector's distributable files.
//
// Two Windows quirks keep breaking this folder, and both are silent:
//   1. cmd.exe requires CRLF. A .cmd written with bare LF is mis-parsed line by
//      line (comments swallow the next line, quotes split mid-token), so the
//      launcher must never be shipped with LF endings.
//   2. Windows PowerShell 5.1 chooses a script's encoding from its BOM. A .ps1
//      saved as UTF-8 without a BOM is decoded as GBK, so every Chinese string
//      becomes mojibake and the parser blows up on stray quote bytes.
//
// Run this after editing anything under _collector/.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', '_collector');
let changed = 0;
let problems = 0;

for (const name of fs.readdirSync(dir).sort()) {
  const full = path.join(dir, name);
  if (!fs.statSync(full).isFile()) continue;
  const ext = path.extname(name).toLowerCase();
  let buf = fs.readFileSync(full);

  if (ext === '.cmd' || ext === '.bat') {
    // 1. no BOM in a batch file
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      buf = buf.subarray(3);
      console.log(`  fix  ${name}: stripped BOM`);
      changed++;
    }
    // 2. must be pure ASCII
    const bad = [];
    for (let i = 0; i < buf.length; i++) if (buf[i] > 127) bad.push(i);
    if (bad.length > 0) {
      console.log(`  WARN ${name}: ${bad.length} non-ASCII byte(s) at ${bad.slice(0, 8).join(',')} - cmd.exe cannot parse these`);
      problems++;
    }
    // 3. must be CRLF
    const text = buf.toString('latin1');
    const crlf = text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    if (crlf !== text) {
      fs.writeFileSync(full, Buffer.from(crlf, 'latin1'));
      console.log(`  fix  ${name}: LF -> CRLF`);
      changed++;
    } else if (bad.length === 0 && buf[0] !== 0xef) {
      console.log(`  ok   ${name}`);
    }
  } else if (ext === '.ps1') {
    if (!(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)) {
      fs.writeFileSync(full, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf]));
      console.log(`  fix  ${name}: added UTF-8 BOM`);
      changed++;
    } else {
      console.log(`  ok   ${name}`);
    }
  }
}

console.log(changed > 0 ? `\n${changed} file(s) normalized.` : '\nAll files already correct.');
if (problems > 0) {
  console.log(`${problems} file(s) still contain non-ASCII bytes - fix those by hand.`);
  process.exit(1);
}
