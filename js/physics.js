/* 三体物理引擎：3 颗太阳 + 行星（质点），2D 速度 Verlet 积分。
 * 全局命名空间 TB.Physics。 */
var TB = TB || {};

TB.Physics = (function () {
  var G = 1.0;
  var SUN_MASS = 1.0;
  var DT = 0.002;
  var STEPS_PER_ROUND = 400;
  var SOFTEN = 0.01; // 引力软化，避免数值爆炸

  // 温度模型（标定开局 T=20°C，x = flux/flux0）：
  //   x≤1: T = 20 + 25·ln(x)，下限 -100 —— 远离太阳时平滑滑入严寒/极寒
  //   x>1: T = 20 + 80·(x-1)        —— 逼近太阳时线性升温，凌空为稀有尖峰
  var T_FLOOR = -100;

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* 生成一组随机初始条件：三颗太阳分布在环上，行星在其间。
   * 亮度标定（flux0）使开局温度恰为 20°C。 */
  function createSystem() {
    var suns = [];
    var i, ang, r;
    for (i = 0; i < 3; i++) {
      ang = (i / 3) * Math.PI * 2 + rand(-0.5, 0.5);
      r = rand(1.4, 2.8);
      suns.push({
        x: Math.cos(ang) * r,
        y: Math.sin(ang) * r,
        vx: rand(-0.35, 0.35) - Math.sin(ang) * rand(0.1, 0.45),
        vy: rand(-0.35, 0.35) + Math.cos(ang) * rand(0.1, 0.45),
        m: SUN_MASS
      });
    }
    // 消去系统总动量，防止整体漂移
    var px = 0, py = 0;
    for (i = 0; i < 3; i++) { px += suns[i].vx; py += suns[i].vy; }
    for (i = 0; i < 3; i++) { suns[i].vx -= px / 3; suns[i].vy -= py / 3; }

    ang = rand(0, Math.PI * 2);
    r = rand(0.9, 1.8);
    // 行星给近圆轨道速度（v=√(GM总/r)），否则会径直坠入太阳
    var vOrb = Math.sqrt(G * SUN_MASS * 3 / r) * rand(0.85, 1.1);
    var planet = {
      x: Math.cos(ang) * r,
      y: Math.sin(ang) * r,
      vx: -Math.sin(ang) * vOrb,
      vy: Math.cos(ang) * vOrb
    };

    var sys = { suns: suns, planet: planet, flux0: 1, ejectRounds: 0 };
    sys.flux0 = fluxAt(sys); // 标定：使开局 T = T_BASE + T_SCALE = 20°C
    return sys;
  }

  function fluxAt(sys) {
    var f = 0, i, dx, dy, d2;
    for (i = 0; i < 3; i++) {
      dx = sys.suns[i].x - sys.planet.x;
      dy = sys.suns[i].y - sys.planet.y;
      d2 = dx * dx + dy * dy + SOFTEN;
      f += 1 / d2;
    }
    return f;
  }

  function temperature(sys) {
    var x = fluxAt(sys) / sys.flux0;
    var t = x <= 1 ? 20 + 25 * Math.log(x) : 20 + 45 * (x - 1);
    return Math.max(t, T_FLOOR);
  }

  function accel(sys, body, isPlanet) {
    var ax = 0, ay = 0, i, dx, dy, d2, d, a;
    for (i = 0; i < 3; i++) {
      var s = sys.suns[i];
      if (!isPlanet && s === body) continue;
      dx = s.x - body.x;
      dy = s.y - body.y;
      d2 = dx * dx + dy * dy + SOFTEN;
      d = Math.sqrt(d2);
      a = G * s.m / d2;
      ax += a * dx / d;
      ay += a * dy / d;
    }
    return { x: ax, y: ay };
  }

  function step(sys) {
    var bodies = sys.suns.concat([sys.planet]);
    var accs = bodies.map(function (b, idx) { return accel(sys, b, idx === 3); });
    var i, b;
    for (i = 0; i < 4; i++) {
      b = bodies[i];
      b.x += b.vx * DT + 0.5 * accs[i].x * DT * DT;
      b.y += b.vy * DT + 0.5 * accs[i].y * DT * DT;
    }
    var accs2 = bodies.map(function (b, idx) { return accel(sys, b, idx === 3); });
    for (i = 0; i < 4; i++) {
      b = bodies[i];
      b.vx += 0.5 * (accs[i].x + accs2[i].x) * DT;
      b.vy += 0.5 * (accs[i].y + accs2[i].y) * DT;
    }
  }

  function minSunDist(sys) {
    var m = Infinity, i, dx, dy, d;
    for (i = 0; i < 3; i++) {
      dx = sys.suns[i].x - sys.planet.x;
      dy = sys.suns[i].y - sys.planet.y;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d < m) m = d;
    }
    return m;
  }

  /* 三星连珠：三颗太阳近似共线，且都离行星不太远 */
  function isAlignment(sys) {
    var s = sys.suns;
    var ax = s[1].x - s[0].x, ay = s[1].y - s[0].y;
    var bx = s[2].x - s[0].x, by = s[2].y - s[0].y;
    var cross = Math.abs(ax * by - ay * bx);
    var lenA = Math.sqrt(ax * ax + ay * ay);
    var lenB = Math.sqrt(bx * bx + by * by);
    if (lenA < 0.01 || lenB < 0.01) return false;
    var span = Math.max(lenA, lenB);
    return cross / (lenA * lenB) < 0.06 && span < 5 && minSunDist(sys) < 4;
  }

  /* 推进一个回合，返回该回合的气候摘要 */
  function advanceRound(sys) {
    var maxT = -Infinity, minT = Infinity, sumT = 0;
    var engulfed = false, minD = Infinity;
    for (var i = 0; i < STEPS_PER_ROUND; i++) {
      step(sys);
      var t = temperature(sys);
      if (t > maxT) maxT = t;
      if (t < minT) minT = t;
      sumT += t;
      var d = minSunDist(sys);
      if (d < minD) minD = d;
      if (d < 0.008) engulfed = true;
    }
    if (minD > 25) sys.ejectRounds++;
    else sys.ejectRounds = 0;
    return {
      avgT: sumT / STEPS_PER_ROUND,
      maxT: maxT,
      minT: minT,
      engulfed: engulfed,
      ejected: sys.ejectRounds >= 12,
      alignment: isAlignment(sys)
    };
  }

  function cloneSystem(sys) {
    return {
      suns: sys.suns.map(function (s) { return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, m: s.m }; }),
      planet: { x: sys.planet.x, y: sys.planet.y, vx: sys.planet.vx, vy: sys.planet.vy },
      flux0: sys.flux0,
      ejectRounds: sys.ejectRounds
    };
  }

  /* 前向预报 n 个回合（确定性积分，不影响真实系统） */
  function forecast(sys, n) {
    var ghost = cloneSystem(sys);
    var out = [];
    for (var i = 0; i < n; i++) out.push(advanceRound(ghost));
    return out;
  }

  /* 太阳的视觉信息：距离决定大小，>6 视为飞星 */
  function skyInfo(sys) {
    return sys.suns.map(function (s) {
      var dx = s.x - sys.planet.x;
      var dy = s.y - sys.planet.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      return { d: d, angle: Math.atan2(dy, dx), flying: d > 6 };
    });
  }

  return {
    createSystem: createSystem,
    advanceRound: advanceRound,
    forecast: forecast,
    skyInfo: skyInfo,
    temperature: temperature
  };
})();
