(function (DP) {
  'use strict';
  var esc = DP.esc;

  function allItems() {
    var D = DP.data, out = [];
    D.elements.filter(function (e) { return e.classification !== 'none'; }).forEach(function (e) {
      out.push({ kind: 'el', id: e.id, label: e.table.name + '.' + e.name, sub: DP.CLASS_LABEL[e.classification] + ' element, confidence ' + DP.pct(e.confidence), sort: e.confidence, el: e });
    });
    D.rules.forEach(function (r) {
      var e = D.elementById[r.elementId];
      out.push({ kind: 'rule', id: r.id, label: r.name, sub: r.tier + ' rule on ' + e.table.name + '.' + e.name, sort: 2 + e.confidence, el: e });
    });
    out.forEach(function (i) { i.decision = DP.store.get(DP.keyFor(i.kind, i.id)); });
    return out;
  }

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }

  DP.views.review = {
    title: 'Approve',
    sub: 'Governance team reviews, accepts or rejects; feedback improves results',
    render: function (ui) {
      var s = DP.stats();
      var items = allItems();
      var pending = items.filter(function (i) { return !i.decision; }).sort(function (a, b) { return a.sort - b.sort; });
      var decided = items.filter(function (i) { return i.decision; }).sort(function (a, b) { return a.decision.at < b.decision.at ? 1 : -1; });
      var donePct = s.total ? Math.round(((s.approved + s.rejected) / s.total) * 100) : 0;

      var tiles = [
        ['Items to review', s.total], ['Approved', s.approved], ['Rejected', s.rejected], ['Pending', s.pending]
      ].map(function (t) { return '<div class="tile"><span class="tile-n">' + t[1] + '</span><span class="tile-l">' + t[0] + '</span></div>'; }).join('');

      var list;
      if (ui.reviewTab === 'pending') {
        list = pending.length ? pending.slice(0, 40).map(function (i) {
          return '<li class="queue-item"><div><button type="button" class="link-btn" data-action="open-el" data-id="' + esc(i.el.id) + '">' + esc(i.label) + '</button>' +
            '<div class="muted small">' + esc(i.sub) + '</div></div><div class="actions">' + DP.decisionButtons(i.kind, i.id) + '</div></li>';
        }).join('') + (pending.length > 40 ? '<li class="muted small queue-more">Showing the 40 lowest-confidence items of ' + pending.length + '.</li>' : '')
          : '<li class="empty">Everything has been reviewed.</li>';
      } else {
        list = decided.length ? decided.map(function (i) {
          return '<li class="queue-item"><div><span>' + esc(i.label) + '</span> ' + DP.statusBadge(i.decision) +
            '<div class="muted small">' + esc(i.sub) + ' &middot; ' + esc(fmtTime(i.decision.at)) +
            (i.decision.reason ? ' &middot; ' + esc(i.decision.reason) : '') + (i.decision.comment ? ' &middot; &ldquo;' + esc(i.decision.comment) + '&rdquo;' : '') + '</div></div>' +
            '<div class="actions">' + DP.decisionButtons(i.kind, i.id) + '</div></li>';
        }).join('') : '<li class="empty">No decisions yet.</li>';
      }

      var reasons = {};
      decided.forEach(function (i) { if (i.decision.status === 'rejected') { var r = i.decision.reason || 'No reason given'; reasons[r] = (reasons[r] || 0) + 1; } });
      var reasonKeys = Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a]; });
      var feedback = reasonKeys.length
        ? '<ul class="plain">' + reasonKeys.map(function (k) { return '<li>' + esc(k) + ' <strong>' + reasons[k] + '</strong></li>'; }).join('') + '</ul>'
        : '<p class="muted">Rejection reasons will appear here.</p>';

      return '' +
        '<div class="tiles">' + tiles + '</div>' +
        '<div class="progress" role="img" aria-label="' + donePct + ' percent reviewed"><span style="width:' + donePct + '%"></span></div>' +
        '<div class="split split-wide"><div class="split-main">' +
        '<div class="tabs" role="tablist" aria-label="Review queue">' +
        '<button type="button" role="tab" class="tab' + (ui.reviewTab === 'pending' ? ' is-on' : '') + '" aria-selected="' + (ui.reviewTab === 'pending') + '" data-action="review-tab" data-value="pending">Pending (' + pending.length + ')</button>' +
        '<button type="button" role="tab" class="tab' + (ui.reviewTab === 'decided' ? ' is-on' : '') + '" aria-selected="' + (ui.reviewTab === 'decided') + '" data-action="review-tab" data-value="decided">Decided (' + decided.length + ')</button>' +
        '</div>' +
        (ui.reviewTab === 'pending' ? '<p class="note">Lowest-confidence items come first, because those are the ones most likely to need a human call.</p>' : '') +
        '<ul class="queue">' + list + '</ul></div>' +
        '<aside class="card side-card"><h3>Feedback captured</h3>' + feedback +
        '<p class="muted small">Decisions and reasons are stored in this browser and can be exported. This prototype does not retrain anything yet; the export is what a backend would learn from.</p>' +
        '<div class="stack"><button type="button" class="btn btn-primary btn-sm" data-action="export">Export decisions (JSON)</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="reset">Clear all decisions</button></div></aside>' +
        '</div>';
    }
  };
})(window.DP = window.DP || {});
