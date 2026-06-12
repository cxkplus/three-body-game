/* UI 渲染层：天象画布（持续动画）、状态面板、预报条、日志、模态框。
 * 画布由 requestAnimationFrame 常驻循环驱动：
 *  - 回合结算后用物理关键帧平滑播放太阳轨迹（animateRound）
 *  - 平时显示当前天象 + 天气粒子 + 星星闪烁
 * 全局命名空间 TB.UI。 */
var TB = TB || {};

TB.UI = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var canvas, ctx;
  var stars = [];
  var particles = [];   // 天气粒子（雪/余烬）
  var curSt = null;     // 最近一次 render 的游戏状态
  var anim = null;      // {frames, start, dur} 回合天象动画

  function init() {
    canvas = $('sky');
    ctx = canvas.getContext('2d');
    for (var i = 0; i < 140; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.8,
        r: Math.random() * 1.2 + 0.3,
        a: Math.random() * 0.5 + 0.2,
        tw: Math.random() * Math.PI * 2   // 闪烁相位
      });
    }
    requestAnimationFrame(tick);
  }

  function tick(ts) {
    if (curSt) drawScene(ts);
    requestAnimationFrame(tick);
  }

  function animateRound(frames) {
    if (frames && frames.length > 1) {
      anim = { frames: frames, start: performance.now(), dur: 900 };
    }
  }

  /* 当前应显示的天象（动画中插值，否则取实时状态） */
  function lerpAngle(a0, a1, f) {
    var d = ((a1 - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a0 + d * f;
  }

  function skyNow() {
    if (anim) {
      var p = (performance.now() - anim.start) / anim.dur;
      if (p >= 1) { anim = null; }
      else {
        var fr = anim.frames;
        var fi = p * (fr.length - 1);
        var i0 = Math.floor(fi), i1 = Math.min(i0 + 1, fr.length - 1), f = fi - i0;
        var suns = fr[i0].suns.map(function (s0, k) {
          var s1 = fr[i1].suns[k];
          return {
            d: s0.d + (s1.d - s0.d) * f,
            angle: lerpAngle(s0.angle, s1.angle, f),
            flying: f < 0.5 ? s0.flying : s1.flying
          };
        });
        return { suns: suns, temp: fr[i0].t + (fr[i1].t - fr[i0].t) * f };
      }
    }
    return {
      suns: TB.Physics.skyInfo(curSt.sys),
      temp: curSt.lastRound ? curSt.lastRound.avgT : 20
    };
  }

  /* ---- 场景绘制 ---- */
  var SKY_COLORS = {
    doom:       ['#3a0a05', '#7a2008'],
    inferno:    ['#3a0a05', '#7a2008'],
    scorch:     ['#2a1206', '#54280c'],
    hot:        ['#1c1208', '#36240e'],
    mild:       ['#0a1220', '#1a2c44'],
    cold:       ['#060a18', '#101c34'],
    frigid:     ['#04061a', '#0a1028'],
    deepfreeze: ['#020310', '#060818']
  };

  function drawScene(ts) {
    var w = canvas.width, h = canvas.height;
    var horizon = h - 70;
    var view = skyNow();
    var cli = TB.Game.classify(view.temp);
    var key = cli.key;

    // 天空
    var colors = SKY_COLORS[key] || SKY_COLORS.mild;
    var grad = ctx.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, horizon);

    // 星空（强光气候下隐去），带闪烁
    var bright = key === 'mild' || key === 'hot' || key === 'scorch' || key === 'inferno' || key === 'doom';
    if (!bright) {
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var a = s.a * (0.7 + 0.3 * Math.sin(ts / 700 + s.tw));
        ctx.fillStyle = 'rgba(220,230,255,' + a.toFixed(3) + ')';
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
    }

    drawSuns(view.suns, w, horizon);
    drawGround(w, h, horizon);
    drawCity(w, horizon, ts);
    updateParticles(key, w, horizon);

    // 温度读数
    ctx.fillStyle = 'rgba(201,212,232,0.8)';
    ctx.font = '12px monospace';
    ctx.fillText('地表温度 ' + Math.round(view.temp) + '°C', 12, 20);
  }

  function drawSuns(sky, w, horizon) {
    for (var j = 0; j < sky.length; j++) {
      var sun = sky[j];
      var px = w / 2 + Math.cos(sun.angle) * w * 0.38;
      var closeness = Math.max(0, 1 - sun.d / 8);
      var py = horizon - 30 - closeness * (horizon - 80);
      if (sun.flying) {
        ctx.fillStyle = '#e8eeff';
        ctx.beginPath();
        ctx.arc(px, Math.min(py, horizon * 0.45), 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(232,238,255,0.25)';
        ctx.beginPath();
        ctx.arc(px, Math.min(py, horizon * 0.45), 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        var radius = Math.min(85, 7 + 32 / Math.max(sun.d, 0.25));
        // 越近越白热
        var heat = Math.min(1, 1.2 / Math.max(sun.d, 0.3));
        var coreColor = heat > 0.8 ? '#ffffff' : '#fff6e0';
        var glow = ctx.createRadialGradient(px, py, radius * 0.2, px, py, radius * 2.2);
        glow.addColorStop(0, 'rgba(255,200,110,0.85)');
        glow.addColorStop(0.4, 'rgba(255,140,60,0.25)');
        glow.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
        var core = ctx.createRadialGradient(px, py, 0, px, py, radius);
        core.addColorStop(0, coreColor);
        core.addColorStop(0.7, '#ffc868');
        core.addColorStop(1, '#ff9038');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGround(w, h, horizon) {
    var ggrad = ctx.createLinearGradient(0, horizon, 0, h);
    ggrad.addColorStop(0, '#11131a');
    ggrad.addColorStop(1, '#05060a');
    ctx.fillStyle = ggrad;
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.strokeStyle = '#262c3e';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();
  }

  /* 随时代演进的地平线剪影 */
  function drawCity(w, horizon, ts) {
    var eraIdx = curSt ? TB.Game.ERAS.indexOf(TB.Game.eraOf(curSt.sci)) : 0;
    var dehydrated = curSt && curSt.dehydrated;
    ctx.fillStyle = '#0a0c12';

    // 金字塔（历代不变的纪念碑）
    ctx.beginPath();
    ctx.moveTo(w * 0.18, horizon);
    ctx.lineTo(w * 0.26, horizon - 38);
    ctx.lineTo(w * 0.34, horizon);
    ctx.closePath();
    ctx.fill();

    if (eraIdx >= 1) { // 青铜起：城郭
      ctx.fillRect(w * 0.42, horizon - 14, 36, 14);
      ctx.fillRect(w * 0.48, horizon - 22, 14, 22);
      ctx.fillRect(w * 0.55, horizon - 11, 28, 11);
    }
    if (eraIdx >= 3) { // 蒸汽起：烟囱与烟
      ctx.fillRect(w * 0.66, horizon - 30, 8, 30);
      ctx.fillRect(w * 0.70, horizon - 20, 18, 20);
      if (!dehydrated) {
        for (var p = 0; p < 3; p++) {
          var phase = (ts / 2400 + p / 3) % 1;
          ctx.fillStyle = 'rgba(150,150,160,' + (0.22 * (1 - phase)).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(w * 0.66 + 4 + phase * 10, horizon - 32 - phase * 22, 3 + phase * 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#0a0c12';
      }
    }
    if (eraIdx >= 4) { // 电气起：高楼 + 灯火（脱水时熄灭）
      ctx.fillRect(w * 0.78, horizon - 42, 14, 42);
      ctx.fillRect(w * 0.84, horizon - 32, 12, 32);
      if (!dehydrated) {
        ctx.fillStyle = 'rgba(255,214,130,0.85)';
        for (var f = 0; f < 8; f++) {
          ctx.fillRect(w * 0.785 + (f % 2) * 7, horizon - 38 + Math.floor(f / 2) * 9, 3, 3);
        }
        ctx.fillStyle = '#0a0c12';
      }
    }
    if (eraIdx >= 6) { // 信息起：天线塔，红灯闪烁
      ctx.beginPath();
      ctx.moveTo(w * 0.10, horizon);
      ctx.lineTo(w * 0.115, horizon - 52);
      ctx.lineTo(w * 0.13, horizon);
      ctx.closePath();
      ctx.fill();
      if (Math.sin(ts / 500) > 0) {
        ctx.fillStyle = '#ff4040';
        ctx.beginPath();
        ctx.arc(w * 0.115, horizon - 54, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a0c12';
      }
    }
    if (eraIdx >= 7) { // 太空时代：发射塔架与星舰
      ctx.fillRect(w * 0.90, horizon - 48, 4, 48);
      ctx.fillRect(w * 0.945, horizon - 48, 4, 48);
      ctx.fillRect(w * 0.90, horizon - 48, 49 * 0.18, 3);
      ctx.fillStyle = '#1c2434';
      ctx.beginPath();
      ctx.moveTo(w * 0.922, horizon - 44);
      ctx.lineTo(w * 0.93, horizon - 58);
      ctx.lineTo(w * 0.938, horizon - 44);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0a0c12';
    }
  }

  /* 天气粒子：雪（寒带）/ 余烬（热带） */
  var PARTICLE_TARGET = {
    cold: 25, frigid: 70, deepfreeze: 130,
    scorch: 40, inferno: 90, doom: 90,
    hot: 0, mild: 0
  };

  function updateParticles(key, w, horizon) {
    var snow = key === 'cold' || key === 'frigid' || key === 'deepfreeze';
    var ember = key === 'scorch' || key === 'inferno' || key === 'doom';
    var target = PARTICLE_TARGET[key] || 0;

    while (particles.length < target) {
      particles.push(snow ? {
        kind: 'snow', x: Math.random() * w, y: Math.random() * horizon,
        vx: (Math.random() - 0.5) * 0.4, vy: 0.5 + Math.random() * 1.1,
        r: 1 + Math.random() * 1.8
      } : {
        kind: 'ember', x: Math.random() * w, y: horizon - Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.6, vy: -(0.6 + Math.random() * 1.4),
        r: 1 + Math.random() * 1.5, life: 1
      });
    }
    if (particles.length > target) particles.length = target;

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.kind === 'snow') {
        if (p.y > horizon) { p.y = -4; p.x = Math.random() * w; }
        ctx.fillStyle = 'rgba(225,235,255,0.75)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        p.life -= 0.008;
        if (p.life <= 0 || p.y < 0) { p.y = horizon - 5; p.x = Math.random() * w; p.life = 1; }
        ctx.fillStyle = 'rgba(255,' + Math.floor(120 + 100 * p.life) + ',60,' + (0.7 * p.life).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ---- 面板 ---- */
  function fmt(n) {
    if (n >= 100) return Math.round(n).toString();
    return (Math.round(n * 10) / 10).toString();
  }

  function render(st) {
    curSt = st;
    var era = TB.Game.eraOf(st.sci);
    $('civ-info').textContent = '第 ' + st.civ + ' 号文明 · ' + era.name;
    $('year-info').textContent = '三体历 ' + st.year + ' 年';

    var banner = $('climate-banner');
    if (st.lastClimate) {
      var stable = st.lastClimate.key === 'mild' && st.mildStreak >= 3;
      banner.textContent = stable ? '恒纪元' : '乱纪元 · ' + st.lastClimate.name;
      banner.className = stable ? 'climate-stable' : st.lastClimate.cls;
    } else {
      banner.textContent = '纪元未知';
      banner.className = 'climate-mild';
    }

    $('stat-pop').textContent = fmt(st.pop) + ' 万';
    $('stat-food').textContent = fmt(st.food);
    $('stat-sci').textContent = Math.floor(st.sci);
    $('stat-obs').textContent = 'Lv ' + st.obs + (st.obs >= 6 ? '（满）' : '');
    var hy = $('stat-hydra');
    hy.textContent = st.dehydrated ? '已脱水' : '含水';
    hy.className = st.dehydrated ? 'dehydrated' : '';
    $('stat-ship').textContent = era.name === '太空时代'
      ? st.shipProgress + ' / 3'
      : '未解锁';
    var adv = $('stat-advisor');
    adv.textContent = st.advisor.name;
    adv.title = st.advisor.title + '：' + st.advisor.desc;

    var dis = st.over || st.won;
    $('act-farm').disabled = dis || st.dehydrated;
    $('act-research').disabled = dis || st.dehydrated;
    $('act-breed').disabled = dis || st.dehydrated;
    var cost = TB.Game.obsCost(st);
    $('act-observe').disabled = dis || st.dehydrated || st.obs >= 6 || st.food < cost;
    $('act-observe').textContent = '🔭 建观测台（粮 ' + cost + '）';
    $('act-dehydrate').disabled = dis;
    $('act-dehydrate').textContent = st.dehydrated ? '🌊 集体浸泡' : '💧 全民脱水';
    $('act-wait').disabled = dis;
    $('act-ship').disabled = dis || st.dehydrated || era.name !== '太空时代' || st.food < 200;

    renderForecast(st);
    renderLog(st);
  }

  var FC_STYLE = {
    doom:       ['凌空', '#5c0e0e', '#ff6b5e'],
    inferno:    ['凌空', '#5c0e0e', '#ff6b5e'],
    scorch:     ['炙烤', '#4a1c16', '#e08a7e'],
    hot:        ['酷热', '#4a2e16', '#e0b27e'],
    mild:       ['温和', '#2e3a1e', '#c8d97e'],
    cold:       ['寒冷', '#16314a', '#7ec3e0'],
    frigid:     ['严寒', '#1a2452', '#8fa0ff'],
    deepfreeze: ['极寒', '#251a52', '#b59fff']
  };

  function renderForecast(st) {
    var strip = $('forecast-strip');
    strip.innerHTML = '';
    var cells = TB.Game.getForecast(st, 8);
    for (var i = 0; i < cells.length; i++) {
      var div = document.createElement('div');
      div.className = 'fc-cell';
      var c = cells[i];
      if (c.known) {
        var sty = FC_STYLE[c.climate.key];
        div.textContent = sty[0];
        div.style.background = sty[1];
        div.style.color = sty[2];
      } else {
        div.textContent = '？';
        div.className += ' fc-unknown';
      }
      strip.appendChild(div);
    }
  }

  function renderLog(st) {
    var box = $('log');
    box.innerHTML = '';
    for (var i = 0; i < st.log.length; i++) {
      var e = st.log[i];
      var div = document.createElement('div');
      div.className = 'log-entry ' + e.kind;
      var yr = document.createElement('span');
      yr.className = 'log-year';
      yr.textContent = '[' + e.year + '年]';
      div.appendChild(yr);
      div.appendChild(document.createTextNode(e.msg));
      box.appendChild(div);
    }
    box.scrollTop = box.scrollHeight;
  }

  function showModal(title, text, btnText) {
    $('modal-title').textContent = title;
    $('modal-text').textContent = text;
    $('modal-btn').textContent = btnText;
    $('modal').classList.remove('hidden');
  }

  function hideModal() {
    $('modal').classList.add('hidden');
  }

  return {
    init: init,
    render: render,
    animateRound: animateRound,
    showModal: showModal,
    hideModal: hideModal
  };
})();
