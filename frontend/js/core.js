/* Shared helpers and the review-decision store. */
(function (DP) {
  'use strict';

  DP.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  DP.fmtNum = function (n) { return Number(n).toLocaleString('en-GB'); };
  DP.pct = function (n) { return Math.round(n * 100) + '%'; };
  DP.CLASS_LABEL = { critical: 'Critical', monitored: 'Monitored', none: 'Not selected' };

  DP.badge = function (cls) {
    return '<span class="badge badge-' + cls + '">' + DP.esc(DP.CLASS_LABEL[cls] || cls) + '</span>';
  };

  DP.tierBadge = function (tier) {
    return '<span class="badge badge-tier badge-' + tier.toLowerCase() + '">' + DP.esc(tier) + '</span>';
  };

  DP.statusBadge = function (d) {
    if (!d) return '<span class="status status-pending">Pending review</span>';
    return d.status === 'approved'
      ? '<span class="status status-approved">Approved</span>'
      : '<span class="status status-rejected">Rejected</span>';
  };

  DP.REJECT_REASONS = [
    'Not business critical',
    'Incorrect classification',
    'Rule too strict',
    'Rule too lenient',
    'Duplicate of an existing rule',
    'Other'
  ];

  /* Review decisions, kept in localStorage when it is available. */
  DP.store = (function () {
    var KEY = 'datapulse.decisions.v1';
    var mem = {};
    var listeners = [];
    try { mem = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { mem = {}; }

    function persist() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* storage unavailable */ } }
    function notify() { listeners.forEach(function (fn) { fn(); }); }

    return {
      get: function (k) { return mem[k] || null; },
      set: function (k, v) {
        mem[k] = { status: v.status, reason: v.reason || '', comment: v.comment || '', at: new Date().toISOString() };
        persist(); notify();
      },
      clear: function (k) { delete mem[k]; persist(); notify(); },
      all: function () { return JSON.parse(JSON.stringify(mem)); },
      reset: function () { mem = {}; persist(); notify(); },
      onChange: function (fn) { listeners.push(fn); }
    };
  })();

  DP.keyFor = function (kind, id) { return (kind === 'rule' ? 'rule:' : 'el:') + id; };

  /* Counts used by the overview, sidebar and review page. */
  DP.stats = function () {
    var D = DP.data;
    var recommended = D.elements.filter(function (e) { return e.classification !== 'none'; });
    var items = [];
    recommended.forEach(function (e) { items.push(DP.keyFor('el', e.id)); });
    D.rules.forEach(function (r) { items.push(DP.keyFor('rule', r.id)); });
    var approved = 0, rejected = 0;
    items.forEach(function (k) {
      var d = DP.store.get(k);
      if (d && d.status === 'approved') approved++;
      else if (d && d.status === 'rejected') rejected++;
    });
    var cols = D.tables.reduce(function (n, t) { return n + t.columns.length; }, 0);
    return {
      tables: D.tables.length, columns: cols,
      critical: D.elements.filter(function (e) { return e.classification === 'critical'; }).length,
      monitored: D.elements.filter(function (e) { return e.classification === 'monitored'; }).length,
      rules: D.rules.length,
      basic: D.rules.filter(function (r) { return r.tier === 'Basic'; }).length,
      intermediate: D.rules.filter(function (r) { return r.tier === 'Intermediate'; }).length,
      advanced: D.rules.filter(function (r) { return r.tier === 'Advanced'; }).length,
      total: items.length, approved: approved, rejected: rejected,
      pending: items.length - approved - rejected
    };
  };

  /* Accept / reject buttons shared by rows, cards and the drawer. */
  DP.decisionButtons = function (kind, id, compact) {
    var d = DP.store.get(DP.keyFor(kind, id));
    var data = 'data-kind="' + kind + '" data-id="' + DP.esc(id) + '"';
    if (d) {
      return '<button type="button" class="btn btn-ghost btn-sm" data-action="undo" ' + data + '>Undo</button>';
    }
    return '<button type="button" class="btn btn-accept btn-sm" data-action="accept" ' + data + '>' + (compact ? 'Accept' : 'Accept') + '</button>' +
      '<button type="button" class="btn btn-reject btn-sm" data-action="reject" ' + data + '>Reject</button>';
  };

  DP.views = DP.views || {};

  /* UI state that survives navigation (filters, selections). */
  DP.ui = {
    recFilter: 'all', recSearch: '', recSort: 'score',
    ruleTier: 'all', ruleStatus: 'all', ruleEl: '',
    table: 'claims.claim_header',
    impactEl: 'claims.claim_header.claim_amount',
    reviewTab: 'pending',
    chat: null
  };
})(window.DP = window.DP || {});
