# 2-源码-可重建

这一块是**能做出 `1-游戏-双击即玩` 那个成品**的原料：游戏源码 + 工具脚本 + 游戏素材 + 文档与证据。

**先读 [`docs/复刻与构建手册.md`](docs/复刻与构建手册.md)** —— 环境要求、
从零重建的确切命令、目录地图、来源等级、已知缺口、实测踩过的坑。

最快跑起来：

```powershell
node _tools/check-plan-freshness.mjs   # 开工自检（只读，1 秒）
node _tools/run-all-tests.mjs          # 全量回归
node _tools/make-release.mjs           # 打出发布包
node _tools\smoke-exe.mjs              # 真启动一次 exe
```

**包里没有**：原版归档（8.8 GB）、`assets/sprites/`（1.86 GB 全分辨率帧，运行时不用）、
各种可重建的缓存。详见手册 §1.3。

> 完整说明见交接包顶层的 `先读我.md`，或另有一份独立的 `多克多比vX.Y-源码包.zip`。
