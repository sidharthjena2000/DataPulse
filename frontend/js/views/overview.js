(function (DP) {
  'use strict';
  var esc = DP.esc;

  DP.views.overview = {
    title: 'Overview',
    sub: 'An AI layer on top of Unity Catalog metadata',
    render: function () {
      var s = DP.stats();

      var steps = [
        { n: 1, title: 'Read', route: 'discover', text: 'Source system (SSTM) details, tables, columns, lineage, tags and usage',
          stat: DP.fmtNum(s.tables) + ' tables, ' + DP.fmtNum(s.columns) + ' columns read' },
        { n: 2, title: 'Recommend', route: 'recommend', text: 'Critical and monitored data elements with a business reason and confidence',
          stat: s.critical + ' critical, ' + s.monitored + ' monitored' },
        { n: 3, title: 'Propose rules', route: 'rules', text: 'Basic to advanced quality rules per element',
          stat: s.rules + ' rules proposed' },
        { n: 4, title: 'Approve', route: 'review', text: 'Governance team reviews, accepts or rejects; feedback improves results',
          stat: s.approved + ' approved, ' + s.rejected + ' rejected, ' + s.pending + ' pending' }
      ];

      var flow = steps.map(function (st) {
        return '<a class="step step-' + (st.n % 2 ? 'navy' : 'teal') + '" href="#/' + st.route + '">' +
          '<h3><span class="step-n">' + st.n + '</span>' + esc(st.title) + '</h3>' +
          '<p>' + esc(st.text) + '</p>' +
          '<p class="step-stat">' + esc(st.stat) + '</p>' +
          '</a>';
      }).join('');

      var extras = [
        { title: 'Criticality score', route: 'recommend', text: 'Transparent score breakdown and confidence per element.', cta: 'See score breakdowns' },
        { title: 'Impact simulation', route: 'impact', text: 'If this field fails, these dashboards and reports break.', cta: 'Simulate a failure' },
        { title: 'Natural-language chat', route: 'ask', text: 'Which fields feed our regulatory report?', cta: 'Ask a question' }
      ].map(function (x) {
        return '<a class="card card-link" href="#/' + x.route + '"><h3>' + esc(x.title) + '</h3><p>' + esc(x.text) + '</p><span class="card-cta">' + esc(x.cta) + ' &rarr;</span></a>';
      }).join('');

      return '' +
        '<section aria-labelledby="flow-h"><h2 id="flow-h" class="section-h">How it works</h2><div class="flow">' + flow + '</div></section>' +

        '<section class="tiers" aria-label="Example rule tiers"><strong>Example rule tiers</strong>' +
        '<span>' + DP.tierBadge('Basic') + ' null, type, range</span>' +
        '<span>' + DP.tierBadge('Intermediate') + ' format, referential, duplicates</span>' +
        '<span>' + DP.tierBadge('Advanced') + ' cross-table reconciliation, drift, business logic</span>' +
        '</section>' +

        '<section aria-labelledby="problem-h"><h2 id="problem-h" class="section-h">The problem today</h2>' +
        '<p class="section-sub">Identifying what data matters is slow, manual and inconsistent.</p>' +
        '<div class="grid-2">' +
        '<div class="card"><h3>Manual discovery</h3><p>CDEs are picked in workshops and spreadsheets, taking weeks or months per domain.</p></div>' +
        '<div class="card"><h3>Subjective decisions</h3><p>Results depend on who is in the room, so criticality differs across teams.</p></div>' +
        '</div></section>' +

        '<section aria-labelledby="ideas-h"><h2 id="ideas-h" class="section-h">Additional ideas</h2>' +
        '<p class="section-sub">Extensions that raise the impact.</p>' +
        '<div class="grid-3">' + extras + '</div></section>';
    }
  };
})(window.DP = window.DP || {});
