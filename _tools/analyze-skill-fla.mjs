// 把 `skill_icon_*.fla` 当 SWF 解析：看它们是矢量形状还是位图
//
// 这批「FLA」其实是**未压缩/压缩的 SWF**（当年把发布产物当源文件归档），
// 文件名自带技能 ID 区间 —— 所以只要能渲染出形状，就能得到"技能 ID → 图标"的权威对应。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, '多克多比专区资料素材/魔法道具ICON等/多克多比技能')
const NAME = {
  0: 'End', 1: 'ShowFrame', 2: 'DefineShape', 22: 'DefineShape2', 32: 'DefineShape3', 83: 'DefineShape4',
  39: 'DefineSprite', 26: 'PlaceObject2', 70: 'PlaceObject3', 4: 'PlaceObject', 5: 'RemoveObject',
  6: 'DefineBits', 21: 'DefineBitsJPEG2', 35: 'DefineBitsJPEG3', 20: 'DefineBitsLossless', 36: 'DefineBitsLossless2',
  46: 'DefineMorphShape', 84: 'DefineMorphShape2', 34: 'DefineButton2', 7: 'DefineButton',
  56: 'ExportAssets', 76: 'SymbolClass', 9: 'SetBackgroundColor', 43: 'FrameLabel',
  10: 'DefineFont', 48: 'DefineFont2', 75: 'DefineFont3', 11: 'DefineText', 33: 'DefineText2',
  12: 'DoAction', 59: 'DoInitAction', 82: 'DoABC', 37: 'DefineEditText', 24: 'Protect',
}

const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.fla'))
console.log(`扫描 ${files.length} 个 .fla\n`)

for (const f of files) {
  const buf = fs.readFileSync(path.join(DIR, f))
  const sig = buf.toString('ascii', 0, 3)
  let b
  try {
    if (sig === 'CWS') b = zlib.inflateSync(buf.subarray(8))
    else if (sig === 'FWS') b = buf.subarray(8)
    else { console.log(`${f.padEnd(36)} ✗ 签名 ${JSON.stringify(sig)}（不是 SWF）`); continue }
  } catch (e) { console.log(`${f.padEnd(36)} ✗ 解压失败 ${e.message}`); continue }

  const ver = b[3]
  // RECT：nbits 在第一个字节高 5 位
  const nb = b[8] >> 3
  const rectBytes = Math.ceil((5 + nb * 4) / 8)
  let p = 8 + rectBytes + 4        // 跳过 RECT + frameRate(2) + frameCount(2)
  const counts = {}
  let frames = 0
  while (p + 2 <= b.length) {
    const tl = b.readUInt16LE(p); p += 2
    const code = tl >> 6
    let len = tl & 0x3f
    if (len === 0x3f) { len = b.readUInt32LE(p); p += 4 }
    if (code === 0) break
    const nm = NAME[code] || ('tag' + code)
    counts[nm] = (counts[nm] || 0) + 1
    if (code === 1) frames++
    p += len
    if (p > b.length) break
  }
  const shapes = (counts.DefineShape || 0) + (counts.DefineShape2 || 0) + (counts.DefineShape3 || 0) + (counts.DefineShape4 || 0)
  const bits = (counts.DefineBits || 0) + (counts.DefineBitsJPEG2 || 0) + (counts.DefineBitsJPEG3 || 0) + (counts.DefineBitsLossless || 0) + (counts.DefineBitsLossless2 || 0)
  const sprites = counts.DefineSprite || 0
  const top = Object.entries(counts).sort((a, c) => c[1] - a[1]).slice(0, 5)
  const verdict = shapes > 0 && bits === 0 ? '**纯矢量**（可渲染）' : bits > 0 && shapes === 0 ? '位图' : `矢量${shapes}+位图${bits}`
  console.log(`${f.padEnd(36)} v${ver}  ${String(frames).padStart(3)}帧  形状${String(shapes).padStart(4)} 位图${String(bits).padStart(4)} 精灵${String(sprites).padStart(3)}  ${verdict}`)
  console.log(`${' '.repeat(36)} top: ${top.map(([k, v]) => k + '×' + v).join('  ')}`)
}
