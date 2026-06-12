/* 入口：状态机与事件绑定 */
(function () {
  var st;

  function afterAction() {
    if (st.lastRound && st.lastRound.frames) {
      TB.UI.animateRound(st.lastRound.frames);
    }
    TB.UI.render(st);
    if (st.over || st.won) {
      setTimeout(checkEnd, 950); // 等天象动画播完再揭晓命运
    }
  }

  function bind(id, action) {
    document.getElementById(id).addEventListener('click', function () {
      if (st.over || st.won) return;
      var ok = TB.Game.doAction(st, action);
      if (!ok) return;
      afterAction();
    });
  }

  var lastFate = null; // 最近一条文明命运记录（战绩卡片用）

  function recordFate() {
    if (st._fateRecorded) return;
    st._fateRecorded = true;
    if (st.won) {
      lastFate = {
        civ: st.civ, era: '太空时代', lived: st.year - st.civStart,
        reason: 'win', advisor: st.advisor.name, won: true
      };
    } else {
      lastFate = {
        civ: st.civ, era: st.pendingRebirth.eraName, lived: st.pendingRebirth.lived,
        reason: st.pendingRebirth.reasonKey, advisor: st.advisor.name, won: false
      };
    }
    TB.Chronicle.add(lastFate);
  }

  function checkEnd() {
    if (st.won) {
      recordFate();
      TB.UI.showModal(
        '飞 向 群 星',
        '恒星级飞船的引擎照亮了三体世界的夜空。\n\n第 ' + st.civ + ' 号文明成为了第一个飞出三体星系的文明。' +
        '在他们身后，三颗太阳仍在进行着永恒的混沌之舞。\n\n但要小心——宇宙的深处，黑暗森林正注视着这一切。',
        '再次轮回'
      );
    } else if (st.over) {
      recordFate();
      TB.UI.showModal('文 明 毁 灭', st.pendingRebirth.text, '文明将重新启动');
    }
  }

  document.getElementById('modal-btn').addEventListener('click', function () {
    if (st.won) {
      st = TB.Game.newState();
    } else {
      TB.Game.rebirth(st);
      st._fateRecorded = false;
    }
    TB.UI.hideModal();
    TB.UI.render(st);
  });

  document.getElementById('modal-card-btn').addEventListener('click', function () {
    if (lastFate) TB.Chronicle.downloadCard(lastFate);
  });

  // ---- 史册 ----
  function openChronicle() {
    var stats = TB.Chronicle.stats();
    document.getElementById('chronicle-stats').innerHTML =
      '<div><b>' + stats.total + '</b>轮回文明</div>' +
      '<div><b>' + stats.wins + '</b>飞出星系</div>' +
      '<div><b>' + stats.bestEra + '</b>最高时代</div>' +
      '<div><b>' + stats.longest + ' 年</b>最长存续</div>';
    var list = document.getElementById('chronicle-list');
    list.innerHTML = '';
    var records = TB.Chronicle.load().slice().reverse();
    if (!records.length) {
      list.innerHTML = '<div class="chr-empty">史册空白。第一页将由毁灭或荣耀写下。</div>';
    }
    records.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'chr-row';
      var fate = TB.Chronicle.REASON_TEXTS[r.reason] || r.reason;
      row.innerHTML =
        '<span class="chr-civ">第 ' + r.civ + ' 号</span>' +
        '<span class="chr-fate' + (r.won ? ' won' : '') + '">' + fate + '</span>' +
        '<span class="chr-meta">' + r.era + ' · ' + r.lived + ' 年 · ' + r.advisor + '</span>';
      var btn = document.createElement('button');
      btn.className = 'chr-card';
      btn.textContent = '卡片';
      btn.addEventListener('click', function () { TB.Chronicle.downloadCard(r); });
      row.appendChild(btn);
      list.appendChild(row);
    });
    document.getElementById('chronicle').classList.remove('hidden');
  }
  document.getElementById('chronicle-btn').addEventListener('click', openChronicle);
  document.getElementById('chronicle-close').addEventListener('click', function () {
    document.getElementById('chronicle').classList.add('hidden');
  });

  TB.UI.init();
  st = TB.Game.newState();
  st.log.push({ year: 0, msg: '第 ' + st.civ + ' 号文明的种子蛰伏在仓库中，等待苏醒。', kind: 'log-system' });
  st.log.push({ year: 0, msg: '看天象预报：等到温和的纪元，点击「集体浸泡」唤醒文明。', kind: '' });
  st.log.push({ year: 0, msg: '恒纪元里耕作、研究、繁衍；乱纪元来临前脱水、静待。在毁灭之前——飞向太空。', kind: '' });

  bind('act-farm', 'farm');
  bind('act-research', 'research');
  bind('act-breed', 'breed');
  bind('act-observe', 'observe');
  bind('act-dehydrate', 'hydrate');
  bind('act-wait', 'wait');
  bind('act-ship', 'ship');

  // 调试/测试接口（不影响正常游玩）
  window.__tb = {
    get state() { return st; },
    act: function (a) { var ok = TB.Game.doAction(st, a); TB.UI.render(st); if (st.over || st.won) checkEnd(); return ok; },
    rebirth: function () { if (st.over) { TB.Game.rebirth(st); TB.UI.hideModal(); TB.UI.render(st); } }
  };

  TB.UI.render(st);
})();
