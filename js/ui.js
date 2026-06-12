/* UI 渲染层：天象画布、状态面板、预报条、日志、模态框。
 * 全局命名空间 TB.UI。 */
var TB = TB || {};

TB.UI = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var canvas, ctx;
  var stars = []; // 静态背景星空

  function init() {
    canvas = $('sky');
    ctx = canvas.getContext('2d');
    for (var i = 0; i < 140; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.85,
        r: Math.random() * 1.2 + 0.3,
        a: Math.random() * 0.5 + 0.2
      });
    }
  }

  /* ---- 天象画布 ---- */
  function drawSky(st) {
    var w = canvas.width, h = canvas.height;
    var horizon = h - 70;
    var cli = st.lastClimate;

    // 天空底色随气候变化
    var skyTop = '#02030a', skyBot = '#0a0e1c';
    if (cli) {
      switch (cli.key) {
        case 'doom': case 'inferno': skyTop = '#3a0a05'; skyBot = '#7a2008'; break;
        case 'scorch': skyTop = '#2a1206'; skyBot = '#54280c'; break;
        case 'hot':    skyTop = '#1c1208'; skyBot = '#36240e'; break;
        case 'mild':   skyTop = '#0a1220'; skyBot = '#1a2c44'; break;
        case 'cold':   skyTop = '#060a18'; skyBot = '#101c34'; break;
        case 'frigid': skyTop = '#04061a'; skyBot = '#0a1028'; break;
        case 'deepfreeze': skyTop = '#020310'; skyBot = '#060818'; break;
      }
    }
    var grad = ctx.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, skyTop);
    grad.addColorStop(1, skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, horizon);

    // 星空（白昼强光下隐去）
    var bright = cli && (cli.key === 'mild' || cli.key === 'hot' || cli.key === 'scorch' ||
                         cli.key === 'inferno' || cli.key === 'doom');
    if (!bright) {
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        ctx.fillStyle = 'rgba(220,230,255,' + s.a + ')';
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
    }

    // 太阳 / 飞星：按与行星的距离决定视大小与位置
    var sky = TB.Physics.skyInfo(st.sys);
    for (var j = 0; j < sky.length; j++) {
      var sun = sky[j];
      // 方位角 → 水平位置；距离 → 高度（近则高悬）
      var px = w / 2 + Math.cos(sun.angle) * w * 0.38;
      var closeness = Math.max(0, 1 - sun.d / 8);
      var py = horizon - 30 - closeness * (horizon - 80);
      if (sun.flying) {
        // 飞星：一颗小亮点
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
        var glow = ctx.createRadialGradient(px, py, radius * 0.2, px, py, radius * 2.2);
        glow.addColorStop(0, 'rgba(255,200,110,0.85)');
        glow.addColorStop(0.4, 'rgba(255,140,60,0.25)');
        glow.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
        var core = ctx.createRadialGradient(px, py, 0, px, py, radius);
        core.addColorStop(0, '#fff6e0');
        core.addColorStop(0.7, '#ffc868');
        core.addColorStop(1, '#ff9038');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 地面
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

    // 地面剪影：金字塔（原著的纪念碑式建筑）
    ctx.fillStyle = '#0a0c12';
    ctx.beginPath();
    ctx.moveTo(w * 0.18, horizon);
    ctx.lineTo(w * 0.26, horizon - 38);
    ctx.lineTo(w * 0.34, horizon);
    ctx.closePath();
    ctx.fill();

    // 温度读数
    if (st.lastRound) {
      ctx.fillStyle = 'rgba(201,212,232,0.8)';
      ctx.font = '12px monospace';
      ctx.fillText('地表温度 ' + Math.round(st.lastRound.avgT) + '°C', 12, 20);
    }
  }

  /* ---- 面板 ---- */
  function fmt(n) {
    if (n >= 100) return Math.round(n).toString();
    return (Math.round(n * 10) / 10).toString();
  }

  function render(st) {
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
    $('stat-obs').textContent = 'Lv ' + st.obs + (st.obs >= 6 ? '（已满级）' : '');
    var hy = $('stat-hydra');
    hy.textContent = st.dehydrated ? '已脱水' : '含水';
    hy.className = st.dehydrated ? 'dehydrated' : '';
    $('stat-ship').textContent = era.name === '太空时代'
      ? st.shipProgress + ' / 3'
      : '未解锁（需太空时代）';

    // 按钮可用性
    var dis = st.over || st.won;
    $('act-farm').disabled = dis || st.dehydrated;
    $('act-research').disabled = dis || st.dehydrated;
    $('act-breed').disabled = dis || st.dehydrated;
    $('act-observe').disabled = dis || st.dehydrated || st.obs >= 6 || st.food < 30 * (st.obs + 1);
    $('act-dehydrate').disabled = dis;
    $('act-dehydrate').textContent = st.dehydrated ? '🌊 集体浸泡' : '💧 全民脱水';
    $('act-wait').disabled = dis;
    $('act-ship').disabled = dis || st.dehydrated || era.name !== '太空时代' || st.food < 200;
    $('act-observe').textContent = '🔭 建观测台（粮 ' + 30 * (st.obs + 1) + '）';

    renderForecast(st);
    renderLog(st);
    drawSky(st);
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

  return { init: init, render: render, showModal: showModal, hideModal: hideModal };
})();
