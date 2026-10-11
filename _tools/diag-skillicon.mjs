// 诊断：技能面板里 skillIcon() 为什么取不到图。
import { T } from './game-harness.mjs'
const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
// 手动喂一张进去，看 FakeImage 能不能拿到像素
const r = t.run(`(() => {
  const out = {}
  const D = window.DKDbbData
  const sk = D.SKILLS['重击']
  out.skillIconField = sk ? sk.icon : null
  out.skillCount = Object.keys(D.SKILLS).length
  const im = new Image()
  im.src = 'assets/skills/skill_icon_1001.png'
  out.complete = im.complete
  out.naturalWidth = im.naturalWidth
  out.hasPixels = !!im._pixels
  return out
})()`)
console.log('诊断结果: ' + JSON.stringify(r, null, 1))
