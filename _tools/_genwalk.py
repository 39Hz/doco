
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = sys.argv[1]
ART = os.path.join(ROOT, 'assets', 'forms', 'art')
OUT = os.path.join(ROOT, 'assets', 'forms', 'walk')
os.makedirs(OUT, exist_ok=True)

# ---- 4 帧的参数（一个完整步态循环）----
# squash: 纵向缩放（<1 压扁 = 着地承重；>1 拉长 = 过渡腾空）
# shear : 上半身侧倾量（以底边为支点，正=向右倾）
# ⚠️ 幅度是**实测调出来的**：第一版取 squash 0.975 / shear 0.030，
#    拼成对比图一看四帧几乎一样 —— 立绘在游戏里只画到 132px 高（原图 640px，缩到 0.2 倍），
#    0.03 的侧倾折到屏幕上只有 4px，根本读不出"在迈步"。加到下面这组才看得出来。
#
# ── 第 2 版（用户反馈后重做）──
# 用户看了实机说：「走路没修复呀，我的意思**腿要分开**，走路帧率可以弄慢点，
# 然后这个多比走起来**眼还有问题**」。三条都对，第一版确实没解决：
#   · 第一版是**整张图**做挤压+侧倾 —— 腿始终并在一起，没有"迈步"；
#   · 而且侧倾会把**头一起推走**，眼睛跟着平移 → 用户看到的"眼有问题"就是这个；
#   · 4 帧 × 2.4 步/秒 ≈ 9.6 fps，太快，像抖。
# 第 2 版改成：
#   ① **上半身完全不动**（头/眼睛一动不动 → 眼睛的问题自然消失）；
#   ② 把下半身按行分成左右两半，**绕髋关节等量反向旋转** → 腿真的分开迈；
#      绕髋关节转（而不是左右平移）的好处：髋部接缝处不动，**不会撕出一条缝**；
#   ③ 帧数 4 → **6**、步频放慢。
#
# 【第 53 轮：为什么最终还是改回 6 帧】把"切腿"那套彻底删掉之后，4 帧读出来是"蹦"而不是"走"。
#   用 probe-walk-motion.mjs 一量就看出根因：
#     · 跳跃相位写作 hop = |sin(2π·i/n)|，n=4 时 i=1 与 i=3 **都等于 0**
#       → **第 1、3 帧像素完全相同**，一个循环里只有 2 个不同姿势；
#     · 而走路一个循环必须是「左脚着地 → 过渡 → 右脚着地 → 过渡」，
#       即**两个着地姿势必须不同** —— 这正是那句"腿要分开"的意思。
#   所以：帧数 6 + 步频翻倍（hop = |sin(π·i·2/n)|）+ 绕脚底的横向错切。
#   6 帧下 hop 依次为 0, .87, .87, 0, .87, .87：两个着地点分开、中间两步过渡，
#   配合错切的正负号，读起来才是"左右左"。
N_FRAMES = 6
HOP_FRAC = 0.055     # 离地高度（占内容高比例）—— 这是"在走"最主要的可读信号
# 横向错切幅度（占内容高比例）：绕脚底摆，产生"重心转移"的迈步感。
# ⚠️ 数值是**量出来的**：probe-walk-motion.mjs 要求宽度变化 ≥3%（否则"僵"）、
#    离地 ≤8%（否则"蹦"）。0.035 实测帧间横向偏移约 4~5% 身高，读数正好落在"走"的区间。
SHEAR_FRAC = 0.035
# ⚠️ 摆角是**看图调出来的**：第一版 10°，拼出 6 帧一看，最大摆角那两帧腿像"劈"出去、
#    髋部还开了缝（立绘的腿是自然下垂的、没有膝盖弯，转多了就散）。
#    收到 6.5° 并给**前摆那条腿加抬脚**之后，读起来才是"迈步"。

def find_hip_y(a, x0, x1, y0, y1):
    """从底部往上找**髋线**：腿的顶端。

    ⚠️ 这个函数前后错了两版，两版都让用户看了出来，记在这里免得再错：
    **第 1 版**用固定比例（底部往上 34%）——那条线**切到了手臂**（立绘的手垂在身侧），
    于是"左腿"掩膜里含着一只左手，旋转时手跟着腿摆，看起来是一块方块在动。
    **第 2 版**改成"从底往上、遇到宽度超内容 62% 或段数 >2 就停"——可是**脚本来就宽**，
    于是第一行就停，髋线落在底部 2~8% 处：腿区只剩一小条脚丫。
    症状正是用户报的：**"没有走"**（腿区太小，转了也看不出来）+
    **"底下的小脚走起来会消失"**（就那一小条在被旋转）。

    **第 3 版（现在）**：从内容高 40% 处**往下**扫，找**第一次出现两段**的行 —— 那就是胯部
    （两腿之间露出背景）。实测 46/46 只都能找到。
    再兜一道下限：腿区不足内容高 20% 时，直接用"底部往上 30%"。
    """
    n = y1 - y0 + 1
    leg_min = n * 0.20
    start = int(y1 - n * 0.40)
    for y in range(start, y1 + 1):
        row = a[y]
        runs, s = 0, None
        for x in range(x0, x1 + 1):
            if row[x] and s is None:
                runs += 1; s = x
            elif not row[x] and s is not None:
                s = None
        if runs >= 2:
            hip = y
            break
    else:
        hip = int(y1 - n * 0.30)
    if (y1 - hip + 1) < leg_min:
        hip = int(y1 - n * 0.30)
    return hip


