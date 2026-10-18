(function (DP) {
  'use strict';
  var esc = DP.esc;

  function visible(ui) {
    return DP.data.rules.filter(function (r) {
      if (ui.ruleTier !== 'all' && r.tier !== ui.ruleTier) return false;
      if (ui.ruleEl && r.elementId !== ui.ruleEl) return false;
      var d = DP.store.get(DP.keyFor('rule', r.id));
      var st = d ? d.status : 'pending';
      if (ui.ruleStatus !== 'all' && st !== ui.ruleStatus) return false;
      return true;
    });
  }

  function cards(ui) {
    var list = visible(ui);
    if (!list.length) return '<p class="empty">No rules match these filters.</p>';
    var D = DP.data, groups = {}, order = [];
    list.forEach(function (r) {
      if (!groups[r.elementId]) { groups[r.elementId] = []; order.push(r.elementId); }
      groups[r.elementId].push(r);
    });
    order.sort(function (a, b) { return D.elementById[b].score - D.elementById[a].score; });
    return order.map(function (id) {
      var el = D.elementById[id];
      var items = groups[id].map(function (r) {
        var d = DP.store.get(DP.keyFor('rule', r.id));
        return '<article class="rule">' +
          '<header><h4>' + esc(r.name) + '</h4>' + DP.tierBadge(r.tier) + '</header>' +
          '<p>' + esc(r.desc) + '</p>' +
          '<pre class="code" tabindex="0"><code>' + esc(r.sql) + '</code></pre>' +
          '<footer>' + DP.statusBadge(d) +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="copy" data-id="' + esc(r.id) + '">Copy SQL</button>' +
          DP.decisionButtons('rule', r.id) + '</footer>' +
          (d && d.reason ? '<p class="muted small">Reason: ' + esc(d.reason) + (d.comment ? ' &middot; ' + esc(d.comment) : '') + '</p>' : '') +
          '</article>';
      }).join('');
      return '<section class="rule-group" aria-label="Rules for ' + esc(el.name) + '">' +
        '<h3 class="group-h"><button type="button" class="link-btn" data-action="open-el" data-id="' + esc(el.id) + '">' + esc(el.name) + '</button> ' + DP.badge(el.classification) +
        '<span class="muted small"> ' + esc(el.table.id) + '</span></h3>' + items + '</section>';
    }).join('');
  }

  DP.views.rules = {
    title: 'Propose rules',
    sub: 'Basic to advanced data quality rules per element, written as Databricks SQL',
    partial: { selector: '#rule-list', html: cards },
    render: function (ui) {
      var D = DP.data;
      var tiers = ['all', 'Basic', 'Intermediate', 'Advanced'].map(function (t) {
        var n = t === 'all' ? D.rules.length : D.rules.filter(function (r) { return r.tier === t; }).length;
        var on = ui.ruleTier === t;
        return '<button type="button" class="filter' + (on ? ' is-on' : '') + '" data-action="rule-tier" data-value="' + t + '" aria-pressed="' + on + '">' + (t === 'all' ? 'All tiers' : t) + ' <span class="count">' + n + '</span></button>';
      }).join('');
      var elOpts = '<option value="">All elements</option>' + D.elements.filter(function (e) { return e.rules.length; }).sort(function (a, b) { return a.id.localeCompare(b.id); }).map(function (e) {
        return '<option value="' + esc(e.id) + '"' + (ui.ruleEl === e.id ? ' selected' : '') + '>' + esc(e.table.name + '.' + e.name) + '</option>';
      }).join('');
      var stOpts = [['all', 'Any status'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(function (o) {
        return '<option value="' + o[0] + '"' + (ui.ruleStatus === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('');
      return '<div class="toolbar"><div class="filters" role="group" aria-label="Filter by tier">' + tiers + '</div>' +
        '<div class="toolbar-right"><label class="field"><span class="sr-only">Element</span><select id="rule-el">' + elOpts + '</select></label>' +
        '<label class="field"><span class="sr-only">Status</span><select id="rule-status">' + stOpts + '</select></label></div></div>' +
        '<p class="note">Critical elements get all three tiers where a cross-table or business-logic check exists. Monitored elements get Basic and Intermediate rules. Review each rule before it is activated; nothing here runs against your data.</p>' +
        '<div id="rule-list">' + cards(ui) + '</div>';
    }
  };
})(window.DP = window.DP || {});
