// ── Auth ──────────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000/v1';
let _token = sessionStorage.getItem('fhp_access_token');
let _govToken = sessionStorage.getItem('fhp_gov_token');
let _govRole = null;
let _govDisplayName = null;

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (_token || '') };
}

function govAuthHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (_govToken || '') };
}

// Public reads — 401 is silently ignored (dashboard is publicly viewable)
async function api(method, path, body) {
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.ok ? await res.json() : null;
  } catch (e) {
    console.error('API error:', method, path, e);
    return null;
  }
}

// Authenticated writes — 401 redirects to login
async function apiAuth(method, path, body) {
  if (!_token) { window.location.href = 'landing-page.html'; return null; }
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { sessionStorage.clear(); window.location.href = 'landing-page.html'; return null; }
    if (!res.ok) throw await res.json();
    return res.json();
  } catch (e) {
    console.error('API auth error:', method, path, e);
    throw e;
  }
}

// Governance authenticated writes — 401 prompts re-login rather than redirect
async function apiGov(method, path, body) {
  if (!_govToken) { showGovLogin(); return null; }
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: govAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      sessionStorage.removeItem('fhp_gov_token');
      _govToken = null;
      showGovLogin();
      return null;
    }
    if (!res.ok) throw await res.json();
    return res.json();
  } catch (e) {
    console.error('apiGov error:', method, path, e);
    throw e;
  }
}

// ── Tab navigation ────────────────────────────────────────────────────────────
const GOV_TABS = ['overview','escalations','fairness','proposals','auditlog','votes'];
const _tabLoaded = {};

function govShowTab(tabId) {
  GOV_TABS.forEach(t => {
    const el  = document.getElementById('gov-' + t);
    const nav = document.getElementById('gov-tab-' + t);
    if (el)  el.style.display  = t === tabId ? '' : 'none';
    if (nav) nav.classList.toggle('active', t === tabId);
  });
  const sidebar = document.querySelector('.col-side');
  const newsroom = document.querySelector('.newsroom');
  if (tabId === 'overview') {
    sidebar.style.display = '';
    newsroom.style.gridTemplateColumns = '';
  } else {
    sidebar.style.display = 'none';
    newsroom.style.gridTemplateColumns = '1fr';
  }
  if (!_tabLoaded[tabId]) {
    _tabLoaded[tabId] = true;
    switch (tabId) {
      case 'escalations': loadEscalations(); break;
      case 'fairness':    loadGovFairness(); break;
      case 'proposals':   loadProposals(); break;
      case 'auditlog':    loadGovAuditLog(); break;
      case 'votes':       loadVotes(); break;
    }
  }
}

