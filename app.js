(function () {
  "use strict";

  var DATA = window.ACTIVITY_DATA;
  var IND = DATA.indicators;
  var DIST = DATA.districts;
  var N = DIST.length;
  var STEP_NAMES = ["Task", "Indicators", "Weights", "Scaling", "Line", "Compare", "Reflect"];
  var SCALE_NAMES = { rank: "ranks", minmax: "0 to 100", z: "z-scores" };
  var STORE = "poverty-index-activity-v1";

  var state = { step: 0, group: "", picked: [], weights: {}, scale: "rank", share: 20, answers: ["", "", ""], weightsTouched: false };

  // ---------- helpers
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function label(code) { for (var i = 0; i < IND.length; i++) if (IND[i].code === code) return IND[i].label; return code; }
  function col(code) { return DIST.map(function (d) { return d[code]; }); }
  function fmt(x, d) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || "null");
      if (s && typeof s === "object") Object.keys(state).forEach(function (k) { if (k in s) state[k] = s[k]; });
    } catch (e) { /* storage unavailable */ }
  }

  // ---------- the same math as the Excel version of the activity
  // percentile rank: share of the other districts with a lower value
  // (the workbook uses COUNTIF(range,"<"&x)/(COUNT(range)-1) so both agree exactly)
  function percentRank(arr, x) {
    var below = 0;
    for (var i = 0; i < arr.length; i++) if (arr[i] < x) below++;
    return below / (arr.length - 1);
  }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function sdPop(a) { var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / a.length); }
  function scaleCol(code, method) {
    var a = col(code);
    if (method === "rank") return a.map(function (x) { return percentRank(a, x) * 100; });
    if (method === "minmax") {
      var lo = Math.min.apply(null, a), hi = Math.max.apply(null, a);
      return a.map(function (x) { return hi === lo ? 0 : (x - lo) / (hi - lo) * 100; });
    }
    var m = mean(a), sd = sdPop(a);
    return a.map(function (x) { return sd === 0 ? 0 : (x - m) / sd; });
  }
  // rank 1 = most need; ties go to the district listed first, as in the workbook
  function rankDesc(vals) {
    return vals.map(function (v, i) {
      var r = 1;
      for (var j = 0; j < vals.length; j++) {
        if (vals[j] > v) r++;
        else if (vals[j] === v && j < i) r++;
      }
      return r;
    });
  }
  function corr(a, b) {
    var ma = mean(a), mb = mean(b), sab = 0, saa = 0, sbb = 0;
    for (var i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) * (a[i] - ma); sbb += (b[i] - mb) * (b[i] - mb); }
    return sab / Math.sqrt(saa * sbb);
  }
  function weightTotal() { return state.picked.reduce(function (s, c) { return s + (Number(state.weights[c]) || 0); }, 0); }
  function cutoff() { return Math.round(state.share / 100 * N); }

  function results() {
    var total = weightTotal();
    var scaled = {};
    state.picked.forEach(function (c) { scaled[c] = scaleCol(c, state.scale); });
    var index = DIST.map(function (d, i) {
      if (!total) return 0;
      var s = 0;
      state.picked.forEach(function (c) { s += (Number(state.weights[c]) || 0) * scaled[c][i]; });
      // rounded so that exact ties are treated the same way as in the workbook
      return Math.round(s / total * 1e6) / 1e6;
    });
    var yours = rankDesc(index);
    var income = rankDesc(col("inc185"));
    var k = cutoff();
    return DIST.map(function (d, i) {
      return { name: d.district, small: d.small, raw: d, index: index[i], rank: yours[i], irank: income[i],
               high: yours[i] <= k, ihigh: income[i] <= k };
    });
  }

  // ---------- stepper and navigation
  function renderStepper() {
    var ol = $("stepper");
    ol.innerHTML = "";
    STEP_NAMES.forEach(function (n, i) {
      var li = el("li", { class: i === state.step ? "now" : (i < state.step ? "done" : "") }, i === 0 ? n : i + ". " + n);
      if (i === state.step) li.setAttribute("aria-current", "step");
      ol.appendChild(li);
    });
  }
  function stepProblem(step) {
    if (step === 1) {
      if (state.picked.length < 2) return "Pick at least two indicators.";
      if (state.picked.length > 8) return "Pick no more than eight indicators.";
    }
    if (step === 2) {
      var t = weightTotal();
      if (t !== 100) return "Weights add to " + t + ". They need to add to 100.";
    }
    return "";
  }
  function show(step) {
    state.step = step;
    document.querySelectorAll(".panel").forEach(function (p) { p.hidden = Number(p.getAttribute("data-step")) !== step; });
    if (step === 1) renderIndicators();
    if (step === 2) renderWeights();
    if (step === 3) renderScaleExample();
    if (step === 4) renderShare();
    if (step === 5) renderResults();
    $("backBtn").style.visibility = step === 0 ? "hidden" : "visible";
    $("nextBtn").style.visibility = step === STEP_NAMES.length - 1 ? "hidden" : "visible";
    $("nextBtn").textContent = step === 4 ? "See results" : "Next";
    renderStepper();
    updateNav();
    save();
    var h = document.querySelector('.panel[data-step="' + step + '"] h2');
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }
  function updateNav() {
    var problem = stepProblem(state.step);
    $("nextBtn").disabled = !!problem;
    $("navHint").textContent = problem;
  }

  // ---------- step 1
  function renderIndicators() {
    var box = $("indicatorCards");
    box.innerHTML = "";
    IND.forEach(function (ind) {
      var a = col(ind.code);
      var on = state.picked.indexOf(ind.code) >= 0;
      var lab = el("label", { class: "card" + (on ? " on" : "") + (ind.code === "inc185" ? " income" : "") });
      var cb = el("input", { type: "checkbox", value: ind.code });
      cb.checked = on;
      cb.addEventListener("change", function () {
        if (cb.checked) state.picked.push(ind.code);
        else state.picked = state.picked.filter(function (c) { return c !== ind.code; });
        lab.classList.toggle("on", cb.checked);
        state.weightsTouched = false;
        updatePick();
      });
      var span = el("span");
      span.appendChild(el("span", { class: "label" }, ind.label + (ind.code === "inc185" ? " (the FRPL-style line)" : "")));
      span.appendChild(el("span", { class: "desc" }, ind.desc));
      span.appendChild(el("span", { class: "range" }, "Across districts: " + fmt(Math.min.apply(null, a), 1) + " to " + fmt(Math.max.apply(null, a), 1) + " percent"));
      lab.appendChild(cb);
      lab.appendChild(span);
      box.appendChild(lab);
    });
    updatePick();
  }
  function updatePick() {
    var n = state.picked.length;
    $("pickCount").textContent = n + " selected" + (n > 0 && (n < 4 || n > 6) ? ". Four to six works best." : ".");
    var warn = $("corrWarn");
    warn.innerHTML = "";
    for (var i = 0; i < state.picked.length; i++) {
      for (var j = i + 1; j < state.picked.length; j++) {
        var r = corr(col(state.picked[i]), col(state.picked[j]));
        if (Math.abs(r) >= 0.8) {
          warn.appendChild(el("p", null, label(state.picked[i]) + " and " + label(state.picked[j]) +
            " rise and fall together across districts (r = " + fmt(r, 2) + "). Counting both gives that idea extra weight."));
        }
      }
    }
    updateNav();
    save();
  }

  // ---------- step 2
  function splitEvenly() {
    var k = state.picked.length;
    if (!k) return;
    var base = Math.floor(100 / k), extra = 100 - base * k;
    state.weights = {};
    state.picked.forEach(function (c, i) { state.weights[c] = base + (i < extra ? 1 : 0); });
  }
  function renderWeights() {
    if (!state.weightsTouched || weightTotal() === 0 || state.picked.some(function (c) { return !(c in state.weights); })) {
      splitEvenly();
      state.weightsTouched = true;
    }
    var box = $("weights");
    box.innerHTML = "";
    state.picked.forEach(function (c) {
      var row = el("div", { class: "wrow" });
      var id = "w-" + c;
      var lab = el("label", { class: "wl", for: id }, label(c));
      var range = el("input", { type: "range", min: "0", max: "100", step: "1", "aria-label": label(c) + " weight slider" });
      var numb = el("input", { type: "number", id: id, min: "0", max: "100", step: "1" });
      range.value = numb.value = state.weights[c];
      function set(v) {
        v = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
        state.weights[c] = v;
        range.value = numb.value = v;
        updateTotal();
      }
      range.addEventListener("input", function () { set(range.value); });
      numb.addEventListener("input", function () { set(numb.value); });
      row.appendChild(lab); row.appendChild(range); row.appendChild(numb);
      box.appendChild(row);
    });
    updateTotal();
  }
  function updateTotal() {
    var t = weightTotal();
    var out = $("weightTotal");
    out.textContent = "Total: " + t + " of 100";
    out.className = "total " + (t === 100 ? "ok" : "bad");
    updateNav();
    save();
  }

  // ---------- step 3
  function renderScaleExample() {
    document.querySelectorAll('input[name="scale"]').forEach(function (r) { r.checked = r.value === state.scale; });
    var code = state.picked.slice().sort(function (a, b) { return (state.weights[b] || 0) - (state.weights[a] || 0); })[0];
    var box = $("scaleExample");
    box.innerHTML = "";
    if (!code) return;
    var raw = col(code);
    var order = raw.map(function (v, i) { return i; }).sort(function (a, b) { return raw[a] - raw[b]; });
    var picks = [order[0], order[Math.floor(N / 4)], order[Math.floor(N / 2)], order[Math.floor(3 * N / 4)], order[N - 1]];
    var s = { rank: scaleCol(code, "rank"), minmax: scaleCol(code, "minmax"), z: scaleCol(code, "z") };
    var t = el("table");
    t.appendChild(el("caption", null, "How five districts score on " + label(code) + " under each method"));
    var hr = el("tr");
    ["District", "Percent", "Ranks", "0 to 100", "z-scores"].forEach(function (h, i) {
      var th = el("th", null, h);
      if ((i === 2 && state.scale === "rank") || (i === 3 && state.scale === "minmax") || (i === 4 && state.scale === "z")) th.textContent = h + " (yours)";
      hr.appendChild(th);
    });
    t.appendChild(hr);
    picks.forEach(function (i) {
      var tr = el("tr");
      tr.appendChild(el("td", null, DIST[i].district));
      tr.appendChild(el("td", { class: "n" }, fmt(raw[i], 1)));
      tr.appendChild(el("td", { class: "n" }, fmt(s.rank[i], 1)));
      tr.appendChild(el("td", { class: "n" }, fmt(s.minmax[i], 1)));
      tr.appendChild(el("td", { class: "n" }, fmt(s.z[i], 2)));
      t.appendChild(tr);
    });
    box.appendChild(t);
  }

  // ---------- step 4
  function renderShare() {
    $("share").value = state.share;
    $("shareOut").textContent = state.share + " percent";
    $("shareCount").textContent = "That is the top " + cutoff() + " of " + N + " districts.";
  }

  // ---------- step 5
  function nameWithTag(r) {
    var frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode(r.name));
    if (r.small) frag.appendChild(el("span", { class: "tag", title: "Fewer than 500 children ages 6 to 17. Large margin of error." }, "small"));
    return frag;
  }
  function recapText() {
    var parts = state.picked.map(function (c) { return label(c) + " (" + state.weights[c] + ")"; });
    return "Your index: " + parts.join(", ") + ". Scaled by " + SCALE_NAMES[state.scale] + ". Top " + state.share + " percent (" + cutoff() + " districts) counted as high need.";
  }
  var sortKey = "rank", sortDir = 1;
  function renderResults() {
    var R = results();
    $("recap").textContent = recapText();
    var both = R.filter(function (r) { return r.high && r.ihigh; }).length;
    var added = R.filter(function (r) { return r.high && !r.ihigh; }).sort(function (a, b) { return a.rank - b.rank; });
    var dropped = R.filter(function (r) { return !r.high && r.ihigh; }).sort(function (a, b) { return a.irank - b.irank; });
    var smallHigh = R.filter(function (r) { return r.high && r.small; }).length;
    var stats = $("stats");
    stats.innerHTML = "";
    [[both, "high-need districts in both lists"], [added.length, "added by your index"], [dropped.length, "dropped by your index"], [smallHigh, "small-sample districts in your high-need group"]]
      .forEach(function (s) {
        var d = el("div", { class: "stat" });
        d.appendChild(el("span", { class: "big" }, String(s[0])));
        d.appendChild(el("span", { class: "lbl" }, s[1]));
        stats.appendChild(d);
      });
    var byRank = R.slice().sort(function (a, b) { return a.rank - b.rank; }).slice(0, 10);
    var byInc = R.slice().sort(function (a, b) { return a.irank - b.irank; }).slice(0, 10);
    var incTop = byInc.map(function (r) { return r.name; });
    var yourTop = byRank.map(function (r) { return r.name; });
    fillTop($("topYours"), byRank, incTop, "not in the income-only top ten");
    fillTop($("topIncome"), byInc, yourTop, "not in your top ten");
    fillMoves($("addedList"), added, "No districts added.");
    fillMoves($("droppedList"), dropped, "No districts dropped.");
    renderTable(R);
  }
  function fillTop(ol, rows, other, note) {
    ol.innerHTML = "";
    rows.forEach(function (r) {
      var li = el("li");
      li.appendChild(nameWithTag(r));
      if (other.indexOf(r.name) < 0) { li.className = "added"; li.setAttribute("title", note); }
      ol.appendChild(li);
    });
  }
  function fillMoves(ul, rows, empty) {
    ul.innerHTML = "";
    if (!rows.length) { ul.appendChild(el("li", null, empty)); return; }
    rows.forEach(function (r) {
      var li = el("li");
      li.appendChild(nameWithTag(r));
      li.appendChild(document.createTextNode(": income-only rank " + r.irank + ", your rank " + r.rank));
      ul.appendChild(li);
    });
  }
  function renderTable(R) {
    var cols = [
      { key: "name", head: "District", get: function (r) { return r.name; } },
      { key: "rank", head: "Your rank", get: function (r) { return r.rank; }, n: true },
      { key: "irank", head: "Income-only rank", get: function (r) { return r.irank; }, n: true },
      { key: "change", head: "Change", get: function (r) { return r.irank - r.rank; }, n: true },
      { key: "kids", head: "Children 6 to 17", get: function (r) { return r.raw.kids; }, n: true }
    ].concat(state.picked.map(function (c) { return { key: c, head: label(c), get: function (r) { return r.raw[c]; }, n: true, pct: true }; }));
    var sorter = cols.filter(function (c) { return c.key === sortKey; })[0] || cols[1];
    var rows = R.slice().sort(function (a, b) {
      var x = sorter.get(a), y = sorter.get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
    });
    var t = $("fullTable");
    t.innerHTML = "";
    var hr = el("tr");
    cols.forEach(function (c) {
      var th = el("th", { scope: "col", tabindex: "0" }, c.head + (c.key === sortKey ? (sortDir > 0 ? " ▲" : " ▼") : ""));
      th.setAttribute("aria-sort", c.key === sortKey ? (sortDir > 0 ? "ascending" : "descending") : "none");
      function go() { if (sortKey === c.key) sortDir = -sortDir; else { sortKey = c.key; sortDir = c.key === "change" ? -1 : 1; } renderTable(R); }
      th.addEventListener("click", go);
      th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      hr.appendChild(th);
    });
    t.appendChild(hr);
    rows.forEach(function (r) {
      var tr = el("tr");
      cols.forEach(function (c) {
        var v = c.get(r);
        var td = el("td", c.n ? { class: "n" } : null);
        if (c.key === "name") td.appendChild(nameWithTag(r));
        else if (c.key === "change") { td.textContent = v > 0 ? "+" + v : String(v); if (v > 0) td.className = "n up"; if (v < 0) td.className = "n down"; }
        else if (c.key === "kids") td.textContent = v.toLocaleString("en-US");
        else td.textContent = c.pct ? fmt(v, 1) : String(v);
        tr.appendChild(td);
      });
      t.appendChild(tr);
    });
  }

  // ---------- step 6
  function summaryText() {
    var R = results();
    var lines = [];
    lines.push("Student Poverty Index Lab");
    lines.push("Group: " + (state.group || "(no name)"));
    lines.push("");
    lines.push(recapText());
    lines.push("");
    lines.push("Your top ten:");
    R.slice().sort(function (a, b) { return a.rank - b.rank; }).slice(0, 10).forEach(function (r) { lines.push("  " + r.rank + ". " + r.name + (r.small ? " (small sample)" : "")); });
    lines.push("");
    lines.push("Income-only top ten:");
    R.slice().sort(function (a, b) { return a.irank - b.irank; }).slice(0, 10).forEach(function (r) { lines.push("  " + r.irank + ". " + r.name + (r.small ? " (small sample)" : "")); });
    lines.push("");
    var added = R.filter(function (r) { return r.high && !r.ihigh; });
    var dropped = R.filter(function (r) { return !r.high && r.ihigh; });
    lines.push("Added by your index: " + (added.map(function (r) { return r.name; }).join("; ") || "none"));
    lines.push("Dropped by your index: " + (dropped.map(function (r) { return r.name; }).join("; ") || "none"));
    lines.push("");
    ["Which indicators did you choose, and why?", "Which districts entered your high-need group that income alone missed? What do they have in common?", "Which one decision changed your ranking the most?"]
      .forEach(function (q, i) { lines.push((i + 1) + ". " + q); lines.push("   " + (state.answers[i] || "")); lines.push(""); });
    lines.push(DATA.source + ".");
    return lines.join("\n");
  }
  function download() {
    var blob = new Blob([summaryText()], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    var name = (state.group || "group").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "group";
    a.href = URL.createObjectURL(blob);
    a.download = "poverty-index-lab-" + name + ".txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- wiring
  function init() {
    load();
    state.picked = state.picked.filter(function (c) { return IND.some(function (i) { return i.code === c; }); });
    $("groupName").value = state.group;
    $("groupName").addEventListener("input", function (e) { state.group = e.target.value; save(); });
    $("evenBtn").addEventListener("click", function () { splitEvenly(); renderWeights(); });
    document.querySelectorAll('input[name="scale"]').forEach(function (r) {
      r.addEventListener("change", function () { state.scale = r.value; renderScaleExample(); save(); });
    });
    $("share").addEventListener("input", function (e) { state.share = Number(e.target.value); renderShare(); save(); });
    ["q1", "q2", "q3"].forEach(function (id, i) {
      $(id).value = state.answers[i] || "";
      $(id).addEventListener("input", function (e) { state.answers[i] = e.target.value; save(); });
    });
    $("downloadBtn").addEventListener("click", download);
    $("restartBtn").addEventListener("click", function () {
      if (!window.confirm("Clear your choices and answers and start over?")) return;
      state = { step: 0, group: "", picked: [], weights: {}, scale: "rank", share: 20, answers: ["", "", ""], weightsTouched: false };
      $("groupName").value = "";
      ["q1", "q2", "q3"].forEach(function (id) { $(id).value = ""; });
      show(0);
    });
    $("backBtn").addEventListener("click", function () { if (state.step > 0) show(state.step - 1); });
    $("nextBtn").addEventListener("click", function () { if (!stepProblem(state.step) && state.step < STEP_NAMES.length - 1) show(state.step + 1); });
    show(Math.min(state.step || 0, STEP_NAMES.length - 1));
  }

  // exposed for the automated check in tests/check.js
  window.__activity = { percentRank: percentRank, scaleCol: scaleCol, rankDesc: rankDesc, results: results, state: function () { return state; } };
  init();
})();
