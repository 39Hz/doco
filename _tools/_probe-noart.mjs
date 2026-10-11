import { T } from './game-harness.mjs'
const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const D = W.DKDbbData
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
// 找一只"没有立绘"的形态
const noArt = D.FORMS.filter((f) => !f.art)
console.log('  没立绘的形态数:', noArt.length)
console.log('  例子:', noArt.slice(0, 6).map((f) => `${f.name}(${f.element})`).join('、'))
S().form = noArt[0]
console.log('  设为出战:', S().form.name)
