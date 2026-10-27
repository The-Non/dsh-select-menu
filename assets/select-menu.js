/* dsh-select-menu v2 —— 选中对话文字 → 【复制 / 追问 ▸ 引用·解释一下】
 *
 * v2 改动：
 *   - 删掉「朗读」「详细展开」
 *   - 「引用」不再往输入框里塞文字，改为在输入框上方显示副栏（豆包那样），输入框保持干净
 *   - 发送时由本脚本拦截回车：把 “> 引文 + 用户输入” 写进编辑器后再替你按一次回车
 *     · 写入失败不吞消息：改为把引文追加到输入框末尾，用户再按一次回车即可
 *   - 副栏的 ✕ 可取消引用；发出后自动清掉
 */
(function () {
  if (window.__dshSelectMenu) return;
  window.__dshSelectMenu = true;

  var Z = 2147483000;
  var CSS =
    '.dsm-menu{position:fixed;z-index:' + Z + ';display:none;align-items:center;gap:2px;padding:4px;' +
    'border-radius:10px;background:#2b2b30;border:1px solid rgba(255,255,255,.13);' +
    'box-shadow:0 10px 28px rgba(0,0,0,.5);font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'color:#eaeaea;user-select:none;-webkit-user-select:none}' +
    '.dsm-menu.dsm-show{display:flex}' +
    '.dsm-btn{padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}' +
    '.dsm-btn:hover{background:rgba(255,255,255,.11)}' +
    '.dsm-sub{min-width:110px}' +
    '.dsm-sep{width:1px;height:18px;margin:0 3px;background:rgba(255,255,255,.14)}' +
    '.dsm-tip{position:fixed;z-index:' + (Z + 2) + ';padding:6px 11px;border-radius:8px;' +
    'background:rgba(28,28,32,.96);border:1px solid rgba(255,255,255,.12);color:#fff;' +
    'font:12px/1.4 system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .16s}' +
    '.dsm-tip.dsm-show{opacity:1}' +
    '.dsm-quote{position:fixed;z-index:' + (Z - 1) + ';display:none;box-sizing:border-box;' +
    'padding:9px 12px 9px 12px;border-radius:10px;background:#24252a;' +
    'border:1px solid rgba(255,255,255,.16);box-shadow:0 10px 26px rgba(0,0,0,.55);' +
    'font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'color:#e4e4e8;max-height:120px;overflow:hidden}' +
    '.dsm-quote.dsm-show{display:block}' +
    '.dsm-quote:before{content:"";position:absolute;left:4px;top:8px;bottom:8px;width:2px;' +
    'border-radius:2px;background:rgba(255,255,255,.35)}' +
    '.dsm-qtext{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;' +
    'padding-right:18px;white-space:pre-wrap;word-break:break-word}' +
    '.dsm-qclose{position:absolute;right:6px;top:5px;width:18px;height:18px;line-height:16px;' +
    'text-align:center;border-radius:50%;cursor:pointer;color:#9a9aa0;font-size:14px}' +
    '.dsm-qclose:hover{background:rgba(255,255,255,.12);color:#fff}';

  var style = document.createElement('style');
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  var menu = null, sub = null, tip = null, bar = null, barText = null;
  var tipTimer = 0, refreshTimer = 0, barTimer = 0;
  var selText = '';
  var pendingQuote = '';       /* 待发送的引用 */
  var flushing = false;        /* 正在替用户发送 */

  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function toast(msg) {
    if (!tip) { tip = mk('div', 'dsm-tip'); document.body.appendChild(tip); }
    tip.textContent = msg;
    tip.classList.add('dsm-show');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { tip.classList.remove('dsm-show'); }, 2200);
  }

  function composer() {
    return document.querySelector('[data-composer-input]') ||
           document.querySelector('[data-composer-seat] [contenteditable]') ||
           document.querySelector('[contenteditable="true"]');
  }

  function composerCard() {
    var c = composer();
    if (!c) return null;
    return c.closest('[data-composer-card]') || c.closest('[data-composer-seat]') || c.parentElement;
  }

  function inComposer(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || !el.closest) return true;
    return !!el.closest('input,textarea,[contenteditable=""],[contenteditable="true"],[data-composer-input],[data-composer-seat]');
  }

  function currentSelection() {
    var s = window.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed) return null;
    var t = (s.toString() || '').replace(/\u200b/g, '').trim();
    if (!t) return null;
    if (inComposer(s.anchorNode) || inComposer(s.focusNode)) return null;
    var anchorEl = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
    if (!anchorEl || !anchorEl.closest || anchorEl.closest('.dsm-menu,.dsm-tip,.dsm-quote')) return null;
    return { text: t, range: s.getRangeAt(0) };
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return legacyCopy(t); });
    }
    return Promise.resolve(legacyCopy(t));
  }
  function legacyCopy(t) {
    try {
      var ta = mk('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ---------- 引用副栏 ---------- */
  function showQuote(text) {
    pendingQuote = text;
    if (!bar) {
      bar = mk('div', 'dsm-quote');
      barText = mk('div', 'dsm-qtext');
      var x = mk('div', 'dsm-qclose', '×');
      x.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); clearQuote(); });
      bar.appendChild(barText); bar.appendChild(x);
      document.body.appendChild(bar);
    }
    barText.textContent = text.replace(/\s+/g, ' ').slice(0, 300);
    bar.classList.add('dsm-show');
    positionBar();
    startBarTracking();
  }

  function clearQuote() {
    pendingQuote = '';
    if (bar) bar.classList.remove('dsm-show');
    stopBarTracking();
  }

  function positionBar() {
    if (!bar || !bar.classList.contains('dsm-show')) return;
    var card = composerCard();
    if (!card) return;
    var r = card.getBoundingClientRect();
    var w = Math.min(Math.max(r.width, 240), window.innerWidth - 24);
    bar.style.width = w + 'px';
    bar.style.left = Math.max(8, r.left + (r.width - w) / 2) + 'px';
    bar.style.top = Math.max(8, r.top - bar.offsetHeight - 8) + 'px';
  }

  function startBarTracking() {
    if (barTimer) return;
    barTimer = setInterval(positionBar, 400);
    window.addEventListener('resize', positionBar);
    window.addEventListener('scroll', positionBar, true);
  }
  function stopBarTracking() {
    if (!barTimer) return;
    clearInterval(barTimer); barTimer = 0;
    window.removeEventListener('resize', positionBar);
    window.removeEventListener('scroll', positionBar, true);
  }

  /* ---------- 动作 ---------- */
  var actions = {};

  actions.copy = function () {
    copyText(selText).then(function (ok) { toast(ok ? '已复制' : '复制失败，请用 Ctrl+C'); });
    hideAll();
  };

  /* 引用后把光标送进输入框。
   * DSH 的输入框是 Lexical（根节点甚至可能是 contenteditable=false，编辑由 Lexical 接管），
   * 所以**光设 DOM range 没用**：Lexical 只认自己收到的事件。
   * 做法：在输入框里模拟一次带坐标的 pointerdown/mousedown/mouseup/click
   *      —— Lexical 的点击处理会按 clientX/clientY 自己算选区并把光标画出来；
   *      再补 focus() + DOM range（双保险），300ms 后检查焦点，没进去再补点一次。 */
  function simulateClickInto(el) {
    var r = el.getBoundingClientRect();
    var x = Math.round(r.left + Math.min(28, Math.max(8, r.width * 0.05)));
    var y = Math.round(r.top + Math.min(18, Math.max(8, r.height * 0.25)));
    var opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1 };
    var seq = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    seq.forEach(function (type) {
      try {
        var ev;
        if (type.indexOf('pointer') === 0 && window.PointerEvent) {
          ev = new PointerEvent(type, Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, opts));
        } else {
          ev = new MouseEvent(type, Object.assign({ view: window, detail: 1 }, opts));
        }
        el.dispatchEvent(ev);
      } catch (e) {}
    });
  }

  function caretToEnd(el) {
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  function isFocused(el) {
    var a = document.activeElement;
    return !!(a && (a === el || el.contains(a)));
  }

  function focusComposer() {
    var c = composer();
    if (!c) return null;

    try { c.focus({ preventScroll: true }); } catch (e) { try { c.focus(); } catch (e2) {} }
    simulateClickInto(c);
    caretToEnd(c);

    setTimeout(function () {
      if (isFocused(c)) return;
      /* 再补一枪：有些情况下第一次合成的点击被 React 的渲染循环吃掉了 */
      try { c.focus({ preventScroll: true }); } catch (e) {}
      simulateClickInto(c);
      caretToEnd(c);
    }, 300);

    return c;
  }

  actions.quote = function (kind) {
    hideAll();
    showQuote(selText);
    var c = focusComposer();
    if (!c) { toast('已引用（没找到输入框）'); return; }
    if (kind === 'explain') {
      dispatchPaste(c, '解释一下这段：');
      setTimeout(function () { toast('已引用，光标已在输入框，回车即发送'); }, 60);
    } else {
      toast('已引用，光标已跳到输入框，回车发送时自动带上引文');
    }
  };

  function dispatchPaste(target, text) {
    try {
      var dt = new DataTransfer();
      dt.setData('text/plain', text);
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return true;
    } catch (e) { return false; }
  }

  function composerText(c) {
    return (c.innerText || '').replace(/\u200b/g, '').trim();
  }

  /* 把输入框内容整体换成 finalText。
   * 坑：Lexical 不认我们用 DOM range 设的选区（上一版就是因此变成"追加"→ 文字重复），
   *     所以先给它发一次 Ctrl+A（Lexical 自己的全选），再粘贴覆盖；
   *     不是 Lexical 的普通 contenteditable 再用 execCommand('selectAll') 兜底。 */
  function selectAllIn(c) {
    try {
      ['keydown', 'keyup'].forEach(function (type) {
        c.dispatchEvent(new KeyboardEvent(type, {
          key: 'a', code: 'KeyA', keyCode: 65, which: 65,
          ctrlKey: true, bubbles: true, cancelable: true,
        }));
      });
    } catch (e) {}
    try {
      var range = document.createRange();
      range.selectNodeContents(c);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  function replaceComposerText(c, finalText) {
    try { c.focus(); } catch (e) {}
    selectAllIn(c);
    var ok = dispatchPaste(c, finalText);
    if (!ok) {
      try { document.execCommand('selectAll', false, null); } catch (e) {}
      ok = dispatchPaste(c, finalText);
    }
    return ok;
  }

  function pressEnter(c) {
    try {
      ['keydown', 'keypress', 'keyup'].forEach(function (type) {
        var ev = new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
        });
        c.dispatchEvent(ev);
      });
    } catch (e) {}
  }

  function flushAndSend(c) {
    var text = composerText(c);
    var quote = pendingQuote.split('\n').map(function (l) { return '> ' + l; }).join('\n');
    var finalText = quote + (text ? '\n\n' + text : '\n\n');
    var ok = replaceComposerText(c, finalText);

    setTimeout(function () {
      if (!ok || composerText(c).indexOf('>') === -1) {
        dispatchPaste(c, '\n\n' + finalText);
        clearQuote();
        toast('引用已追加到输入框，请再按一次回车');
        return;
      }
      flushing = true;
      clearQuote();
      pressEnter(c);
      setTimeout(function () { flushing = false; }, 400);
    }, 80);
  }

  /* ---------- 浮层 ---------- */
  function buildMenu() {
    if (menu) return;
    menu = mk('div', 'dsm-menu');
    var bCopy = mk('div', 'dsm-btn', '复制');
    var bAsk  = mk('div', 'dsm-btn', '追问 ›');
    bCopy.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); actions.copy(); });
    bAsk.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); showSub(bAsk); });
    menu.appendChild(bCopy);
    menu.appendChild(mk('div', 'dsm-sep'));
    menu.appendChild(bAsk);
    document.body.appendChild(menu);
  }

  function showSub(anchor) {
    if (!sub) {
      sub = mk('div', 'dsm-menu dsm-sub');
      [['引用', 'quote'], ['解释一下', 'explain']].forEach(function (it) {
        var b = mk('div', 'dsm-btn', it[0]);
        b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); actions.quote(it[1]); });
        sub.appendChild(b);
      });
      document.body.appendChild(sub);
    }
    var r = anchor.getBoundingClientRect();
    sub.classList.add('dsm-show');
    var w = sub.offsetWidth, h = sub.offsetHeight;
    var x = Math.min(r.left, window.innerWidth - w - 8);
    var y = r.bottom + 4;
    if (y + h > window.innerHeight - 8) y = r.top - h - 4;
    sub.style.left = Math.max(8, x) + 'px';
    sub.style.top = Math.max(8, y) + 'px';
  }

  function hideAll() {
    if (menu) menu.classList.remove('dsm-show');
    if (sub) sub.classList.remove('dsm-show');
  }

  function place(rect) {
    menu.classList.add('dsm-show');
    var w = menu.offsetWidth, h = menu.offsetHeight;
    var x = rect.left + rect.width / 2 - w / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    var y = rect.bottom + 6;
    if (y + h > window.innerHeight - 8) y = rect.top - h - 6;
    menu.style.left = x + 'px';
    menu.style.top = Math.max(8, y) + 'px';
  }

  function update() {
    var cur = currentSelection();
    if (!cur) { if (menu) hideAll(); return; }
    selText = cur.text;
    buildMenu();
    place(cur.range.getBoundingClientRect());
    if (sub) sub.classList.remove('dsm-show');
  }

  function scheduleUpdate() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(update, 60);
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('mouseup', function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest('.dsm-menu,.dsm-quote')) return;
    scheduleUpdate();
  }, true);

  document.addEventListener('selectionchange', function () {
    var s = window.getSelection();
    if ((!s || s.isCollapsed) && menu) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () {
        var s2 = window.getSelection();
        if (!s2 || s2.isCollapsed) hideAll();
      }, 180);
    }
  }, true);

  document.addEventListener('keyup', function (ev) {
    if (ev.key === 'Shift' || ev.key === 'Control' || ev.key === 'Alt') scheduleUpdate();
  }, true);

  document.addEventListener('mousedown', function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest('.dsm-menu,.dsm-quote')) return;
    if (menu) hideAll();
  }, true);

  /* 发送拦截：有引用时，回车先拼引文再替你发 */
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { hideAll(); return; }
    if (flushing) return;
    if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    var c = composer();
    if (!c || !pendingQuote) return;
    var t = ev.target;
    if (!(t === c || (t && c.contains(t)))) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    flushAndSend(c);
  }, true);

  window.addEventListener('scroll', function () { hideAll(); }, true);
  window.addEventListener('resize', function () { hideAll(); });
})();