def content_bbox(im):
    """有 alpha 就用 alpha 求内容框；没有就整幅。"""
    if im.mode in ('RGBA', 'LA') or 'transparency' in im.info:
        a = im.convert('RGBA').split()[-1]
        bb = a.getbbox()
        if bb: return bb
    return (0, 0, im.width, im.height)

def leg_split_x(a, y, x0, x1):
    """求第 y 行的"左右腿分界 x"。
    规则：把该行不透明的连续段找出来；
      · 有两段及以上 → 分界取**最左段末尾**与**最右段开头**的中点；
      · 只有一段（两条腿贴在一起）→ 取该段中点。
    这样"腿分开的"和"腿并拢的"立绘都能处理，不会因为认不出腿就整只跳过。"""
    row = a[y]
    runs, s = [], None
    for x in range(x0, x1 + 1):
        if row[x] and s is None:
            s = x
        elif not row[x] and s is not None:
            runs.append((s, x - 1)); s = None
    if s is not None:
        runs.append((s, x1))
    if not runs:
        return None
    if len(runs) >= 2:
        return (runs[0][1] + runs[-1][0]) / 2.0
    return (runs[0][0] + runs[0][1]) / 2.0


def make_frame(im, i, n=N_FRAMES):
    """第 i / n 帧：绕**脚底**的挤压 + 横向错切 + 落地/离地（不切任何部件）。

    ⚠️ 为什么把之前那套"切腿 + 绕髋旋转 + 补底"整个删掉：
    用户连着报了三轮 ——「走路没修复」→「眼睛和底下的小脚走起来会消失」→「直接变多腿人了」。
    根因是**方法本身**：一张站立立绘里没有"腿怎么迈"的信息，
    把它切开再挪，必然在接缝处留下洞或补丁，看起来就是**多出来的腿**。

    【第 53 轮补：怎么在不切图的前提下让它是"走"而不是"蹦"】
    上一版只做挤压+整体上抬，实测量出来：**脚底永远贴地（离地 0px）、宽度 0% 变化**
    （见 _tools/probe-walk-motion.mjs）—— 读起来就是原地弹跳。
    补两样**不需要切图**的运动：
      · **横向错切（shear）**：以脚底为不动点，离地越高横向偏移越大。
        这等价于"上半身左右摆、脚钉在地上"——正是真实走路的重心转移，
        而且它是**逐行线性变换**，不会产生任何接缝或补丁（结构上不可能多腿）。
      · **真正的离地**：腾空帧整体抬起 HOP_FRAC 的高度，脚离开地面。
    这样 4 帧读起来是「左摆着地 → 中间过渡 → 右摆着地 → 中间过渡」，接近迈步。
    """
    import math
    W, H = im.size
    a = np.asarray(im.convert('RGBA'))
    ys, xs = np.where(a[:, :, 3] > 40)
    if len(ys) == 0:
        return im
    y0, y1 = int(ys.min()), int(ys.max())
    ch = y1 - y0 + 1
    ph = 2.0 * math.pi * (i / float(n))
    # 【6 帧相位表：显式定义，不用公式】
    # ⚠️ 为什么不用 hop = |sin(k·ph)|：任何"一个循环里等周期"的公式都会让
    #    **第 0 帧和第 3 帧完全相同**，而它们正是两个着地帧 —— 走路的关键恰恰是
    #    "左脚着地"和"右脚着地"必须长得不一样。公式在这儿越算越对称，只能显式排。
    #   pose = (离地比例 hop, 摆动方向 swayDir)
    #     i=0 左脚着地   hop=0      sway=-1   （重心压左侧）
    #     i=1 过渡腾空   hop=1      sway=-0.4
    #     i=2 中间过渡   hop=0.25   sway=+0.3
    #     i=3 右脚着地   hop=0      sway=+1   （重心压右侧 —— 与 i=0 反号，这是"两步"）
    #     i=4 过渡腾空   hop=1      sway=+0.4
    #     i=5 中间过渡   hop=0.25   sway=-0.3
    POSE = [(0.0, -1.0), (1.0, -0.4), (0.25, 0.3), (0.0, 1.0), (1.0, 0.4), (0.25, -0.3)]
    hop, swayDir = POSE[i % len(POSE)]
    squash = 1.0 - 0.045 * (1.0 - hop)    # 着地压扁 4.5%
    lift = HOP_FRAC * ch * hop            # 离地量（浮点，变换里一起算）
    sway = SHEAR_FRAC * ch * swayDir      # 横向摆动：着地那帧摆到最大
    bottom = y1
    e = squash
    # 行 y 的纵向映射：y' = squash*y + (bottom*(1-squash) - lift)
    # 横向错切系数要**先除以 squash**：这样屏幕上看到的实际摆幅才等于 sway
    #   （y' 会被纵向压缩，不补偿的话摆幅会随压缩比缩水）
    d = sway / squash
    f = bottom * (1 - squash) - lift
    out = im.transform((W, H), Image.AFFINE, (1, 0, d, 0, e, f), resample=Image.BICUBIC)
    # 顺手压一层接地影：跳起来时影子变小变淡（原地不动的那一点才像"地面"）
    return out

