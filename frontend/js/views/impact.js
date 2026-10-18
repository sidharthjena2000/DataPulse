(function (DP) {
  'use strict';
  var esc = DP.esc;

  function downstreamOf(tableId) {
    var seen = {}, queue = [tableId];
    while (queue.length) {
      var cur = queue.shift();
      DP.data.lineage.forEach(function (e) {
        if (e[0] === cur && !seen[e[1]]) { seen[e[1]] = true; queue.push(e[1]); }
      });
    }
    return Object.keys(seen);
  }

  function graph(sourceId, affected) {
    var D = DP.data, W = 230, NW = 190, NH = 52, GAP = 22, PAD = 16;
    var depth = {};
    function dep(id) {
      if (depth[id] != null) return depth[id];
      var ups = D.lineage.filter(function (e) { return e[1] === id; }).map(function (e) { return e[0]; });
      depth[id] = ups.length ? 1 + Math.max.apply(null, ups.map(dep)) : 0;
      return depth[id];
    }
    D.tables.forEach(function (t) { dep(t.id); });
    var cols = {}, maxDepth = 0;
    D.tables.forEach(function (t) { (cols[depth[t.id]] = cols[depth[t.id]] || []).push(t); maxDepth = Math.max(maxDepth, depth[t.id]); });
    var maxRows = Math.max.apply(null, Object.keys(cols).map(function (k) { return cols[k].length; }));
    var H = PAD * 2 + maxRows * NH + (maxRows - 1) * GAP;
    var width = PAD * 2 + maxDepth * W + NW;
    var pos = {};
    Object.keys(cols).forEach(function (k) {
      var list = cols[k], colH = list.length * NH + (list.length - 1) * GAP, top = (H - colH) / 2;
      list.forEach(function (t, i) { pos[t.id] = { x: PAD + k * W, y: top + i * (NH + GAP) }; });
    });

    var edges = D.lineage.map(function (e) {
      var a = pos[e[0]], b = pos[e[1]];
      var x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      var hot = (e[0] === sourceId || affected.indexOf(e[0]) !== -1) && affected.indexOf(e[1]) !== -1;
      return '<path class="edge' + (hot ? ' edge-hot' : '') + '" d="M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2 + '" marker-end="url(#arrow' + (hot ? '-hot' : '') + ')"/>';
    }).join('');

    var nodes = D.tables.map(function (t) {
      var p = pos[t.id];
      var cls = t.id === sourceId ? 'node node-source' : affected.indexOf(t.id) !== -1 ? 'node node-affected' : 'node';
      var state = t.id === sourceId ? 'Source of failure' : affected.indexOf(t.id) !== -1 ? 'Affected downstream' : 'Not affected';
      return '<g class="' + cls + '" transform="translate(' + p.x + ',' + p.y + ')"><title>' + esc(t.id + ': ' + state) + '</title>' +
        '<rect width="' + NW + '" height="' + NH + '" rx="8"/>' +
        '<text x="14" y="22" class="node-name">' + esc(t.name) + '</text>' +
        '<text x="14" y="40" class="node-sub">' + esc(state) + '</text></g>';
    }).join('');

    return '<svg class="lineage-svg" viewBox="0 0 ' + width + ' ' + H + '" role="img" aria-label="Lineage graph showing the failing table and the tables downstream of it">' +
      '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow"/></marker>' +
      '<marker id="arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow arrow-hot"/></marker></defs>' +
      edges + nodes + '</svg>';
  }

  DP.views.impact = {
    title: 'Impact simulation',
    sub: 'If this field fails, these dashboards and reports break',
    render: function (ui) {
      var D = DP.data;
      var el = D.elementById[ui.impactEl] || D.elements[0];
      var affectedTables = downstreamOf(el.table.id);
      var regs = el.assets.filter(function (a) { return a.regulatory; });

      var groups = ['critical', 'monitored', 'none'].map(function (c) {
        var opts = D.elements.filter(function (e) { return e.classification === c; }).sort(function (a, b) { return b.score - a.score; }).map(function (e) {
          return '<option value="' + esc(e.id) + '"' + (e.id === el.id ? ' selected' : '') + '>' + esc(e.table.name + '.' + e.name) + '</option>';
        }).join('');
        return '<optgroup label="' + esc(DP.CLASS_LABEL[c]) + '">' + opts + '</optgroup>';
      }).join('');

      var assetList = el.assets.length ? el.assets.map(function (a) {
        return '<li class="asset"><div><strong>' + esc(a.name) + '</strong><div class="muted small">' + esc(a.type) + ' &middot; owned by ' + esc(a.owner) + '</div></div>' +
          (a.regulatory ? '<span class="badge badge-reg">Regulatory</span>' : '<span class="badge badge-ops">Operational</span>') + '</li>';
      }).join('') : '<li class="empty">Nothing in the catalog reads this element.</li>';

      return '' +
        '<div class="toolbar"><label class="field field-wide"><span class="field-l">Element that fails</span><select id="impact-el">' + groups + '</select></label>' +
        '<div class="toolbar-right">' + DP.badge(el.classification) + '<button type="button" class="btn btn-ghost btn-sm" data-action="open-el" data-id="' + esc(el.id) + '">Score details</button></div></div>' +
        '<div class="tiles">' +
        '<div class="tile"><span class="tile-n">' + el.assets.length + '</span><span class="tile-l">Assets break</span></div>' +
        '<div class="tile"><span class="tile-n">' + regs.length + '</span><span class="tile-l">Regulatory reports</span></div>' +
        '<div class="tile"><span class="tile-n">' + affectedTables.length + '</span><span class="tile-l">Downstream tables</span></div>' +
        '</div>' +
        '<div class="card"><h2 class="card-h">Lineage</h2>' + graph(el.table.id, affectedTables) +
        '<p class="muted small">Table-level lineage. Tables shaded as affected consume data from the failing table; whether they carry this exact column depends on column-level lineage, which this sample does not include.</p></div>' +
        '<div class="card"><h2 class="card-h">Dashboards, reports and feeds that read ' + esc(el.name) + '</h2><ul class="asset-list">' + assetList + '</ul></div>';
    }
  };
})(window.DP = window.DP || {});
