/*
 * DataPulse sample data and recommendation logic.
 *
 * Everything here is SAMPLE metadata that mimics what a Databricks Unity Catalog
 * scan would return (tables, columns, tags, lineage, usage). The scoring below is
 * deterministic and transparent so the UI can show exactly why an element was
 * recommended. A real backend would replace DP.data with an API response of the
 * same shape.
 */
(function (DP) {
  'use strict';

  var CATALOG = 'gbs_health_prod';

  // ---- Source metadata (what "Read" returns) -------------------------------

  var tables = [
    {
      id: 'claims.claim_header', schema: 'claims', name: 'claim_header',
      domain: 'Claims', owner: 'Claims Data Engineering', rows: 48200000, queries30d: 4820,
      timeCol: 'claim_received_date',
      description: 'One row per submitted health claim.',
      columns: [
        { n: 'claim_id', t: 'string', kind: 'id', tags: ['Key'], nullPct: 0, reads: 3900, fanout: 3 },
        { n: 'policy_id', t: 'string', kind: 'fk', tags: ['Key'], nullPct: 0, reads: 3100, fanout: 3, parent: 'policy.policy_master.policy_id' },
        { n: 'member_id', t: 'string', kind: 'fk', tags: ['Key'], nullPct: 0.1, reads: 2700, fanout: 2, parent: 'member.member_profile.member_id' },
        { n: 'provider_id', t: 'string', kind: 'fk', tags: ['Key'], nullPct: 0.4, reads: 2200, fanout: 2, parent: 'provider.provider_master.provider_id' },
        { n: 'claim_status', t: 'string', kind: 'status', tags: [], nullPct: 0, reads: 3600, fanout: 1, domainValues: ['RECEIVED', 'ASSESSED', 'APPROVED', 'PAID', 'REJECTED'] },
        { n: 'claim_received_date', t: 'date', kind: 'date', tags: [], nullPct: 0, reads: 3300, fanout: 1, fresh: true },
        {
          n: 'claim_paid_date', t: 'date', kind: 'date', tags: [], nullPct: 12.5, reads: 2100, fanout: 1,
          logic: { name: 'Paid date not before received date', desc: 'A claim cannot be paid before it was received.', sql: 'claim_paid_date < claim_received_date' }
        },
        {
          n: 'claim_amount', t: 'decimal(12,2)', kind: 'amount', tags: ['Financial'], nullPct: 0.2, reads: 4400, fanout: 3,
          recon: { name: 'Header total equals sum of claim lines', desc: 'Reconciles the claimed amount to the line-level amounts for the same claim.',
            sql: 'SELECT h.claim_id, h.claim_amount, SUM(l.line_amount) AS lines_total\nFROM {fq} h\nJOIN gbs_health_prod.claims.claim_line l ON l.claim_id = h.claim_id\nGROUP BY h.claim_id, h.claim_amount\nHAVING ABS(h.claim_amount - SUM(l.line_amount)) > 0.01' }
        },
        { n: 'currency_code', t: 'string', kind: 'code', tags: [], nullPct: 0, reads: 300, fanout: 0, fmt: '^[A-Z]{3}$' },
        { n: 'internal_batch_ref', t: 'string', kind: 'text', tags: [], nullPct: 31, reads: 40, fanout: 0 }
      ]
    },
    {
      id: 'claims.claim_line', schema: 'claims', name: 'claim_line',
      domain: 'Claims', owner: 'Claims Data Engineering', rows: 171000000, queries30d: 1950,
      timeCol: 'service_date',
      description: 'One row per treatment or service line within a claim.',
      columns: [
        { n: 'line_id', t: 'string', kind: 'id', tags: ['Key'], nullPct: 0, reads: 900, fanout: 0 },
        { n: 'claim_id', t: 'string', kind: 'fk', tags: ['Key'], nullPct: 0, reads: 1800, fanout: 1, parent: 'claims.claim_header.claim_id' },
        { n: 'procedure_code', t: 'string', kind: 'code', tags: [], nullPct: 0.6, reads: 1500, fanout: 1, fmt: '^[A-Z0-9]{4,7}$' },
        { n: 'service_date', t: 'date', kind: 'date', tags: [], nullPct: 0.2, reads: 1300, fanout: 1, fresh: true },
        { n: 'line_amount', t: 'decimal(12,2)', kind: 'amount', tags: ['Financial'], nullPct: 0.1, reads: 1700, fanout: 2 },
        {
          n: 'approved_amount', t: 'decimal(12,2)', kind: 'amount', tags: ['Financial'], nullPct: 4.8, reads: 1600, fanout: 2,
          logic: { name: 'Approved amount within claimed amount', desc: 'The approved amount should never exceed the amount claimed on the line.', sql: 'approved_amount > line_amount' }
        },
        { n: 'reviewer_notes', t: 'string', kind: 'text', tags: [], nullPct: 62, reads: 25, fanout: 0 }
      ]
    },
    {
      id: 'policy.policy_master', schema: 'policy', name: 'policy_master',
      domain: 'Policy', owner: 'Policy Data Products', rows: 6400000, queries30d: 3900,
      timeCol: 'policy_start_date',
      description: 'One row per policy with product, term and premium.',
      columns: [
        {
          n: 'policy_id', t: 'string', kind: 'id', tags: ['Key'], nullPct: 0, reads: 3800, fanout: 4,
          logic: { name: 'Active policy has premium ledger entries', desc: 'Every active policy should have at least one posted premium in the finance ledger.',
            sql: 'SELECT p.policy_id\nFROM {fq} p\nLEFT ANTI JOIN gbs_health_prod.finance.premium_ledger l ON l.policy_id = p.policy_id\nWHERE p.policy_status = \'ACTIVE\'' }
        },
        { n: 'product_code', t: 'string', kind: 'code', tags: [], nullPct: 0, reads: 1200, fanout: 1, fmt: '^[A-Z]{2}-[0-9]{3}$' },
        {
          n: 'policy_start_date', t: 'date', kind: 'date', tags: [], nullPct: 0, reads: 2600, fanout: 2,
          logic: { name: 'Claims fall on or after policy start', desc: 'A claim should not be received before the policy it is made against started.',
            sql: 'SELECT h.claim_id, h.claim_received_date, p.policy_start_date\nFROM gbs_health_prod.claims.claim_header h\nJOIN {fq} p ON p.policy_id = h.policy_id\nWHERE h.claim_received_date < p.policy_start_date' }
        },
        {
          n: 'policy_end_date', t: 'date', kind: 'date', tags: [], nullPct: 8, reads: 1900, fanout: 1,
          logic: { name: 'End date after start date', desc: 'A policy term must end after it starts.', sql: 'policy_end_date <= policy_start_date' }
        },
        {
          n: 'premium_amount', t: 'decimal(12,2)', kind: 'amount', tags: ['Financial'], nullPct: 0, reads: 2900, fanout: 2,
          recon: { name: 'Annual premium agrees to posted ledger premium', desc: 'Compares the policy premium to premiums posted for the policy in the finance ledger.',
            sql: 'SELECT p.policy_id, p.premium_amount, SUM(l.premium_amount) AS ledger_total\nFROM {fq} p\nJOIN gbs_health_prod.finance.premium_ledger l ON l.policy_id = p.policy_id\nWHERE l.ledger_status = \'POSTED\'\nGROUP BY p.policy_id, p.premium_amount\nHAVING ABS(p.premium_amount - SUM(l.premium_amount)) > 0.01' }
        },
        { n: 'policy_status', t: 'string', kind: 'status', tags: [], nullPct: 0, reads: 2400, fanout: 1, domainValues: ['QUOTED', 'ACTIVE', 'LAPSED', 'CANCELLED'] },
        { n: 'sales_channel_note', t: 'string', kind: 'text', tags: [], nullPct: 44, reads: 60, fanout: 0 }
      ]
    },
    {
      id: 'member.member_profile', schema: 'member', name: 'member_profile',
      domain: 'Member', owner: 'Member Data Products', rows: 5100000, queries30d: 3500,
      timeCol: null,
      description: 'One row per insured member with contact and consent details.',
      columns: [
        {
          n: 'member_id', t: 'string', kind: 'id', tags: ['Key'], nullPct: 0, reads: 3400, fanout: 3,
          logic: { name: 'Closed members have no open claims', desc: 'Members marked CLOSED should not have claims still being processed.',
            sql: 'SELECT m.member_id, h.claim_id\nFROM {fq} m\nJOIN gbs_health_prod.claims.claim_header h ON h.member_id = m.member_id\nWHERE m.member_status = \'CLOSED\' AND h.claim_status IN (\'RECEIVED\', \'ASSESSED\')' }
        },
        { n: 'date_of_birth', t: 'date', kind: 'date', tags: ['PII'], nullPct: 0.1, reads: 1500, fanout: 2, noFuture: true },
        { n: 'postcode', t: 'string', kind: 'code', tags: ['PII'], nullPct: 2.3, reads: 1100, fanout: 1, fmt: '^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$' },
        { n: 'email', t: 'string', kind: 'code', tags: ['PII'], nullPct: 9.5, reads: 900, fanout: 1, fmt: '^[^@ ]+@[^@ ]+[.][^@ ]+$' },
        { n: 'member_status', t: 'string', kind: 'status', tags: [], nullPct: 0, reads: 1800, fanout: 1, domainValues: ['ACTIVE', 'SUSPENDED', 'CLOSED'] },
        {
          n: 'marketing_consent', t: 'boolean', kind: 'bool', tags: ['Consent'], nullPct: 0, reads: 700, fanout: 1,
          logic: { name: 'No marketing consent on closed members', desc: 'Closed members should not carry active marketing consent.', sql: 'marketing_consent = TRUE AND member_status = \'CLOSED\'' },
          extra: [{ tier: 'Intermediate', name: 'Consent populated for active members', desc: 'Active members must have an explicit consent value.', sql: "member_status = 'ACTIVE' AND marketing_consent IS NULL" }]
        }
      ]
    },
    {
      id: 'finance.premium_ledger', schema: 'finance', name: 'premium_ledger',
      domain: 'Finance', owner: 'Finance Data Engineering', rows: 92000000, queries30d: 2600,
      timeCol: 'posting_date',
      description: 'Premium postings per policy, including taxes and reversals.',
      columns: [
        { n: 'ledger_id', t: 'string', kind: 'id', tags: ['Key'], nullPct: 0, reads: 1400, fanout: 0 },
        { n: 'policy_id', t: 'string', kind: 'fk', tags: ['Key'], nullPct: 0, reads: 2100, fanout: 2, parent: 'policy.policy_master.policy_id' },
        { n: 'posting_date', t: 'date', kind: 'date', tags: [], nullPct: 0, reads: 1900, fanout: 1, fresh: true },
        {
          n: 'premium_amount', t: 'decimal(12,2)', kind: 'amount', tags: ['Financial'], nullPct: 0, reads: 2500, fanout: 3,
          recon: { name: 'Ledger premium agrees to policy premium', desc: 'Posted premiums per policy should reconcile to the premium held on the policy.',
            sql: 'SELECT l.policy_id, SUM(l.premium_amount) AS ledger_total, MAX(p.premium_amount) AS policy_premium\nFROM {fq} l\nJOIN gbs_health_prod.policy.policy_master p ON p.policy_id = l.policy_id\nWHERE l.ledger_status = \'POSTED\'\nGROUP BY l.policy_id\nHAVING ABS(SUM(l.premium_amount) - MAX(p.premium_amount)) > 0.01' }
        },
        {
          n: 'tax_amount', t: 'decimal(12,2)', kind: 'amount', tags: ['Financial'], nullPct: 1.9, reads: 1200, fanout: 2,
          logic: { name: 'Tax not larger than premium', desc: 'Tax on a posting should not exceed the premium it relates to.', sql: 'tax_amount > premium_amount' }
        },
        { n: 'ledger_status', t: 'string', kind: 'status', tags: [], nullPct: 0, reads: 800, fanout: 0, domainValues: ['POSTED', 'REVERSED', 'PENDING'] }
      ]
    },
    {
      id: 'provider.provider_master', schema: 'provider', name: 'provider_master',
      domain: 'Provider', owner: 'Provider Data Products', rows: 310000, queries30d: 2150,
      timeCol: null,
      description: 'Registered treatment providers and network status.',
      columns: [
        { n: 'provider_id', t: 'string', kind: 'id', tags: ['Key'], nullPct: 0, reads: 2000, fanout: 2 },
        { n: 'provider_name', t: 'string', kind: 'text', tags: [], nullPct: 0.3, reads: 900, fanout: 1 },
        { n: 'network_status', t: 'string', kind: 'status', tags: [], nullPct: 0, reads: 1000, fanout: 1, domainValues: ['IN_NETWORK', 'OUT_OF_NETWORK', 'SUSPENDED'] },
        { n: 'registration_number', t: 'string', kind: 'code', tags: ['Regulatory'], nullPct: 3.1, reads: 300, fanout: 0, fmt: '^[0-9]{6,8}$' }
      ]
    }
  ];

  // Table-level lineage edges: [upstream, downstream]
  var lineage = [
    ['policy.policy_master', 'claims.claim_header'],
    ['member.member_profile', 'claims.claim_header'],
    ['provider.provider_master', 'claims.claim_header'],
    ['claims.claim_header', 'claims.claim_line'],
    ['policy.policy_master', 'finance.premium_ledger']
  ];

  // Downstream dashboards, reports and feeds, with the elements they read.
  var assets = [
    {
      id: 'a1', name: 'Solvency II QRT Pack', type: 'Regulatory report', regulatory: true, owner: 'Finance Reporting',
      uses: ['claims.claim_header.claim_amount', 'claims.claim_header.claim_paid_date', 'finance.premium_ledger.premium_amount',
        'policy.policy_master.policy_id', 'policy.policy_master.policy_start_date', 'policy.policy_master.policy_end_date', 'policy.policy_master.premium_amount']
    },
    {
      id: 'a2', name: 'IFRS 17 Contract Reporting', type: 'Regulatory report', regulatory: true, owner: 'Finance Reporting',
      uses: ['finance.premium_ledger.premium_amount', 'finance.premium_ledger.tax_amount', 'finance.premium_ledger.posting_date', 'finance.premium_ledger.policy_id',
        'policy.policy_master.policy_id', 'policy.policy_master.policy_start_date', 'policy.policy_master.policy_end_date', 'policy.policy_master.premium_amount',
        'claims.claim_header.claim_amount']
    },
    {
      id: 'a3', name: 'GDPR Data Subject Register', type: 'Regulatory report', regulatory: true, owner: 'Data Protection Office',
      uses: ['member.member_profile.member_id', 'member.member_profile.date_of_birth', 'member.member_profile.postcode', 'member.member_profile.email', 'member.member_profile.marketing_consent']
    },
    {
      id: 'a4', name: 'Claims Settlement Dashboard', type: 'Power BI dashboard', regulatory: false, owner: 'Claims Operations',
      uses: ['claims.claim_header.claim_id', 'claims.claim_header.claim_status', 'claims.claim_header.claim_received_date', 'claims.claim_header.claim_paid_date',
        'claims.claim_header.claim_amount', 'claims.claim_header.policy_id']
    },
    {
      id: 'a5', name: 'Provider Network Scorecard', type: 'Power BI dashboard', regulatory: false, owner: 'Provider Management',
      uses: ['claims.claim_header.provider_id', 'provider.provider_master.provider_id', 'provider.provider_master.network_status',
        'claims.claim_line.line_amount', 'claims.claim_line.approved_amount', 'claims.claim_line.claim_id']
    },
    {
      id: 'a6', name: 'Member 360 View', type: 'Power BI dashboard', regulatory: false, owner: 'Customer Insight',
      uses: ['member.member_profile.member_id', 'member.member_profile.member_status', 'claims.claim_header.member_id', 'policy.policy_master.policy_id', 'policy.policy_master.policy_status']
    },
    {
      id: 'a7', name: 'Premium Collection Dashboard', type: 'Power BI dashboard', regulatory: false, owner: 'Finance Operations',
      uses: ['finance.premium_ledger.premium_amount', 'finance.premium_ledger.posting_date', 'finance.premium_ledger.ledger_status', 'finance.premium_ledger.policy_id']
    },
    {
      id: 'a8', name: 'Fraud Triage Model Feed', type: 'Data feed', regulatory: false, owner: 'Claims Analytics',
      uses: ['claims.claim_header.claim_id', 'claims.claim_header.claim_amount', 'claims.claim_header.claim_status', 'claims.claim_header.provider_id',
        'claims.claim_line.procedure_code', 'claims.claim_line.service_date', 'claims.claim_line.line_amount']
    }
  ];

  // ---- Scoring (what "Recommend" returns) ----------------------------------

  var WEIGHTS = [
    { key: 'regulatory', label: 'Regulatory reporting', weight: 0.30, hint: 'Used by regulatory reports (50 points each, capped at 100)' },
    { key: 'downstream', label: 'Downstream dependencies', weight: 0.25, hint: 'Dashboards, reports and feeds that read it (25 points each)' },
    { key: 'usage', label: 'Usage', weight: 0.15, hint: 'Reads in the last 30 days, scaled so 4,000 reads scores 100' },
    { key: 'sensitivity', label: 'Sensitivity', weight: 0.15, hint: 'Unity Catalog tags: PII or Financial 70 to 90, Key 55, none 10' },
    { key: 'lineage', label: 'Lineage reach', weight: 0.15, hint: 'Number of tables it propagates to (25 points each)' }
  ];

  // Classification thresholds on the 0-100 criticality score.
  var THRESHOLDS = { critical: 60, monitored: 35 };

  var TAG_SENSITIVITY = { PII: 90, Financial: 70, Consent: 70, Regulatory: 60, Key: 55 };

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function sensitivityOf(tags) {
    var best = 10;
    tags.forEach(function (t) { best = Math.max(best, TAG_SENSITIVITY[t] || 0); });
    return best;
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function reasonFor(el) {
    var parts = [];
    if (el.regCount > 0) parts.push('feeds ' + plural(el.regCount, 'regulatory report', 'regulatory reports'));
    if (el.assetCount > el.regCount) parts.push(plural(el.assetCount - el.regCount, 'other downstream asset depends', 'other downstream assets depend') + ' on it');
    if (el.tags.length) parts.push('tagged ' + el.tags.join(', '));
    if (el.lineageFanout >= 2) parts.push('propagates to ' + el.lineageFanout + ' tables');
    if (el.reads >= 2000) parts.push('read ' + el.reads.toLocaleString('en-GB') + ' times in 30 days');
    if (!parts.length) return 'Low usage and no downstream dependencies found in the catalog metadata.';
    var s = parts.slice(0, 3).join('; ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  var elements = [];
  var byId = {};

  tables.forEach(function (t) {
    t.fq = CATALOG + '.' + t.id;
    t.columns.forEach(function (c) {
      var id = t.id + '.' + c.n;
      var used = assets.filter(function (a) { return a.uses.indexOf(id) !== -1; });
      var regCount = used.filter(function (a) { return a.regulatory; }).length;
      var factors = {
        regulatory: clamp(regCount * 50, 0, 100),
        downstream: clamp(used.length * 25, 0, 100),
        usage: clamp(Math.round(c.reads / 40), 0, 100),
        sensitivity: sensitivityOf(c.tags),
        lineage: clamp(c.fanout * 25, 0, 100)
      };
      var breakdown = WEIGHTS.map(function (w) {
        return { key: w.key, label: w.label, hint: w.hint, weight: w.weight, value: factors[w.key], points: factors[w.key] * w.weight };
      });
      var score = Math.round(breakdown.reduce(function (s, b) { return s + b.points; }, 0));
      var cls = score >= THRESHOLDS.critical ? 'critical' : score >= THRESHOLDS.monitored ? 'monitored' : 'none';
      var dist = Math.min(Math.abs(score - THRESHOLDS.critical), Math.abs(score - THRESHOLDS.monitored));
      var signals = breakdown.filter(function (b) { return b.value >= 30; }).length;
      var confidence = clamp(0.6 + 0.35 * Math.min(1, dist / 30) + (signals >= 3 ? 0.02 : 0), 0, 0.97);

      var el = {
        id: id, table: t, col: c, name: c.n, type: c.t, tags: c.tags.slice(),
        reads: c.reads, nullPct: c.nullPct, lineageFanout: c.fanout,
        assets: used, assetCount: used.length, regCount: regCount,
        breakdown: breakdown, score: score, classification: cls,
        confidence: Math.round(confidence * 100) / 100
      };
      el.reason = reasonFor(el);
      elements.push(el);
      byId[id] = el;
    });
  });

  // ---- Rule proposals (what "Propose rules" returns) ------------------------

  function fill(sql, el) { return sql.replace(/\{fq\}/g, el.table.fq); }

  function rulesFor(el) {
    var c = el.col, t = el.table, fq = t.fq, col = c.n;
    var out = [];
    function add(tier, name, desc, sql) {
      out.push({ id: el.id + '#' + (out.length + 1), elementId: el.id, tier: tier, name: name, desc: desc, sql: sql });
    }
    var isKey = c.kind === 'id' || c.kind === 'fk';

    // Basic
    var maxNull = isKey ? 0 : Math.ceil(c.nullPct * 1.25 + 0.5);
    add('Basic', isKey ? 'Key is never null' : 'Null rate within expected limit',
      isKey ? 'Keys must always be populated.' : 'Null rate should stay at or below ' + maxNull + '%, based on the profiled rate of ' + c.nullPct + '%.',
      'SELECT 100.0 * COUNT_IF(' + col + ' IS NULL) / COUNT(*) AS null_pct\nFROM ' + fq + '\nHAVING 100.0 * COUNT_IF(' + col + ' IS NULL) / COUNT(*) > ' + maxNull);
    if (c.kind === 'amount') {
      add('Basic', 'Amount is not negative', 'Monetary amounts should not be below zero.', 'SELECT * FROM ' + fq + '\nWHERE ' + col + ' < 0');
    } else if (c.kind === 'date') {
      add('Basic', 'Date is not in the future', 'Event dates should not be later than today.', 'SELECT * FROM ' + fq + '\nWHERE ' + col + ' > CURRENT_DATE()');
    } else if (c.kind === 'bool') {
      add('Basic', 'Value is true or false', 'Flag columns must only hold boolean values.', 'SELECT * FROM ' + fq + '\nWHERE ' + col + ' IS NOT NULL AND ' + col + ' NOT IN (TRUE, FALSE)');
    } else {
      add('Basic', 'Value conforms to column type', 'Values must cast cleanly to ' + c.t + '.',
        'SELECT * FROM ' + fq + '\nWHERE ' + col + ' IS NOT NULL AND TRY_CAST(' + col + ' AS ' + c.t.toUpperCase() + ') IS NULL');
    }

    // Intermediate
    if (c.kind === 'id') {
      add('Intermediate', 'Key is unique', 'No two rows may share the same ' + col + '.',
        'SELECT ' + col + ', COUNT(*) AS n\nFROM ' + fq + '\nGROUP BY ' + col + '\nHAVING COUNT(*) > 1');
    }
    if (c.kind === 'fk' && c.parent) {
      var pp = c.parent.split('.'), pCol = pp.pop(), pTable = CATALOG + '.' + pp.join('.');
      add('Intermediate', 'Referential integrity to ' + pp.join('.'), 'Every value must exist in the parent table.',
        'SELECT c.' + col + '\nFROM ' + fq + ' c\nLEFT ANTI JOIN ' + pTable + ' p ON c.' + col + ' = p.' + pCol);
    }
    if (c.fmt) {
      add('Intermediate', 'Format matches expected pattern', 'Values must match the pattern ' + c.fmt,
        "SELECT * FROM " + fq + "\nWHERE " + col + " IS NOT NULL AND NOT " + col + " RLIKE '" + c.fmt + "'");
    }
    if (c.domainValues) {
      add('Intermediate', 'Value is in allowed list', 'Only these values are valid: ' + c.domainValues.join(', ') + '.',
        'SELECT * FROM ' + fq + '\nWHERE ' + col + " IS NOT NULL AND " + col + " NOT IN (" + c.domainValues.map(function (v) { return "'" + v + "'"; }).join(', ') + ')');
    }
    if (c.kind === 'amount') {
      add('Intermediate', 'No extreme outliers', 'Flags values far above the 99.9th percentile.',
        'SELECT * FROM ' + fq + '\nWHERE ' + col + ' > (SELECT PERCENTILE(' + col + ', 0.999) * 3 FROM ' + fq + ')');
    }
    if (c.kind === 'date' && c.fresh) {
      add('Intermediate', 'Data is fresh', 'The latest ' + col + ' should be no more than 2 days old.',
        'SELECT MAX(' + col + ') AS latest\nFROM ' + fq + '\nHAVING MAX(' + col + ') < DATE_SUB(CURRENT_DATE(), 2)');
    } else if (c.kind === 'date' && !c.noFuture) {
      add('Intermediate', 'Date within plausible window', 'Dates before 2000 are treated as defaults or errors.', 'SELECT * FROM ' + fq + "\nWHERE " + col + " < DATE '2000-01-01'");
    } else if (c.kind === 'date') {
      add('Intermediate', 'Age within plausible range', 'Members should be between 0 and 120 years old.',
        'SELECT * FROM ' + fq + '\nWHERE ' + col + ' < DATE_SUB(CURRENT_DATE(), 120 * 365) OR ' + col + ' > CURRENT_DATE()');
    }
    (c.extra || []).forEach(function (x) { add(x.tier, x.name, x.desc, 'SELECT * FROM ' + fq + '\nWHERE ' + x.sql); });

    // Advanced (critical elements only)
    if (el.classification === 'critical') {
      if (c.recon) add('Advanced', c.recon.name, c.recon.desc, fill(c.recon.sql, el));
      if (c.logic) {
        add('Advanced', c.logic.name, c.logic.desc,
          /^SELECT/i.test(c.logic.sql) ? fill(c.logic.sql, el) : 'SELECT * FROM ' + fq + '\nWHERE ' + c.logic.sql);
      }
      if (c.kind === 'amount' && t.timeCol) {
        add('Advanced', 'Distribution drift against 90-day baseline',
          'Alerts when the last 7 days move more than 3 standard deviations from the prior 90 days.',
          'WITH cur AS (\n  SELECT AVG(' + col + ') AS m FROM ' + fq + '\n  WHERE ' + t.timeCol + ' >= DATE_SUB(CURRENT_DATE(), 7)\n), base AS (\n  SELECT AVG(' + col + ') AS m, STDDEV(' + col + ') AS s FROM ' + fq +
          '\n  WHERE ' + t.timeCol + ' BETWEEN DATE_SUB(CURRENT_DATE(), 97) AND DATE_SUB(CURRENT_DATE(), 7)\n)\nSELECT ABS(cur.m - base.m) / base.s AS z\nFROM cur, base\nHAVING ABS(cur.m - base.m) / base.s > 3');
      }
    }
    return out;
  }

  var rules = [];
  elements.forEach(function (el) {
    if (el.classification === 'none') return;
    el.rules = rulesFor(el);
    rules = rules.concat(el.rules);
  });
  elements.forEach(function (el) { if (!el.rules) el.rules = []; });

  var ruleById = {};
  rules.forEach(function (r) { ruleById[r.id] = r; });

  DP.data = {
    catalog: CATALOG, tables: tables, lineage: lineage, assets: assets,
    elements: elements, elementById: byId, rules: rules, ruleById: ruleById,
    weights: WEIGHTS, thresholds: THRESHOLDS,
    tableById: tables.reduce(function (m, t) { m[t.id] = t; return m; }, {})
  };
})(window.DP = window.DP || {});
