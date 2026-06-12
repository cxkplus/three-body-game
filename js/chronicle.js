/* 文明史册：记录每一号文明的命运（localStorage 持久化），
 * 并把任意一条记录绘成可分享的战绩卡片 PNG。
 * 全局命名空间 TB.Chronicle。 */
var TB = TB || {};

TB.Chronicle = (function () {
  var KEY = 'tb-chronicle-v1';

  var REASON_TEXTS = {
    doom:    '殁于三日凌空',
    inferno: '殁于凌空烈焰',
    starve:  '殁于漫长饥馑',
    freeze:  '殁于永恒寒夜',
    engulf:  '随行星坠入太阳',
    eject:   '随行星流放深空',
    win:     '飞出了三体星系'
  };

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch (e) { return []; }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-100))); } catch (e) {}
  }

  /* rec = {civ, era, lived, reason, advisor, won} */
  function add(rec) {
    var list = load();
    list.push(rec);
    save(list);
    return list;
  }

  function stats() {
    var list = load();
    var wins = list.filter(function (r) { return r.won; }).length;
    var ERAS = TB.Game.ERAS;
    var bestIdx = -1, longest = 0;
    list.forEach(function (r) {
      var idx = ERAS.map(function (e) { return e.name; }).indexOf(r.era);
      if (idx > bestIdx) bestIdx = idx;
      if (r.lived > longest) longest = r.lived;
    });
    return {
      total: list.length,
      wins: wins,
      bestEra: bestIdx >= 0 ? ERAS[bestIdx].name : '——',
      longest: longest
    };
  }

  /* 把一条记录画成 800×420 的战绩卡片，返回 dataURL */
  function drawCard(rec) {
    var c = document.createElement('canvas');
    c.width = 800; c.height = 420;
    var x = c.getContext('2d');

    // 背景
    var bg = x.createLinearGradient(0, 0, 0, 420);
    bg.addColorStop(0, rec.won ? '#0a1428' : '#160806');
    bg.addColorStop(1, '#04050a');
    x.fillStyle = bg;
    x.fillRect(0, 0, 800, 420);

    // 星空
    for (var i = 0; i < 90; i++) {
      x.fillStyle = 'rgba(220,230,255,' + (Math.random() * 0.5 + 0.1).toFixed(2) + ')';
      x.fillRect(Math.random() * 800, Math.random() * 300, 1.4, 1.4);
    }

    // 三颗太阳
    var suns = [[640, 90, 46], [718, 140, 26], [580, 168, 16]];
    suns.forEach(function (s) {
      var glow = x.createRadialGradient(s[0], s[1], s[2] * 0.2, s[0], s[1], s[2] * 2.4);
      glow.addColorStop(0, 'rgba(255,200,110,0.8)');
      glow.addColorStop(1, 'rgba(255,120,40,0)');
      x.fillStyle = glow;
      x.beginPath(); x.arc(s[0], s[1], s[2] * 2.4, 0, Math.PI * 2); x.fill();
      var core = x.createRadialGradient(s[0], s[1], 0, s[0], s[1], s[2]);
      core.addColorStop(0, '#fff6e0');
      core.addColorStop(1, '#ff9038');
      x.fillStyle = core;
      x.beginPath(); x.arc(s[0], s[1], s[2], 0, Math.PI * 2); x.fill();
    });

    // 地平线 + 金字塔
    x.fillStyle = '#0a0c12';
    x.fillRect(0, 330, 800, 90);
    x.beginPath();
    x.moveTo(90, 330); x.lineTo(150, 270); x.lineTo(210, 330);
    x.closePath(); x.fill();
    x.strokeStyle = '#262c3e';
    x.beginPath(); x.moveTo(0, 330); x.lineTo(800, 330); x.stroke();

    // 文案
    x.fillStyle = '#d4a94f';
    x.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
    x.fillText('三体：文明纪元', 48, 64);

    x.fillStyle = rec.won ? '#7ee08a' : '#e8eeff';
    x.font = 'bold 42px "PingFang SC", "Microsoft YaHei", sans-serif';
    x.fillText('第 ' + rec.civ + ' 号文明', 48, 140);

    x.fillStyle = rec.won ? '#7ee08a' : '#ff8a7e';
    x.font = 'bold 30px "PingFang SC", "Microsoft YaHei", sans-serif';
    x.fillText(REASON_TEXTS[rec.reason] || rec.reason, 48, 192);

    x.fillStyle = '#c9d4e8';
    x.font = '21px "PingFang SC", "Microsoft YaHei", sans-serif';
    x.fillText('存续 ' + rec.lived + ' 年 · 进化至' + rec.era, 48, 240);
    x.fillText('执政顾问：' + rec.advisor, 48, 276);

    if (rec.won) {
      x.fillStyle = '#8fa0ff';
      x.font = 'italic 18px "PingFang SC", "Microsoft YaHei", sans-serif';
      x.fillText('「但宇宙深处，黑暗森林正注视着这一切。」', 48, 312);
    } else {
      x.fillStyle = '#6b7a96';
      x.font = 'italic 18px "PingFang SC", "Microsoft YaHei", sans-serif';
      x.fillText('「文明的种子仍在，它将重新启动……」', 48, 312);
    }

    x.fillStyle = '#6b7a96';
    x.font = '16px monospace';
    x.fillText('cxkplus.github.io/three-body-game', 48, 368);
    x.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
    x.fillText('原著：刘慈欣《三体》 · 粉丝同人作品', 48, 394);

    return c.toDataURL('image/png');
  }

  function downloadCard(rec) {
    var a = document.createElement('a');
    a.href = drawCard(rec);
    a.download = '三体战绩-第' + rec.civ + '号文明.png';
    a.click();
  }

  return {
    load: load,
    add: add,
    stats: stats,
    drawCard: drawCard,
    downloadCard: downloadCard,
    REASON_TEXTS: REASON_TEXTS
  };
})();
