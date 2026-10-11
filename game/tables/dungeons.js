/* 多克多比 · 官方副本数据（M4-1）
 *
 * 数据来源：docs/官方资料库.md 第十二章（7k7k 副本解读/攻略频道原文，经 _tools/scan-corpus.mjs 查证）
 * 硬性规则 R1/R2：**原文没写的绝不编**。每条都带 conf（official/derived/missing）与 evidence。
 *
 * 原版副本的统一骨架（从 13 个副本的原文归纳，official）：
 *   NPC 传送进入 → 小游戏/解谜关卡 → 战斗 → BOSS → 翻牌/掉落
 * 且有一条**硬规则**（official）：完成副本可获得「只有在副本里才能获得的魅力属性」。
 *
 * 怪物选角说明（derived）：归档里只有 36 只怪，没有「木乃伊」「法老」「关羽」这些立绘。
 * 选角原则 = 优先用**原文点过名的怪**，没有就按主题/元素选最近的，并把替换关系写进 monNote。
 */
(() => {
  'use strict'
  const D = window.DKDbbData = window.DKDbbData || {}

  // 副本常规奖励（原文 7k7k/179182：「副本常规奖励都包含金币、彩晶石、晶石碎片，
  // 以及很重要属性魅力值、勇气」）—— 具体数额原文没给，标 derived。
  const COMMON_REWARD = { gold: 420, charm: 3, brave: 2, crystal: 30 }

  // 关卡类型：
  //   memory —— 记忆力小游戏（原文：金字塔「幻影栈道，记忆力与团队协作的策略游戏」）
  //   battle —— 普通战斗
  //   boss   —— BOSS 战
  //   flip   —— 翻牌（原文：武当保卫战「翻牌」、凤凰考验「通关翻牌有几率」）
  const DUNGEONS = [
    {
      id: 'jinzita', name: '金字塔', minLevel: 10, players: '多人', order: 1,
      entry: { npc: '拉鲁', place: '迷失' },          // official：原文点名「迷失里的拉鲁，可以将你的队伍传送到金字塔」
      stages: [
        { kind: 'memory', label: '幻影栈道', hint: '记忆力与团队协作的策略游戏', seq: 4 },
        { kind: 'battle', label: '金字塔守卫', mon: 19009, lv: 11, monNote: '原文写「大战木乃伊」；归档里只有蛇面蝙蝠被原文点名为金字塔守卫者（眼镜蛇+巨型蝙蝠融合），故用它' },
        // 原文（7k7k/115179 等）：「玩家分组站立在两个机关上，进入解谜拼图游戏」
        // → 用**滑动拼图**（与「魔法工匠」同一套机制：3×3 滑动到目标图案）。
        //   原文只说"解谜拼图"，具体拼什么没给 → 机制是 derived（V59），但比"记忆力关"贴近得多。
        { kind: 'slide', label: '机关拼图', hint: '玩家分组站立在两个机关上，进入解谜拼图游戏', standIn: '原文只说"解谜拼图"，拼图内容没给 → 用滑动拼图（derived）' },
        { kind: 'boss', label: '金字塔之主', mon: 10011, lv: 15, monNote: '原文 BOSS 是「法老」；归档无该立绘，用具埃及主题的克里奥佩特拉代替' },
      ],
      drop: ['魔蛇之心'],  // official：五大能量石之一
      conf: 'official', evidence: '7k7k/111450 · 115179 · 112099',
      // 第 34 轮：归档里有 3 段金字塔录像（金字塔.wmv / 金字塔版本2.avi / 金字塔版本3.wmv）。
      // 文件名**没有**给出小游戏名字，只有"有三个版本"这一点信息。
      videoEvidence: {
        files: ['金字塔/金字塔.wmv', '金字塔/金字塔版本2.avi', '金字塔/金字塔版本3.wmv'],
        names: [],
        note: '归档有 3 段本副本录像，但文件名只体现"版本 1/2/3"、没有玩法名；画面未解读（本机无 ffmpeg，WPF 媒体栈在这个沙箱里也跑不起来）',
      },
    },
    {
      id: 'huoshaochibi', name: '火烧赤壁', minLevel: 15, players: '多人', order: 2,
      entry: { npc: null, place: null },
      stages: [
        // 原文：「一进入副本就需要玩一个小游戏，就是在不被敌人发现的情况下到达船的甲板上…
        //        简单的来说就是和甲板上的敌人玩捉迷藏，与敌人要保持一定的距离，不要让敌人发现，
        //        掌握好敌人的速度，尽量在和敌人背对的时候行动」
        { kind: 'stealth', label: '无所遁形', guards: 2, hint: '在甲板上与敌人捉迷藏：保持距离，趁敌人背对时前进' },
        { kind: 'battle', label: '甲板守卫', mon: 10017, lv: 16 },
        { kind: 'boss', label: '关羽', mon: 19012, lv: 16, monNote: '原文 BOSS 关羽（16 级，招牌技能「草泥马狂奔」）；归档无关羽立绘，用魔龙代替' },
      ],
      drop: ['迅捷飞刀', '防御之石'],  // official：掉落技能「迅捷飞刀」与圣洁之盾材料
      conf: 'official', evidence: '7k7k/115197 · 168880 · 173951',
    },
    {
      id: 'suoyamiju', name: '索亚迷局', minLevel: 18, players: '多人', order: 3,
      entry: { npc: '咪鲁', place: '索亚走道 · 索亚城' },
      // 【第 58 轮补三段】官方（7k7k/179859《多克多比索亚迷局副本攻略》，11 步全剧情）
      // 明确写了这条副本里有**三处可玩段落**，但**只说了"要做什么"、没写"怎么做"**：
      //   第 3 步「经过**密林危途小游戏**才可以顺利到达索亚森林！」      → kind: runner
      //   第 6 步「这个叫**米雅**的索亚还真**难抓**，想要抓到它得费点劲了。」 → kind: catch
      //   第 9 步「想要达到黑水晶之处**首先要躲开重重陷阱**。」           → kind: stealth
      // 按 R1 **不编造**：这三段的**存在与先后顺序是 official**，
      // **具体玩法是 derived** —— 复用归档/攻略里本来就有的三套小游戏机制
      //（runner=「多比快跑」躲石头与水塘、catch=接住掉落物、stealth=一步步前进躲危险），
      // 并在关卡名与提示里**对玩家写明这一点**（R3：不许静默降级）。
      stages: [
        {
          kind: 'runner', label: '密林危途（第 3 步）',
          hint: '原文只说「经过密林危途小游戏才可以顺利到达索亚森林」，**玩法原文没有**；这里复用《多比快跑》的跑动躲障碍机制（derived）',
        },
        { kind: 'battle', label: '迷局守卫', mon: 19013, lv: 19 },
        {
          kind: 'catch', label: '抓捕米雅（第 6 步）',
          hint: '原文只说米雅「还真难抓……得费点劲了」，**玩法原文没有**；这里复用已实现的"接住移动目标"机制（derived）',
        },
        {
          kind: 'stealth', label: '躲开重重陷阱（第 9 步）', guards: 2,
          hint: '原文只说「想要达到黑水晶之处首先要躲开重重陷阱」，**玩法原文没有**；这里复用"一步步前进、避开危险"的机制（derived）',
        },
        { kind: 'boss', label: '年轻克里文', mon: 19010, lv: 22, monNote: '原文 BOSS 是「年轻克里文」（紫罗兰皇家骑士团亲卫）；归档无该立绘，用魔化多比代替' },
      ],
      drop: ['黑水晶碎片'],  // official
      conf: 'official', evidence: '7k7k/112049 · 115179 · 179859（11 步全剧情，见 docs/官方资料库.md 16.6）',
      derivedNote: '三段可玩段落（密林危途 / 抓捕米雅 / 躲陷阱）的**存在与顺序**有原文；' +
        '**具体玩法没有原文**，按 V59 的既定做法复用已实现的小游戏机制（属 derived），' +
        '并在关卡名与提示里写明 —— 已登记 V79。',
    },
    {
      id: 'zhanshenjingang', name: '战神金刚', minLevel: 20, players: '多人', order: 4,
      entry: { npc: null, place: null },
      stages: [
        // 原文（7k7k/163435）：「**连接能量管线**，使得能量能够顺利输送即可。」
        { kind: 'pipe', label: '连接能量管线', hint: '旋转管件，把左侧入水口与右侧出水口接通' },
        { kind: 'battle', label: '外面的敌人', mon: 19008, lv: 20 },
        { kind: 'boss', label: '巨大机器人', mon: 19008, lv: 24, monNote: '原文：机器人组合成全新的巨大机器人；归档用机械系拉乌比I型' },
      ],
      drop: ['元素石'],
      conf: 'official', evidence: '7k7k/163435 · 181055',
      // 第 34 轮：归档里这一关有 3 段录像，文件名给出另外三个小游戏的名字。
      // 已实现的「连接能量管线」来自原文正文，这 3 个只有名字、玩法未解读。
      videoEvidence: {
        files: ['战神金刚/战神金刚副本队长射击小游戏.avi', '战神金刚/战神金刚接口小游戏.wmv',
          '战神金刚/战神金刚装配及挖矿小游戏.wmv'],
        names: ['队长射击', '接口', '装配及挖矿'],
        note: '归档录像的**文件名**给出了三个小游戏的名字；画面未解读（本机无 ffmpeg，WPF 媒体栈在这个沙箱里也跑不起来）→ 除「连接能量管线」外均为 missing',
      },
    },
    {
      id: 'dayuzhishui', name: '大禹治水', minLevel: 22, players: '只能组队', order: 5,
      entry: { npc: null, place: null },
      stages: [
        // 原文（7k7k/115195）：「**激流勇进**小提示：站在最后面未必是安全的，站在一个合适的位置
        // 并且能够留给自己足够的反应时间才是最重要的！另外大家最好站在一起，如果队友不小心…」
        { kind: 'current', label: '激流勇进', hint: '湍流会冲来某一条航道：在被冲中之前换到别的航道', rounds: 3 },
        { kind: 'battle', label: '水患妖物', mon: 10014, lv: 22 },
        { kind: 'boss', label: '魔化河伯', mon: 19011, lv: 26, monNote: '原文剧情里的黄河水神「河伯」；归档正好有魔化河伯' },
      ],
      drop: ['天河宝石', '防御盾柄'],
      conf: 'official', evidence: '7k7k/115164 · 115179 · 115195',
    },
    {
      id: 'atelansi', name: '阿特兰斯', minLevel: 25, players: '组队', order: 6,
      entry: { npc: null, place: '阿特兰斯大裂谷' },
      stages: [
        // 第 40 轮：**这一关是替代品**，必须在界面上说出来（R3 不许静默降级）。
        // 原文只有一句「而且在海底世界中，各种机关密道也给玩家带来了许多困难」——
        // **机关长什么样、怎么过，一个字都没给** → 用通用记忆力关替代，并标明。
        { kind: 'memory', label: '机关密道', hint: '海底世界的各种机关密道；力量、智慧、团结都是必不可少的', seq: 5,
          standIn: '原文只有"各种机关密道带来许多困难"一句，机关怎么走没有依据 → 这里用通用记忆力关替代（V59）' },
        { kind: 'battle', label: '珊瑚中的鱼群', mon: 10019, lv: 25 },
        { kind: 'boss', label: '梅尔德·费西', mon: 10015, lv: 30, monNote: '原文 BOSS 是水属性人鱼多比「梅尔德·费西」；归档无该立绘，用鲤鱼将军代替' },
      ],
      drop: ['潜水服套装', '阿特兰斯宝石'],
      conf: 'official', evidence: '7k7k/115154 · 115170 · 115209',
    },
    {
      id: 'zijingdong', name: '紫晶洞', minLevel: 35, players: '四人', order: 7,
      entry: { npc: null, place: null },
      stages: [
        { kind: 'memory', label: '时空裂隙', hint: '穿梭时空回到被乌卡族统治的年代', seq: 5,
          standIn: '原文只给了"穿梭时空回到被乌卡族统治的年代"这个设定，裂隙里怎么玩没有依据 → 这里用通用记忆力关替代（V59）' },
        { kind: 'battle', label: '乌卡族巡逻', mon: 10010, lv: 35 },
        { kind: 'boss', label: '超级勇士多比', mon: 19010, lv: 38, monNote: '原文：传说中的第一个勇士「超级勇士多比」出现；归档无该立绘，用魔化多比代替' },
      ],
      drop: ['魔化水晶', '防御之翼'],
      conf: 'official', evidence: '7k7k/115202 · 115164',
    },
    {
      id: 'fengHuangKaoYan', name: '凤凰考验', minLevel: 28, players: '多人', order: 8,
      entry: { npc: '克鲁斯', place: '勇者之颠' },
      stages: [
        // 第 34 轮：归档 `多克多比素材fla\…\副本视频及素材\` 里有**4 段这一关的小游戏录像**，
        // 文件名给出了原版小游戏的名字：射击 / 铲煤 / 队长火车 / 电工。
        // ⚠️ 但**本机没有视频解码器**（无 ffmpeg，WPF 媒体栈在这个沙箱里也跑不起来），
        //   所以只拿到了**名字**、玩法**未解读** —— 这一关仍用通用记忆力关替代。
        //   不许因为"看到了文件名"就假装知道玩法（R1/R9）。
        { kind: 'memory', label: '凤凰的四道考验（替代）',
          hint: '原版这一关是「射击 / 铲煤 / 队长火车 / 电工」四个小游戏；录像在归档里但本机无解码器 → 玩法未解读，这里用通用记忆力关替代',
          standIn: '原版四个小游戏只有名字（归档录像的画面未解读，B15）→ 这里用通用记忆力关替代（V59）' },
        { kind: 'battle', label: '凤凰召唤的对手', mon: 10018, lv: 28 },
        { kind: 'boss', label: '凤凰', mon: 19001, lv: 32, monNote: '归档无凤凰立绘，用雷暴鲁巴代替' },
      ],
      drop: ['凤凰之心', '点燃'],
      conf: 'official', evidence: '7k7k/164106 · 557145 · 5068/9333',
      videoEvidence: {
        files: ['凤凰的考验/凤凰副本射击小游戏.wmv', '凤凰的考验/凤凰副本铲煤小游戏.avi',
          '凤凰的考验/凤凰副本队长火车小游戏.wmv', '凤凰的考验/凤凰考验副本电工小游戏.wmv'],
        names: ['射击', '铲煤', '队长火车', '电工'],
        note: '归档录像的**文件名**给出了四个小游戏的名字；画面未解读（本机无 ffmpeg，WPF 媒体栈在这个沙箱里也跑不起来）→ 玩法按 missing 处理',
      },
    },
    {
      id: 'wudangbaoweizhan', name: '武当保卫战', minLevel: 30, players: '圣多克专属', order: 9,
      entry: { npc: '卢卡多', place: '彩虹岛' },
      stages: [
        // 原文（7k7k/508282）：「经过一段讲解，**玛丽娜要考考各位小多克**了，这些标红的字…」
        { kind: 'quiz', label: '玛丽娜的考试', hint: '答对 2 道以上即可通过（题目答案都标了出处）', need: 2 },
        { kind: 'battle', label: '乌卡族入侵', mon: 19010, lv: 30 },
        { kind: 'boss', label: '乌卡族首领', mon: 19002, lv: 34, monNote: '归档用大幽灵代替' },
      ],
      drop: ['阴勾玉', '阳勾玉'],
      conf: 'official', evidence: '7k7k/506959 · 508282 · 508296',
    },
    {
      id: 'taikongbaolei', name: '太空堡垒', minLevel: 26, players: '多人', order: 10,
      entry: { npc: null, place: '布拉德矿坑' },
      stages: [
        { kind: 'battle', label: '异星战士', mon: 19008, lv: 26 },
        // 原文（7k7k/511864）：「**打飞机的部分不是方向键控制的**，很多人进去就傻站着。」
        // → 刻意做成**纯鼠标**打靶，不用键盘。
        { kind: 'shooter', label: '驾驶超级战机', hint: '鼠标点击击落来袭目标（原版也不是方向键控制）', need: 5 },
        { kind: 'boss', label: '机械多比', mon: 19008, lv: 31, monNote: '原文：通关有机会获得机械多比「埃尔·垒」，专属技能破天钻' },
      ],
      drop: ['机械多比'],
      conf: 'official', evidence: '7k7k/511864 · 511869 · 512075',
    },
    {
      id: 'luluwang', name: '噜噜王的终结', minLevel: 12, players: '圣多克专属 2-4 人', order: 11,
      entry: { npc: '沙拉塔', place: '索亚走道' },
      stages: [
        // 原文：「每个队伍进入噜噜王副本中会出现两个数值！一个是玩家队伍的士气值，一个是噜噜王的…」
        // ⚠️ 原文只说了"有两个数值"，没说怎么增减 —— 增减规则是本项目推算的（derived，见 V37）
        { kind: 'morale', label: '士气对抗', hint: '队伍士气 vs 噜噜王：先到 100 者胜（规则为推算）' },
        { kind: 'battle', label: '噜噜普', mon: 10021, lv: 13 },
        { kind: 'boss', label: '噜噜王', mon: 10022, lv: 18, monNote: '归档用赛罗特代替' },
      ],
      drop: ['宝藏'],
      conf: 'official', evidence: '7k7k/115968 · 528376 · 528805',
    },
    {
      id: 'daluqi', name: '大陆棋', minLevel: 20, players: 'PVP 匹配', order: 12,
      entry: { npc: '皮格万', place: '万象小屋' },
      // 【第 51 轮按原文重做】原先这里是一关 `boss`（"对 AI 打一局"）—— **与原文不符**：
      // 第 47 轮查明大陆棋是**推人下河的弹弓物理对战**，不是回合制战斗。
      // 现改为 `sumo` 关：拉弓发射 → 撞人/撞河 → 四类多比各有打法（规则见 game/tables/sumo.js）。
      stages: [
        { kind: 'sumo', label: '大陆棋对局', hint: '将鼠标指向出招的多比会出现一个箭头，移动鼠标调整箭头的方向和大小；瞄准敌人后松开鼠标就可以进行发射' },
      ],
      drop: ['平和药剂'],
      conf: 'official',
      evidence: '7k7k/558220 · 558658 · 558684 · 558700 · 563724（玩法逐字可读，见 docs/官方资料库.md 16.5.1）',
      pvpNote: '原版是与真人跨服匹配；离线版只能对 AI，属**有意的形式改变**（已登记 V71）。**玩法本身已按原文重做**，不再是"打一局"。',
    },
    {
      id: 'jingshiduizhan', name: '晶石对战', minLevel: 20, players: 'PVP 匹配', order: 13,
      entry: { npc: '皮格万', place: '万象小屋' },
      // 【第 57 轮按原文重做】原先这里是一关 `boss`（"单机版简化为一场战斗"）—— **与原文不符**：
      // 官方原文（7k7k/563849 · 545865）说的是 **三消攒能量 + 多比自动出手 + 1 主将 4 副将的 5v5**：
      //   「每个多比都有主将技和副将技！主将只能有一个多比，副将可以有四个多比」
      //   「每回合多比都会自动向对方攻击！而小多克需要操作自己面前的晶石板来积攒晶石能量打击对方」
      //   「红心晶石：恢复能力晶石可以进行加血！其他晶石：每种属性都有自己的晶石」
      //   「只有符合自己出战多比属性和恢复晶石才会有作用，多比属性能量积累到一定程度就可以发放相关技能」
      //   「击败对方全部 5 个多比，战斗胜利」
      //   「有的小多克一回合就被秒杀……因为对手的运气太好，一次性消除的晶石数量过多导致」
      // 现改为 `crystal` 关（规则见 game/tables/crystal.js）。
      stages: [
        {
          kind: 'crystal', label: '三消攒能量 · 多比自动出手 · 5v5',
          hint: '点两块相邻的晶石交换位置，连成三颗以上就会消掉：属性晶石给**同属性的多比**充能，红心晶石回血；能量攒满那只多比就会放技能',
        },
      ],
      drop: ['元素晶石微粒'],
      conf: 'official',
      evidence: '7k7k/563849 · 545865（玩法逐字可读，见 docs/官方资料库.md 16.5.2）',
      pvpNote: '原版是与真人跨服匹配；离线版只能对 AI，属**有意的形式改变**（已登记 V71）。**玩法本身已按原文重做**（三消 + 自动出手 + 5v5），不再是"打一场架"。',
    },
    {
      id: 'yingxiongjueze', name: '英雄抉择', minLevel: 0, players: '多人', order: 14,
      stages: [],
      drop: ['防御盾牌'],  // 唯一已知信息：圣洁之盾材料
      conf: 'missing', evidence: '7k7k/506377（语料里只有 3 处命中，**玩法无原文**）',
      missingNote: '**玩法在语料里查不到**，按 R1 不编造：列表里显示为"玩法资料缺失"',
    },
  ]

  // ---- 「玛丽娜的考试」题库（武当保卫战，7k7k/508282 原文：「玛丽娜要考考各位小多克」）----
  // 原文只说了"有考试"这个环节，**没给题目**。所以题库由本项目出，
  // 但**每一题的答案都取自我们已经核实过的官方资料**，并在题目里带上出处 ——
  // 出的不是"常识题"，而是"这个复刻版里能查到的东西"。
  const QUIZ = [
    {
      q: '官方七大地形里，多比们的主城叫什么？',
      a: ['多比城堡', '多比学院', '智慧城'], right: 0,
      evidence: '5068《多克多比地形全介绍》',
    },
    {
      q: '金字塔副本里，乌卡把眼镜蛇和巨型蝙蝠融合成了哪只怪物？',
      a: ['蛇面蝙蝠', '魔化河伯', '大幽灵'], right: 0,
      evidence: '7k7k/112099',
    },
    {
      q: '白色彩晶石碎片每天最多能合成几块白色彩晶石？',
      a: ['3 块', '5 块', '10 块'], right: 1,
      evidence: '7k7k/177905',
    },
    {
      q: '发动结印技需要先积累什么？',
      a: ['金币', 'SP', '声望'], right: 1,
      evidence: '7k7k《多克多比结印技能特点》',
    },
    {
      q: '与多比一起出战、每只有不同战斗机制的伙伴叫什么？',
      a: ['索亚', '骑士', '精灵'], right: 0,
      evidence: '7k7k 索亚介绍页',
    },
    {
      q: '八大骑士里，以"水的柔韧化解强力攻击"的是哪位？',
      a: ['赤炎骑士', '水晶骑士', '狂毒骑士'], right: 1,
      evidence: '原版任务剧情「以柔克刚」',
    },
  ]

  D.DUNGEON_QUIZ = QUIZ
  // 抽 n 道题（不重复）
  D.pickQuiz = function (n = 3) {
    const pool = QUIZ.slice()
    const out = []
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    return out
  }

  D.DUNGEONS = DUNGEONS
  D.DUNGEON_COMMON_REWARD = COMMON_REWARD
  // 临时副本表：小游戏面板用"单关卡的临时副本"来跑官方小游戏，
  // 这样能**复用副本的阶段机与结算**，不必为小游戏再写一套状态机（只活在本次会话，不写存档）。
  D._tempDungeons = {}
  D.dungeonById = (id) => DUNGEONS.find((x) => x.id === id) || D._tempDungeons[id] || null
  // 可玩的（有玩法依据、且至少有 1 个关卡）
  D.playableDungeons = () => DUNGEONS.filter((x) => x.stages.length > 0)
  // 已用到的怪物 id → 便于自检"引用的怪真的存在"
  D.dungeonMonsterIds = () => {
    const s = new Set()
    for (const d of DUNGEONS) for (const st of d.stages) if (st.mon) s.add(st.mon)
    return [...s]
  }
})()
