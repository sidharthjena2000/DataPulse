/*
 * Run logs: validation runs, anomalies and review activity.
 * The events are generated from the sample catalog (fictional data), on a fixed schedule of one
 * run every six hours for seven days, ending at the most recent six-hour mark. A backend would
 * return the same event shape from its run history.
 */
(function (DP) {
  'use strict';
  var esc = DP.esc;

  var RUN_EVERY_H = 6;
  var RUN_COUNT = 28;
  var HOUR = 3600 * 1000;

  var TYPE_LABEL = {
    rule_validation: 'Rule validation',
    null_rate_anomaly: 'Null-rate anomaly',
    freshness_sla: 'Freshness SLA',
    schema_drift: 'Schema drift',
    quarantine: 'Quarantine'
  };
  var LEVEL_LABEL = { fail: 'Failed', warn: 'Warning', info: 'Info', pass: 'Passed' };

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* ---- Build events ---- */
  function build() {
    var D = DP.data;
    var latest = Math.floor(Date.now() / (RUN_EVERY_H * HOUR)) * (RUN_EVERY_H * HOUR);
    var L = RUN_COUNT - 1;
    var events = [];
    var seq = 0;

    function rulesOf(elId) { return (D.elementById[elId] && D.elementById[elId].rules) || []; }
    function rule(elId, i) { return rulesOf(elId)[i] || rulesOf(elId)[0] || null; }

    function add(run, ev) {
      ev.run = run;
      ev.ts = latest - (L - run) * RUN_EVERY_H * HOUR + ev.offsetMin * 60000;
      delete ev.offsetMin;
      ev.id = 'ev-' + (++seq);
      ev.runId = 'dq-run-' + (8412 - (L - run));
      events.push(ev);
    }

    /* Incidents, by run index (L is the latest run). */
    var dob = 'member.member_profile.date_of_birth';
    var postingDate = 'finance.premium_ledger.posting_date';
    var regNo = 'provider.provider_master.registration_number';
    var claimAmt = 'claims.claim_header.claim_amount';
    var premium = 'policy.policy_master.premium_amount';

    var incidents = {};
    function inc(run, ev) { (incidents[run] = incidents[run] || []).push(ev); }

    inc(L - 10, { level: 'warn', type: 'rule_validation', table: 'policy.policy_master', element: premium, rule: rule(premium, 1),
      message: 'premium_amount outside the expected range on 7 rows', metrics: { rows_checked: 1840000, rows_failed: 7 } });
    inc(L - 8, { level: 'fail', type: 'rule_validation', table: 'claims.claim_header', element: claimAmt, rule: rule(claimAmt, 1),
      message: 'claim_amount is negative on 4 rows', metrics: { rows_checked: 48200000, rows_failed: 4 } });
    inc(L - 7, { level: 'pass', type: 'rule_validation', table: 'claims.claim_header', element: claimAmt, rule: rule(claimAmt, 1),
      message: 'claim_amount is not negative: 0 violations after correction upstream', metrics: { rows_checked: 48200000, rows_failed: 0 } });
    inc(L - 5, { level: 'warn', type: 'quarantine', table: 'provider.provider_master', element: regNo, rule: rule(regNo, 1),
      message: '31 rows quarantined: registration_number does not match the expected format', metrics: { rows_quarantined: 31, rows_checked: 118400 } });
    inc(L - 3, { level: 'info', type: 'schema_drift', table: 'claims.claim_line', element: null, rule: null,
      message: 'Column adjudication_code added (string, nullable). It is not in the catalog snapshot.', metrics: { change: 'column_added', column: 'adjudication_code' } });
    inc(L - 2, { level: 'warn', type: 'null_rate_anomaly', table: 'member.member_profile', element: dob, rule: rule(dob, 0),
      message: 'date_of_birth null rate 0.94% against a 0.21% baseline', metrics: { null_rate_pct: 0.94, baseline_pct: 0.21, threshold_pct: 0.5 } });
    inc(L - 1, { level: 'fail', type: 'null_rate_anomaly', table: 'member.member_profile', element: dob, rule: rule(dob, 0),
      message: 'date_of_birth null rate 1.84% against a 0.21% baseline', metrics: { null_rate_pct: 1.84, baseline_pct: 0.21, threshold_pct: 0.5 } });
    inc(L, { level: 'fail', type: 'null_rate_anomaly', table: 'member.member_profile', element: dob, rule: rule(dob, 0),
      message: 'date_of_birth null rate 1.91% against a 0.21% baseline', metrics: { null_rate_pct: 1.91, baseline_pct: 0.21, threshold_pct: 0.5 } });
    inc(L - 1, { level: 'warn', type: 'freshness_sla', table: 'finance.premium_ledger', element: postingDate, rule: null,
      message: 'Last load 6h 12m ago against a 4h freshness SLA', metrics: { sla_hours: 4, age_minutes: 372 } });
    inc(L, { level: 'fail', type: 'freshness_sla', table: 'finance.premium_ledger', element: postingDate, rule: null,
      message: 'Last load 12h 10m ago against a 4h freshness SLA', metrics: { sla_hours: 4, age_minutes: 730 } });
    inc(L, { level: 'warn', type: 'quarantine', table: 'provider.provider_master', element: regNo, rule: rule(regNo, 1),
      message: '12 rows quarantined: registration_number does not match the expected format', metrics: { rows_quarantined: 12, rows_checked: 118400 } });

    /* One validation summary per table per run, unless that table has a rule-validation incident in the run. */
    D.tables.forEach(function (t, ti) {
      var elIds = D.elements.filter(function (e) { return e.table === t; }).map(function (e) { return e.id; });
      var total = elIds.reduce(function (n, id) { return n + rulesOf(id).length; }, 0);
      if (!total) return;
      for (var run = 0; run <= L; run++) {
        var list = incidents[run] || [];
        var hit = list.filter(function (e) { return e.table === t.id && e.type === 'rule_validation' && e.level !== 'pass'; })[0];
        var failed = hit ? 1 : 0;
        add(run, {
          level: failed ? hit.level : 'pass', type: 'rule_validation', table: t.id, element: null, rule: null,
          message: (total - failed) + ' of ' + total + ' rules passed on ' + t.id,
          metrics: { rules_total: total, rules_passed: total - failed, duration_s: 14 + ((run * 7 + ti * 5) % 19) },
          offsetMin: 4 + ti * 3
        });
      }
    });

    Object.keys(incidents).forEach(function (run) {
      incidents[run].forEach(function (ev, i) {
        ev.offsetMin = 5 + i * 2 + 18;
        add(Number(run), ev);
      });
    });

    events.sort(function (a, b) { return b.ts - a.ts || (a.id < b.id ? 1 : -1); });
    return { events: events, latest: latest, runs: RUN_COUNT };
  }

  var cache = null;
  function logs() { if (!cache) cache = build(); return cache; }

  function fmtTime(ts) {
    var d = new Date(ts);
    return d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'short' }) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function target(ev) {
    return ev.element ? ev.element : ev.table;
  }

  /* ---- Filters ---- */
  var ui = function () {
    var u = DP.ui;
    if (!u.log) u.log = { level: 'attention', type: 'all', table: 'all', search: '', limit: 40, tab: 'runs' };
    return u.log;
  };

  function filtered() {
    var f = ui();
    var q = f.search.trim().toLowerCase();
    return logs().events.filter(function (e) {
      if (f.level === 'attention' && e.level !== 'fail' && e.level !== 'warn') return false;
      if (f.level !== 'attention' && f.level !== 'all' && e.level !== f.level) return false;
      if (f.type !== 'all' && e.type !== f.type) return false;
      if (f.table !== 'all' && e.table !== f.table) return false;
      if (q && (e.message + ' ' + target(e) + ' ' + e.runId + ' ' + TYPE_LABEL[e.type]).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function question(ev) {
    return 'Explain this log event and what to do next. Run ' + ev.runId + ' at ' + fmtTime(ev.ts) + ', ' + LEVEL_LABEL[ev.level].toLowerCase() +
      ', ' + TYPE_LABEL[ev.type] + ' on ' + target(ev) + ': ' + ev.message + '. Metrics: ' + JSON.stringify(ev.metrics) + '.';
  }

  function rows() {
    var f = ui();
    var all = filtered();
    var shown = all.slice(0, f.limit);
    if (!shown.length) return '<p class="empty">No events match these filters.</p>';
    var body = shown.map(function (e) {
      return '<tr>' +
        '<td class="mono nowrap" data-label="Time">' + esc(fmtTime(e.ts)) + '</td>' +
        '<td data-label="Level"><span class="lvl lvl-' + e.level + '">' + esc(LEVEL_LABEL[e.level]) + '</span></td>' +
        '<td data-label="Type">' + esc(TYPE_LABEL[e.type]) + '</td>' +
        '<td class="mono" data-label="Target">' + esc(target(e)) + '</td>' +
        '<td data-label="Detail">' + esc(e.message) + (e.rule ? '<div class="muted small">Rule: ' + esc(e.rule.name) + '</div>' : '') + '</td>' +
        '<td class="mono muted nowrap" data-label="Run">' + esc(e.runId) + '</td>' +
        '<td data-label=""><button type="button" class="btn btn-ghost btn-sm" data-action="copilot-ask" data-q="' + esc(question(e)) + '" data-label="' + esc('Explain: ' + TYPE_LABEL[e.type] + ' on ' + target(e) + ', ' + e.runId) + '">Ask Copilot</button></td>' +
        '</tr>';
    }).join('');
    var more = all.length > shown.length
      ? '<div class="log-more"><button type="button" class="btn btn-ghost" data-action="log-more">Show ' + Math.min(40, all.length - shown.length) + ' more</button></div>' : '';
    return '<div class="table-wrap"><table class="data responsive"><thead><tr><th>Time</th><th>Level</th><th>Type</th><th>Target</th><th>Detail</th><th>Run</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="muted small log-count">Showing ' + shown.length + ' of ' + all.length + ' events</p>' + more;
  }

  function stats() {
    var data = logs();
    var latestTs = data.latest;
    var checks = 0, passed = 0;
    data.events.forEach(function (e) {
      if (e.type !== 'rule_validation' || e.metrics.rules_total === undefined) return;
      checks += e.metrics.rules_total; passed += e.metrics.rules_passed;
    });
    var open = data.events.filter(function (e) { return e.ts >= latestTs && (e.level === 'fail' || e.level === 'warn'); });
    var quarantined = data.events.filter(function (e) { return e.ts >= latestTs && e.type === 'quarantine'; })
      .reduce(function (n, e) { return n + e.metrics.rows_quarantined; }, 0);
    return {
      runs: data.runs, checks: checks, rate: checks ? (100 * passed / checks) : 100,
      open: open.length, failing: open.filter(function (e) { return e.level === 'fail'; }).length, quarantined: quarantined
    };
  }

  function tile(label, value, note, tone) {
    return '<div class="log-tile' + (tone ? ' log-tile-' + tone : '') + '"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd>' + (note ? '<p class="muted small">' + esc(note) + '</p>' : '') + '</div>';
  }

  function review() {
    var all = DP.store.all();
    var keys = Object.keys(all).sort(function (a, b) { return all[b].at < all[a].at ? -1 : 1; });
    if (!keys.length) return '<p class="empty">No review decisions yet. Accept or reject a recommendation and it will appear here.</p>';
    var D = DP.data;
    var body = keys.map(function (k) {
      var kind = k.slice(0, k.indexOf(':')), id = k.slice(k.indexOf(':') + 1), d = all[k], label = id;
      if (kind === 'rule' && D.ruleById[id]) label = D.ruleById[id].name + ' (' + D.ruleById[id].elementId + ')';
      return '<tr><td class="mono nowrap" data-label="Time">' + esc(fmtTime(Date.parse(d.at))) + '</td>' +
        '<td data-label="Item">' + esc(kind === 'rule' ? 'Rule' : 'Element') + '</td>' +
        '<td class="mono" data-label="Target">' + esc(label) + '</td>' +
        '<td data-label="Decision"><span class="lvl ' + (d.status === 'approved' ? 'lvl-pass' : 'lvl-fail') + '">' + (d.status === 'approved' ? 'Approved' : 'Rejected') + '</span></td>' +
        '<td data-label="Reason">' + esc(d.reason || '') + (d.comment ? '<div class="muted small">' + esc(d.comment) + '</div>' : '') + '</td></tr>';
    }).join('');
    return '<div class="table-wrap"><table class="data responsive"><thead><tr><th>Time</th><th>Item</th><th>Target</th><th>Decision</th><th>Reason</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function toCsv(list) {
    function cell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var head = ['time_utc', 'run_id', 'level', 'type', 'table', 'element', 'rule', 'message', 'metrics'];
    var lines = [head.join(',')].concat(list.map(function (e) {
      return [new Date(e.ts).toISOString(), e.runId, e.level, e.type, e.table, e.element || '', e.rule ? e.rule.name : '', e.message, JSON.stringify(e.metrics)].map(cell).join(',');
    }));
    return lines.join('\n');
  }

  function opt(value, label, cur) { return '<option value="' + esc(value) + '"' + (cur === value ? ' selected' : '') + '>' + esc(label) + '</option>'; }

  DP.logs = {
    events: function () { return logs().events; },
    typeLabel: TYPE_LABEL,
    levelLabel: LEVEL_LABEL,
    fmtTime: fmtTime,
    stats: stats,
    filtered: filtered,
    csv: function () { return toCsv(filtered()); },
    /* Latest-run issues, used as grounding for the Copilot. */
    latestIssues: function () {
      var latest = logs().latest;
      return logs().events.filter(function (e) { return e.ts >= latest && (e.level === 'fail' || e.level === 'warn' || e.level === 'info'); });
    },
    recentIssues: function (n) {
      return logs().events.filter(function (e) { return e.level !== 'pass'; }).slice(0, n);
    },
    question: question
  };

  DP.views.logs = {
    title: 'Run logs',
    sub: 'Validation runs, anomalies and review activity',
    partial: { selector: '#log-body', html: rows },
    render: function () {
      var f = ui(), s = stats();
      var tabs = '<div class="seg-tabs" role="tablist" aria-label="Log source">' +
        '<button type="button" role="tab" class="seg-t' + (f.tab === 'runs' ? ' is-on' : '') + '" aria-selected="' + (f.tab === 'runs') + '" data-action="log-tab" data-value="runs">Validation runs</button>' +
        '<button type="button" role="tab" class="seg-t' + (f.tab === 'review' ? ' is-on' : '') + '" aria-selected="' + (f.tab === 'review') + '" data-action="log-tab" data-value="review">Review activity</button></div>';

      if (f.tab === 'review') return tabs + '<div id="log-body">' + review() + '</div>';

      var tables = DP.data.tables.map(function (t) { return opt(t.id, t.id, f.table); }).join('');
      var types = Object.keys(TYPE_LABEL).map(function (k) { return opt(k, TYPE_LABEL[k], f.type); }).join('');
      return tabs +
        '<p class="note">Sample data: events are generated from the demo catalog, one run every ' + RUN_EVERY_H + ' hours for the last 7 days. Times are in your local time zone.</p>' +
        '<dl class="log-tiles">' +
        tile('Runs, 7 days', String(s.runs), 'Every ' + RUN_EVERY_H + ' hours') +
        tile('Rule pass rate', s.rate.toFixed(2) + '%', DP.fmtNum(s.checks) + ' table-level checks') +
        tile('Open in latest run', String(s.open), s.failing + ' failing', s.failing ? 'bad' : '') +
        tile('Rows quarantined', DP.fmtNum(s.quarantined), 'Latest run') + '</dl>' +
        '<div class="filters" role="group" aria-label="Filter events">' +
        '<label>Level <select id="log-level">' + opt('attention', 'Failures and warnings', f.level) + opt('all', 'All levels', f.level) + opt('fail', 'Failed', f.level) + opt('warn', 'Warning', f.level) + opt('info', 'Info', f.level) + opt('pass', 'Passed', f.level) + '</select></label>' +
        '<label>Type <select id="log-type">' + opt('all', 'All types', f.type) + types + '</select></label>' +
        '<label>Table <select id="log-table">' + opt('all', 'All tables', f.table) + tables + '</select></label>' +
        '<label class="grow">Search <input type="search" id="log-search" value="' + esc(f.search) + '" placeholder="Column, run id or message" maxlength="80"></label>' +
        '<button type="button" class="btn btn-ghost" data-action="log-export">Export CSV</button></div>' +
        '<div id="log-body">' + rows() + '</div>';
    }
  };
})(window.DP = window.DP || {});
