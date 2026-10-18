/*
 * Sign-in preview: a sample validation run against the demo catalog.
 * All figures are sample data and are labelled as such in the page.
 */
(function () {
  "use strict";

  var RUN = [
    { id: "R-014", el: "claims.claim_id",           rule: "not_null",                res: "0 nulls in 48,210 rows",          state: "pass" },
    { id: "R-021", el: "claims.member_id",          rule: "fk_exists members",       res: "100% matched",                    state: "pass" },
    { id: "R-033", el: "members.date_of_birth",     rule: "null_rate ≤ 0.5%",        res: "1.84% null, baseline 0.21%",      state: "fail" },
    { id: "R-040", el: "policies.premium_amount",   rule: "between 0 and 250,000",   res: "0 violations",                    state: "pass" },
    { id: "R-052", el: "providers.npi",             rule: "regex ^\\d{10}$",         res: "12 rows quarantined",             state: "warn" },
    { id: "R-061", el: "payments.settled_at",       rule: "freshness ≤ 4h",          res: "last load 6h 12m ago",            state: "fail" }
  ];

  var HEALTH = [
    { label: "Rules passing",   value: function (c) { return c.pass + " / " + RUN.length; }, note: "" },
    { label: "Quarantine rate", value: function () { return "0.025%"; }, note: "12 rows" },
    { label: "Freshness SLAs",  value: function () { return "1 breach"; }, note: "of 4" },
    { label: "Schema drift",    value: function () { return "1 change"; }, note: "last 7d" }
  ];

  var ALERTS = [
    { lvl: "warn", html: ["Null-rate anomaly on ", "members.date_of_birth", ", 1.84% against a 0.21% baseline"], time: "2m ago" },
    { lvl: "warn", html: ["Freshness SLA breach on ", "payments.settled_at", ", 2h 12m over target"], time: "9m ago" },
    { lvl: "info", html: ["Schema drift: ", "claims.adjudication_code", " added as nullable string"], time: "31m ago" }
  ];

  var rowsEl = document.getElementById("rows");
  var barEl = document.getElementById("bar");
  var sumEl = document.getElementById("sum");
  var healthEl = document.getElementById("health");
  var alertsEl = document.getElementById("alerts");
  var chipEl = document.getElementById("chip");
  var chipText = document.getElementById("chip-text");
  var replayBtn = document.getElementById("replay");
  if (!rowsEl) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var timers = [];
  var rowEls = [];

  function later(fn, ms) { timers.push(window.setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(window.clearTimeout); timers = []; }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function counts() {
    var c = { pass: 0, warn: 0, fail: 0 };
    RUN.forEach(function (r) { c[r.state] += 1; });
    return c;
  }

  function setChip(state, text) {
    chipEl.setAttribute("data-state", state);
    chipText.textContent = text;
  }

  function setProgress(done) {
    barEl.firstElementChild.style.setProperty("--p", Math.round((done / RUN.length) * 100) + "%");
  }

  function paintRow(i, state) {
    var row = rowEls[i];
    var r = RUN[i];
    row.setAttribute("data-state", state);
    var st = row.querySelector(".st");
    var tail = row.querySelector(".tail");
    if (state === "pending") { st.textContent = "queued"; tail.textContent = ""; }
    else if (state === "running") { st.textContent = "running"; tail.textContent = ""; }
    else { st.textContent = state; tail.textContent = " " + r.res; }
  }

  function build() {
    rowsEl.textContent = "";
    rowEls = RUN.map(function (r) {
      var row = el("div", "row");
      row.appendChild(el("span", "", r.id));
      row.appendChild(el("span", "el", r.el));
      row.appendChild(el("span", "", r.rule));
      var res = el("span", "res");
      res.appendChild(el("b", "st"));
      res.appendChild(el("span", "tail"));
      row.appendChild(res);
      rowsEl.appendChild(row);
      return row;
    });
  }

  function renderSummary() {
    var c = counts();
    sumEl.textContent = "";
    [["ok", c.pass, "passed"], ["warn", c.warn, "warning"], ["err", c.fail, "failed"]].forEach(function (p) {
      var s = el("span");
      s.appendChild(el("b", p[0], String(p[1])));
      s.appendChild(document.createTextNode(" " + p[2]));
      sumEl.appendChild(s);
    });
    sumEl.classList.add("is-on");
  }

  function renderHealth(filled) {
    var c = counts();
    healthEl.textContent = "";
    HEALTH.forEach(function (h) {
      var cell = el("div");
      cell.appendChild(el("dt", "", h.label));
      var dd = el("dd");
      dd.appendChild(document.createTextNode(filled ? h.value(c) : "–"));
      if (filled && h.note) { dd.appendChild(document.createTextNode(" ")); dd.appendChild(el("small", "", h.note)); }
      cell.appendChild(dd);
      healthEl.appendChild(cell);
    });
  }

  function buildAlerts() {
    alertsEl.textContent = "";
    return ALERTS.map(function (a) {
      var row = el("div", "alert");
      var lvl = el("span", "lvl", a.lvl === "warn" ? "Warning" : "Info");
      lvl.setAttribute("data-lvl", a.lvl);
      var what = el("span", "what");
      what.appendChild(document.createTextNode(a.html[0]));
      what.appendChild(el("span", "mono", a.html[1]));
      what.appendChild(document.createTextNode(a.html[2]));
      row.appendChild(lvl);
      row.appendChild(what);
      row.appendChild(el("time", "", a.time));
      alertsEl.appendChild(row);
      return row;
    });
  }

  function finalChip() {
    var c = counts();
    setChip("failed", "Failed, " + c.fail + " rules");
  }

  function renderFinal() {
    build();
    RUN.forEach(function (r, i) { paintRow(i, r.state); });
    setProgress(RUN.length);
    renderSummary();
    renderHealth(true);
    buildAlerts().forEach(function (a) { a.classList.add("is-on"); });
    finalChip();
  }

  function play() {
    clearTimers();
    replayBtn.disabled = true;
    build();
    RUN.forEach(function (r, i) { paintRow(i, "pending"); });
    sumEl.classList.remove("is-on");
    sumEl.textContent = "";
    renderHealth(false);
    var alertRows = buildAlerts();
    setProgress(0);
    setChip("running", "Running");

    var start = 500;
    var step = 780;
    RUN.forEach(function (r, i) {
      later(function () { paintRow(i, "running"); setProgress(i); }, start + i * step);
      later(function () { paintRow(i, r.state); setProgress(i + 1); }, start + i * step + 520);
    });

    var end = start + RUN.length * step + 200;
    later(function () { renderSummary(); renderHealth(true); finalChip(); }, end);
    alertRows.forEach(function (row, i) {
      later(function () { row.classList.add("is-on"); }, end + 250 + i * 380);
    });
    later(function () { replayBtn.disabled = false; }, end + 250 + alertRows.length * 380);
  }

  if (reduce) {
    renderFinal();
    replayBtn.hidden = true;
  } else {
    play();
    replayBtn.addEventListener("click", play);
  }
})();
