// 索亚的获得方式：开局送一只 + 打赢怪物有几率遇到新的。
import fs from 'node:fs'

const p = 'game/game.js'
let s = fs.readFileSync(p, 'utf8')
let n = 0
const rep = (a, b, label) => {
  if (!s.includes(a)) { console.log('X ' + label); return }
  s = s.replace(a, b); n++; console.log('OK ' + label)
}

rep(
  '    if (!save.data.forms) save.data.forms = [D.FORMS[0].name]',
  [
    '    if (!save.data.forms) save.data.forms = [D.FORMS[0].name]',
    '    // 索亚：开局送官方表里的第一只（70001 斯提尔兽），其余靠打赢怪物遇到',
    '    if (!save.data.soya) save.data.soya = []',
    '    if (!save.data.soya.length && D.SOYA.length) save.data.soya.push(D.SOYA[0].id)',
  ].join('\n'),
  '开局送一只'
)

rep(
  '      save.persist()\n      if (b.spawn) b.spawn.alive = false',
  [
    '      // ---- 索亚：打赢有几率遇到新的一只 ----',
    '      {',
    '        const missSoya = (D.SOYA || []).filter((x) => !save.data.soya.includes(x.id))',
    '        if (missSoya.length && Math.random() < 0.22) {',
    '          const got = missSoya[Math.floor(Math.random() * missSoya.length)]',
    '          save.data.soya.push(got.id)',
    '          save.data.soyaActive = got.id',
    '          b.dropSoya = got.name',
    '          b.log.push(`★ 遇到了索亚「${got.name}」！已自动设为出战`)',
    '        }',
    '      }',
    '      save.persist()',
    '      if (b.spawn) b.spawn.alive = false',
  ].join('\n'),
  '打赢有几率遇到索亚'
)

fs.writeFileSync(p, s, 'utf8')
console.log('total ' + n)
