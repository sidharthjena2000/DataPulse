(function (DP) {
  'use strict';
  var esc = DP.esc;

  var SUGGESTIONS = [
    'Which fields feed our regulatory report?',
    'What breaks if claim_amount fails?',
    'Which elements contain PII?',
    'Which elements are critical?',
    'What rules exist for premium_amount?'
  ];

  function chips(ids, max) {
    var D = DP.data;
    max = max || 20;
    var shown = ids.slice(0, max).map(function (id) {
      var e = D.elementById[id];
      return '<button type="button" class="chip" data-action="open-el" data-id="' + esc(id) + '">' + esc(e.table.name + '.' + e.name) + '</button>';
    }).join('');
    return '<div class="chips">' + shown + (ids.length > max ? '<span class="muted small">and ' + (ids.length - max) + ' more</span>' : '') + '</div>';
  }

  function unique(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }

  function findAsset(s) {
    var keys = [['solvency', 'a1'], ['ifrs', 'a2'], ['gdpr', 'a3'], ['settlement', 'a4'], ['provider network', 'a5'], ['scorecard', 'a5'], ['member 360', 'a6'], ['premium collection', 'a7'], ['fraud', 'a8']];
    for (var i = 0; i < keys.length; i++) if (s.indexOf(keys[i][0]) !== -1) return DP.data.assets.filter(function (a) { return a.id === keys[i][1]; })[0];
    return null;
  }

  function findElement(s) {
    var hits = DP.data.elements.filter(function (e) {
      return s.indexOf(e.name) !== -1 || s.indexOf(e.name.replace(/_/g, ' ')) !== -1;
    });
    if (!hits.length) return null;
    var longest = Math.max.apply(null, hits.map(function (e) { return e.name.length; }));
    hits = hits.filter(function (e) { return e.name.length === longest; });
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits[0];
  }

  /* Rule-based answers over the sample metadata. Not a live language model. */
  function answer(q) {
    var D = DP.data, s = q.toLowerCase();
    var asset = findAsset(s), el = findElement(s);

    if (asset && /feed|field|column|element|use|read|depend/.test(s)) {
      var ids = asset.uses.filter(function (id) { return D.elementById[id]; });
      return '<p><strong>' + esc(asset.name) + '</strong> reads ' + ids.length + ' elements. ' + (asset.regulatory ? 'It is a regulatory report.' : '') + '</p>' + chips(ids);
    }
    if (/regulat/.test(s)) {
      var regAssets = D.assets.filter(function (a) { return a.regulatory; });
      var all = unique([].concat.apply([], regAssets.map(function (a) { return a.uses; })));
      var sorted = all.sort(function (a, b) { return D.elementById[b].score - D.elementById[a].score; });
      return '<p>' + sorted.length + ' elements feed the ' + regAssets.length + ' regulatory reports (' + regAssets.map(function (a) { return esc(a.name); }).join(', ') + '). Highest criticality first:</p>' + chips(sorted);
    }
    if (el && /break|fail|impact|affect|depend/.test(s)) {
      var names = el.assets.map(function (a) { return esc(a.name) + (a.regulatory ? ' (regulatory)' : ''); });
      return '<p>If <strong>' + esc(el.table.id + '.' + el.name) + '</strong> fails, ' + (names.length ? names.length + (names.length === 1 ? ' asset is' : ' assets are') + ' affected: ' + names.join(', ') + '.' : 'no downstream assets read it.') +
        ' <a href="#/impact?el=' + encodeURIComponent(el.id) + '">Open the impact simulation</a>.</p>';
    }
    if (el && /rule/.test(s)) {
      if (!el.rules.length) return '<p><strong>' + esc(el.name) + '</strong> is not selected as a critical or monitored element, so no rules are proposed.</p>';
      var byTier = ['Basic', 'Intermediate', 'Advanced'].map(function (t) { return el.rules.filter(function (r) { return r.tier === t; }).length + ' ' + t.toLowerCase(); }).join(', ');
      return '<p>' + el.rules.length + ' rules are proposed for <strong>' + esc(el.table.id + '.' + el.name) + '</strong> (' + byTier + '). <a href="#/rules?el=' + encodeURIComponent(el.id) + '">Review them</a>.</p>';
    }
    if (/pii|personal|sensitive|privacy/.test(s)) {
      var pii = D.elements.filter(function (e) { return e.tags.indexOf('PII') !== -1; }).map(function (e) { return e.id; });
      return '<p>' + pii.length + ' elements are tagged PII in Unity Catalog:</p>' + chips(pii);
    }
    if (/critical|cde/.test(s)) {
      var crit = D.elements.filter(function (e) { return e.classification === 'critical'; }).sort(function (a, b) { return b.score - a.score; }).map(function (e) { return e.id; });
      return '<p>' + crit.length + ' elements are classed as critical (score ' + D.thresholds.critical + ' or above):</p>' + chips(crit);
    }
    if (/monitor/.test(s)) {
      var mon = D.elements.filter(function (e) { return e.classification === 'monitored'; }).sort(function (a, b) { return b.score - a.score; }).map(function (e) { return e.id; });
      return '<p>' + mon.length + ' elements are classed as monitored:</p>' + chips(mon);
    }
    if (/pending|review|approv|reject/.test(s)) {
      var st = DP.stats();
      return '<p>' + st.approved + ' approved, ' + st.rejected + ' rejected and ' + st.pending + ' pending out of ' + st.total + ' items. <a href="#/review">Open the review queue</a>.</p>';
    }
    if (el) {
      return '<p><strong>' + esc(el.table.id + '.' + el.name) + '</strong> is ' + esc(DP.CLASS_LABEL[el.classification].toLowerCase()) + ' with a score of ' + el.score + ' and ' + DP.pct(el.confidence) + ' confidence. ' + esc(el.reason) + '</p>' + chips([el.id]);
    }
    return '<p>I can answer questions about the sample catalog: which fields feed a report, what breaks if a field fails, which elements are critical or PII, and what rules exist for an element. Try one of the suggestions.</p>';
  }

  DP.views.ask = {
    title: 'Ask DataPulse',
    sub: 'Natural-language questions about your data elements',
    answer: answer,
    render: function (ui) {
      if (!ui.chat) ui.chat = [{ role: 'assistant', html: '<p>Ask me about the sample catalog. I match your question against the scored metadata, so name a report, an element or a topic like regulatory, PII or critical.</p>' }];
      var msgs = ui.chat.map(function (m) {
        return '<div class="msg msg-' + m.role + '"><div class="bubble">' + (m.role === 'user' ? '<p>' + esc(m.text) + '</p>' : m.html) + '</div></div>';
      }).join('');
      var sugg = SUGGESTIONS.map(function (q) {
        return '<button type="button" class="chip chip-ask" data-action="ask" data-q="' + esc(q) + '">' + esc(q) + '</button>';
      }).join('');
      return '<p class="note">Demo mode: answers come from simple matching over the sample metadata, not from a live language model.</p>' +
        '<div class="chat card"><div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-label="Conversation">' + msgs + '</div>' +
        '<div class="chat-suggest">' + sugg + '</div>' +
        '<form class="chat-form" id="chat-form" autocomplete="off"><label class="sr-only" for="chat-input">Your question</label>' +
        '<input type="text" id="chat-input" placeholder="Which fields feed our regulatory report?" maxlength="200">' +
        '<button type="submit" class="btn btn-primary">Ask</button></form></div>';
    }
  };
})(window.DP = window.DP || {});
