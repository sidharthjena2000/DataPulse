(function (DP) {
  'use strict';
  var esc = DP.esc;

  function filtered(ui) {
    var q = ui.recSearch.trim().toLowerCase();
    var list = DP.data.elements.filter(function (e) {
      if (ui.recFilter !== 'all' && e.classification !== ui.recFilter) return false;
      if (q && (e.id + ' ' + e.reason + ' ' + e.tags.join(' ')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (ui.recSort === 'confidence') return a.confidence - b.confidence || b.score - a.score;
      if (ui.recSort === 'name') return a.id.localeCompare(b.id);
      return b.score - a.score;
    });
    return list;
  }

  function meter(value, label) {
    return '<div class="meter" role="img" aria-label="' + esc(label) + '"><span style="width:' + value + '%"></span></div>';
  }

  function rows(ui) {
    var list = filtered(ui);
    if (!list.length) return '<tr><td colspan="7" class="empty">No elements match these filters.</td></tr>';
    return list.map(function (e) {
      var d = e.classification === 'none' ? null : DP.store.get(DP.keyFor('el', e.id));
      var status = e.classification === 'none' ? '<span class="muted">Not applicable</span>' : DP.statusBadge(d);
      var actions = e.classification === 'none' ? '' : DP.decisionButtons('el', e.id);
      return '<tr>' +
        '<td data-label="Element"><button type="button" class="link-btn" data-action="open-el" data-id="' + esc(e.id) + '">' + esc(e.name) + '</button>' +
        '<div class="muted small">' + esc(e.table.id) + '</div></td>' +
        '<td data-label="Class">' + DP.badge(e.classification) + '</td>' +
        '<td data-label="Score"><div class="score-cell"><strong>' + e.score + '</strong>' + meter(e.score, 'Criticality score ' + e.score + ' out of 100') + '</div></td>' +
        '<td class="num" data-label="Confidence">' + DP.pct(e.confidence) + '</td>' +
        '<td class="reason" data-label="Business reason">' + esc(e.reason) + '</td>' +
        '<td data-label="Status">' + status + '</td>' +
        '<td class="actions" data-label="Decision">' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  function filterBar(ui) {
    var D = DP.data;
    function count(c) { return c === 'all' ? D.elements.length : D.elements.filter(function (e) { return e.classification === c; }).length; }
    var chips = [['all', 'All'], ['critical', 'Critical'], ['monitored', 'Monitored'], ['none', 'Not selected']].map(function (f) {
      var on = ui.recFilter === f[0];
      return '<button type="button" class="filter' + (on ? ' is-on' : '') + '" data-action="rec-filter" data-value="' + f[0] + '" aria-pressed="' + on + '">' +
        esc(f[1]) + ' <span class="count">' + count(f[0]) + '</span></button>';
    }).join('');
    return '<div class="toolbar">' +
      '<div class="filters" role="group" aria-label="Filter by classification">' + chips + '</div>' +
      '<div class="toolbar-right">' +
      '<label class="field"><span class="sr-only">Search elements</span><input type="search" id="rec-search" placeholder="Search elements, tags or reasons" value="' + esc(ui.recSearch) + '"></label>' +
      '<label class="field"><span class="sr-only">Sort by</span><select id="rec-sort">' +
      [['score', 'Highest score'], ['confidence', 'Lowest confidence first'], ['name', 'Name']].map(function (o) {
        return '<option value="' + o[0] + '"' + (ui.recSort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label>' +
      '</div></div>';
  }

  DP.views.recommend = {
    title: 'Recommend',
    sub: 'Critical and monitored data elements, each with a business reason and confidence',
    partial: { selector: '#rec-body', html: rows },
    render: function (ui) {
      var T = DP.data.thresholds;
      return filterBar(ui) +
        '<p class="note">Elements score 0 to 100 from five weighted signals. <strong>Critical</strong> is ' + T.critical + ' or above, <strong>Monitored</strong> is ' + T.monitored + ' to ' + (T.critical - 1) +
        '. Confidence drops as a score nears a threshold, so those elements are worth a closer look. Select an element to see the full breakdown.</p>' +
        '<div class="table-wrap"><table class="data responsive"><thead><tr>' +
        '<th scope="col">Element</th><th scope="col">Class</th><th scope="col">Criticality score</th><th scope="col" class="num">Confidence</th>' +
        '<th scope="col">Business reason</th><th scope="col">Status</th><th scope="col">Decision</th>' +
        '</tr></thead><tbody id="rec-body">' + rows(ui) + '</tbody></table></div>';
    }
  };

  /* Side drawer with the transparent score breakdown. */
  DP.views.drawer = function (el) {
    var D = DP.data;
    var breakdown = el.breakdown.map(function (b) {
      return '<li><div class="bd-head"><span>' + esc(b.label) + '</span><span class="muted small">weight ' + Math.round(b.weight * 100) + '%</span></div>' +
        '<div class="bd-bar" role="img" aria-label="' + esc(b.label) + ' scores ' + b.value + ' out of 100"><span style="width:' + b.value + '%"></span></div>' +
        '<div class="bd-foot"><span class="muted small">' + esc(b.hint) + '</span><span><strong>' + b.value + '</strong> &rarr; ' + b.points.toFixed(1) + ' pts</span></div></li>';
    }).join('');

    var assets = el.assets.length ? el.assets.map(function (a) {
      return '<li><span>' + esc(a.name) + '</span> ' + (a.regulatory ? '<span class="badge badge-reg">Regulatory</span>' : '<span class="muted small">' + esc(a.type) + '</span>') + '</li>';
    }).join('') : '<li class="muted">No downstream assets found.</li>';

    var tiers = ['Basic', 'Intermediate', 'Advanced'].map(function (t) {
      var n = el.rules.filter(function (r) { return r.tier === t; }).length;
      return '<span>' + DP.tierBadge(t) + ' ' + n + '</span>';
    }).join('');

    var rec = el.classification !== 'none';
    var d = rec ? DP.store.get(DP.keyFor('el', el.id)) : null;
    var decision = rec
      ? '<div class="drawer-actions">' + DP.statusBadge(d) + '<span class="spacer"></span>' + DP.decisionButtons('el', el.id) + '</div>' +
        (d && d.reason ? '<p class="muted small">Reason: ' + esc(d.reason) + (d.comment ? ' &middot; ' + esc(d.comment) : '') + '</p>' : '')
      : '<p class="muted">Below the monitoring threshold, so no review is needed.</p>';

    return '' +
      '<header class="drawer-head"><div><h2 id="drawer-title">' + esc(el.name) + '</h2><p class="muted">' + esc(D.catalog + '.' + el.table.id) + ' &middot; ' + esc(el.type) + '</p></div>' +
      '<button type="button" class="btn btn-ghost btn-icon" data-action="close-drawer" aria-label="Close details">&times;</button></header>' +
      '<div class="drawer-body">' +
      '<div class="drawer-summary">' + DP.badge(el.classification) +
      '<div><span class="big">' + el.score + '</span><span class="muted"> / 100 criticality</span></div>' +
      '<div><span class="big">' + DP.pct(el.confidence) + '</span><span class="muted"> confidence</span></div></div>' +
      '<h3>Why this recommendation</h3><p>' + esc(el.reason) + '</p>' +
      '<h3>Score breakdown</h3><ol class="breakdown">' + breakdown + '</ol>' +
      '<p class="note small">Score = sum of points. Critical from ' + D.thresholds.critical + ', monitored from ' + D.thresholds.monitored + '. Confidence reflects how far the score sits from the nearest threshold.</p>' +
      '<h3>Evidence</h3>' +
      '<dl class="facts compact"><div><dt>Tags</dt><dd>' + (el.tags.length ? el.tags.map(function (g) { return '<span class="tag">' + esc(g) + '</span>'; }).join('') : 'None') + '</dd></div>' +
      '<div><dt>Reads (30d)</dt><dd>' + DP.fmtNum(el.reads) + '</dd></div>' +
      '<div><dt>Null rate</dt><dd>' + el.nullPct + '%</dd></div></dl>' +
      '<h4>Downstream assets</h4><ul class="plain">' + assets + '</ul>' +
      '<h3>Proposed rules</h3>' +
      (rec ? '<p class="tier-counts">' + tiers + '</p><p><a href="#/rules?el=' + encodeURIComponent(el.id) + '" data-action="close-drawer">View ' + el.rules.length + ' rules &rarr;</a></p>'
           : '<p class="muted">No rules proposed.</p>') +
      '<h3>Your decision</h3>' + decision +
      '<p><a href="#/impact?el=' + encodeURIComponent(el.id) + '" data-action="close-drawer">Simulate a failure of this element &rarr;</a></p>' +
      '</div>';
  };
})(window.DP = window.DP || {});