function viewNotice(noticeId) {
  const panel = document.getElementById('notice-panel');
  if (panel) { panel.style.display = panel.style.display === 'none' ? '' : 'none'; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function h(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtScore(v, dp) {
  if (v == null) return '—';
  return parseFloat(v).toFixed(dp != null ? dp : 3);
}

function fmtEscType(raw) {
  return (raw || '—').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function renderEscalationItem(e, allowRespond = true) {
  const prioClass = { critical:'critical', urgent:'urgent', standard:'standard' }[e.priority] || 'standard';
  const escId = e.escalation_id || '';
  const safeId = escId.replace(/[^a-zA-Z0-9]/g, '');
  const canRespond = allowRespond && (_govRole === 'governance' || _govRole === 'admin');

  let respondHtml = '';
  if (canRespond && escId) {
    respondHtml =
      '<div class="esc-respond-row">' +
        '<div class="esc-respond-form" id="esc-respond-' + safeId + '">' +
          '<div class="esc-respond-grid">' +
            '<div>' +
              '<div class="esc-respond-label">Status</div>' +
              '<select id="esc-status-' + safeId + '">' +
                '<option value="">— Select —</option>' +
                '<option value="in_review">In Review</option>' +
                '<option value="pending_response">Pending Response</option>' +
                '<option value="resolved">Resolved</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<div class="esc-respond-label">Outcome</div>' +
              '<select id="esc-outcome-' + safeId + '">' +
                '<option value="">— Select —</option>' +
                '<option value="pending">Pending</option>' +
                '<option value="upheld">Upheld</option>' +
                '<option value="not_upheld">Not Upheld</option>' +
                '<option value="partially_upheld">Partially Upheld</option>' +
                '<option value="referred">Referred</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="esc-respond-label">Outcome Notes</div>' +
          '<textarea id="esc-notes-' + safeId + '" rows="2" placeholder="Internal notes…"></textarea>' +
          '<div class="esc-respond-label">Public Summary (shown externally on resolve)</div>' +
          '<textarea id="esc-public-' + safeId + '" rows="2" placeholder="Optional public summary…"></textarea>' +
          '<button class="gov-btn-primary" style="font-size:10px;padding:6px 14px" ' +
            'onclick="submitEscalationResponse(\'' + escId + '\',\'' + safeId + '\')">Submit Response</button>' +
          '<div class="esc-respond-msg" id="esc-msg-' + safeId + '" style="display:none"></div>' +
        '</div>' +
      '</div>';
  }

  const respondBtn = (canRespond && escId)
    ? '<button class="esc-respond-toggle" style="margin-left:auto" onclick="toggleEscalationRespond(\'' + safeId + '\')">Respond</button>'
    : '';

  return '<div class="escalation-item ' + prioClass + '" style="margin-top:8px">' +
    '<div class="esc-header">' +
    '<span class="esc-type">' + h(fmtEscType(e.escalation_type)) + '</span>' +
    '<span class="esc-priority ' + prioClass + '">' + h(e.priority || '—') + '</span>' +
    '<span class="esc-id">' + (escId ? escId.slice(0,16) : '—') + '</span>' +
    respondBtn +
    '</div>' +
    '<div class="esc-body">' +
    '<div class="esc-summary">' + h(e.public_summary || e.outcome_notes || '') + '</div>' +
    '<div class="esc-meta">' +
    '<span>Assignee: <strong>' + h(e.assignee_body || '—') + '</strong></span>' +
    '<span>Deadline: <strong>' + fmtDate(e.resolution_deadline) + '</strong></span>' +
    '<span>Status: <strong>' + h(e.status || '—') + '</strong></span>' +
    '</div>' +
    '</div>' +
    respondHtml +
    '</div>';
}

function toggleEscalationRespond(safeId) {
  const form = document.getElementById('esc-respond-' + safeId);
  if (form) form.style.display = form.style.display === 'block' ? 'none' : 'block';
}

async function submitEscalationResponse(escId, safeId) {
  const msgEl = document.getElementById('esc-msg-' + safeId);
  msgEl.style.display = 'none';

  const status        = document.getElementById('esc-status-'  + safeId).value;
  const outcome       = document.getElementById('esc-outcome-' + safeId).value;
  const outcome_notes = document.getElementById('esc-notes-'   + safeId).value.trim();
  const public_summary = document.getElementById('esc-public-' + safeId).value.trim();

  if (!status) {
    msgEl.textContent = 'Please select a status.';
    msgEl.className = 'esc-respond-msg err';
    msgEl.style.display = '';
    return;
  }

  try {
    const body = { status };
    if (outcome)        body.outcome        = outcome;
    if (outcome_notes)  body.outcome_notes  = outcome_notes;
    if (public_summary) body.public_summary = public_summary;
    await apiGov('PUT', '/governance/escalations/' + escId, body);
    msgEl.textContent = '✓ Response submitted.';
    msgEl.className = 'esc-respond-msg ok';
    msgEl.style.display = '';
    setTimeout(() => { _tabLoaded.escalations = false; loadEscalations(); }, 1500);
  } catch (err) {
    msgEl.textContent = (err && err.message) ? err.message : 'Failed to submit response.';
    msgEl.className = 'esc-respond-msg err';
    msgEl.style.display = '';
  }
}

// ── Overview load ─────────────────────────────────────────────────────────────
async function loadOverview() {
  const [summary, escalations, audit, bodiesData] = await Promise.all([
    api('GET', '/governance/summary'),
    api('GET', '/governance/escalations?limit=5&status=open'),
    api('GET', '/governance/audit?limit=5&public_only=true'),
    api('GET', '/governance/bodies'),
  ]);

  if (summary) {
    // Health grid
    const co = summary.companies || {};
    document.getElementById('hc-active').textContent = co.active != null ? co.active : '—';
    document.getElementById('hc-active-note').textContent = co.total_registered + ' registered · ' + (co.suspended || 0) + ' suspended';

    const esc = summary.escalations || {};
    document.getElementById('hc-escalations').textContent = esc.total_open != null ? esc.total_open : '—';
    document.getElementById('hc-escalations-note').textContent =
      (esc.critical || 0) + ' critical · ' + (esc.urgent || 0) + ' urgent';

    const pf = summary.platform_fairness || {};
    document.getElementById('hc-dir').textContent = pf.platform_dir != null ? fmtScore(pf.platform_dir) : '—';
    document.getElementById('hc-dir-note').textContent =
      (pf.dir_breach_count || 0) + ' company breach(es)';

    document.getElementById('hc-proposals').textContent = (summary.proposals || {}).open != null ? summary.proposals.open : '—';

    // Platform fairness metrics
    const setPM = (id, val, ok, pct) => {
      const color = ok ? 'var(--green)' : 'var(--crimson, #c0392b)';
      const fill = document.getElementById('pm-' + id + '-fill');
      const valEl = document.getElementById('pm-' + id + '-val');
      const statusEl = document.getElementById('pm-' + id + '-status');
      if (fill) fill.style.width = Math.min(100, pct) + '%';
      if (fill) fill.style.background = ok ? 'var(--green)' : 'var(--amber)';
      if (valEl) { valEl.textContent = fmtScore(val); valEl.style.color = color; }
      if (statusEl) { statusEl.textContent = ok ? '✓ OK' : '✗ Breach'; statusEl.style.color = color; }
    };
    if (pf) {
      setPM('dir', pf.platform_dir, pf.dir_breach_count === 0, (pf.platform_dir || 0) * 100);
      setPM('eod', pf.platform_eod, Math.abs(pf.platform_eod || 0) <= 0.05, (1 - Math.abs(pf.platform_eod || 0) / 0.05) * 100);
      setPM('sds', pf.platform_sds, Math.abs(pf.platform_sds || 0) <= 0.03, (1 - Math.abs(pf.platform_sds || 0) / 0.03) * 100);
      document.getElementById('pm-summary').textContent =
        'Platform metrics computed ' + fmtDate(pf.last_computed) + '. ' +
        (pf.dir_breach_count || 0) + ' DIR · ' + (pf.eod_breach_count || 0) + ' EOD · ' + (pf.sds_breach_count || 0) + ' SDS company-level breach(es).';
    }

    // FHP version in header if available
    if (summary.fhp_version) {
      const verEl = document.querySelector('.masthead-sub');
      if (verEl) verEl.textContent = 'Protocol v' + summary.fhp_version + ' · Governance Terminal';
    }
  }

  // Overview escalations
  if (escalations) {
    const items = escalations.escalations || [];
    const el = document.getElementById('overview-escalations-list');
    el.innerHTML = items.length ? items.map(e => renderEscalationItem(e, false)).join('') :
      '<div style="font-family:var(--mono);font-size:11px;color:var(--green);padding:12px 0">✓ No open escalations.</div>';
  }

  // Overview audit record
  if (audit) {
    const entries = audit.entries || audit.audit_entries || [];
    const el = document.getElementById('overview-audit-entries');
    el.innerHTML = entries.length
      ? entries.map(e =>
          '<div class="audit-entry">' +
          '<div class="audit-headline">' + h(e.headline || e.summary || '—') + '</div>' +
          '<div class="audit-byline">' + h(e.event_type || '').toUpperCase() + ' · ' + fmtDate(e.occurred_at || e.created_at) + (e.resolution_ref ? ' · ' + h(e.resolution_ref) : '') + '</div>' +
          (e.detail ? '<div class="audit-lede">' + h(e.detail) + '</div>' : '') +
          '</div>'
        ).join('')
      : '<div class="mono-sm-muted">No public audit entries yet.</div>';
  }

  // Live feed sidebar
  const feedList = document.getElementById('live-feed-list');
  const feedEntries = audit ? (audit.entries || audit.audit_entries || []) : [];
  if (feedEntries.length) {
    feedList.innerHTML = feedEntries.slice(0, 6).map(e =>
      '<div class="live-feed-item">' +
      '<div class="feed-dot blue"></div>' +
      '<span class="feed-time">' + fmtDate(e.occurred_at || e.created_at) + '</span>' +
      '<span class="feed-msg">' + h(e.summary || e.headline || '—') + '</span>' +
      '</div>'
    ).join('');
  } else {
    feedList.innerHTML = '<div class="live-feed-item"><div class="feed-dot"></div><span class="feed-time">—</span><span class="feed-msg" style="color:var(--ink-light)">No public governance events yet.</span></div>';
  }

  // Governance bodies sidebar
  const bodiesList = document.getElementById('gov-bodies-list');
  if (bodiesData && (bodiesData.bodies || []).length) {
    bodiesList.innerHTML = bodiesData.bodies.map(b => {
      const memberLine = b.membership_type === 'open'
        ? 'Open membership'
        : (b.member_count || '—') + ' member' + (b.member_count !== 1 ? 's' : '');
      const itemLine = b.open_item_count > 0
        ? b.open_item_count + ' open item' + (b.open_item_count !== 1 ? 's' : '')
        : 'No open items';
      const voteNote = b.open_votes > 0 ? ' · ' + b.open_votes + ' pending vote' + (b.open_votes !== 1 ? 's' : '') : '';
      const queueHtml = (b.queue_items || []).map(q => {
        const due = q.deadline ? ' · due ' + fmtDate(q.deadline) : '';
        const soon = q.deadline && (new Date(q.deadline) - Date.now()) < 7 * 86400000;
        return '<span class="body-queue-item' + (soon ? ' due-soon' : '') + '">' +
          h(q.ref.slice(0, 8)) + due + '</span>';
      }).join('');
      return '<div class="body-card">' +
        '<span class="body-acronym">' + h(b.acronym) + '</span>' +
        '<div class="body-name">' + h(b.full_name) + '</div>' +
        '<div class="body-status">' + memberLine + ' · ' + itemLine + voteNote + '</div>' +
        (queueHtml ? '<div class="body-queue">' + queueHtml + '</div>' : '') +
        '</div>';
    }).join('');
  } else {
    bodiesList.innerHTML = '<div class="mono-xs">No body data.</div>';
  }

  // Recent votes sidebar
  const votesData = await api('GET', '/governance/votes?limit=4');
  if (votesData) updateRecentVotesSidebar(votesData.votes || []);
}

// ── Escalations tab ───────────────────────────────────────────────────────────
let _allEscalations = [];

async function loadEscalations() {
  const data = await api('GET', '/governance/escalations');
  if (!data) return;
  _allEscalations = data.escalations || [];
  renderEscalationsList(_allEscalations);
}

function renderEscalationsList(items) {
  const el = document.getElementById('escalations-list');
  el.innerHTML = items.length ? items.map(renderEscalationItem).join('') :
    '<div style="font-family:var(--mono);font-size:11px;color:var(--green);padding:12px 0">✓ No escalations match these filters.</div>';
}

function applyEscFilters() {
  const type     = document.getElementById('esc-filter-type').value;
  const priority = document.getElementById('esc-filter-priority').value;
  const body     = document.getElementById('esc-filter-body').value;
  const filtered = _allEscalations.filter(e =>
    (!type     || e.escalation_type === type) &&
    (!priority || e.priority === priority) &&
    (!body     || e.assigned_body === body)
  );
  renderEscalationsList(filtered);
}

// ── Fairness tab ──────────────────────────────────────────────────────────────
async function loadGovFairness() {
  const data = await api('GET', '/governance/fairness/companies');
  if (!data) return;

  const companies = data.companies || data.fairness || [];
  const tbody = document.getElementById('gov-fairness-tbody');
  if (!companies.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="panel-mono-pad">No fairness data available.</td></tr>';
    return;
  }

  tbody.innerHTML = companies.map(c => {
    const dirOk = c.dir_within_bounds !== false;
    const eodOk = c.eod_within_bounds !== false;
    const sdsOk = c.sds_within_bounds !== false;
    const allOk = dirOk && eodOk && sdsOk;
    const status = c.status === 'suspended' ? 'SUSPENDED' : allOk ? 'All OK' : 'Breach';
    const statusColor = c.status === 'suspended' ? 'var(--crimson,#c0392b)' : allOk ? 'var(--green)' : 'var(--amber)';
    return '<tr style="border-bottom:1px solid var(--rule)">' +
      '<td style="padding:10px 16px;font-weight:600;font-family:var(--serif)">' + h(c.legal_name || c.company_id) + '</td>' +
      '<td style="padding:10px 12px;font-family:var(--mono);color:' + (dirOk ? 'inherit' : 'var(--crimson,#c0392b)') + '">' + fmtScore(c.dir_value) + (dirOk ? '' : ' ✗') + '</td>' +
      '<td style="padding:10px 12px;font-family:var(--mono);color:' + (eodOk ? 'inherit' : 'var(--crimson,#c0392b)') + '">' + fmtScore(c.eod_value) + (eodOk ? '' : ' ✗') + '</td>' +
      '<td style="padding:10px 12px;font-family:var(--mono);color:' + (sdsOk ? 'inherit' : 'var(--crimson,#c0392b)') + '">' + fmtScore(c.sds_value) + (sdsOk ? '' : ' ✗') + '</td>' +
      '<td style="padding:10px 12px;font-family:var(--mono)">' + (c.consecutive_breach_windows || 0) + '</td>' +
      '<td style="padding:10px 12px"><span style="font-family:var(--mono);font-size:9px;padding:2px 6px;color:' + statusColor + '">' + status + '</span></td>' +
      '</tr>';
  }).join('');
}

// ── Proposals tab ─────────────────────────────────────────────────────────────
async function loadProposals() {
  const data = await api('GET', '/governance/proposals?status=under_review');
  if (!data) return;

  const proposals = data.proposals || [];
  const el = document.getElementById('proposals-list');
  if (!proposals.length) {
    el.innerHTML = '<div class="mono-sm-muted">No open proposals.</div>';
    return;
  }

  el.innerHTML = proposals.map(p => {
    const needsVote = !p.vote || p.vote.result === 'pending' || p.vote.result == null;
    const voteBadge = needsVote ? '<span class="vote-required-badge">VOTE REQUIRED</span>' : '';
    return '<div class="escalation-item standard" style="margin-bottom:12px">' +
      '<div class="esc-header">' +
      '<span class="esc-type">' + h(p.proposal_ref || p.proposal_id || '—') + '</span>' +
      '<span class="esc-priority standard">Open</span>' +
      '<span class="esc-id">Closes ' + fmtDate(p.review_closes_at) + '</span>' +
      '</div>' +
      '<div class="esc-body">' +
      '<div class="esc-summary"><strong>' + h(p.title || '—') + '</strong>' + voteBadge + (p.summary ? ' — ' + h(p.summary) : '') + '</div>' +
      '<div class="esc-meta">' +
      (p.submitted_by ? '<span>Submitted by: <strong>' + h(p.submitted_by) + '</strong></span>' : '') +
      (p.comment_count != null ? '<span>Comments: <strong>' + p.comment_count + '</strong></span>' : '') +
      '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

// ── Audit log tab ─────────────────────────────────────────────────────────────
async function loadGovAuditLog() {
  const data = await api('GET', '/governance/audit?limit=50');
  if (!data) return;

  const entries = data.entries || data.audit_entries || [];
  const el = document.getElementById('gov-auditlog-entries');
  el.innerHTML = entries.length
    ? entries.map(e =>
        '<div class="audit-entry">' +
        '<div class="audit-headline">' + h(e.headline || e.summary || '—') + '</div>' +
        '<div class="audit-byline">' + h(e.event_type || '').toUpperCase() + ' · ' + fmtDate(e.occurred_at || e.created_at) + (e.resolution_ref ? ' · ' + h(e.resolution_ref) : '') + '</div>' +
        (e.detail ? '<div class="audit-lede">' + h(e.detail) + '</div>' : '') +
        '</div>'
      ).join('')
    : '<div class="mono-sm-muted">No public audit entries yet.</div>';
}

// ── Votes tab ─────────────────────────────────────────────────────────────────
async function loadVotes() {
  const data = await api('GET', '/governance/votes');
  if (!data) return;

  const votes = data.votes || [];
  const tbody = document.getElementById('votes-tbody');
  if (!votes.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="panel-mono-pad">No votes recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = votes.map(v => {
    const passed = v.result === 'passed';
    const pending = v.result === 'pending' || !v.result;
    const resultColor = pending ? 'var(--amber)' : passed ? 'var(--green)' : 'var(--crimson,#c0392b)';
    const resultText = pending ? 'PENDING' : passed ? 'PASSED' : 'FAILED';
    return '<tr style="border-bottom:1px solid var(--rule)">' +
      '<td style="padding:10px 0">' + h(v.resolution_ref || v.proposal_id || '—') + (v.title ? ' · ' + h(v.title) : '') + '</td>' +
      '<td style="padding:10px 16px;font-family:var(--mono);font-size:11px;color:var(--ink-light)">' + fmtDate(v.voted_at) + '</td>' +
      '<td style="padding:10px 12px;font-family:var(--mono)">' + (v.votes_for != null ? v.votes_for + '/' + v.total_eligible : '—') + '</td>' +
      '<td style="padding:10px 12px;font-family:var(--mono);font-size:10px">' + (v.majority_required || '—') + '</td>' +
      '<td style="padding:10px 12px"><span style="color:' + resultColor + ';font-family:var(--mono);font-size:10px;font-weight:600">' + resultText + '</span></td>' +
      '<td style="padding:10px 12px;font-family:var(--mono);font-size:10px;color:var(--ink-light)">' + (v.fob_veto_exercised ? 'Yes' : 'No') + '</td>' +
      '</tr>';
  }).join('');
}

// ── Submit vote ───────────────────────────────────────────────────────────────
async function submitVote() {
  const errEl = document.getElementById('record-vote-error');
  errEl.style.display = 'none';

  const resolution_ref = document.getElementById('vote-resolution-ref').value.trim();
  const question       = document.getElementById('vote-question').value.trim();
  const votes_for      = parseInt(document.getElementById('vote-for').value, 10);
  const votes_against  = parseInt(document.getElementById('vote-against').value, 10);
  const votes_abstain  = parseInt(document.getElementById('vote-abstain').value, 10);
  const majority_required = parseInt(document.getElementById('vote-majority').value, 10);
  const total_eligible    = parseInt(document.getElementById('vote-eligible').value, 10);
  const fob_veto_exercised = document.getElementById('vote-fob-veto').checked;
  const notes = document.getElementById('vote-notes').value.trim() || undefined;

  if (!resolution_ref || resolution_ref.length < 5) {
    errEl.textContent = 'Resolution ref must be at least 5 characters.';
    errEl.style.display = '';
    return;
  }
  if (!question || question.length < 10) {
    errEl.textContent = 'Question must be at least 10 characters.';
    errEl.style.display = '';
    return;
  }
  if (isNaN(votes_for) || isNaN(votes_against) || isNaN(votes_abstain)) {
    errEl.textContent = 'Vote counts must be valid numbers.';
    errEl.style.display = '';
    return;
  }
  if (votes_for + votes_against + votes_abstain === 0) {
    errEl.textContent = 'At least one vote must be cast (for, against, or abstain).';
    errEl.style.display = '';
    return;
  }

  const body = { resolution_ref, question, votes_for, votes_against, votes_abstain,
                 majority_required, total_eligible, fob_veto_exercised, notes };

  try {
    const res = await fetch(API_BASE + '/governance/votes', {
      method: 'POST',
      headers: govAuthHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      errEl.textContent = json.message || 'Failed to record vote.';
      errEl.style.display = '';
      return;
    }
    // Reset form and refresh
    document.getElementById('record-vote-panel').style.display = 'none';
    document.getElementById('record-vote-btn-wrap').style.display = '';
    document.getElementById('vote-resolution-ref').value = '';
    document.getElementById('vote-question').value = '';
    document.getElementById('vote-for').value = '0';
    document.getElementById('vote-against').value = '0';
    document.getElementById('vote-abstain').value = '0';
    document.getElementById('vote-fob-veto').checked = false;
    document.getElementById('vote-notes').value = '';
    // Reload the votes table and sidebar
    _tabLoaded.votes = false;
    loadVotes();
    // Refresh sidebar
    const sideData = await api('GET', '/governance/votes?limit=4');
    if (sideData) updateRecentVotesSidebar(sideData.votes || []);
  } catch (e) {
    errEl.textContent = 'Network error — check connection and try again.';
    errEl.style.display = '';
  }
}

// ── Protocol versions sidebar ─────────────────────────────────────────────────
async function loadVersions() {
  const data = await api('GET', '/governance/versions');
  const el = document.getElementById('versions-list');
  if (!el) return;
  if (!data) {
    el.innerHTML = '<div class="mono-xs">Version data unavailable.</div>';
    return;
  }
  const history = data.history || [];
  const current = data.current || {};
  el.innerHTML = history.map(v => {
    const isCurrent = v.status === 'current';
    return '<div class="version-row">' +
      '<span class="version-num">v' + h(v.fhp_version) + '</span>' +
      '<span class="version-date">' + (v.released_at || '—') + '</span>' +
      '<span class="version-desc">' + h(v.label || '') + '</span>' +
      (isCurrent ? '<span class="version-tag current">Current</span>' : '') +
      '</div>';
  }).join('') + (current.pipeline_version
    ? '<div style="font-family:var(--mono);font-size:9px;color:var(--ink-faint);padding:6px 0;letter-spacing:0.08em">Pipeline v' + current.pipeline_version + '</div>'
    : '');
}

function updateRecentVotesSidebar(votes) {
  const el = document.getElementById('recent-votes-list');
  if (!el) return;
  el.innerHTML = votes.length
    ? votes.map(v => {
        const passed = v.result === 'passed';
        const pending = v.result === 'pending' || !v.result;
        return '<div class="vote-record">' +
          '<span class="vote-proposal">' + h(v.resolution_ref || v.proposal_id || '—') + '</span>' +
          '<span class="vote-result ' + (pending ? 'pending' : passed ? 'passed' : 'failed') + '">' +
          (pending ? 'Pending' : (v.votes_for || '—') + '/' + (v.total_eligible || '—') + (passed ? ' ✓' : ' ✗')) +
          '</span>' +
          '</div>';
      }).join('')
    : '<div class="mono-xs">No votes recorded.</div>';
}

// ── Active notice banner ───────────────────────────────────────────────────────
async function loadActiveNotice() {
  // Fetch the highest-priority open or in-review escalation that has a public summary
  const data = await api('GET', '/governance/escalations?limit=10');
  if (!data) return;
  const esc = (data.escalations || []).find(e =>
    ['open','in_review','pending_response'].includes(e.status) && e.public_summary
  );
  if (!esc) return;

  const deadlineStr = esc.resolution_deadline
    ? new Date(esc.resolution_deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const issuedStr = esc.raised_at
    ? new Date(esc.raised_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  const company  = esc.company_legal_name || null;
  const escLabel = (esc.escalation_type || '').replace(/_/g, ' ');
  const escRef   = esc.escalation_id ? esc.escalation_id.slice(0, 16) : '—';

  // Banner strip
  const bannerText = document.getElementById('alert-banner-text');
  bannerText.textContent = esc.public_summary + (deadlineStr ? ' Remediation deadline: ' + deadlineStr + '.' : '');
  document.getElementById('alert-banner').style.display = '';

  // Notice panel
  document.getElementById('notice-issued').textContent =
    'Active Governance Notice · Issued ' + issuedStr;
  document.getElementById('notice-title').textContent =
    escLabel.charAt(0).toUpperCase() + escLabel.slice(1) + (company ? ' — ' + company : '');
  document.getElementById('notice-body').textContent = esc.public_summary;
  document.getElementById('notice-meta').textContent =
    'Escalation ref: ' + escRef +
    (company ? ' · Company: ' + company : '') +
    (esc.priority ? ' · Priority: ' + esc.priority : '') +
    (esc.assignee_body ? ' · Assignee: ' + esc.assignee_body.toUpperCase() : '');
}

// ── Governance login / session ────────────────────────────────────────────────
function showGovLogin() {
  const m = document.getElementById('gov-login-modal');
  if (m) { m.classList.add('open'); setTimeout(() => document.getElementById('gov-username').focus(), 50); }
}

function hideGovLogin() {
  const m = document.getElementById('gov-login-modal');
  if (m) m.classList.remove('open');
  const err = document.getElementById('gov-login-error');
  if (err) err.style.display = 'none';
}

async function submitGovLogin() {
  const errEl = document.getElementById('gov-login-error');
  errEl.style.display = 'none';
  const username = document.getElementById('gov-username').value.trim();
  const password = document.getElementById('gov-password').value;
  if (!username || !password) {
    errEl.textContent = 'Username and password are required.';
    errEl.style.display = 'block';
    return;
  }
  try {
    const res = await fetch(API_BASE + '/auth/login-governance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (!res.ok) {
      errEl.textContent = json.message || 'Sign in failed.';
      errEl.style.display = 'block';
      return;
    }
    _govToken = json.access_token;
    sessionStorage.setItem('fhp_gov_token', _govToken);
    sessionStorage.setItem('fhp_gov_display', json.display_name || json.username || json.role);
    document.getElementById('gov-username').value = '';
    document.getElementById('gov-password').value = '';
    hideGovLogin();
    activateGovernanceUI(json.role, json.display_name || json.username || json.role);
  } catch (_e) {
    errEl.textContent = 'Network error — check connection and try again.';
    errEl.style.display = 'block';
  }
}

function govLogout() {
  _govToken = null; _govRole = null; _govDisplayName = null;
  sessionStorage.removeItem('fhp_gov_token');
  sessionStorage.removeItem('fhp_gov_display');
  document.getElementById('gov-user-badge').style.display = 'none';
  document.getElementById('gov-signin-btn').style.display = '';
  document.getElementById('record-vote-btn-wrap').style.display = 'none';
  const addBtn = document.getElementById('add-proposal-btn');
  if (addBtn) addBtn.style.display = 'none';
  if (_allEscalations.length) renderEscalationsList(_allEscalations);
}

function activateGovernanceUI(role, displayName) {
  _govRole = role;
  _govDisplayName = displayName || role;
  document.getElementById('gov-signin-btn').style.display = 'none';
  const badge   = document.getElementById('gov-user-badge');
  const nameEl  = document.getElementById('gov-display-name');
  const roleTag = document.getElementById('gov-role-tag');
  if (nameEl)  nameEl.textContent  = _govDisplayName;
  if (roleTag) {
    roleTag.textContent = role.toUpperCase();
    roleTag.className   = 'role-tag' + (role === 'admin' ? ' admin' : '');
  }
  badge.style.display = '';
  if (role === 'governance' || role === 'admin') {
    document.getElementById('record-vote-btn-wrap').style.display = '';
  }
  const addBtn = document.getElementById('add-proposal-btn');
  if (addBtn) addBtn.style.display = '';
  if (_allEscalations.length) renderEscalationsList(_allEscalations);
}

// Support Enter key in login modal
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const modal = document.getElementById('gov-login-modal');
    if (modal && modal.classList.contains('open')) submitGovLogin();
    const propModal = document.getElementById('gov-proposal-modal');
    if (propModal && propModal.classList.contains('open') && e.target.tagName !== 'TEXTAREA') submitProposal();
  }
  if (e.key === 'Escape') { hideGovLogin(); hideProposalModal(); }
});

// ── Proposal modal ────────────────────────────────────────────────────────────
function showProposalModal() {
  if (!_govToken) { showGovLogin(); return; }
  const m = document.getElementById('gov-proposal-modal');
  if (m) m.classList.add('open');
}

function hideProposalModal() {
  const m = document.getElementById('gov-proposal-modal');
  if (m) m.classList.remove('open');
  const err = document.getElementById('gov-proposal-error');
  if (err) err.style.display = 'none';
}

async function submitProposal() {
  const errEl = document.getElementById('gov-proposal-error');
  errEl.style.display = 'none';

  const proposal_ref      = document.getElementById('prop-ref').value.trim();
  const title             = document.getElementById('prop-title').value.trim();
  const summary           = document.getElementById('prop-summary').value.trim();
  const submitted_by      = document.getElementById('prop-submitted-by').value.trim();
  const affiliation       = document.getElementById('prop-affiliation').value.trim() || undefined;
  const fhp_version_target = document.getElementById('prop-version-target').value.trim() || undefined;
  const review_deadline   = document.getElementById('prop-deadline').value || undefined;
  const document_body     = document.getElementById('prop-body').value.trim();

  if (!proposal_ref || !title || !summary || !submitted_by || !document_body) {
    errEl.textContent = 'Proposal Ref, Title, Summary, Submitted By, and Document are required.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const body = { proposal_ref, title, summary, submitted_by, document_body };
    if (affiliation)        body.affiliation        = affiliation;
    if (fhp_version_target) body.fhp_version_target = fhp_version_target;
    if (review_deadline)    body.review_deadline    = review_deadline;

    await apiGov('POST', '/governance/proposals', body);
    hideProposalModal();
    ['prop-ref','prop-title','prop-summary','prop-submitted-by','prop-affiliation',
     'prop-version-target','prop-deadline','prop-body'].forEach(id => {
      document.getElementById(id).value = '';
    });
    _tabLoaded.proposals = false;
    loadProposals();
  } catch (err) {
    errEl.textContent = (err && err.message) ? err.message : 'Failed to submit proposal.';
    errEl.style.display = 'block';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  govShowTab('overview');
  _tabLoaded.overview = true;
  loadOverview();
  loadActiveNotice();
  loadVersions();

  // Restore governance session from sessionStorage
  if (_govToken) {
    try {
      const parts   = _govToken.split('.');
      const payload = JSON.parse(atob(parts[1]));
      if (payload && (payload.role === 'governance' || payload.role === 'admin')) {
        const storedDisplay = sessionStorage.getItem('fhp_gov_display') || payload.role;
        activateGovernanceUI(payload.role, storedDisplay);
      } else {
        sessionStorage.removeItem('fhp_gov_token');
        sessionStorage.removeItem('fhp_gov_display');
        _govToken = null;
      }
    } catch (_e) {
      sessionStorage.removeItem('fhp_gov_token');
      sessionStorage.removeItem('fhp_gov_display');
      _govToken = null;
    }
  }
});