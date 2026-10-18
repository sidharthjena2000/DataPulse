/* Router, event handling, drawer and dialogs. */
(function (DP) {
  'use strict';
  var esc = DP.esc;

  var NAV = [
    { group: 'Workflow', items: [
      { route: 'overview', label: 'Overview' },
      { route: 'discover', label: 'Read', n: 1 },
      { route: 'recommend', label: 'Recommend', n: 2 },
      { route: 'rules', label: 'Propose rules', n: 3 },
      { route: 'review', label: 'Approve', n: 4, pending: true }
    ] },
    { group: 'Extensions', items: [
      { route: 'impact', label: 'Impact simulation' },
      { route: 'ask', label: 'Ask DataPulse' }
    ] }
  ];

  var current = 'overview';
  var lastFocus = null;
  var pendingFocus = null;
  var toastTimer = null;

  function $(sel) { return document.querySelector(sel); }

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, ''), q = '', i = h.indexOf('?');
    if (i > -1) { q = h.slice(i + 1); h = h.slice(0, i); }
    var params = {};
    q.split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      try { params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } catch (e) { /* ignore malformed */ }
    });
    return { route: DP.views[h] && h !== 'drawer' ? h : 'overview', params: params };
  }

  function renderNav() {
    var s = DP.stats();
    $('#nav').innerHTML = NAV.map(function (g) {
      return '<div class="nav-group"><p class="nav-h">' + esc(g.group) + '</p><ul>' + g.items.map(function (it) {
        var on = it.route === current;
        return '<li><a href="#/' + it.route + '" class="nav-link' + (on ? ' is-active' : '') + '"' + (on ? ' aria-current="page"' : '') + '>' +
          (it.n ? '<span class="nav-n">' + it.n + '</span>' : '<span class="nav-n nav-n-empty"></span>') +
          '<span>' + esc(it.label) + '</span>' +
          (it.pending && s.pending ? '<span class="nav-count" aria-label="' + s.pending + ' pending">' + s.pending + '</span>' : '') +
          '</a></li>';
      }).join('') + '</ul></div>';
    }).join('');
  }

  function renderMain(focusTitle) {
    var v = DP.views[current];
    var y = window.scrollY;
    $('#main').innerHTML = '<header class="page-head"><h1 id="page-title" tabindex="-1">' + esc(v.title) + '</h1><p class="sub">' + esc(v.sub) + '</p></header>' + v.render(DP.ui);
    document.title = v.title + ' · DataPulse';
    renderNav();
    if (focusTitle) { window.scrollTo(0, 0); $('#page-title').focus({ preventScroll: true }); }
    else {
      window.scrollTo(0, y);
      if (pendingFocus) {
        var t = document.querySelector('[data-kind="' + pendingFocus.kind + '"][data-id="' + CSS.escape(pendingFocus.id) + '"]');
        if (t) t.focus({ preventScroll: true });
        pendingFocus = null;
      }
    }
  }

  function navigate() {
    var p = parseHash();
    current = p.route;
    if (current === 'rules') DP.ui.ruleEl = p.params.el && DP.data.elementById[p.params.el] ? p.params.el : '';
    if (current === 'impact' && p.params.el && DP.data.elementById[p.params.el]) DP.ui.impactEl = p.params.el;
    renderMain(true);
  }

  /* ---- Drawer ---- */
  var openElId = null;

  function drawerFocusables() {
    return Array.prototype.slice.call($('#drawer').querySelectorAll('a[href], button:not([disabled])'));
  }

  function openDrawer(id) {
    var el = DP.data.elementById[id];
    if (!el) return;
    if (!openElId) lastFocus = document.activeElement;
    openElId = id;
    var d = $('#drawer');
    d.innerHTML = DP.views.drawer(el);
    d.hidden = false; $('#scrim').hidden = false;
    requestAnimationFrame(function () { d.classList.add('open'); });
    var close = d.querySelector('[data-action="close-drawer"]');
    if (close) close.focus();
    document.body.classList.add('no-scroll');
  }

  function closeDrawer() {
    if (!openElId) return;
    openElId = null;
    var d = $('#drawer');
    d.classList.remove('open'); d.hidden = true; $('#scrim').hidden = true;
    document.body.classList.remove('no-scroll');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  function refreshDrawer() {
    if (!openElId) return;
    var d = $('#drawer'), y = d.scrollTop;
    d.innerHTML = DP.views.drawer(DP.data.elementById[openElId]);
    d.scrollTop = y;
    if (pendingFocus) {
      var t = d.querySelector('[data-kind="' + pendingFocus.kind + '"][data-id="' + CSS.escape(pendingFocus.id) + '"]');
      if (t) { t.focus({ preventScroll: true }); pendingFocus = null; }
    }
  }

  /* ---- Reject dialog ---- */
  var rejectTarget = null;

  function openReject(kind, id) {
    rejectTarget = { kind: kind, id: id };
    var D = DP.data, label;
    if (kind === 'rule') { var r = D.ruleById[id]; label = r.name + ' (' + D.elementById[r.elementId].name + ')'; }
    else { var e = D.elementById[id]; label = e.table.name + '.' + e.name; }
    $('#reject-what').textContent = label;
    $('#reject-form').reset();
    var dlg = $('#reject-dialog');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    $('#reject-reason').focus();
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function labelFor(key) {
    var D = DP.data, kind = key.slice(0, key.indexOf(':')), id = key.slice(key.indexOf(':') + 1);
    if (kind === 'rule') { var r = D.ruleById[id]; return r ? r.name + ' (' + r.elementId + ')' : id; }
    return id;
  }

  function exportDecisions() {
    var all = DP.store.all();
    var out = Object.keys(all).sort().map(function (k) {
      return { item: k.slice(0, k.indexOf(':')) === 'rule' ? 'rule' : 'element', id: k.slice(k.indexOf(':') + 1), label: labelFor(k), status: all[k].status, reason: all[k].reason, comment: all[k].comment, decidedAt: all[k].at };
    });
    var blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), catalog: DP.data.catalog, decisions: out }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'datapulse-decisions.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove(); toast(ok ? 'SQL copied' : 'Copy not available in this browser');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('SQL copied'); }, fallback);
    else fallback();
  }

  function ask(q) {
    q = q.trim();
    if (!q) return;
    if (!DP.ui.chat) DP.views.ask.render(DP.ui);
    DP.ui.chat.push({ role: 'user', text: q });
    DP.ui.chat.push({ role: 'assistant', html: DP.views.ask.answer(q) });
    renderMain(false);
    var log = $('#chat-log'); if (log) log.scrollTop = log.scrollHeight;
    var input = $('#chat-input'); if (input) input.focus({ preventScroll: true });
  }

  /* ---- Events ---- */
  document.addEventListener('click', function (e) {
    if (e.target.id === 'scrim') { closeDrawer(); return; }
    var t = e.target.closest('[data-action]');
    if (!t) return;
    var a = t.getAttribute('data-action'), id = t.getAttribute('data-id'), kind = t.getAttribute('data-kind'), val = t.getAttribute('data-value');
    switch (a) {
      case 'open-el': openDrawer(id); break;
      case 'close-drawer': closeDrawer(); break;
      case 'pick-table':
        DP.ui.table = id;
        if (current !== 'discover') location.hash = '#/discover'; else renderMain(false);
        break;
      case 'rec-filter': DP.ui.recFilter = val; renderMain(false); break;
      case 'rule-tier': DP.ui.ruleTier = val; renderMain(false); break;
      case 'review-tab': DP.ui.reviewTab = val; renderMain(false); break;
      case 'accept': pendingFocus = { kind: kind, id: id }; DP.store.set(DP.keyFor(kind, id), { status: 'approved' }); break;
      case 'reject': openReject(kind, id); break;
      case 'undo': pendingFocus = { kind: kind, id: id }; DP.store.clear(DP.keyFor(kind, id)); break;
      case 'copy': copyText(DP.data.ruleById[id].sql); break;
      case 'export': exportDecisions(); break;
      case 'reset':
        if (window.confirm('Clear every accept and reject decision stored in this browser?')) DP.store.reset();
        break;
      case 'ask': ask(t.getAttribute('data-q')); break;
    }
  });

  document.addEventListener('change', function (e) {
    var id = e.target.id;
    if (id === 'rec-sort') { DP.ui.recSort = e.target.value; renderMain(false); }
    else if (id === 'rule-el') { DP.ui.ruleEl = e.target.value; renderMain(false); }
    else if (id === 'rule-status') { DP.ui.ruleStatus = e.target.value; renderMain(false); }
    else if (id === 'impact-el') { DP.ui.impactEl = e.target.value; renderMain(false); }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id !== 'rec-search') return;
    DP.ui.recSearch = e.target.value;
    var p = DP.views.recommend.partial;
    $(p.selector).innerHTML = p.html(DP.ui);
  });

  document.addEventListener('submit', function (e) {
    if (e.target.id === 'chat-form') {
      e.preventDefault();
      var input = $('#chat-input'); var q = input.value; input.value = '';
      ask(q);
    } else if (e.target.id === 'reject-form') {
      e.preventDefault();
      var target = rejectTarget, reason = $('#reject-reason').value, comment = $('#reject-comment').value.trim();
      rejectTarget = null;
      $('#reject-dialog').close();
      if (target) {
        pendingFocus = { kind: target.kind, id: target.id };
        DP.store.set(DP.keyFor(target.kind, target.id), { status: 'rejected', reason: reason, comment: comment });
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openElId && !$('#reject-dialog').open) { closeDrawer(); return; }
    if (e.key === 'Tab' && openElId && !$('#reject-dialog').open) {
      var f = drawerFocusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (!$('#drawer').contains(document.activeElement)) { first.focus(); e.preventDefault(); }
      else if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });

  DP.store.onChange(function () {
    var y = window.scrollY;
    renderMain(false);
    window.scrollTo(0, y);
    refreshDrawer();
  });

  window.addEventListener('hashchange', function () { closeDrawer(); navigate(); });

  document.addEventListener('DOMContentLoaded', function () {
    $('#reject-reason').innerHTML = '<option value="">Select a reason</option>' + DP.REJECT_REASONS.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('');
    $('#reject-cancel').addEventListener('click', function () { rejectTarget = null; $('#reject-dialog').close(); });
    navigate();
  });
})(window.DP = window.DP || {});
