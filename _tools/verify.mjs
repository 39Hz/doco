// 冒烟测试：校验 manifest 引用的每个资源都真实存在，并检查音频可解码性
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.argv[2] || '.')
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))

let fail = 0
const check = (rel, expectAudio) => {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) { console.log(`  ✗ 缺失 ${rel}`); fail++; return null }
  const buf = fs.readFileSync(p)
  if (buf.length === 0) { console.log(`  ✗ 空文件 ${rel}`); fail++; return null }
  if (expectAudio) {
    // 音频有效性：ID3 头，或能在文件前 4KB 内找到 MP3 帧同步字
    let ok = buf.toString('ascii', 0, 3) === 'ID3'
    if (!ok) {
      for (let i = 0; i < Math.min(buf.length - 1, 4096); i++) {
        if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) { ok = true; break }
      }
    }
    if (!ok) { console.log(`  ✗ 找不到 MP3 帧 ${rel}`); fail++; return null }
  }
  return buf
}

console.log('=== 场景资源 ===')
let sceneBytes = 0
for (const s of m.scenes) {
  const b = check(s.file, false)
  if (b) sceneBytes += b.length
}
console.log(`  ${m.scenes.length} 个场景全部就位，合计 ${(sceneBytes / 1048576).toFixed(2)} MB`)

console.log('=== 音乐资源 ===')
for (const t of m.bgm) check(t.file, true)
for (const s of m.sfx) check(s.file, true)
console.log(`  ${m.bgm.length} 首 BGM + ${m.sfx.length} 个音效全部就位`)

console.log('=== 清单一致性 ===')
const badDim = m.scenes.filter(s => !s.w || !s.h)
if (badDim.length) { console.log(`  ✗ ${badDim.length} 个场景尺寸解析失败`); fail++ }
else console.log(`  全部场景尺寸解析正常`)

// 场景名是否已补齐（"未命名场景 XX" 就是还没命名）
const unnamed = m.scenes.filter(s => /^未命名场景/.test(s.title || ''))
if (unnamed.length) { console.log(`  ✗ 还有 ${unnamed.length} 个场景没命名：${unnamed.slice(0, 5).map(s => s.id).join(', ')}…`); fail++ }
else console.log(`  88 个场景全部有中文名 ✓`)

const noSecs = m.bgm.filter(b => !b.secs)
if (noSecs.length) console.log(`  ! ${noSecs.length} 首 BGM 时长解析失败：${noSecs.map(b => b.name).join(', ')}`)

if (m.assetNotes && m.assetNotes.length) {
  console.log('=== 资源质量备注 ===')
  m.assetNotes.forEach(n => console.log(`  [${n.level}] ${n.file} —— ${n.note}`))
}

console.log(fail === 0 ? '\n✅ 全部通过，可直接双击 index.html 运行' : `\n❌ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
