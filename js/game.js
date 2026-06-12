/* 游戏逻辑层：文明状态、回合结算、气候效果、轮回与胜负。
 * 全局命名空间 TB.Game。数值依据 docs/GDD.md。 */
var TB = TB || {};

TB.Game = (function () {
  var ERAS = [
    { name: '石器时代', sci: 0,    mult: 1,   popCap: 30 },
    { name: '青铜时代', sci: 25,   mult: 1.3, popCap: 60 },
    { name: '铁器时代', sci: 75,   mult: 1.7, popCap: 120 },
    { name: '蒸汽时代', sci: 180,  mult: 2.2, popCap: 250 },
    { name: '电气时代', sci: 400,  mult: 3,   popCap: 500 },
    { name: '原子时代', sci: 700,  mult: 4,   popCap: 900 },
    { name: '信息时代', sci: 1100, mult: 5.5, popCap: 1500 },
    { name: '太空时代', sci: 1600, mult: 7,   popCap: 2500 }
  ];

  var CLIMATES = [
    { key: 'doom',       name: '烈日凌空', cls: 'climate-doom',       min: 800 },
    { key: 'inferno',    name: '双日凌空', cls: 'climate-doom',       min: 280 },
    { key: 'scorch',     name: '炙烤',     cls: 'climate-scorch',     min: 90 },
    { key: 'hot',        name: '酷热',     cls: 'climate-hot',        min: 45 },
    { key: 'mild',       name: '温和',     cls: 'climate-mild',       min: 8 },
    { key: 'cold',       name: '寒冷',     cls: 'climate-cold',       min: -25 },
    { key: 'frigid',     name: '严寒',     cls: 'climate-frigid',     min: -75 },
    { key: 'deepfreeze', name: '极寒',     cls: 'climate-deepfreeze', min: -Infinity }
  ];

  // 含水状态下各气候效果：[人口存活率, 粮食保存率, 产出系数]
  var WET_FX = {
    doom:       [0,    0,   0],
    inferno:    [0.15, 0.2, 0],
    scorch:     [0.6,  0.7, 0],
    hot:        [0.9,  1,   0.5],
    mild:       [1,    1,   1],
    cold:       [0.92, 1,   0.5],
    frigid:     [0.65, 1,   0],
    deepfreeze: [0.45, 1,   0]
  };
  // 脱水状态下各气候的人口存活率（doom 单独结算：5% 深藏者存活）
  var DRY_SURVIVE = {
    doom: 0.05, inferno: 0.7, scorch: 0.985, hot: 0.995,
    mild: 0.995, cold: 0.995, frigid: 0.99, deepfreeze: 0.985
  };

  var DESTROY_TEXTS = {
    doom:    '三日凌空。行星表面化为熔炉，岩石燃烧，海洋蒸腾。',
    inferno: '凌空的烈日烤焦了大地，文明在烈焰中化为灰烬。',
    starve:  '漫长的饥馑耗尽了最后一粒粮食，文明在沉寂中熄灭。',
    freeze:  '严酷的气候夺走了最后的生命，文明在风雪中熄灭。',
    engulf:  '行星坠入了太阳。在最后的时刻，整个世界变成了一道光。',
    eject:   '行星被引力甩出，飞向宇宙深处。永恒的黑夜降临了。'
  };

  function classify(t) {
    for (var i = 0; i < CLIMATES.length; i++) {
      if (t >= CLIMATES[i].min) return CLIMATES[i];
    }
    return CLIMATES[CLIMATES.length - 1];
  }

  function eraOf(sci) {
    var e = ERAS[0];
    for (var i = 0; i < ERAS.length; i++) {
      if (sci >= ERAS[i].sci) e = ERAS[i];
    }
    return e;
  }

  /* 生成"值得一玩"的星系：40 回合内无吞噬/甩出，开局 6 回合无凌空，
   * 且至少 1/4 的回合气候可生产。挑不出完美的就取评分最高的。 */
  function safeSystem() {
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < 30; i++) {
      var sys = TB.Physics.createSystem();
      var rounds = TB.Physics.forecast(sys, 40);
      var score = 0, fatal = false, productive = 0;
      for (var j = 0; j < rounds.length; j++) {
        var r = rounds[j];
        if (r.engulfed || r.ejected) { fatal = true; break; }
        if (j < 6 && (r.avgT >= 280 || r.maxT >= 800)) { fatal = true; break; }
        if (r.avgT >= -25 && r.avgT <= 90) productive++;
        if (r.avgT >= 800 || r.maxT >= 1600) score -= 3;
      }
      if (!fatal) {
        score += productive;
        if (productive >= 10) return sys;
        if (score > bestScore) { bestScore = score; best = sys; }
      } else if (best === null) {
        best = sys;
      }
    }
    return best;
  }

  function newState() {
    return {
      civ: 137 + Math.floor(Math.random() * 31),
      year: 0,
      pop: 10,
      food: 50,
      sci: 0,
      obs: 0,
      dehydrated: true,  // 文明以脱水种子形态开局，等待第一个恒纪元苏醒
      shipProgress: 0,   // 星舰计划已投入次数（3 次胜利）
      mildStreak: 0,     // 连续温和回合数（≥3 判定为恒纪元）
      sys: safeSystem(),
      over: false,       // 当前文明是否已毁灭（等待轮回）
      won: false,
      log: []
    };
  }

  function log(st, msg, kind) {
    st.log.push({ year: st.year, msg: msg, kind: kind || '' });
    if (st.log.length > 200) st.log.shift();
  }

  function fmt(n) { return Math.round(n * 10) / 10; }

  /* 文明毁灭 → 轮回。reason 是 DESTROY_TEXTS 的 key。 */
  function destroy(st, reason) {
    var era = eraOf(st.sci);
    var inherited = Math.floor(st.sci * 0.75);
    st.over = true;
    st.pendingRebirth = {
      text: DESTROY_TEXTS[reason] +
        '\n\n第 ' + st.civ + ' 号文明在持续了 ' + st.year + ' 年后毁灭了。该文明进化至' + era.name + '。' +
        '\n\n文明的种子仍在，它将重新启动，再次开始在三体世界中命运莫测的进化。' +
        (inherited > 0 ? '\n（上一文明的遗迹将传承 ' + inherited + ' 点科技）' : ''),
      inherited: inherited,
      resetSystem: reason === 'engulf' || reason === 'eject'
    };
  }

  function rebirth(st) {
    var p = st.pendingRebirth;
    st.civ += 1;
    st.pop = 10;
    st.food = 50;
    st.sci = p.inherited;
    st.obs = Math.ceil(st.obs / 2); // 天文历法随文明记忆传承一半
    st.dehydrated = true;           // 新文明以脱水种子形态苏醒前蛰伏
    st.shipProgress = 0;
    st.mildStreak = 0;
    st.over = false;
    st.pendingRebirth = null;
    if (p.resetSystem) {
      st.sys = safeSystem();
      log(st, '新的星系轮回开始了。三颗太阳在虚空中重新就位。', 'log-system');
    }
    log(st, '第 ' + st.civ + ' 号文明在一片废墟上诞生了。', 'log-system');
  }

  /* 执行玩家行动。返回 false 表示行动无效（不消耗回合）。 */
  function doAction(st, action) {
    if (st.over || st.won) return false;
    var era = eraOf(st.sci);
    var roundInfo = { action: action };

    switch (action) {
      case 'farm':
      case 'research':
      case 'breed':
        if (st.dehydrated) return false;
        break;
      case 'observe':
        if (st.dehydrated) return false;
        var cost = 30 * (st.obs + 1);
        if (st.obs >= 6 || st.food < cost) return false;
        st.food -= cost;
        st.obs += 1;
        log(st, '观测台升至 ' + st.obs + ' 级。脱水者们仰望天空的眼睛更亮了。', 'log-good');
        break;
      case 'hydrate':
        // 浸泡/脱水切换在结算前判定气候，见 endRound
        break;
      case 'wait':
        // 静待：什么都不做，让时间流逝（脱水熬灾难的唯一手段）
        break;
      case 'ship':
        if (st.dehydrated || era.name !== '太空时代' || st.food < 200) return false;
        st.food -= 200;
        st.shipProgress += 1;
        if (st.shipProgress >= 3) {
          st.won = true;
          log(st, '恒星级飞船升空了。', 'log-system');
        } else {
          log(st, '星舰计划推进至 ' + st.shipProgress + '/3。群星在召唤。', 'log-good');
        }
        break;
      default:
        return false;
    }

    endRound(st, roundInfo);
    return true;
  }

  function endRound(st, info) {
    var era = eraOf(st.sci);
    var round = TB.Physics.advanceRound(st.sys);
    st.year += 5;
    var cli = classify(round.maxT >= 280 ? round.maxT : round.avgT);
    st.lastClimate = cli;
    st.lastRound = round;

    // 恒纪元判定
    if (cli.key === 'mild') st.mildStreak += 1;
    else st.mildStreak = 0;

    // 行星级灾难
    if (round.engulfed) { destroy(st, 'engulf'); return; }
    if (round.ejected) { destroy(st, 'eject'); return; }

    // 脱水/浸泡切换
    if (info.action === 'hydrate') {
      if (st.dehydrated) {
        // 浸泡：气候不适宜则付出惨重代价
        var t = round.avgT;
        st.dehydrated = false;
        if (t < -10 || t > 50) {
          st.pop *= 0.7;
          log(st, '在恶劣的天候中强行浸泡，许多人刚刚苏醒便死去了。', 'log-danger');
        } else {
          log(st, '湖水温暖。浸泡开始了，干涸的躯体重新舒展，文明苏醒。', 'log-good');
        }
      } else {
        st.dehydrated = true;
        log(st, '"脱水——" 全民卷成了干纤维，由脱水卫队收入仓库。', 'log-system');
      }
    }

    // 凌空毁灭：持续高温（avgT）或极端尖峰。含水必灭；
    // 脱水者中有 5% 深藏地窟得以幸存——预报+脱水是唯一的活路
    if (round.avgT >= 800 || round.maxT >= 1600) {
      if (!st.dehydrated) { destroy(st, 'doom'); return; }
      st.pop *= 0.2;
      st.food *= 0.5;
      log(st, '烈日凌空！行星表面化为熔炉，唯有深藏地窟的脱水体免于焚毁。', 'log-danger');
      if (st.pop < 0.5) { destroy(st, 'doom'); }
      return;
    }
    if (cli.key === 'doom') { cli = classify(279); st.lastClimate = cli; } // 掠日尖峰降格为双日凌空

    var prodFactor = 0;
    if (st.dehydrated) {
      st.pop *= DRY_SURVIVE[cli.key];
      // 守夜学者：少数保持含水的值守者以 10% 速率延续研究
      st.sci += st.pop * 0.12 * era.mult;
      if (cli.key === 'inferno') {
        log(st, '双日凌空！仓库中的脱水体也有三成被引燃。', 'log-danger');
      }
    } else {
      var fx = WET_FX[cli.key];
      if (cli.key === 'inferno') {
        st.pop *= fx[0];
        st.food *= fx[1];
        prodFactor = fx[2];
        log(st, '双日凌空！大地燃烧，含水的人们在烈焰中倒下。', 'log-danger');
      } else {
        st.pop *= fx[0];
        st.food *= fx[1];
        prodFactor = fx[2];
        if (fx[0] < 0.8) {
          log(st, '乱纪元的' + cli.name + '夺走了大量生命。', 'log-danger');
        }
      }
    }

    // 三星连珠
    if (round.alignment && st.pop > 0) {
      st.pop *= 0.85;
      log(st, '三星连珠！潮汐力撕扯着大地，山脉在引力中升起又崩塌。', 'log-danger');
    }

    // 飞星预兆（纯演出）
    var sky = TB.Physics.skyInfo(st.sys);
    var flying = sky.filter(function (s) { return s.flying; }).length;
    if (flying === 3 && Math.random() < 0.5) {
      log(st, '三颗飞星同时出现。古老的预言说：这是漫长极寒的前兆。', '');
    }

    // 产出与消耗（仅含水状态）
    if (!st.dehydrated) {
      var climateF = prodFactor;
      if (info.action === 'farm') {
        var gain = st.pop * 1.5 * era.mult * climateF;
        st.food += gain;
        if (gain > 0) log(st, '收获了 ' + fmt(gain) + ' 单位粮食。', '');
        else log(st, '严酷的气候里颗粒无收。', '');
      } else if (info.action === 'research') {
        var sgain = st.pop * 1.5 * era.mult * Math.max(climateF, 0.5);
        var prevEra = era.name;
        st.sci += sgain;
        log(st, '学者们积累了 ' + fmt(sgain) + ' 点科技。', '');
        var newEra = eraOf(st.sci);
        if (newEra.name !== prevEra) {
          log(st, '文明进入了' + newEra.name + '！', 'log-system');
        }
      } else if (info.action === 'breed') {
        var cap = era.popCap;
        var growth = st.pop * 0.12 * climateF * Math.max(0, 1 - st.pop / cap);
        st.pop += growth;
        st.food -= growth * 0.3;
        if (growth > 0.1) log(st, '人口增长了 ' + fmt(growth) + ' 万。', 'log-good');
        else log(st, '严酷的气候中，没有人愿意生育。', '');
      }

      // 气候宜人且有余粮时，人口自然增长（不占用行动）
      if (prodFactor > 0 && st.food > st.pop) {
        st.pop += st.pop * 0.05 * prodFactor * Math.max(0, 1 - st.pop / era.popCap);
      }

      // 基础粮耗与饥荒（缺口比例 = 缺粮 / 所需粮）
      var foodNeeded = st.pop * 0.5;
      st.food -= foodNeeded;
      if (st.food < 0) {
        var deficitRatio = Math.min(0.35, -st.food / Math.max(foodNeeded, 0.1));
        st.pop *= (1 - deficitRatio);
        st.food = 0;
        log(st, '粮仓见底，饥荒蔓延。', 'log-danger');
      }
    }

    // 文明消亡判定
    if (st.pop < 0.5) {
      var reason = 'starve';
      if (cli.key === 'cold' || cli.key === 'frigid' || cli.key === 'deepfreeze') reason = 'freeze';
      else if (cli.key === 'hot' || cli.key === 'scorch' || cli.key === 'inferno') reason = 'inferno';
      destroy(st, reason);
      return;
    }

    // 恒纪元播报
    if (st.mildStreak === 3) {
      log(st, '气候已持续温和。长老们宣布：恒纪元到来了！浸泡吧，繁衍吧，生活吧！', 'log-good');
    }
  }

  /* 预报数据：观测台等级决定可见回合数（1+obs），其余为未知 */
  function getForecast(st, totalCells) {
    var visible = Math.min(1 + st.obs, totalCells);
    var rounds = TB.Physics.forecast(st.sys, visible);
    var out = [];
    for (var i = 0; i < totalCells; i++) {
      if (i < visible) {
        var r = rounds[i];
        var cli = classify(r.maxT >= 280 ? r.maxT : r.avgT);
        out.push({ known: true, climate: cli, stable: cli.key === 'mild' });
      } else {
        out.push({ known: false });
      }
    }
    return out;
  }

  return {
    newState: newState,
    doAction: doAction,
    rebirth: rebirth,
    getForecast: getForecast,
    eraOf: eraOf,
    classify: classify,
    ERAS: ERAS
  };
})();
