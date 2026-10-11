// 一键恢复官方立绘（重跑权威生成器 + 官方高清同步），用于撤销实验性改动
//
// 【为什么需要】调超分参数时会把 `assets/forms/art/*.png` 改掉；
//   要对比/回退就必须能**一键回到"官方素材直出"的状态**，否则会分不清
//   "现在这张图到底是官方的，还是我超分过的"（这仓库栽过"用错图还不自知"）。
//
// 流程：① `build-form-art.mjs`（官方源 → 640px，权威）
//      ② `resync-form-art-hd.mjs`（有真实高清源的 5 只换回高清）
//
// 用法: node _tools/reset-form-art.mjs
import { execFileSync } from 'node:child_process'
import path from 'node:path'
const ROOT = path.resolve('.')
console.log('① 重跑官方生成器 build-form-art.mjs …')
execFileSync('node', [path.join(ROOT, '_tools', 'build-form-art.mjs')], { stdio: 'inherit', cwd: ROOT })
console.log('\n② 重新应用官方高清源（5 只）…')
execFileSync('node', [path.join(ROOT, '_tools', 'resync-form-art-hd.mjs')], { stdio: 'inherit', cwd: ROOT })
console.log('\n✓ 已恢复到"官方素材直出"状态（那 5 只为官方高清源，其余为官方源直出）')
