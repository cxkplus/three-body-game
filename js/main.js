/* 入口：状态机与事件绑定 */
(function () {
  var st;

  function bind(id, action) {
    document.getElementById(id).addEventListener('click', function () {
      if (st.over || st.won) return;
      var ok = TB.Game.doAction(st, action);
      if (!ok) return;
      TB.UI.render(st);
      checkEnd();
    });
  }

  function checkEnd() {
    if (st.won) {
      TB.UI.showModal(
        '飞 向 群 星',
        '恒星级飞船的引擎照亮了三体世界的夜空。\n\n第 ' + st.civ + ' 号文明成为了第一个飞出三体星系的文明。' +
        '在他们身后，三颗太阳仍在进行着永恒的混沌之舞。\n\n但要小心——宇宙的深处，黑暗森林正注视着这一切。',
        '再次轮回'
      );
    } else if (st.over) {
      TB.UI.showModal('文 明 毁 灭', st.pendingRebirth.text, '文明将重新启动');
    }
  }

  document.getElementById('modal-btn').addEventListener('click', function () {
    if (st.won) {
      st = TB.Game.newState();
    } else {
      TB.Game.rebirth(st);
    }
    TB.UI.hideModal();
    TB.UI.render(st);
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
    act: function (a) { var ok = TB.Game.doAction(st, a); TB.UI.render(st); checkEnd(); return ok; },
    rebirth: function () { if (st.over) { TB.Game.rebirth(st); TB.UI.hideModal(); TB.UI.render(st); } }
  };

  TB.UI.render(st);
})();
