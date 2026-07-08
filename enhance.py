import os
module = '''
// ==SmartPlanner Module==
var HY_PLAN_KEY = "HY_PlanV2";
var HY_PLAN_IDX = "HY_PlanIdx";
var HY_DISC_KEY = "HY_Discovered";

var SmartPlanner = {
  discover: function() {
    var courses = [];
    document.querySelectorAll("a[href*=\"course.aspx?cid=\"]").forEach(function(a) {
      var txt = (a.textContent || "").trim();
      if (txt && txt.length > 2) courses.push({ n: txt, l: a.href });
    });
    document.querySelectorAll("input.btn67[value*=\"继续\"]").forEach(function(b) {
      var oc = b.getAttribute("onclick") || "";
      var m = oc.match(/["\']([^"\']*course\\.aspx[^"\']*)["\']/);
      if (m && m[1]) {
        var u = m[1];
        if (u.indexOf("http") < 0) u = location.origin + "/pages/" + u.replace("../pages/", "");
        courses.push({ n: "\u7ee7\u7eed\u5b66\u4e60", l: u });
      }
    });
    if (courses.length) { Store.s(HY_DISC_KEY, courses); }
    return courses;
  },
  makePlan: function() {
    var an = CreditPlanner.analyze();
    if (!an || an.met) return null;
    this.discover();
    var disc = Store.g(HY_DISC_KEY, []);
    var cand = [];
    for (var i = 0; i < an.projects.length; i++) {
      var p = an.projects[i];
      if (!p.completed) cand.push({ n: p.name, cr: p.credit || 1, st: p.status || "\u672a\u5b66\u4e60", pb: p.isPublic, lk: p.link || "", src: "exist" });
    }
    for (var j = 0; j < disc.length; j++) {
      var found = false;
      for (var k = 0; k < cand.length; k++) { if (cand[k].lk === disc[j].l) { found = true; break; } }
      if (!found) cand.push({ n: disc[j].n, cr: 1, st: "\u672a\u5b66\u4e60", pb: disc[j].n.indexOf("\u516c\u9700") >= 0, lk: disc[j].l, src: "new" });
    }
    cand.sort(function(a, b) {
      if (a.pb !== b.pb) return a.pb ? -1 : 1;
      var pa = a.st === "\u672a\u5b66\u4e60" ? 0 : (a.st || "").indexOf("\u64ad\u653e\u81f3") >= 0 ? 1 : a.st === "\u5b66\u4e60\u4e2d" ? 2 : 3;
      var pb = b.st === "\u672a\u5b66\u4e60" ? 0 : (b.st || "").indexOf("\u64ad\u653e\u81f3") >= 0 ? 1 : b.st === "\u5b66\u4e60\u4e2d" ? 2 : 3;
      return pa - pb || (b.cr || 0) - (a.cr || 0);
    });
    var tasks = [], acc = 0, np = an.publicRemaining, no = an.otherRemaining, tr = an.totalRemaining;
    for (var i = 0; i < cand.length && acc < tr; i++) {
      var c = cand[i];
      if (c.pb && np <= 0) continue;
      if (!c.pb && no <= 0) continue;
      tasks.push({ n: c.n, cr: c.cr, st: c.st, lk: c.lk, pb: c.pb, act: c.st === "\u5f85\u8003\u8bd5" ? "exam" : "learn" });
      acc += c.cr;
      if (c.pb) np -= c.cr; else no -= c.cr;
    }
    var plan = { tasks: tasks, met: false, acc: acc, need: tr };
    Store.s(HY_PLAN_KEY, plan);
    Store.s(HY_PLAN_IDX, 0);
    return plan;
  },
  start: function() {
    var plan = Store.g(HY_PLAN_KEY, null);
    if (!plan || !plan.tasks || !plan.tasks.length) return;
    var idx = Store.g(HY_PLAN_IDX, 0);
    if (idx >= plan.tasks.length) return;
    var t = plan.tasks[idx];
    if (t.lk) { window.location.href = t.lk; }
    else { Store.s(HY_PLAN_IDX, idx + 1); this.start(); }
  },
  complete: function() {
    var idx = Store.g(HY_PLAN_IDX, 0);
    Store.s(HY_PLAN_IDX, idx + 1);
  }
};
'''

path = "src/tampermonkey/hua-yi-helper.user.js"
with open(path, "r", encoding="utf-8") as f:
    old = f.read()

marker = "function autoScanCourses()"
pos = old.find(marker)
if pos < 0:
    print("ERROR: marker not found")
else:
    new = old[:pos] + module + old[pos:]
    with open(path, "w", encoding="utf-8") as f:
        f.write(new)
    sz = os.path.getsize(path)
    has = "SmartPlanner" in new
    print("OK: %d bytes, SmartPlanner: %s" % (sz, has))
