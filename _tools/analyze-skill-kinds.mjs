// 统计官方技能说明里的措辞分布，用来修正 kind 判定规则。
// 目的：搞清楚「精神力技能 / 力量型技能 / 魔武混合 / 辅助技能」到底有多少技能写了，
// 没写的那些说明长什么样。
import fs from 'node:fs'
const src = JSON.parse(fs.readFileSync('_web/skills.json', 'utf8'))
const has = (s, re) => re.test(s.desc || '')

const marks = {
  精神力技能: /精神力技能/,
  力量型技能: /力量型技能/,
  魔武混合: /魔武混合/,
  辅助技能: /辅助技能/,
  结印: /结印/,
  提升类: /提高|提升|增加|加强/,
  降低类: /降低|减少|削弱/,
  治疗类: /恢复|治疗|回春/,
  持续类: /持续受到伤害|中毒|灼烧|燃烧/,
  吸血类: /吸取生命|吸血/,
  解除类: /移除|解除|清除/,
}
console.log('=== 说明中出现的判定关键词 ===')
for (const [k, re] of Object.entries(marks)) {
  const hit = src.filter((s) => has(s, re))
  console.log(`${k.padEnd(8)} ${String(hit.length).padStart(3)} 个  ${hit.slice(0, 6).map((s) => s.name).join('、')}`)
}
const declared = src.filter((s) => has(s, /精神力技能|力量型技能|魔武混合|辅助技能/))
console.log(`\n明确声明了类型的技能: ${declared.length} / ${src.length}`)

console.log('\n=== 未声明类型的技能，说明原文（前 40 条）===')
const undecl = src.filter((s) => !has(s, /精神力技能|力量型技能|魔武混合|辅助技能/))
for (const s of undecl.slice(0, 40)) {
  console.log(`  ${s.name.padEnd(6, '　')} [${s.elementRaw}] ${s.desc}`)
}
console.log(`\n未声明共 ${undecl.length} 个`)

console.log('\n=== 上古技能表点名的那几个，说明原文 ===')
for (const n of ['信标', '平衡风暴', '海市蜃楼', '疾风翼', '泼沙', '石枪阵', '旋风', '火柱']) {
  const s = src.find((x) => x.name === n)
  console.log(`  ${n.padEnd(6, '　')} ${s ? `[${s.elementRaw}/${s.range}/${s.mp}MP/CD${s.cooldown}] ${s.desc}` : '（数据里没有）'}`)
}
