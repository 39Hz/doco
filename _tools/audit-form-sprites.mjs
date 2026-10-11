// 建立「形态 → 正确精灵目录」的对照。
//
// 问题：用户截图里「瑞比特·兔 多比」显示成了龙多比的样子。
// 原因是 assets/forms.js 里它的 spriteDir 被填成了「龙多比形态序列」——
// 那是早先"没有专属帧就借用同系多比"的兜底，但对兔子这种**确实有自己素材**的形态就是错的。
//
// 做法：把归档里所有可用的角色序列目录列全，与 11 个形态名逐个核对。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const anim = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'anim', 'index.json'), 'utf8'))
const forms = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'forms.js'), 'utf8')
  .replace(/^\s*window\.__DKDbb_FORMS__\s*=\s*/, '').replace(/;\s*$/, ''))

// 所有顶层目录（去掉"时装序列/xxx"那种二级）
const dirs = new Map()
for (const a of Object.values(anim.actions)) {
  const parts = a.dir.split('/')
  const top = parts[0]
  if (!dirs.has(top)) dirs.set(top, { actions: 0, subs: new Set(), sample: [] })
  const d = dirs.get(top)
  d.actions++
  if (parts[1]) d.subs.add(parts[1])
  if (d.sample.length < 4) d.sample.push(a.action)
}
console.log('=== 归档里所有角色序列目录 ===')
for (const [top, d] of [...dirs].sort()) {
  console.log('  ' + top.padEnd(22) + d.actions + ' 个动作' + (d.subs.size ? '  （含 ' + d.subs.size + ' 个子目录）' : '') +
    '  例: ' + d.sample.join(', '))
}

console.log('\n=== 11 个形态当前的 spriteDir ===')
for (const f of forms.forms) {
  const sd = f.spriteDir
  const exists = sd && [...dirs.keys()].some((t) => t === sd || sd.startsWith(t) || t.startsWith(sd))
  console.log('  ' + f.name.padEnd(16) + ' 元素' + (f.element || '无') + '  spriteDir=' + JSON.stringify(sd) +
    '  ' + (exists ? '（目录存在）' : '★ 目录不存在/不匹配'))
}

// 从形态名里抽关键词，看在归档里能不能找到同名目录
console.log('\n=== 按名字找专属目录 ===')
const norm = (s) => String(s).replace(/[\s·・\-_]/g, '')
const tops = [...dirs.keys()]
for (const f of forms.forms) {
  const base = norm(f.name).replace(/多比$/, '')
  const key = base.slice(0, 3)
  const hits = tops.filter((t) => norm(t).includes(key) || key.includes(norm(t).replace(/形态序列|序列/g, '').slice(0, 2)))
  console.log('  ' + f.name.padEnd(16) + ' 关键词「' + key + '」 → ' + (hits.length ? hits.join(', ') : '（无同名目录）'))
}

// 另外：素材目录里有没有"兔多比"这类独立文件
console.log('\n=== 素材目录里按形态名命名的文件 ===')
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (!/^(dist|_apk|_swf|_tools|_stage|docs|assets|game|\.git)$/.test(e.name)) walk(p, out) }
    else out.push(path.basename(p))
  }
  return out
}
const files = walk(path.join(ROOT, '多克多比专区资料素材'))
for (const f of forms.forms) {
  const base = norm(f.name).replace(/多比$/, '')
  const key = base.slice(0, 2)
  const hits = [...new Set(files.filter((x) => norm(x).includes(key) && /兔|多比|龙|蝎|凤凰|光|暗/.test(x)))]
  const short = hits.filter((x) => x.length < 40).slice(0, 5)
  console.log('  ' + f.name.padEnd(16) + (short.length ? short.join(', ') : '（无）'))
}
