(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HuayiCore = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var DEFAULT_POLICY = {
    year: new Date().getFullYear(),
    publicTarget: 5,
    otherTarget: 20
  };

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function normalize(value) {
    return clean(value)
      .replace(/^\d+[、.．)\]\s]+/, '')
      .replace(/m²/gi, 'm2')
      .replace(/[，,。；;：:\s]/g, '')
      .toLowerCase();
  }

  function parseCredit(value) {
    var match = clean(value).match(/(\d+(?:\.\d+)?)\s*学?\s*分/);
    return match ? Number(match[1]) : 0;
  }

  function parseDuration(value) {
    var text = clean(value);
    var hours = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|学时|h(?:ours?)?)/i);
    if (hours) return Math.round(Number(hours[1]) * 60);
    var minutes = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|min(?:utes?)?)/i);
    if (minutes) return Math.round(Number(minutes[1]));
    var clock = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!clock) return 0;
    return clock[3] ? Number(clock[1]) * 60 + Number(clock[2]) + Math.ceil(Number(clock[3]) / 60) :
      Number(clock[1]) * 60 + Number(clock[2]);
  }

  function detectCategory(value) {
    var text = clean(value);
    if (/公需|公共必修|公共科目/.test(text)) return 'public';
    if (/全员|专项/.test(text)) return 'other';
    if (/继续教育|继教|国家级|省级|市级|自治区级|专业科目|专业课/.test(text)) return 'other';
    return 'other';
  }

  function detectSource(value) {
    var text = clean(value);
    if (/公需|公共必修|公共科目/.test(text)) return '继续教育公需课';
    if (/全员|专项/.test(text)) return '全员专项';
    if (/继续教育|继教|国家级|省级|市级|自治区级/.test(text)) return '继续教育';
    return '其他';
  }

  function detectStatus(value) {
    var text = clean(value);
    if (/已申请|已获学分|已授予/.test(text)) return 'applied';
    if (/申请证书|申请学分|待申请|学习完毕|本项目已完成/.test(text)) return 'completed';
    if (/待考试/.test(text)) return 'exam';
    if (/学习中|继续学习|播放至|进行中/.test(text)) return 'in_progress';
    if (/未学习|开始学习|立即学习/.test(text)) return 'not_started';
    if (/已完成/.test(text)) return 'completed';
    return 'unknown';
  }

  function parseYear(value, fallback) {
    var years = clean(value).match(/20\d{2}/g);
    return years && years.length ? Number(years[0]) : Number(fallback || DEFAULT_POLICY.year);
  }

  function normalizeRecord(record, options) {
    options = options || {};
    var text = clean(record.text || [
      record.name, record.creditText, record.categoryText, record.sourceText,
      record.statusText, record.progressText, record.durationText
    ].join(' '));
    var status = record.status || detectStatus(record.statusText || text);
    var category = record.category || detectCategory(record.categoryText || text);
    return {
      id: clean(record.id || record.cwid || record.cid || record.url || record.name),
      name: clean(record.name || ''),
      url: clean(record.url || ''),
      year: Number(record.year || parseYear(text, options.year)),
      credit: Number(record.credit || parseCredit(record.creditText || text)),
      durationMinutes: Number(record.durationMinutes || parseDuration(record.durationText || text)),
      category: category,
      source: record.source || detectSource(record.sourceText || text),
      status: status,
      enrolled: record.enrolled !== false,
      action: clean(record.action || ''),
      progress: clean(record.progress || record.progressText || ''),
      text: text
    };
  }

  function policyWithDefaults(policy) {
    return Object.assign({}, DEFAULT_POLICY, policy || {});
  }

  function summarizeCredits(records, policy) {
    policy = policyWithDefaults(policy);
    var normalized = (records || []).map(function (record) {
      return normalizeRecord(record, policy);
    }).filter(function (record) {
      return !record.year || record.year === Number(policy.year);
    });
    var summary = {
      year: Number(policy.year),
      publicTarget: Number(policy.publicTarget),
      otherTarget: Number(policy.otherTarget),
      publicEarned: 0,
      publicCommitted: 0,
      otherEarned: 0,
      otherCommitted: 0,
      records: normalized,
      applicationTasks: [],
      resumeTasks: []
    };
    normalized.forEach(function (record) {
      var prefix = record.category === 'public' ? 'public' : 'other';
      if (record.status === 'applied') summary[prefix + 'Earned'] += record.credit;
      else if (record.enrolled && /^(completed|exam|in_progress|not_started)$/.test(record.status)) {
        summary[prefix + 'Committed'] += record.credit;
      }
      if (record.status === 'completed' && record.url) summary.applicationTasks.push(record);
      else if (record.enrolled && /^(exam|in_progress|not_started)$/.test(record.status) && record.url) {
        summary.resumeTasks.push(record);
      }
    });
    summary.publicProjected = summary.publicEarned + summary.publicCommitted;
    summary.otherProjected = summary.otherEarned + summary.otherCommitted;
    summary.publicDeficit = Math.max(0, summary.publicTarget - summary.publicProjected);
    summary.otherDeficit = Math.max(0, summary.otherTarget - summary.otherProjected);
    summary.totalEarned = summary.publicEarned + summary.otherEarned;
    summary.totalProjected = summary.publicProjected + summary.otherProjected;
    summary.satisfied = summary.publicEarned >= summary.publicTarget && summary.otherEarned >= summary.otherTarget;
    summary.projectedSatisfied = summary.publicProjected >= summary.publicTarget &&
      summary.otherProjected >= summary.otherTarget;
    return summary;
  }

  function candidateCost(path, target) {
    var credit = path.reduce(function (sum, item) { return sum + item.credit; }, 0);
    var duration = path.reduce(function (sum, item) {
      return sum + (item.durationMinutes > 0 ? item.durationMinutes : 10000);
    }, 0);
    return {
      overshoot: Math.max(0, credit - target),
      duration: duration,
      count: path.length,
      credit: credit
    };
  }

  function comparePlans(a, b, target) {
    if (!a) return 1;
    if (!b) return -1;
    var ca = candidateCost(a, target);
    var cb = candidateCost(b, target);
    if (ca.overshoot !== cb.overshoot) return ca.overshoot - cb.overshoot;
    if (ca.duration !== cb.duration) return ca.duration - cb.duration;
    if (ca.count !== cb.count) return ca.count - cb.count;
    return ca.credit - cb.credit;
  }

  function chooseOptimalSubset(candidates, target) {
    target = Math.max(0, Number(target || 0));
    if (target <= 0) return { selected: [], credit: 0, shortage: 0 };
    var normalized = (candidates || []).map(function (candidate) {
      return normalizeRecord(Object.assign({}, candidate, { enrolled: false }));
    }).filter(function (candidate) {
      return candidate.credit > 0 && candidate.url;
    });
    var scale = 10;
    var targetUnits = Math.ceil(target * scale - 1e-9);
    var maxUnits = targetUnits + normalized.reduce(function (max, item) {
      return Math.max(max, Math.round(item.credit * scale));
    }, 0);
    var plans = new Map();
    plans.set(0, []);
    normalized.slice(0, 80).forEach(function (item) {
      var units = Math.round(item.credit * scale);
      Array.from(plans.entries()).sort(function (a, b) { return b[0] - a[0]; }).forEach(function (entry) {
        var nextUnits = entry[0] + units;
        if (nextUnits > maxUnits) return;
        var nextPlan = entry[1].concat(item);
        var existing = plans.get(nextUnits);
        if (!existing || comparePlans(nextPlan, existing, target) < 0) plans.set(nextUnits, nextPlan);
      });
    });
    var best = null;
    plans.forEach(function (plan, units) {
      if (units < targetUnits) return;
      if (!best || comparePlans(plan, best, target) < 0) best = plan;
    });
    if (!best) {
      var allCredit = normalized.reduce(function (sum, item) { return sum + item.credit; }, 0);
      return { selected: normalized, credit: allCredit, shortage: Math.max(0, target - allCredit) };
    }
    var credit = best.reduce(function (sum, item) { return sum + item.credit; }, 0);
    return { selected: best, credit: credit, shortage: Math.max(0, target - credit) };
  }

  function uniqueById(records) {
    var seen = {};
    return records.filter(function (record) {
      var key = record.id || record.url || normalize(record.name);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function buildAnnualPlan(records, catalog, policy) {
    policy = policyWithDefaults(policy);
    var summary = summarizeCredits(records, policy);
    var completed = summary.records.filter(function (record) {
      return record.status === 'completed';
    });
    var resumable = summary.records.filter(function (record) {
      return record.enrolled && /^(exam|in_progress|not_started)$/.test(record.status) && record.url;
    });
    var completedPublic = completed.filter(function (record) { return record.category === 'public'; })
      .reduce(function (sum, record) { return sum + record.credit; }, 0);
    var completedOther = completed.filter(function (record) { return record.category !== 'public'; })
      .reduce(function (sum, record) { return sum + record.credit; }, 0);
    var publicResume = chooseOptimalSubset(resumable.filter(function (record) {
      return record.category === 'public';
    }), Math.max(0, summary.publicTarget - summary.publicEarned - completedPublic));
    var otherResume = chooseOptimalSubset(resumable.filter(function (record) {
      return record.category !== 'public';
    }), Math.max(0, summary.otherTarget - summary.otherEarned - completedOther));
    var publicAfterExisting = summary.publicEarned + completedPublic + publicResume.credit;
    var otherAfterExisting = summary.otherEarned + completedOther + otherResume.credit;
    var enrolledIds = {};
    summary.records.forEach(function (record) {
      enrolledIds[record.id || record.url || record.name] = true;
    });
    var available = uniqueById((catalog || []).map(function (record) {
      return normalizeRecord(Object.assign({}, record, { enrolled: false }), policy);
    }).filter(function (record) {
      var key = record.id || record.url || record.name;
      return record.year === Number(policy.year) && record.credit > 0 && record.url &&
        !enrolledIds[key] && !/^(applied|completed)$/.test(record.status);
    }));
    var publicChoice = chooseOptimalSubset(available.filter(function (item) {
      return item.category === 'public';
    }), Math.max(0, summary.publicTarget - publicAfterExisting));
    var selectedPublicIds = {};
    publicChoice.selected.forEach(function (item) { selectedPublicIds[item.id || item.url] = true; });
    var otherChoice = chooseOptimalSubset(available.filter(function (item) {
      return item.category !== 'public' && !selectedPublicIds[item.id || item.url];
    }), Math.max(0, summary.otherTarget - otherAfterExisting));
    var tasks = [];
    summary.applicationTasks.forEach(function (record) {
      tasks.push({ type: 'apply', priority: 10, record: record, reason: '课程已完成，先申请学分' });
    });
    publicResume.selected.concat(otherResume.selected).sort(function (a, b) {
      if (a.category !== b.category) return a.category === 'public' ? -1 : 1;
      return b.credit - a.credit;
    }).forEach(function (record) {
      tasks.push({ type: 'resume', priority: record.category === 'public' ? 20 : 30, record: record, reason: '继续已投入课程' });
    });
    publicChoice.selected.forEach(function (record) {
      tasks.push({ type: 'enroll', priority: 40, record: record, reason: '补足公需课 5 分目标' });
    });
    otherChoice.selected.forEach(function (record) {
      tasks.push({ type: 'enroll', priority: 50, record: record, reason: '补足其他课程 20 分目标' });
    });
    tasks.sort(function (a, b) { return a.priority - b.priority; });
    return {
      policy: policy,
      summary: summary,
      publicResumeSelection: publicResume,
      otherResumeSelection: otherResume,
      publicSelection: publicChoice,
      otherSelection: otherChoice,
      tasks: tasks,
      projectedPublic: publicAfterExisting + publicChoice.credit,
      projectedOther: otherAfterExisting + otherChoice.credit,
      shortages: {
        public: publicChoice.shortage,
        other: otherChoice.shortage
      },
      satisfied: publicChoice.shortage <= 0 && otherChoice.shortage <= 0
    };
  }

  return {
    VERSION: '8.0.0',
    DEFAULT_POLICY: DEFAULT_POLICY,
    clean: clean,
    normalize: normalize,
    parseCredit: parseCredit,
    parseDuration: parseDuration,
    parseYear: parseYear,
    detectCategory: detectCategory,
    detectSource: detectSource,
    detectStatus: detectStatus,
    normalizeRecord: normalizeRecord,
    summarizeCredits: summarizeCredits,
    chooseOptimalSubset: chooseOptimalSubset,
    buildAnnualPlan: buildAnnualPlan
  };
});
