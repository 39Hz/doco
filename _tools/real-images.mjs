// 给无头测试台接上"真实像素"的图片注册表 + 像素级画布，
// 让游戏（以及截图工具）能真的把素材画出来。
//
// 背景：测试台原本的 FakeImage 是 320×320 的空壳，util.drawSprite 拿到它会算出错误的
// 缩放尺寸而静默失败 —— 截图里角色就只剩一个占位圆圈，看着像"游戏没做角色"，
// 实际是测试环境的假图片。这个模块把假图片换成真的解码结果。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

export function makeImageRegistry(root) {
  const cache = new Map()
  let decoded = 0, missing = 0
  const get = (rel) => {
    if (cache.has(rel)) return cache.get(rel)
    const p = path.join(root, rel)
    let v = null
    if (fs.existsSync(p)) {
      try {
        const png = decodePng(fs.readFileSync(p))
        if (png.w > 4 && png.h > 4) { v = { w: png.w, h: png.h, data: png.data }; decoded++ }
      } catch (e) { v = null }
    }
    if (!v) missing++
    cache.set(rel, v)
    return v
  }
  return { get, stats: () => ({ decoded, missing, size: cache.size }) }
}

// 把一个 FakeCanvas 升级成像素画布
export function attachPixelCanvas(canvas, opts = {}) {
  canvas._fb = makeFramebuffer(canvas.width, canvas.height)
  canvas._textRenderer = opts.textRenderer || null
  canvas._onCall = opts.onCall || null
  const ctx = new PixelCtx(canvas)
  canvas.getContext = () => ctx
  canvas._ctx = ctx
  return ctx
}

export function makeGlyphRenderer() {
  const atlas = loadGlyphAtlas()
  return new TextRenderer(atlas)
}
