// ── Auth ──────────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000/v1';
let _token = sessionStorage.getItem('fhp_access_token');

if (!_token) {
  console.warn('No access token — API calls will fail. Login via landing-page.html first.');
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (_token || '') };
}

let _lastApiError = null;
async function api(method, path, body) {
  _lastApiError = null;
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { sessionStorage.clear(); window.location.href = 'landing-page.html'; return null; }
    if (!res.ok) {
      try { _lastApiError = await res.json(); } catch { _lastApiError = { message: 'Request failed (' + res.status + ')' }; }
      console.error('API error:', method, path, _lastApiError);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('API error:', method, path, e);
    return null;
  }
}

// ── Tab navigation ────────────────────────────────────────────────────────────
const PAGES = ['overview','fairness','jobs','pipeline','sla','ghosting','rejections','auditlog','appeals'];
const _tabLoaded = {};

function showPage(pageId) {
  PAGES.forEach(p => {
    const sec = document.getElementById('page-' + p);
    const nav = document.getElementById('nav-' + p);
    if (sec) sec.style.display = p === pageId ? '' : 'none';
    if (nav) nav.classList.toggle('active', p === pageId);
  });
  if (!_tabLoaded[pageId]) {
    _tabLoaded[pageId] = true;
    switch (pageId) {
      case 'fairness':    loadFairness(); break;
      case 'jobs':        loadJobs(); break;
      case 'pipeline':    loadPipeline(); break;
      case 'sla':         loadSLA(); break;
      case 'ghosting':    loadGhosting(); break;
      case 'rejections':  loadRejections(); break;
      case 'auditlog':    loadAuditLog(); break;
      case 'appeals':     loadAppeals(); break;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function h(s) {
  return String(s ?? '').replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  }).replace(/[^\x00-\x7F]/g, function(c) { return '&#' + c.codePointAt(0) + ';'; });
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function fmtScore(v) {
  if (v == null) return '—';
  return parseFloat(v).toFixed(2);
}
function scoreClass(v, good, caution) {
  if (v == null) return '';
  return v >= good ? 'good' : v >= caution ? 'caution' : 'poor';
}
function statusTag(status) {
  const map = { active:'pass', paused:'fail', closed:'fail', expired:'fail' };
  return map[status] || 'info';
}
function slaTag(s) {
  const map = { breached:'fail', due_today:'warn', due_soon:'warn', on_track:'pass' };
  return map[s] || 'info';
}
function appealTag(s) {
  const map = { submitted:'info', twg_review:'warn', pc_review:'warn', upheld:'pass', dismissed:'fail', withdrawn:'fail' };
  return map[s] || 'info';
}
function ghostTag(s) {
  const map = { severe:'fail', significant:'warn', minor:'info' };
  return map[s] || 'info';
}
function triggerDownload(content, filename, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function jsonToCsv(rows, cols) {
  const header = cols.map(c => c.label).join(',');
  const lines = rows.map(r => cols.map(c => {
    const v = String(r[c.key] == null ? '' : r[c.key]).replace(/"/g, '""');
    return '"' + v + '"';
  }).join(','));
  return [header, ...lines].join('\n');
}

// ── Overview load ─────────────────────────────────────────────────────────────
async function loadOverview() {
  const data = await api('GET', '/companies/me/dashboard');
  if (!data) return;

  const co = data.company || {};
  if (co.legal_name) {
    _companyName = co.legal_name;
    document.getElementById('co-name').textContent = co.legal_name;
    document.getElementById('co-id').textContent = 'ID: ' + co.company_id.slice(0, 8);
  }

  // KPI strip
  document.getElementById('kpi-compliance-score').textContent = fmtScore(co.compliance_score);
  document.getElementById('kpi-compliance-change').textContent = co.compliance_score != null ? (co.compliance_score >= 0.7 ? 'Above review threshold' : 'Below review threshold') : 'No score yet';
  document.getElementById('kpi-jobs-active').textContent = (data.active_jobs || []).length;
  document.getElementById('kpi-jobs-change').textContent = (data.active_jobs || []).length + ' brief(s) active';
  document.getElementById('kpi-ghosting-open').textContent = (data.open_ghosting || []).length;
  document.getElementById('kpi-ghosting-change').textContent = (data.open_ghosting || []).length + ' open event(s)';

  // Nav badges
  const openGhosts = (data.open_ghosting || []).length;
  if (openGhosts > 0) {
    const b = document.getElementById('nav-badge-ghosting');
    b.textContent = openGhosts; b.style.display = '';
  }

  // Fairness rings
  const f = data.fairness;
  if (!f) {
    document.getElementById('kpi-sla-pct').textContent = '—';
    document.getElementById('kpi-sla-change').textContent = 'No fairness data yet';
    document.getElementById('compliance-score-big').textContent = fmtScore(co.compliance_score);
  }
  if (f) {
    document.getElementById('kpi-sla-pct').textContent = f.ghosting_sla_compliance_rate != null
      ? Math.round(f.ghosting_sla_compliance_rate * 100) + '%' : '—';
    document.getElementById('kpi-sla-change').textContent = f.ghosting_sla_compliance_rate != null
      ? (f.ghosting_sla_compliance_rate >= 0.9 ? 'Good standing' : 'Needs attention') : 'No data';

    const setRing = (id, val, ok) => {
      const el = document.getElementById('ring-' + id + '-val');
      const st = document.getElementById('ring-' + id + '-status');
      if (el) { el.textContent = fmtScore(val); el.className = 'ring-val ' + (ok ? 'ok' : 'breach'); }
      if (st) { st.textContent = ok ? '✓ Within bounds' : '✗ Breach'; st.className = 'ring-status ' + (ok ? 'ok' : 'breach'); }
    };
    setRing('dir', f.dir_value, f.dir_within_bounds);
    setRing('eod', f.eod_value, f.eod_within_bounds);
    setRing('sds', f.sds_value, f.sds_within_bounds);

    if (f.any_metric_breached) {
      const el = document.getElementById('overview-breach-notice');
      el.style.display = '';
      document.getElementById('overview-breach-msg').textContent =
        'One or more fairness metrics are outside bounds. ' +
        f.consecutive_breach_windows + ' consecutive breach window(s). ' +
        'Review your active job briefs and submit a remediation plan if required.';

      const fb = document.getElementById('nav-badge-fairness');
      fb.textContent = 1; fb.style.display = '';
    }

    document.getElementById('compliance-score-big').textContent =
      fmtScore(co.compliance_score);
  }

  // Active jobs table (overview)
  const jobs = data.active_jobs || [];
  const jobsTbody = document.getElementById('overview-jobs-tbody');
  if (!jobs.length) {
    jobsTbody.innerHTML = '<tr><td colspan="6" class="panel-mono">No active jobs.</td></tr>';
  } else {
    jobsTbody.innerHTML = jobs.map(j => {
      const exp = fmtDate(j.expires_at);
      const expiring = j.expires_at && (new Date(j.expires_at) - Date.now()) < 7 * 86400000;
      return '<tr>' +
        '<td><div class="job-title">' + h(j.title) + '</div><div class="job-id">' + j.job_id.slice(0,8) + '</div></td>' +
        '<td class="mono">' + (j.total_candidates || 0) + '</td>' +
        '<td class="mono">' + (j.matched_count || 0) + '</td>' +
        '<td><span class="score-cell ' + scoreClass(j.dir_value, 0.8, 0.7) + '">' + fmtScore(j.dir_value) + '</span></td>' +
        '<td><span class="tag ' + statusTag(j.status) + '">' + (j.response_sla_days || '—') + 'd</span></td>' +
        '<td style="font-family:var(--mono);font-size:10px;color:' + (expiring ? 'var(--amber)' : 'var(--text-dim)') + '">' + exp + (expiring ? ' ⚠' : '') + '</td>' +
        '</tr>';
    }).join('');
  }

  // Ghosting overview list
  const ghosts = data.open_ghosting || [];
  const ghostList = document.getElementById('overview-ghosting-list');
  if (!ghosts.length) {
    ghostList.innerHTML = '<div style="padding:12px;font-family:var(--mono);font-size:11px;color:var(--green)">✓ No open ghosting events.</div>';
  } else {
    ghostList.innerHTML = ghosts.map(g =>
      '<div class="ghost-item ' + h(g.severity) + '">' +
      '<span class="ghost-id">' + g.ghosting_id.slice(0,8) + '</span>' +
      '<span class="ghost-stage">' + h(g.stage_name) + '</span>' +
      '<span class="ghost-overdue">+' + Math.round(g.overdue_hours) + 'h overdue</span>' +
      '<span class="tag ' + ghostTag(g.severity) + '">' + h(g.severity) + '</span>' +
      '</div>'
    ).join('');
  }
  document.getElementById('overview-strike-count').textContent = co.strike_count_90d != null ? co.strike_count_90d : '—';

  // SLA by stage table
  const stageData = await api('GET', '/companies/me/sla-by-stage');
  const stageTbody = document.getElementById('sla-by-stage-tbody');
  if (stageTbody) {
    const stages = stageData && stageData.stages ? stageData.stages : [];
    const stageLabel = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const compColor = pct => pct == null ? 'var(--text-dim)' : pct >= 90 ? 'var(--green)' : pct >= 70 ? 'var(--amber)' : 'var(--red)';
    stageTbody.innerHTML = stages.length
      ? stages.map(s => {
          const pct = s.compliance_pct;
          const activeNote = s.active_count > 0 ? ' <span style="font-size:10px;color:var(--text-dim)">(' + s.active_count + ' active' + (s.active_breached > 0 ? ', ' + s.active_breached + ' breached' : '') + ')</span>' : '';
          return '<tr style="border-bottom:1px solid var(--border)">' +
            '<td style="padding:8px 0">' + stageLabel(s.stage) + activeNote + '</td>' +
            '<td style="padding:8px 12px;font-family:var(--mono);color:' + compColor(pct) + '">' + (pct != null ? pct + '%' : '—') + '</td>' +
            '<td style="padding:8px 12px;font-family:var(--mono);font-size:10px;color:var(--text-dim)">' + (s.ghosting_count > 0 ? s.ghosting_count + ' ghosting event(s)' : '—') + '</td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="3" style="padding:10px;font-family:var(--mono);font-size:11px;color:var(--text-dim)">No stage data in the last 90 days.</td></tr>';
  }

  // Compliance breakdown bars
  const bd = data.compliance_breakdown;
  const breakdownEl = document.getElementById('compliance-breakdown');
  if (bd && (bd.sla_pct != null || bd.ghosting_pct != null || bd.fairness_pct != null || bd.rejection_pct != null)) {
    const barColor = pct => pct == null ? 'var(--text-dim)' : pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)';
    const barWidth = pct => pct == null ? 0 : pct;
    const barVal   = pct => pct == null ? '—' : pct + '%';
    const rows = [
      { label: 'SLA compliance (35%)',       pct: bd.sla_pct },
      { label: 'Ghosting-free rate (25%)',   pct: bd.ghosting_pct },
      { label: 'Fairness metrics (25%)',     pct: bd.fairness_pct },
      { label: 'Structured rejections (15%)', pct: bd.rejection_pct },
    ];
    breakdownEl.innerHTML = rows.map(r =>
      '<div class="comp-row">' +
      '<div class="comp-label">' + r.label + '</div>' +
      '<div class="comp-bar"><div class="comp-bar-fill" style="width:' + barWidth(r.pct) + '%;background:' + barColor(r.pct) + '"></div></div>' +
      '<div class="comp-val" style="color:' + barColor(r.pct) + '">' + barVal(r.pct) + '</div>' +
      '</div>'
    ).join('');
  }

  // Recent audit
  const audit = data.recent_audit || [];
  const auditList = document.getElementById('overview-audit-list');
  if (!audit.length) {
    auditList.innerHTML = '<div class="audit-row"><span class="audit-time">—</span><div class="audit-dot blue"></div><span class="audit-msg">No recent audit events.</span><span></span></div>';
  } else {
    auditList.innerHTML = audit.map(e =>
      '<div class="audit-row">' +
      '<span class="audit-time">' + fmtDate(e.occurred_at) + '</span>' +
      '<div class="audit-dot blue"></div>' +
      '<span class="audit-msg">' + h(e.summary) + '</span>' +
      '<span class="tag info audit-tag">' + h(e.event_type || '') + '</span>' +
      '</div>'
    ).join('');
  }
}

// ── Fairness tab ──────────────────────────────────────────────────────────────
let _fairnessData = null;
let _companyName  = null;

async function loadFairness() {
  const data = await api('GET', '/companies/me/fairness/jobs');
  if (!data) return;
  _fairnessData = data.jobs || [];

  const totalCandidates = _fairnessData.reduce(function(sum, j) { return sum + (j.total_candidates_evaluated || 0); }, 0);
  const sub = document.getElementById('fairness-subtitle');
  if (sub) {
    var parts = ['rolling 30-day window'];
    if (_companyName) parts.unshift(_companyName);
    if (totalCandidates > 0) parts.push(totalCandidates + ' candidate' + (totalCandidates === 1 ? '' : 's') + ' evaluated');
    sub.textContent = '// ' + parts.join(' · ');
  }

  const tbody = document.getElementById('fairness-jobs-tbody');
  if (!_fairnessData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="panel-mono">No fairness data yet.</td></tr>';
    return;
  }

  tbody.innerHTML = _fairnessData.map(j => {
    const breach = j.breach_level !== 'ok';
    return '<tr>' +
      '<td><div class="job-title">' + h(j.title) + '</div><div class="job-id">' + j.job_id.slice(0,8) + '</div></td>' +
      '<td class="mono">' + (j.total_candidates_evaluated || 0) + '</td>' +
      '<td><span class="score-cell ' + scoreClass(j.dir_value, 0.85, 0.8) + '">' + fmtScore(j.dir_value) + '</span></td>' +
      '<td><span class="score-cell ' + (Math.abs(j.eod_value) <= 0.05 ? 'good' : 'poor') + '">' + fmtScore(j.eod_value) + '</span></td>' +
      '<td><span class="score-cell ' + (Math.abs(j.sds_value) <= 0.03 ? 'good' : 'poor') + '">' + fmtScore(j.sds_value) + '</span></td>' +
      '<td style="font-family:var(--mono);font-size:11px;color:' + (j.consecutive_breach_windows > 1 ? 'var(--red)' : 'var(--text-dim)') + '">' + (j.consecutive_breach_windows || 0) + ' window(s)</td>' +
      '<td><span class="tag ' + (breach ? 'fail' : 'pass') + '">' + (breach ? j.breach_level.replace('_', ' ') : 'All OK') + '</span></td>' +
      '</tr>';
  }).join('');

  // Show breach notice for worst offender
  const worst = _fairnessData.filter(j => j.consecutive_breach_windows >= 3)[0];
  if (worst) {
    const notice = document.getElementById('fairness-breach-notice');
    notice.style.display = '';
    document.getElementById('fairness-breach-title').textContent = '⚠ Remediation Required — ' + worst.title;
    document.getElementById('fairness-breach-msg').textContent =
      'All metrics are outside bounds for ' + worst.consecutive_breach_windows +
      ' consecutive windows. A Fairness Oversight Board review has been triggered. Submit a remediation plan within 20 business days.';
    notice.dataset.jobId = worst.job_id;
  }
}

function exportFairnessCSV() {
  if (!_fairnessData || !_fairnessData.length) { alert('No data to export.'); return; }
  const csv = jsonToCsv(_fairnessData, [
    { key:'title', label:'Role' },
    { key:'total_candidates_evaluated', label:'Candidates' },
    { key:'dir_value', label:'DIR' },
    { key:'eod_value', label:'EOD' },
    { key:'sds_value', label:'SDS' },
    { key:'consecutive_breach_windows', label:'Consecutive Breach Windows' },
    { key:'breach_level', label:'Status' },
    { key:'computed_at', label:'Computed At' },
  ]);
  triggerDownload(csv, 'fhp-fairness-' + new Date().toISOString().slice(0,10) + '.csv', 'text/csv');
}

async function submitRemediation() {
  const jobId = document.getElementById('fairness-breach-notice').dataset.jobId;
  if (!jobId) return;
  const plan = prompt('Briefly describe your remediation plan:');
  if (!plan) return;
  const res = await api('POST', '/companies/me/fairness/remediation', { job_id: jobId, remediation_notes: plan });
  if (res) alert('Remediation plan submitted.');
  else alert('Failed to submit. Please try again.');
}

// ── Jobs tab ──────────────────────────────────────────────────────────────────
let _jobsData = [];

async function loadJobs() {
  const data = await api('GET', '/companies/me/jobs');
  if (!data) return;
  _jobsData = data.jobs || [];

  const expiringCount = _jobsData.filter(j => j.days_until_expiry != null && j.days_until_expiry <= 7).length;
  document.getElementById('jobs-subtitle').textContent =
    '// ' + _jobsData.length + ' active · ' + expiringCount + ' expiring within 7 days';

  const tbody = document.getElementById('jobs-table-tbody');
  if (!_jobsData.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="panel-mono">No job briefs yet. Post your first brief above.</td></tr>';
    return;
  }

  tbody.innerHTML = _jobsData.map(j => {
    const exp = fmtDate(j.expires_at);
    const expiring = j.days_until_expiry != null && j.days_until_expiry <= 7;
    const sal = j.salary_currency + j.salary_minimum / 1000 + 'k–' + j.salary_maximum / 1000 + 'k';
    return '<tr>' +
      '<td><div class="job-title">' + h(j.title) + '</div><div class="job-id">' + h(j.employment_type) + ' · ' + h(j.work_mode) + '</div></td>' +
      '<td><span class="tag ' + statusTag(j.status) + '">' + h(j.status) + '</span></td>' +
      '<td class="mono">' + j.response_sla_days + 'd</td>' +
      '<td class="mono">' + (j.total_candidates || 0) + '</td>' +
      '<td class="mono">' + (j.matched_count || 0) + '</td>' +
      '<td style="font-family:var(--mono);font-size:11px">' + sal + '</td>' +
      '<td style="font-family:var(--mono);font-size:10px;color:' + (expiring ? 'var(--amber)' : 'var(--text-dim)') + '">' + exp + (expiring ? ' ⚠' : '') + '</td>' +
      '<td><span class="panel-action" onclick="openJobDialogById(' + "'" + j.job_id + "'" + ')">Edit →</span></td>' +
      '</tr>';
  }).join('');
}

function openJobDialogById(jobId) {
  const job = _jobsData.find(j => j.job_id === jobId);
  if (job) openJobDialog(job.title, job);
  else openJobDialog();
}

// ── Pipeline tab ──────────────────────────────────────────────────────────────
function togglePipelineRun(matchId) {
  var detail = document.getElementById('pr-detail-' + matchId);
  var icon   = document.getElementById('pr-icon-'   + matchId);
  if (!detail) return;
  var open = detail.style.display !== 'none';
  detail.style.display = open ? 'none' : '';
  if (icon) icon.textContent = open ? '▶' : '▼';
}

function _pipelineSkillLabel(ontologyId) {
  if (!ontologyId) return '—';
  return ontologyId.replace(/^fhp:skill:/, '').replace(/-/g, ' ');
}

function _pipelineScoreBar(label, value, color) {
  var pct = value != null ? Math.round(parseFloat(value) * 100) : 0;
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">' +
    '<div style="font-family:var(--mono);font-size:10px;color:var(--text-dim);width:170px;flex-shrink:0">' + label + '</div>' +
    '<div style="flex:1;background:var(--border);height:5px;border-radius:2px">' +
      '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:2px"></div>' +
    '</div>' +
    '<div style="font-family:var(--mono);font-size:11px;width:36px;text-align:right">' + (value != null ? parseFloat(value).toFixed(2) : '—') + '</div>' +
  '</div>';
}

function _pipelineExpandHtml(run) {
  var html = '<td colspan="8" style="padding:0;border-bottom:2px solid var(--border)">' +
    '<div style="padding:16px 20px 18px;background:var(--bg)">';

  // Summary
  if (run.plain_language_summary) {
    html += '<div style="margin-bottom:14px;font-size:13px;line-height:1.6;color:var(--text-mid)">' +
      run.plain_language_summary + '</div>';
  }

  // Score bars
  var skillColor   = parseFloat(run.skill_score) >= 0.7 ? 'var(--green)' : parseFloat(run.skill_score) >= 0.5 ? 'var(--amber)' : 'var(--red)';
  var prefColor    = parseFloat(run.preference_alignment_score) >= 0.7 ? 'var(--green)' : parseFloat(run.preference_alignment_score) >= 0.5 ? 'var(--amber)' : 'var(--red)';
  var transColor   = 'var(--blue)';
  html += '<div style="margin-bottom:14px">' +
    _pipelineScoreBar('Skill match', run.skill_score, skillColor) +
    _pipelineScoreBar('Transferable skills', run.transferable_skill_score, transColor) +
    _pipelineScoreBar('Preference alignment', run.preference_alignment_score, prefColor) +
  '</div>';

  // Bias note
  if (run.bias_correction_triggered) {
    var delta = parseFloat(run.bias_correction_delta);
    html += '<div style="background:var(--amber-dim);border-left:3px solid var(--amber);padding:8px 12px;margin-bottom:14px;font-family:var(--mono);font-size:11px">' +
      '&#9651; Bias correction applied: ' + (delta >= 0 ? '+' : '') + delta.toFixed(3) +
      ' &nbsp;&middot;&nbsp; Pre-correction score: ' + parseFloat(run.pre_correction_score).toFixed(3) +
    '</div>';
  }

  // Skill breakdown grid
  var breakdown = run.skill_breakdown;
  if (breakdown && breakdown.length) {
    html += '<div style="font-family:var(--mono);font-size:9px;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:6px">REQUIRED SKILLS</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr style="border-bottom:1px solid var(--border)">' +
      '<th style="text-align:left;padding:5px 8px 5px 0;font-family:var(--mono);font-size:9px;color:var(--text-dim)">SKILL</th>' +
      '<th style="text-align:left;padding:5px 8px;font-family:var(--mono);font-size:9px;color:var(--text-dim)">REQUIRED</th>' +
      '<th style="text-align:left;padding:5px 8px;font-family:var(--mono);font-size:9px;color:var(--text-dim)">CANDIDATE</th>' +
      '<th style="text-align:left;padding:5px 8px;font-family:var(--mono);font-size:9px;color:var(--text-dim)">MATCH</th>' +
      '<th style="text-align:right;padding:5px 0 5px 8px;font-family:var(--mono);font-size:9px;color:var(--text-dim)">CONTRIBUTION</th>' +
    '</tr></thead><tbody>';

    breakdown.forEach(function(sk) {
      var matched    = sk.matched;
      var matchType  = sk.match_type || '—';
      var mustHave   = (sk.requirement_level === 'must_have');
      var rowColor   = matched ? 'var(--green)' : (mustHave ? 'var(--red)' : 'var(--text-dim)');
      var matchLabel = matched
        ? (matchType === 'transferable' ? '&#10003; transferable' : '&#10003; direct')
        : '&#10007; unmet';
      html += '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:6px 8px 6px 0;font-weight:600">' + _pipelineSkillLabel(sk.ontology_id) +
          (mustHave ? '' : ' <span style="font-weight:400;color:var(--text-dim);font-size:10px">optional</span>') + '</td>' +
        '<td style="padding:6px 8px;font-family:var(--mono);font-size:10px">' + (sk.required_proficiency || '—') + '</td>' +
        '<td style="padding:6px 8px;font-family:var(--mono);font-size:10px;color:var(--text-dim)">' + (sk.candidate_proficiency || 'not assessed') + '</td>' +
        '<td style="padding:6px 8px;font-family:var(--mono);font-size:10px;color:' + rowColor + '">' + matchLabel + '</td>' +
        '<td style="padding:6px 0 6px 8px;font-family:var(--mono);font-size:10px;text-align:right">' +
          (sk.score_contribution != null ? (parseFloat(sk.score_contribution) >= 0 ? '+' : '') + parseFloat(sk.score_contribution).toFixed(3) : '—') +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
  }

  html += '</div></td>';
  return html;
}

async function loadPipeline() {
  var data = await api('GET', '/companies/me/pipeline');
  if (!data) return;

  var s = data.stats || {};
  var total = s.total_runs || 0;
  var matchRate = total > 0 ? Math.round(100 * (s.matched || 0) / total) : null;

  document.getElementById('pipeline-stat-total').textContent = total;
  document.getElementById('pipeline-stat-rate').textContent  = matchRate != null ? matchRate + '%' : '—';
  document.getElementById('pipeline-stat-score').textContent = s.avg_score != null ? parseFloat(s.avg_score).toFixed(2) : '—';
  document.getElementById('pipeline-stat-bias').textContent  = s.bias_corrected != null
    ? s.bias_corrected + (total > 0 ? ' (' + Math.round(100 * s.bias_corrected / total) + '%)' : '') : '—';

  var runs = data.runs || [];
  var subtitle = document.getElementById('pipeline-subtitle');
  if (subtitle) subtitle.textContent = '// ' + total + ' total run' + (total !== 1 ? 's' : '') +
    ' · ' + (s.matched || 0) + ' matched · ' + (s.borderline || 0) + ' borderline';

  var tbody = document.getElementById('pipeline-tbody');
  if (!runs.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;color:var(--text-dim);font-family:var(--mono);font-size:11px">No pipeline runs yet. Runs appear here once candidates are matched against your active briefs.</td></tr>';
    return;
  }

  var decisionTag = function(d) {
    return d === 'matched' ? 'pass' : d === 'borderline' ? 'warn' : 'fail';
  };
  var decisionLabel = function(d) {
    return d === 'not_matched' ? 'not matched' : d;
  };

  tbody.innerHTML = runs.map(function(r) {
    var scoreVal = parseFloat(r.overall_score);
    var scoreCls = scoreClass(scoreVal, 0.75, 0.5);
    var hasBias  = r.bias_correction_triggered;
    var delta    = hasBias ? parseFloat(r.bias_correction_delta) : null;
    var dur      = r.duration_ms != null ? r.duration_ms + 'ms' : '—';
    var mainRow = '<tr style="cursor:pointer;border-bottom:1px solid var(--border)" onclick="togglePipelineRun(\'' + r.match_id + '\')">' +
      '<td style="text-align:center;font-family:var(--mono);font-size:9px;color:var(--text-dim);padding:10px 4px"><span id="pr-icon-' + r.match_id + '">&#9654;</span></td>' +
      '<td class="mono-xs">' + r.match_id.slice(0, 8) + '</td>' +
      '<td style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + h(r.job_title || '—') + '</td>' +
      '<td><span class="tag ' + decisionTag(r.decision) + '">' + decisionLabel(r.decision) + '</span></td>' +
      '<td><span class="score-cell ' + scoreCls + '">' + scoreVal.toFixed(2) + '</span></td>' +
      '<td class="mono-xs">' + dur + '</td>' +
      '<td style="font-family:var(--mono);font-size:11px">' +
        (hasBias ? '<span class="tag warn">' + (delta >= 0 ? '+' : '') + delta.toFixed(3) + '</span>' : '<span style="color:var(--text-dim)">—</span>') +
      '</td>' +
      '<td class="mono-xs">' + fmtDate(r.created_at) + '</td>' +
    '</tr>';
    var detailRow = '<tr id="pr-detail-' + r.match_id + '" style="display:none">' +
      _pipelineExpandHtml(r) +
    '</tr>';
    return mainRow + detailRow;
  }).join('');
}

// ── SLA tab ───────────────────────────────────────────────────────────────────
async function loadSLA() {
  const data = await api('GET', '/companies/me/sla');
  if (!data) return;

  const k = data.kpis || {};
  document.getElementById('sla-kpi-pct').textContent = (k.compliance_pct_30d != null ? k.compliance_pct_30d + '%' : '—');
  document.getElementById('sla-kpi-pct-sub').textContent = 'last 30 days';
  document.getElementById('sla-kpi-due-soon').textContent = k.due_soon != null ? k.due_soon : '—';
  document.getElementById('sla-kpi-breached').textContent = k.breached != null ? k.breached : '—';
  document.getElementById('sla-kpi-active').textContent = k.total_active != null ? k.total_active : '—';
  document.getElementById('sla-kpi-active-sub').textContent = 'currently in progress';
  const slaSubtitle = document.querySelector('#page-sla .page-subtitle');
  if (slaSubtitle) slaSubtitle.textContent = '// ' + (k.total_active || 0) + ' active · ' + (k.due_soon || 0) + ' approaching deadline · ' + (k.breached || 0) + ' breached';

  if (k.breached > 0 || k.due_soon > 0) {
    const b = document.getElementById('nav-badge-sla');
    b.textContent = (k.breached || 0) + (k.due_soon || 0); b.style.display = '';
  }

  const tbody = document.getElementById('sla-tbody');
  const interactions = data.interactions || [];
  if (!interactions.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:14px;color:var(--green);font-family:var(--mono);font-size:11px">✓ No active interactions.</td></tr>';
    return;
  }

  tbody.innerHTML = interactions.map(i => {
    const hrs = i.hours_remaining;
    const isBreached = i.sla_status === 'breached';
    const timeStr = isBreached ? '+' + Math.abs(Math.round(hrs)) + 'h overdue' :
      (hrs < 24 ? Math.round(hrs) + 'h' : Math.round(hrs / 24) + 'd');
    const timeColor = isBreached ? 'var(--red)' : (hrs < 48 ? 'var(--amber)' : 'var(--green)');
    const iid = i.interaction_id;
    const jt  = h(i.job_title || 'Role');
    const isCompleted = i.current_stage === 'completed' || i.current_stage === 'offer_stage';
    return '<tr>' +
      '<td style="font-size:12px">' + jt + '</td>' +
      '<td style="font-family:var(--mono);font-size:10px">' + h((i.current_stage || '—').replace(/_/g,' ')) + '</td>' +
      '<td style="font-family:var(--mono);font-size:10px;color:' + (isBreached ? 'var(--red)' : 'var(--text-dim)') + '">' + fmtDate(i.sla_deadline) + (isBreached ? ' ⚠' : '') + '</td>' +
      '<td style="font-family:var(--mono);font-size:11px;color:' + timeColor + '">' + timeStr + '</td>' +
      '<td><span class="tag ' + slaTag(i.sla_status) + '">' + h(i.sla_status) + '</span></td>' +
      '<td style="white-space:nowrap;display:flex;gap:4px;padding:8px 4px">' +
        (isCompleted ? '' : '<button style="font-family:var(--mono);font-size:9px;background:var(--blue);color:white;border:none;padding:3px 8px;cursor:pointer;border-radius:2px" onclick="advanceInteraction(\'' + iid + '\',\'' + (i.job_title||'') + '\',\'' + (i.current_stage||'') + '\')">Advance →</button>') +
        '<button style="font-family:var(--mono);font-size:9px;background:var(--bg-hover);color:var(--text);border:1px solid var(--border);padding:3px 8px;cursor:pointer;border-radius:2px" onclick="selectInteraction(\'' + iid + '\',\'' + (i.job_title||'') + '\')">Reject →</button>' +
      '</td>' +
      '</tr>';
  }).join('');
}

// ── Ghosting tab ──────────────────────────────────────────────────────────────
let _ghostingData = [];

async function loadGhosting() {
  const data = await api('GET', '/companies/me/ghosting');
  if (!data) return;
  _ghostingData = data.ghosting_events || [];

  const stats = data.stats || {};
  const openCount     = _ghostingData.filter(g => g.status === 'open').length;
  const resolvedCount = _ghostingData.filter(g => g.status === 'resolved').length;
  const strikes       = stats.strikes_applied ?? 0;
  const sub = document.querySelector('#page-ghosting .page-subtitle');
  if (sub) sub.textContent = '// ' + openCount + ' open · ' + resolvedCount + ' resolved this window · strike count: ' + strikes + ' of 3';
  document.getElementById('ghosting-strike-notice').textContent =
    stats.strikes_applied > 0
      ? '⚠ ' + stats.strikes_applied + ' strike(s) applied in this 90-day window. ' + (3 - stats.strikes_applied) + ' more before automatic brief pausing.'
      : '✓ No strikes applied in this 90-day window.';

  const list = document.getElementById('ghosting-list');
  if (!_ghostingData.length) {
    list.innerHTML = '<div style="padding:14px;font-family:var(--mono);font-size:11px;color:var(--green)">✓ No ghosting events.</div>';
    return;
  }

  list.innerHTML = _ghostingData.map(g =>
    '<div class="ghost-item ' + h(g.severity) + '">' +
    '<span class="ghost-id">' + g.ghosting_id.slice(0,8) + '</span>' +
    '<span class="ghost-stage">' + h(g.stage_name) + ' — ' + (g.status === 'open' ? '+' + Math.round(g.overdue_hours) + 'h overdue' : h(g.status)) + '</span>' +
    '<span class="ghost-overdue">' + (g.company_strike_count_at_detection > 0 ? 'Strike recorded' : 'No strike yet') + '</span>' +
    '<span class="tag ' + ghostTag(g.severity) + '">' + h(g.severity) + '</span>' +
    (g.status === 'open'
      ? ' <button style="margin-left:8px;font-family:var(--mono);font-size:9px;background:var(--bg-hover);border:1px solid var(--border);color:var(--text);padding:2px 8px;cursor:pointer" onclick="resolveGhosting(' + "'" + g.ghosting_id + "'" + ')">Resolve →</button>'
      : '') +
    '</div>'
  ).join('');
}

async function resolveGhosting(ghostingId) {
  const notes = prompt('Resolution notes (optional):');
  const res = await api('PUT', '/companies/me/ghosting/' + ghostingId, { action: 'resolve', resolution_notes: notes || undefined });
  if (res) { alert('Ghosting event resolved.'); _tabLoaded.ghosting = false; loadGhosting(); }
  else alert('Failed. Please try again.');
}

function exportGhostingCSV() {
  if (!_ghostingData.length) { alert('No data to export.'); return; }
  const csv = jsonToCsv(_ghostingData, [
    { key:'ghosting_id', label:'ID' },
    { key:'stage_name', label:'Stage' },
    { key:'severity', label:'Severity' },
    { key:'status', label:'Status' },
    { key:'overdue_hours', label:'Overdue Hours' },
    { key:'company_strike_count_at_detection', label:'Strike Count' },
    { key:'detected_at', label:'Detected At' },
    { key:'resolved_at', label:'Resolved At' },
    { key:'job_title', label:'Job' },
  ]);
  triggerDownload(csv, 'fhp-ghosting-' + new Date().toISOString().slice(0,10) + '.csv', 'text/csv');
}

// ── Rejections tab ────────────────────────────────────────────────────────────
let _selectedInteractionId = null;

async function loadRejections() {
  const [interactionsRes, codesRes] = await Promise.all([
    api('GET', '/companies/me/interactions?needs_rejection=true'),
    api('GET', '/reference/rejection-codes'),
  ]);

  if (codesRes && codesRes.rejection_codes) {
    const sel = document.getElementById('rejection-code-select');
    sel.innerHTML = '<option value="">— Select reason code —</option>' +
      codesRes.rejection_codes.map(c =>
        '<option value="' + h(c.code) + '">' + h(c.code) + ' — ' + h(c.label) + '</option>'
      ).join('');
  }

  const tbody = document.getElementById('rejections-tbody');
  const interactions = interactionsRes ? (interactionsRes.interactions || []) : [];

  const sub = document.getElementById('rejections-subtitle');
  if (sub) sub.textContent = '// ' + interactions.length + ' pending response' + (interactions.length === 1 ? '' : 's');

  if (!interactions.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:14px;color:var(--green);font-family:var(--mono);font-size:11px">✓ No pending rejections.</td></tr>';
    return;
  }

  tbody.innerHTML = interactions.map(i =>
    '<tr>' +
    '<td style="font-family:var(--mono);font-size:10px">' + i.interaction_id.slice(0,8) + '</td>' +
    '<td style="font-size:12px">' + h(i.job_title || '—') + '</td>' +
    '<td>' + h(i.current_stage || '—') + '</td>' +
    '<td style="font-family:var(--mono);font-size:10px;color:var(--amber)">' + fmtDate(i.sla_deadline) + '</td>' +
    '<td><button style="font-family:var(--mono);font-size:10px;background:var(--blue);color:white;border:none;padding:4px 10px;cursor:pointer" onclick="selectInteraction(' + "'" + i.interaction_id + "'" + ',' + "'" + (i.job_title || '') + "'" + ')">Select →</button></td>' +
    '</tr>'
  ).join('');
}

function selectInteraction(interactionId, jobTitle) {
  _selectedInteractionId = interactionId;
  document.getElementById('rejection-selected-label').textContent = ' Selected: ' + jobTitle + ' (' + interactionId.slice(0,8) + ')';
  const btn = document.getElementById('rejection-send-btn');
  btn.disabled = false;
  btn.style.background = 'var(--blue)';
  btn.style.color = 'white';
  btn.style.cursor = 'pointer';
}

async function sendRejection() {
  if (!_selectedInteractionId) return;
  const code = document.getElementById('rejection-code-select').value;
  const notes = document.getElementById('rejection-notes-input').value.trim();
  if (!code) { alert('Please select a reason code.'); return; }
  const res = await api('POST', '/companies/me/interactions/' + _selectedInteractionId + '/reject', {
    reason_code: code,
    stage_notes: notes || undefined,
  });
  if (res) {
    alert('Rejection sent.');
    _selectedInteractionId = null;
    document.getElementById('rejection-selected-label').textContent = '';
    const btn = document.getElementById('rejection-send-btn');
    btn.disabled = true; btn.style.background = 'var(--border)'; btn.style.color = 'var(--text-dim)'; btn.style.cursor = 'default';
    document.getElementById('rejection-notes-input').value = '';
    _tabLoaded.rejections = false; loadRejections();
  } else {
    alert('Failed to send rejection. Please try again.');
  }
}

// ── Audit log tab ─────────────────────────────────────────────────────────────
let _auditLoaded = false;

async function loadAuditLog() {
  _auditLoaded = true;
  const data = await api('GET', '/companies/me/audit?limit=50');
  if (!data) return;

  const events = data.audit_log || [];
  const list = document.getElementById('auditlog-list');
  if (!events.length) {
    list.innerHTML = '<div class="audit-row"><span class="audit-time">—</span><div class="audit-dot blue"></div><span class="audit-msg">No audit events yet.</span><span></span></div>';
    return;
  }

  list.innerHTML = events.map(e => {
    const typeColors = { breach:'red', strike:'amber', system:'blue', resolved:'green', posted:'blue', score:'green', notice:'blue' };
    const color = typeColors[e.event_type] || 'blue';
    return '<div class="audit-row">' +
      '<span class="audit-time">' + fmtDate(e.occurred_at) + '</span>' +
      '<div class="audit-dot ' + color + '"></div>' +
      '<span class="audit-msg">' + h(e.summary) + '</span>' +
      '<span class="tag ' + (e.event_type === 'breach' ? 'fail' : e.event_type === 'strike' ? 'warn' : 'info') + ' audit-tag">' + h(e.event_type || '') + '</span>' +
      '</div>';
  }).join('');
}

async function exportAuditLog() {
  const res = await fetch(API_BASE + '/companies/me/audit?format=csv&limit=1000', { headers: authHeaders() });
  if (!res.ok) { alert('Export failed.'); return; }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fhp-audit-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

// ── Appeals tab ───────────────────────────────────────────────────────────────
async function loadAppeals() {
  const data = await api('GET', '/companies/me/appeals');
  if (!data) return;

  const appeals = data.appeals || [];

  const sub = document.querySelector('#page-appeals .page-subtitle');
  if (sub) {
    const active   = appeals.filter(a => a.status === 'submitted' || a.status === 'open' || a.status === 'under_review').length;
    const resolved = appeals.filter(a => a.status === 'resolved' || a.status === 'rejected' || a.status === 'upheld').length;
    sub.textContent = '// ' + active + ' active · ' + resolved + ' resolved';
  }

  const tbody = document.getElementById('appeals-tbody');
  if (!appeals.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:14px;color:var(--green);font-family:var(--mono);font-size:11px">✓ No appeals against your job briefs.</td></tr>';
    return;
  }

  tbody.innerHTML = appeals.map(a =>
    '<tr>' +
    '<td style="font-family:var(--mono);font-size:10px">' + a.appeal_id.slice(0,12) + '</td>' +
    '<td><div class="job-title">' + h(a.job_title || '—') + '</div></td>' +
    '<td style="font-size:11px">' + h(a.ground || '—') + '</td>' +
    '<td><span class="tag ' + appealTag(a.status) + '">' + h(a.status) + '</span></td>' +
    '<td style="font-family:var(--mono);font-size:10px;color:var(--amber)">' + (a.twg_deadline ? fmtDate(a.twg_deadline) : '—') + '</td>' +
    '<td class="mono-xs">' + h(a.outcome || 'Pending') + '</td>' +
    '</tr>'
  ).join('');
}

async function advanceInteraction(interactionId, jobTitle, currentStage) {
  var stageLabels = {
    initial_match_acknowledgement: 'Application Review',
    application_review:            'Screening Call',
    screening_call:                'Technical Assessment',
    technical_assessment:          'Interview',
    interview_stage:               'Offer',
    offer_stage:                   'Completed (Hired)',
  };
  var nextLabel = stageLabels[currentStage] || 'next stage';
  if (!confirm('Advance "' + jobTitle + '" to: ' + nextLabel + '?\n\nThis will notify the candidate and reset the SLA clock.')) return;
  var res = await api('POST', '/companies/me/interactions/' + interactionId + '/advance', {});
  if (res) {
    _tabLoaded.sla = false;
    loadSLA();
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  showPage('overview');
  _tabLoaded.overview = true;
  loadOverview();
});

// ════════════════════════════════════════════════════════════
//  JOB BRIEF DIALOG
// ════════════════════════════════════════════════════════════

let dialogMode = 'create';   // 'create' | 'edit'
let dialogJobId = null;
let jobSkills = [];           // { id, label, domain, type, minProficiency }
let jobCerts  = [];           // { cert_id, label, issuing_body, cert_type, requirement }

function openJobDialog(jobTitle, jobObj) {
  if (jobTitle) {
    dialogMode = 'edit';
    dialogJobId = (jobObj && jobObj.job_id) ? jobObj.job_id : null;
    document.getElementById('dialog-mode-title').textContent = 'Edit job brief';
    document.getElementById('dialog-subtitle').textContent = 'Edit brief · FHP v1.0 compliant';
    prefillJobDialog(jobTitle, jobObj);
  } else {
    dialogMode = 'create';
    dialogJobId = null;
    document.getElementById('dialog-mode-title').textContent = 'Post new job brief';
    document.getElementById('dialog-subtitle').textContent = 'New brief · FHP v1.0 compliant';
    resetJobDialog();
  }
  document.getElementById('job-dialog-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  renderJobSkills();
  renderJobCerts();
  validateJobDialog();
  updateProfGuidance();
  setTimeout(function() { document.getElementById('jd-title').focus(); }, 50);
}

function closeJobDialog() {
  document.getElementById('job-dialog-overlay').classList.remove('open');
  document.body.style.overflow = '';
  resetJobDialog();
}

function resetJobDialog() {
  ['jd-title','jd-summary','jd-city','jd-stages','jd-day-rate','jd-contract-months','jd-onsite-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('jd-employment-type').value = '';
  document.getElementById('jd-work-mode').value = '';
  document.getElementById('jd-currency').value = 'GBP';
  document.getElementById('jd-salary-min').value = '';
  document.getElementById('jd-salary-max').value = '';
  document.getElementById('jd-salary-period').value = 'annual';
  document.getElementById('jd-sla-days').value = '5';
  document.getElementById('jd-notice-n').value = '3';
  document.getElementById('jd-notice-unit').value = 'weeks';
  document.getElementById('jd-work-schedule').value = 'full_time';
  document.getElementById('jd-right-to-work').value = 'GB';
  document.getElementById('jd-expires').value = '';
  document.getElementById('jd-stages').value = 'Screening call, Technical assessment, Final interview';
  ['attest-degree','attest-age','attest-gaps','attest-prestige','attest-salary'].forEach(id => {
    document.getElementById(id).checked = false;
  });
  jobSkills = [];
  jobCerts  = [];
  var skillInput = document.getElementById('skill-add-input');
  if (skillInput) { skillInput.value = ''; delete skillInput.dataset.selectedId; delete skillInput.dataset.selectedDomain; }
  var certInput = document.getElementById('cert-add-input');
  if (certInput) { certInput.value = ''; delete certInput.dataset.selectedCertId; delete certInput.dataset.selectedCertType; }
  var skillSugg = document.getElementById('skill-add-suggestions');
  if (skillSugg) skillSugg.style.display = 'none';
  var certSugg = document.getElementById('cert-add-suggestions');
  if (certSugg) certSugg.style.display = 'none';
  toggleConditionalSections();
}

function prefillJobDialog(title, jobObj) {
  var d;
  if (jobObj) {
    // Real API job object — fields are flat (location_country, salary_minimum, etc.)
    var PROF_NUM = {1:'aware',2:'practitioner',3:'proficient',4:'expert',5:'authority'};
    d = {
      title:           jobObj.title || '',
      summary:         jobObj.role_summary || '',
      employment_type: jobObj.employment_type || 'permanent',
      work_mode:       jobObj.work_mode || 'onsite',
      currency:        jobObj.salary_currency || 'GBP',
      salary_min:      jobObj.salary_minimum != null ? parseFloat(jobObj.salary_minimum) : '',
      salary_max:      jobObj.salary_maximum != null ? parseFloat(jobObj.salary_maximum) : '',
      period:          jobObj.salary_period || 'annual',
      sla:             String(jobObj.response_sla_days || '5'),
      country:         jobObj.location_country || '',
      city:            jobObj.location_city || '',
      schedule:        jobObj.work_schedule || 'full_time',
      rtw:             jobObj.location_country || '',
      stages:          (jobObj.process_stages || []).join(', '),
      notice_n:        (function() {
                         var d = jobObj.max_notice_period_days;
                         if (d == null) return '3';
                         if (d === 0)   return '0';
                         if (d % 30 === 0) return String(d / 30);
                         return String(Math.round(d / 7));
                       })(),
      notice_unit:     (function() {
                         var d = jobObj.max_notice_period_days;
                         if (d == null || d === 0) return 'immediately';
                         if (d % 30 === 0)         return 'months';
                         return 'weeks';
                       })(),
      skills:          (jobObj.skills_required || []).map(function(s) {
                         var reqType = s.requirement_type || (s.requirement_level === 'required' ? 'must_have' : 'nice_to_have');
                         var prof = (typeof s.minimum_proficiency === 'number') ? (PROF_NUM[s.minimum_proficiency] || 'practitioner') : (s.min_proficiency || s.minimum_proficiency || 'practitioner');
                         return { id: s.ontology_id, label: s.label || s.ontology_id.replace('fhp:skill:','').replace(/-/g,' '), domain: s.domain || '', type: reqType, minProficiency: prof };
                       }),
      certs:           (jobObj.required_certifications || []).map(function(c) {
                         return { cert_id: c.cert_id, label: c.label || c.cert_id, cert_type: c.cert_type || 'certification', requirement: c.requirement || 'must_have' };
                       }),
      attest: {
        no_degree_requirement:     jobObj.attest_no_degree_requirement,
        no_graduation_year_filter: jobObj.attest_no_graduation_year_filter,
        no_institution_preference: jobObj.attest_no_institution_preference,
        no_unpaid_work:            jobObj.attest_no_unpaid_work,
      },
    };
  } else {
    // Fallback example data keyed by title (used when no real job object available)
    var DATA = {
      'Senior Backend Engineer': {
        title: 'Senior Backend Engineer', summary: 'Leading backend systems for our core payments platform. You will own the API layer, drive architectural decisions, and mentor junior engineers.',
        employment_type: 'permanent', work_mode: 'remote', currency: 'GBP',
        salary_min: '85000', salary_max: '110000', period: 'annual', sla: '5',
        country: 'GB', city: 'Remote', schedule: 'full_time', rtw: 'GB',
        notice_n: '4', notice_unit: 'weeks',
        stages: 'Screening call, Technical assessment, System design interview, Final interview',
        skills: [
          {id:'fhp:skill:python',    label:'Python',          domain:'Software Eng',    type:'must_have',    minProficiency:'proficient'},
          {id:'fhp:skill:docker',    label:'Docker',          domain:'Infrastructure',  type:'must_have',    minProficiency:'practitioner'},
          {id:'fhp:skill:kubernetes',label:'Kubernetes',      domain:'Infrastructure',  type:'nice_to_have', minProficiency:'practitioner'},
          {id:'fhp:skill:aws',       label:'AWS',             domain:'Infrastructure',  type:'nice_to_have', minProficiency:'practitioner'},
        ],
      },
      'Product Manager': {
        title: 'Product Manager', summary: 'Own the roadmap for our candidate-facing product. Work closely with engineering and design to ship features that make hiring fairer.',
        employment_type: 'permanent', work_mode: 'hybrid', currency: 'GBP',
        salary_min: '75000', salary_max: '95000', period: 'annual', sla: '5',
        country: 'GB', city: 'London', schedule: 'full_time', rtw: 'GB',
        notice_n: '3', notice_unit: 'months',
        stages: 'Screening call, Product case study, Stakeholder interview',
        skills: [
          {id:'fhp:skill:product-mgmt', label:'Product Management', domain:'Product',  type:'must_have',    minProficiency:'proficient'},
          {id:'fhp:skill:agile',        label:'Agile / Scrum',      domain:'Process',  type:'must_have',    minProficiency:'practitioner'},
          {id:'fhp:skill:sql',          label:'Analytical SQL',     domain:'Data',     type:'nice_to_have', minProficiency:'aware'},
        ],
      },
    };
    d = DATA[title];
    if (!d) return;
  }
  document.getElementById('jd-title').value           = d.title;
  document.getElementById('jd-summary').value         = d.summary;
  document.getElementById('jd-employment-type').value = d.employment_type;
  document.getElementById('jd-work-mode').value       = d.work_mode;
  document.getElementById('jd-currency').value        = d.currency;
  document.getElementById('jd-salary-min').value      = d.salary_min;
  document.getElementById('jd-salary-max').value      = d.salary_max;
  document.getElementById('jd-salary-period').value   = d.period;
  document.getElementById('jd-sla-days').value        = d.sla;
  document.getElementById('jd-country').value         = d.country;
  document.getElementById('jd-city').value            = d.city;
  document.getElementById('jd-work-schedule').value   = d.schedule;
  document.getElementById('jd-right-to-work').value   = d.rtw;
  document.getElementById('jd-notice-n').value        = d.notice_n;
  document.getElementById('jd-notice-unit').value     = d.notice_unit;
  document.getElementById('jd-stages').value          = d.stages;
  jobSkills = d.skills.map(function(s) { return Object.assign({}, s); });
  jobCerts  = (d.certs || []).map(function(c) { return Object.assign({}, c); });
  if (d.attest) {
    // DB has 4 columns; attest-gaps has no DB backing so default true when editing an existing job
    if (d.attest.no_degree_requirement     != null) document.getElementById('attest-degree').checked   = d.attest.no_degree_requirement;
    if (d.attest.no_graduation_year_filter != null) document.getElementById('attest-age').checked      = d.attest.no_graduation_year_filter;
    document.getElementById('attest-gaps').checked = true; // not stored separately; carried forward on edit
    if (d.attest.no_institution_preference != null) document.getElementById('attest-prestige').checked = d.attest.no_institution_preference;
    if (d.attest.no_unpaid_work            != null) document.getElementById('attest-salary').checked   = d.attest.no_unpaid_work;
  } else {
    ['attest-degree','attest-age','attest-gaps','attest-prestige','attest-salary'].forEach(function(id) {
      document.getElementById(id).checked = true;
    });
  }
  toggleConditionalSections();
}

// ── Conditional sections (hybrid / contract details) ──────────────────────────
function toggleConditionalSections() {
  const mode    = document.getElementById('jd-work-mode').value;
  const empType = document.getElementById('jd-employment-type').value;
  document.getElementById('hybrid-details').classList.toggle('visible', mode === 'hybrid');
  document.getElementById('contract-details').classList.toggle('visible', empType === 'contract');
  validateJobDialog();
}

// ── Certifications ────────────────────────────────────────────────────────────
var _dialogSkillTimer = null;
var _dialogSkillSuggestions = []; // indexed by onmousedown to avoid JSON-in-attribute escaping
var _jobCertTimer = null;
var _jobCertSuggestions = []; // indexed by onmousedown to avoid JSON-in-attribute escaping

function filterJobCerts(val) {
  var sugg = document.getElementById('cert-add-suggestions');
  if (!val || val.length < 2) { sugg.style.display = 'none'; return; }
  clearTimeout(_jobCertTimer);
  _jobCertTimer = setTimeout(function() {
    fetch(API_BASE + '/ontology/certifications?q=' + encodeURIComponent(val) + '&limit=10')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        _jobCertSuggestions = (data.certifications || []).filter(function(c) {
          return !jobCerts.find(function(x) { return x.cert_id === c.cert_id; });
        });
        if (!_jobCertSuggestions.length) { sugg.style.display = 'none'; return; }
        sugg.style.display = 'block';
        sugg.innerHTML = _jobCertSuggestions.map(function(c, i) {
          var typeLbl = c.cert_type === 'licence' ? 'LICENCE' : c.cert_type === 'membership' ? 'MEMBERSHIP' : 'CERT';
          return '<div style="padding:7px 11px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px" '
            + 'onmouseover="this.style.background=\'var(--blue-dim)\'" '
            + 'onmouseout="this.style.background=\'\'" '
            + 'onmousedown="selectJobCertByIndex(' + i + ')">'
            + '<span style="font-weight:500;color:var(--text)">' + h(c.label) + '</span>'
            + ' <span style="font-family:var(--mono);font-size:9px;color:var(--text-dim)">' + typeLbl + ' &middot; ' + h(c.issuing_body) + '</span>'
            + '</div>';
        }).join('');
      })
      .catch(function() { sugg.style.display = 'none'; });
  }, 180);
}

function selectJobCertByIndex(i) {
  selectJobCert(_jobCertSuggestions[i]);
}

function selectJobCert(c) {
  var input = document.getElementById('cert-add-input');
  if (input) { input.value = c.label; input.dataset.selectedCertId = c.cert_id; input.dataset.selectedCertType = c.cert_type; }
  var sugg = document.getElementById('cert-add-suggestions');
  if (sugg) sugg.style.display = 'none';
  // Licences are always must_have — update the dropdown
  var reqSel = document.getElementById('cert-add-requirement');
  if (reqSel && c.cert_type === 'licence') reqSel.value = 'must_have';
}

function addCertToJob() {
  var input = document.getElementById('cert-add-input');
  if (!input || !input.dataset.selectedCertId) {
    var sugg = document.getElementById('cert-add-suggestions');
    if (sugg) { sugg.style.display = 'block'; sugg.innerHTML = '<div style="padding:7px 11px;font-size:12px;color:var(--rust)">Please select from the suggestions list.</div>'; }
    return;
  }
  var certId   = input.dataset.selectedCertId;
  var certType = input.dataset.selectedCertType;
  var req      = document.getElementById('cert-add-requirement').value;
  // Licences are always must_have regardless of dropdown
  if (certType === 'licence') req = 'must_have';
  if (jobCerts.find(function(c) { return c.cert_id === certId; })) { input.value = ''; return; }
  jobCerts.push({ cert_id: certId, label: input.value, cert_type: certType, requirement: req });
  input.value = '';
  delete input.dataset.selectedCertId;
  delete input.dataset.selectedCertType;
  renderJobCerts();
}

function removeJobCert(i) {
  jobCerts.splice(i, 1);
  renderJobCerts();
}

function renderJobCerts() {
  var list = document.getElementById('cert-req-list');
  if (!list) return;
  if (!jobCerts.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:4px 0">No licences or certifications required.</div>';
    return;
  }
  list.innerHTML = jobCerts.map(function(c, i) {
    var typeCls = c.cert_type === 'licence' ? 'skill-tag-must' : 'skill-tag-nice';
    var typeLabel = c.cert_type === 'licence' ? 'LICENCE' : c.cert_type === 'membership' ? 'MEMBERSHIP' : 'CERT';
    var reqLabel  = c.requirement === 'must_have' ? 'Required' : 'Preferred';
    return '<div class="skill-req-item">'
      + '<div>'
      + '<div class="skill-req-name">' + h(c.label) + '</div>'
      + '<div class="skill-req-domain">' + typeLabel + '</div>'
      + '</div>'
      + '<div class="' + typeCls + '">' + reqLabel + '</div>'
      + '<button class="skill-remove-btn" onclick="removeJobCert(' + i + ')">&#10005;</button>'
      + '</div>';
  }).join('');
}

// ── Skills ────────────────────────────────────────────────────────────────────
const PROF_LABELS = {aware:'Aware',practitioner:'Practitioner',proficient:'Proficient',expert:'Expert',authority:'Authority'};
const PROF_DEFS = {
  aware:        { job_brief_guidance: 'Candidate will need active mentoring to apply this skill. Do not list as a must-have unless you are prepared to invest significantly in training.' },
  practitioner: { job_brief_guidance: 'Can contribute independently on standard tasks. Needs support for complex or novel scenarios. A realistic entry-level must-have for most roles.' },
  proficient:   { job_brief_guidance: 'Solid independent contributor. Handles most scenarios without escalation. Safe must-have baseline for most mid-level and above roles.' },
  expert:       { job_brief_guidance: 'Can define technical direction and resolve issues others cannot. Reserve for roles where this depth is genuinely required — avoid defaulting to Expert as a standard must-have.' },
  authority:    { job_brief_guidance: 'Rare. Only require this for roles where external credibility and discipline leadership are a genuine part of the job. Most senior roles do not require Authority.' },
};

function updateProfGuidance() {
  var sel = document.getElementById('skill-add-proficiency');
  var box = document.getElementById('prof-guidance-box');
  if (!sel || !box) return;
  var def = PROF_DEFS[sel.value];
  box.textContent = def ? def.job_brief_guidance : '';
  box.style.display = def ? '' : 'none';
}

function renderJobSkills() {
  const list = document.getElementById('skill-req-list');
  if (!jobSkills.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:8px 0">No skills added yet. At least one must-have skill is required.</div>';
    return;
  }
  list.innerHTML = jobSkills.map((s, i) => `
    <div class="skill-req-item">
      <div>
        <div class="skill-req-name">${h(s.label)}</div>
        <div class="skill-req-domain">${h(s.domain)}</div>
      </div>
      <div class="${s.type === 'must_have' ? 'skill-tag-must' : 'skill-tag-nice'}">
        ${s.type === 'must_have' ? 'Must-have' : 'Nice-to-have'}
      </div>
      <div class="mono-xs">
        Min: ${h(PROF_LABELS[s.minProficiency] || s.minProficiency)}
      </div>
      <button class="skill-remove-btn" onclick="removeJobSkill(${i})">&#10005;</button>
    </div>`).join('');
  validateJobDialog();
}

function removeJobSkill(i) {
  jobSkills.splice(i, 1);
  clearAttestations('Skill changes');
  renderJobSkills();
}

function filterDialogSkills(val) {
  const sugg = document.getElementById('skill-add-suggestions');
  if (!val || val.length < 1) { sugg.style.display = 'none'; return; }
  clearTimeout(_dialogSkillTimer);
  _dialogSkillTimer = setTimeout(function() {
    fetch(API_BASE + '/ontology/skills?q=' + encodeURIComponent(val) + '&limit=15')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        _dialogSkillSuggestions = (data.skills || []).filter(function(s) {
          return !jobSkills.find(function(j) { return j.id === s.skill_id; });
        });
        if (!_dialogSkillSuggestions.length) { sugg.style.display = 'none'; return; }
        sugg.style.display = 'block';
        sugg.innerHTML = _dialogSkillSuggestions.map(function(s, i) {
          return '<div style="padding:7px 11px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center"'
            + ' onmouseover="this.style.background=\'var(--bg-hover)\'" onmouseout="this.style.background=\'\'"'
            + ' onmousedown="selectDialogSkillByIndex(' + i + ')">'
            + '<span style="font-weight:500;color:var(--text)">' + h(s.label) + '</span>'
            + '<span style="font-family:var(--mono);font-size:9px;color:var(--text-dim)">' + h(s.domain) + '</span>'
            + '</div>';
        }).join('');
      })
      .catch(function() { sugg.style.display = 'none'; });
  }, 180);
}

function selectDialogSkillByIndex(i) {
  var s = _dialogSkillSuggestions[i];
  if (!s) return;
  selectDialogSkill(s.skill_id, s.label, s.domain);
}

function selectDialogSkill(id, label, domain) {
  document.getElementById('skill-add-input').value = label;
  document.getElementById('skill-add-suggestions').style.display = 'none';
  document.getElementById('skill-add-input').dataset.selectedId = id;
  document.getElementById('skill-add-input').dataset.selectedDomain = domain || '';
}

function addSkillToJob() {
  const input = document.getElementById('skill-add-input');
  const label = input.value.trim();
  if (!label) return;
  // Require selection from ontology suggestions — free-text skills break matching
  if (!input.dataset.selectedId) {
    const sugg = document.getElementById('skill-add-suggestions');
    sugg.style.display = 'block';
    sugg.innerHTML = '<div style="padding:7px 11px;font-size:12px;color:var(--rust)">Please select a skill from the suggestions list.</div>';
    return;
  }
  const id     = input.dataset.selectedId;
  const domain = input.dataset.selectedDomain || '';
  const type   = document.getElementById('skill-add-type').value;
  const prof   = document.getElementById('skill-add-proficiency').value;
  if (jobSkills.find(s => s.id === id)) { input.value = ''; return; }
  jobSkills.push({ id, label, domain, type, minProficiency: prof });
  input.value = '';
  delete input.dataset.selectedId;
  delete input.dataset.selectedDomain;
  document.getElementById('skill-add-suggestions').style.display = 'none';
  clearAttestations('Skill changes');
  renderJobSkills();
}

// ── Attestation validation ────────────────────────────────────────────────────
function validateAttestations() {
  const allChecked = ['attest-degree','attest-age','attest-gaps','attest-prestige','attest-salary']
    .every(id => document.getElementById(id).checked);
  document.getElementById('attest-warning').style.display = allChecked ? 'none' : 'block';
  validateJobDialog();
}

// Called when salary or skills change — sensitive fields require re-attestation
function clearAttestations(reason) {
  if (dialogMode !== 'edit') return; // new briefs always start unchecked
  ['attest-degree','attest-age','attest-gaps','attest-prestige','attest-salary'].forEach(id => {
    document.getElementById(id).checked = false;
  });
  const w = document.getElementById('attest-warning');
  w.style.display = 'block';
  w.textContent = (reason || 'Changes to sensitive fields') + ' require re-attestation before saving.';
  validateJobDialog();
}

// ── Overall dialog validation ─────────────────────────────────────────────────
function validateJobDialog() {
  const title   = (document.getElementById('jd-title')?.value || '').trim();
  const summary = (document.getElementById('jd-summary')?.value || '').trim();
  const empType = document.getElementById('jd-employment-type')?.value;
  const mode    = document.getElementById('jd-work-mode')?.value;
  const sMin    = parseFloat(document.getElementById('jd-salary-min')?.value || '0');
  const sMax    = parseFloat(document.getElementById('jd-salary-max')?.value || '0');
  const allAttest = ['attest-degree','attest-age','attest-gaps','attest-prestige','attest-salary']
    .every(id => document.getElementById(id)?.checked);
  const hasMustHave = jobSkills.some(s => s.type === 'must_have');

  const msgs = [];
  if (!title)          msgs.push('Title required');
  if (summary.length < 50) msgs.push('Summary too short');
  if (!empType)        msgs.push('Employment type required');
  if (!mode)           msgs.push('Work mode required');
  if (!sMin || !sMax)  msgs.push('Salary range required');
  if (sMin >= sMax)    msgs.push('Max salary must exceed min');
  if (!hasMustHave)    msgs.push('At least one must-have skill required');
  if (!allAttest)      msgs.push('All 5 attestations required');

  const msgEl  = document.getElementById('dialog-validation-msg');
  const saveBtn = document.getElementById('dialog-save-btn');
  if (msgs.length) {
    msgEl.textContent = msgs[0];
    saveBtn.disabled = true;
  } else {
    msgEl.textContent = '';
    saveBtn.disabled = false;
    saveBtn.textContent = dialogMode === 'edit' ? 'Save changes' : 'Post brief';
  }
}

// ── Save / submit ─────────────────────────────────────────────────────────────
function saveJobBrief() {
  const payload = {
    title:            document.getElementById('jd-title').value.trim(),
    role_summary:     document.getElementById('jd-summary').value.trim(),
    employment_type:  document.getElementById('jd-employment-type').value,
    work_mode:        document.getElementById('jd-work-mode').value,
    location_country: document.getElementById('jd-country').value,
    location_city:    document.getElementById('jd-city').value.trim() || null,
    salary_currency:  document.getElementById('jd-currency').value,
    salary_minimum:   parseFloat(document.getElementById('jd-salary-min').value),
    salary_maximum:   parseFloat(document.getElementById('jd-salary-max').value),
    salary_period:    document.getElementById('jd-salary-period').value,
    response_sla_days: parseInt(document.getElementById('jd-sla-days').value),
    max_notice_period_days: (function() {
      var unit = document.getElementById('jd-notice-unit').value;
      if (unit === 'immediately') return 0;
      var n = parseInt(document.getElementById('jd-notice-n').value, 10);
      if (!n || n < 0) return null;
      return unit === 'months' ? n * 30 : n * 7;
    })(),
    process_stages: (function() {
      var raw = (document.getElementById('jd-stages').value || '').trim();
      if (!raw) return null;
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    })(),
    skills_required: jobSkills.map(s => ({
      ontology_id:      s.id,
      label:            s.label,
      requirement_type: s.type,
      min_proficiency:  s.minProficiency,
    })),
    required_certifications: jobCerts.map(c => ({
      cert_id:     c.cert_id,
      requirement: c.requirement,
    })),
    attest_no_degree_requirement:     document.getElementById('attest-degree').checked,
    attest_no_graduation_year_filter: document.getElementById('attest-age').checked,
    attest_no_institution_preference: document.getElementById('attest-prestige').checked,
    attest_no_unpaid_work:            document.getElementById('attest-salary').checked,
  };

  const saveBtn = document.getElementById('dialog-save-btn');
  const msgEl   = document.getElementById('dialog-validation-msg');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving\u2026';
  msgEl.textContent = '';

  const apiPath = dialogMode === 'edit' ? '/jobs/' + dialogJobId : '/jobs';
  const method  = dialogMode === 'edit' ? 'PUT' : 'POST';

  api(method, apiPath, payload).then(function(result) {
    if (result) {
      closeJobDialog();
      _tabLoaded.jobs = false;
      if (document.getElementById('page-jobs').style.display !== 'none') loadJobs();
    } else {
      msgEl.textContent = (_lastApiError && (_lastApiError.detail || _lastApiError.message)) ? (_lastApiError.detail || _lastApiError.message) : 'Save failed \u2014 please try again.';
      saveBtn.disabled = false;
      saveBtn.textContent = dialogMode === 'edit' ? 'Save changes' : 'Post brief';
    }
  }).catch(function() {
    msgEl.textContent = 'Network error \u2014 please try again.';
    saveBtn.disabled = false;
    saveBtn.textContent = dialogMode === 'edit' ? 'Save changes' : 'Post brief';
  });
}

// Close on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('job-dialog-overlay').classList.contains('open')) {
    closeJobDialog();
  }
});