(function (DP) {
  'use strict';
  var esc = DP.esc;

  function tableChips(ids, prefix) {
    if (!ids.length) return '<span class="muted">None</span>';
    return ids.map(function (id) {
      return '<button type="button" class="chip" data-action="pick-table" data-id="' + esc(id) + '">' + esc(id) + '</button>';
    }).join('');
  }

  DP.views.discover = {
    title: 'Read',
    sub: 'Tables, columns, lineage, tags and usage read from Unity Catalog',
    render: function (ui) {
      var D = DP.data;
      var t = D.tableById[ui.table] || D.tables[0];

      var list = D.tables.map(function (x) {
        var sel = x.id === t.id;
        return '<li><button type="button" class="tbl-btn' + (sel ? ' is-selected' : '') + '" data-action="pick-table" data-id="' + esc(x.id) + '"' + (sel ? ' aria-current="true"' : '') + '>' +
          '<span class="tbl-name">' + esc(x.name) + '</span>' +
          '<span class="tbl-meta">' + esc(x.schema) + ' &middot; ' + x.columns.length + ' columns</span></button></li>';
      }).join('');

      var up = D.lineage.filter(function (e) { return e[1] === t.id; }).map(function (e) { return e[0]; });
      var down = D.lineage.filter(function (e) { return e[0] === t.id; }).map(function (e) { return e[1]; });

      var rows = t.columns.map(function (c) {
        var el = D.elementById[t.id + '.' + c.n];
        var tags = c.tags.length ? c.tags.map(function (g) { return '<span class="tag">' + esc(g) + '</span>'; }).join('') : '<span class="muted">No tags</span>';
        return '<tr>' +
          '<td data-label="Column"><button type="button" class="link-btn" data-action="open-el" data-id="' + esc(el.id) + '">' + esc(c.n) + '</button><div class="muted small">' + esc(c.t) + '</div></td>' +
          '<td data-label="Tags">' + tags + '</td>' +
          '<td class="num" data-label="Null %">' + c.nullPct + '%</td>' +
          '<td class="num" data-label="Reads (30d)">' + DP.fmtNum(c.reads) + '</td>' +
          '<td class="num" data-label="Flows to">' + c.fanout + ' ' + (c.fanout === 1 ? 'table' : 'tables') + '</td>' +
          '<td data-label="Recommendation">' + DP.badge(el.classification) + '</td>' +
          '</tr>';
      }).join('');

      return '' +
        '<div class="split">' +
        '<nav class="tbl-list" aria-label="Tables"><h2 class="side-h">' + esc(D.catalog) + '</h2><ul>' + list + '</ul></nav>' +
        '<div class="split-main">' +
        '<div class="card">' +
        '<h2 class="card-h">' + esc(D.catalog + '.' + t.id) + '</h2>' +
        '<p>' + esc(t.description) + '</p>' +
        '<dl class="facts">' +
        '<div><dt>Domain</dt><dd>' + esc(t.domain) + '</dd></div>' +
        '<div><dt>Owner</dt><dd>' + esc(t.owner) + '</dd></div>' +
        '<div><dt>Rows</dt><dd>' + DP.fmtNum(t.rows) + '</dd></div>' +
        '<div><dt>Queries (30d)</dt><dd>' + DP.fmtNum(t.queries30d) + '</dd></div>' +
        '</dl>' +
        '<div class="lineage-row"><span class="lineage-label">Upstream</span>' + tableChips(up) + '</div>' +
        '<div class="lineage-row"><span class="lineage-label">Downstream</span>' + tableChips(down) + '</div>' +
        '</div>' +
        '<div class="table-wrap"><table class="data responsive"><thead><tr>' +
        '<th scope="col">Column</th><th scope="col">Tags</th><th scope="col" class="num">Null %</th><th scope="col" class="num">Reads (30d)</th><th scope="col" class="num">Flows to</th><th scope="col">Recommendation</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '</div></div>';
    }
  };
})(window.DP = window.DP || {});