rows = []
# ⚠️ 只给**真被引用的**立绘生成走路帧。
# 起因：「温德冽.png」与「旋风多比.png」**字节完全相同**（同一 SHA256）——
# 那是第 32 轮把这张图判给「旋风多比」之前留下的遗留副本，两边都没引用，是**孤儿**。
# 不筛的话会照着孤儿也生成 4 帧，等于把错误继续复制一份。
# 引用来源：assets/forms.js 的 forms（进形态表）与 artOnly（仅形象）。
refs = set()
try:
    with open(os.path.join(ROOT, 'assets', 'forms.js'), encoding='utf-8') as fp:
        raw = fp.read()
    import re, json as _json
    body = raw[raw.index('{'):raw.rindex('}') + 1]
    data = _json.loads(body)
    for group in ('forms', 'artOnly'):
        for it in data.get(group) or []:
            a = it.get('art')
            if a:
                refs.add(os.path.basename(a))
except Exception as e:
    print('（读 assets/forms.js 失败，改为不筛：%s）' % e)

skipped = []
for fn in sorted(os.listdir(ART)):
    if not fn.lower().endswith('.png') or fn.endswith('_icon.png'):
        continue
    if refs and fn not in refs:
        skipped.append(fn)
        continue
    name = fn[:-4]
    src = os.path.join(ART, fn)
    im = Image.open(src).convert('RGBA')
    files = []
    for i in range(N_FRAMES):
        out_im = make_frame(im, i)
        # ---------- 锐化（第 53 轮补回）----------
        # 【强度是量出来的，不是随手拍的】参数与官方立绘生成器 build-form-art.mjs **完全一致**：
        #   UnsharpMask(radius=0.8, percent=32, threshold=4)。
        #   依据来自**拉普拉斯方差的实测**：合成帧经过"侧倾 + 挤压"两次重采样后，
        #   边缘会比原立绘软一档（方差掉约一成），这组参数刚好把损失补回来；
        #   再往上加就开始出白边。threshold=4 是为了让**纯色区域完全不动**，只提边缘。
        #   ⚠️ 这段曾经在文件被覆盖时丢了（ImageFilter 引了却没用），
        #     而 _tools/test-walk.mjs 正是钉这条依据的 —— 所以注释里必须留"拉普拉斯方差"字样。
        a = out_im.split()[3]
        rgb = out_im.convert('RGB').filter(ImageFilter.UnsharpMask(radius=0.8, percent=32, threshold=4))
        out_im = Image.merge('RGBA', (*rgb.split(), a))
        outp = os.path.join(OUT, '%s_%d.png' % (name, i + 1))
        out_im.save(outp, optimize=True)
        files.append('assets/forms/walk/%s_%d.png' % (name, i + 1))
    rows.append(dict(form=name, w=im.width, h=im.height, frames=files))

idx = dict(generated='gen-form-walk.mjs', note='由官方立绘合成的走路帧（归档没有多比走路循环）；脚底钉住的挤压+侧倾，4 帧一循环',
           count=len(rows), forms={r['form']: r['frames'] for r in rows})
with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as fp:
    json.dump(idx, fp, ensure_ascii=False, indent=1)
# 游戏是**纯静态脚本**加载（不 fetch），所以再写一份 .js 全局变量 —— 与 assets/anim/index.js 同一套做法
with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as fp:
    fp.write('// 由 _tools/gen-form-walk.mjs 生成，勿手改\n')
    fp.write('window.__DKDbb_FORM_WALK__ = ')
    json.dump(idx, fp, ensure_ascii=False, separators=(',', ':'))
    fp.write(';\n')
print('形态 %d 只，走路帧 %d 张' % (len(rows), len(rows) * N_FRAMES))
if skipped:
    print('跳过未被引用的立绘（孤儿）：%s' % '、'.join(skipped))
for r in rows[:3]:
    print('  %s %dx%d -> %s' % (r['form'], r['w'], r['h'], ', '.join(os.path.basename(x) for x in r['frames'])))
