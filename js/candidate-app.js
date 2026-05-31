// ── NAVIGATION ──────────────────────────────────────────────────────────────────
const PAGES = ['dashboard','matches','profile','appeals','data','rights'];
function go(p) {
  PAGES.forEach(x => {
    ['pg-','nav-','mob-'].forEach(pre => {
      const el = document.getElementById(pre + x);
      if (el) el.classList.toggle('active', x === p);
    });
  });
  window.scrollTo(0, 0);
  if (p === 'dashboard') loadDashboard();
  if (p === 'matches')   loadMatches();
  if (p === 'appeals')   { loadAppeals(); loadAppealableMatches(); }
  if (p === 'data')      loadConsentRecord();
}

// ── ERROR DIALOG ────────────────────────────────────────────────────────────────
function showError(msg, title) {
  document.getElementById('err-modal-title').textContent = title || 'Cannot continue';
  document.getElementById('err-modal-msg').textContent   = msg;
  document.getElementById('err-modal').classList.add('open');
}
function closeErrModal() {
  document.getElementById('err-modal').classList.remove('open');
}

// ── MOBILE MENU ─────────────────────────────────────────────────────────────────
function openMenu()  { document.getElementById('mob-bg').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeMenu() { document.getElementById('mob-bg').classList.remove('open'); document.body.style.overflow = ''; }

// ── NOTIFICATIONS ───────────────────────────────────────────────────────────────
let NOTIFS = [];

async function loadNotifications() {
  const data = await api('GET', '/candidates/me/notifications?limit=20');
  if (!data) return;
  NOTIFS = (data.notifications || []).map(function(n) {
    var d = new Date(n.created_at);
    var now = new Date();
    var diffMs = now - d;
    var diffH = diffMs / 3600000;
    var time = diffH < 1 ? 'Just now'
             : diffH < 24 ? Math.floor(diffH) + 'h ago'
             : diffH < 48 ? 'Yesterday'
             : d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
    return {
      id:             n.notification_id,
      interaction_id: n.interaction_id || null,
      unread:         n.read_at === null,
      body:           n.body || n.title || '',
      time:           time,
      job:            n.title || '',
      actions:        !!(n.actions && n.interaction_id),
    };
  });
  renderNotifs();
}

function renderNotifs() {
  const list  = document.getElementById('nlist');
  const badge = document.getElementById('bbadge');
  const unread = NOTIFS.filter(n => n.unread).length;
  badge.style.display = unread > 0 ? 'block' : 'none';
  list.innerHTML = NOTIFS.map(n => `
    <div class="ni ${n.unread ? 'unread' : ''}">
      <div class="ni-in">
        <div class="ni-dot ${n.unread ? '' : 'r'}"></div>
        <div class="flex-1">
          <div class="ni-body">${n.body}</div>
          <div class="ni-time">${n.time}</div>
          ${n.actions ? `<div class="ni-acts">
            <button class="na na-y" onclick="respond(${n.id},'accept')">Accept</button>
            <button class="na na-n" onclick="respond(${n.id},'decline')">Decline</button>
          </div>` : ''}
        </div>
      </div>
    </div>`).join('');
}

async function toggleNotif(e) {
  e.stopPropagation();
  document.getElementById('ndrop').classList.toggle('open');
}
async function clearNotifs() {
  NOTIFS.forEach(n => n.unread = false);
  renderNotifs();
  await api('PUT', '/candidates/me/notifications/read-all', {});
}
async function respond(id, action) {
  const n = NOTIFS.find(x => x.id === id);
  if (n) {
    n.unread = false;
    n.body = (action === 'accept' ? '&#10003; Accepted' : '&#10007; Declined') + ' &mdash; ' + n.job;
    n.actions = false;
    renderNotifs();
    await api('PUT', '/candidates/me/notifications/' + id + '/read', {});
    if (n.interaction_id) {
      await api('PUT', '/candidates/me/interactions/' + n.interaction_id, { action });
    }
  }
}
document.addEventListener('click', e => {
  if (!e.target.closest('#ndrop') && !e.target.closest('.bell'))
    document.getElementById('ndrop').classList.remove('open');
});

// ── MATCH CARDS ─────────────────────────────────────────────────────────────────

function fmtOntologyId(id) {
  return (id || '').replace(/^fhp:skill:/, '').replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}
function scoreColor(v) {
  return v >= 0.7 ? 'var(--sage)' : v >= 0.4 ? 'var(--gold)' : 'var(--rust)';
}
function buildExplanationHtml(m) {
  var parts = [];
  var summary = m.plain_language_summary || (m.explanation && m.explanation.plain_language_summary) || 'No explanation available.';
  parts.push('<div class="xsum">' + h(summary) + '</div>');

  var scores = m.scores_snapshot || {};
  var wSkill = scores.weight_skill != null ? scores.weight_skill : 0.80;
  var wPref  = scores.weight_preference != null ? scores.weight_preference : 0.20;
  var skillPct = Math.round(wSkill * 100);
  var prefPct  = Math.round(wPref  * 100);
  var srows = [];
  if (scores.skill_score != null)
    srows.push({l:'Skills (' + skillPct + '% of score)', v:scores.skill_score, c:scoreColor(scores.skill_score)});
  if (scores.transferable_skill_score != null && scores.transferable_skill_score > 0)
    srows.push({l:'Transfer bonus', v:scores.transferable_skill_score, c:'var(--teal-hi)'});
  if (scores.preference_alignment_score != null)
    srows.push({l:'Preferences (' + prefPct + '% of score)', v:scores.preference_alignment_score, c:scoreColor(scores.preference_alignment_score)});
  if (scores.bias_correction_delta != null && scores.bias_correction_delta !== 0)
    srows.push({l:'Fairness adjustment', v:Math.abs(scores.bias_correction_delta), c:scores.bias_correction_delta > 0 ? 'var(--teal-hi)' : 'var(--rust)'});
  if (srows.length) {
    parts.push('<div class="elbl">Score breakdown</div>');
    parts.push('<div style="font-size:11px;color:var(--ink-light);margin-bottom:8px">Each bar shows a 0–1 score. The overall score is the weighted sum.</div>');
    parts.push('<div class="srows">');
    srows.forEach(function(r) {
      parts.push('<div class="srow"><span class="srl">' + h(r.l) + '</span>'
        + '<div class="sbar"><div class="sbf" style="width:' + Math.round(r.v * 100) + '%;background:' + r.c + '"></div></div>'
        + '<span class="srv">' + r.v.toFixed(2) + '</span></div>');
    });
    parts.push('</div>');
  }

  var skillLabelMap = {};
  (m.skills_required || []).forEach(function(s) { skillLabelMap[s.ontology_id] = s.label; });
  var rawBd = m.skill_breakdown || [];
  var breakdown = Array.isArray(rawBd) ? rawBd : (typeof rawBd === 'string' ? (function(){ try { return JSON.parse(rawBd); } catch(e) { return []; } })() : []);
  if (breakdown.length) {
    parts.push('<div class="elbl">Skill assessment</div><div class="sgrid">');
    breakdown.forEach(function(s) {
      var label = skillLabelMap[s.ontology_id] || fmtOntologyId(s.ontology_id);
      var displayLabel = label + (s.requirement_level === 'nice_to_have' ? ' (nice-to-have)' : '');
      var icon, cls;
      if (s.match_type === 'direct' || s.match_type === 'semantic_expansion') { icon = '✓'; cls = 'si-m'; }
      else if (s.match_type === 'transferable') { icon = '⟳'; cls = 'si-t'; }
      else { icon = '✗'; cls = 'si-n'; }
      var lvlParts = [];
      if (s.candidate_proficiency) lvlParts.push('You: ' + s.candidate_proficiency);
      lvlParts.push('Required: ' + s.required_proficiency);
      if (s.match_type === 'transferable' && s.transferable_via) {
        lvlParts.push('Via ' + (skillLabelMap[s.transferable_via] || fmtOntologyId(s.transferable_via)));
      }
      parts.push('<div class="si ' + cls + '"><span class="si-ico">' + icon + '</span>'
        + '<div><div class="si-name">' + h(displayLabel) + '</div>'
        + '<div class="si-lvl">' + h(lvlParts.join(' · ')) + '</div></div></div>');
    });
    parts.push('</div>');
  }

  // Preference detail — sub-scores only present from matches run after this feature was added
  var pSalary = scores.salary_alignment;
  var pMode   = scores.work_mode_alignment;
  var pLoc    = scores.location_alignment;
  if (pSalary != null || pMode != null || pLoc != null) {
    parts.push('<div class="elbl">Preference detail</div><div class="srows">');
    function prefRow(label, val, incompatibleMsg) {
      if (val == null) return;
      var note = val === 0.5 ? ' (not set — neutral)' : val === 0.0 ? ' — ' + (incompatibleMsg || 'incompatible') : '';
      var c = val === 0.5 ? 'var(--ink-light)' : scoreColor(val);
      parts.push('<div class="srow"><span class="srl">' + h(label + note) + '</span>'
        + '<div class="sbar"><div class="sbf" style="width:' + Math.round(val * 100) + '%;background:' + c + '"></div></div>'
        + '<span class="srv">' + val.toFixed(2) + '</span></div>');
    }
    prefRow('Salary', pSalary, 'your minimum is above this role\'s maximum');
    prefRow('Work mode', pMode, 'role\'s work mode doesn\'t match your preferences');
    prefRow('Location', pLoc, 'role location doesn\'t match your preferences');
    parts.push('</div>');
  }

  var reasons = m.not_matched_reasons || [];
  if (reasons.length) {
    parts.push('<div class="elbl">Why not matched</div>');
    reasons.forEach(function(r) {
      var code = typeof r === 'object' ? (r.reason_code || r.code || '') : '';
      var text = typeof r === 'object' ? (r.human_readable || r.text || r.message || String(r)) : String(r);
      parts.push('<div class="rc"><div class="rc-code">' + h(code) + '</div><div class="rc-text">' + h(text) + '</div></div>');
    });
  }

  var nextSteps = m.next_steps || [];
  if (nextSteps.length) {
    parts.push('<div class="elbl">Next steps</div>');
    nextSteps.forEach(function(n) {
      var text = typeof n === 'string' ? n : (n.suggestion || n.text || '');
      parts.push('<div class="nxt"><span class="ni2">→</span>' + h(text) + '</div>');
    });
  }

  return parts.join('');
}

function openTraceModal(t) {
  var stages = t.stages || [];
  var statusIcon = function(s) { return s === 'completed' ? '✓' : s === 'aborted' ? '⊘' : '✗'; };
  var statusColor = function(s) { return s === 'completed' ? 'var(--sage)' : s === 'aborted' ? 'var(--gold)' : 'var(--rust)'; };
  var rows = stages.map(function(s) {
    return '<tr>'
      + '<td style="font-family:var(--mono);font-size:10px;color:' + statusColor(s.status) + ';padding:6px 8px">' + statusIcon(s.status) + '</td>'
      + '<td style="font-size:12px;padding:6px 8px">' + h((s.stage_name || '').replace(/_/g,' ')) + '</td>'
      + '<td style="font-family:var(--mono);font-size:10px;color:var(--ink-light);padding:6px 8px;text-align:right">' + (s.duration_ms != null ? s.duration_ms + 'ms' : '—') + '</td>'
      + '</tr>';
  }).join('');
  document.getElementById('trace-modal-title').textContent = 'Pipeline trace — ' + (t.status || '') + ' in ' + (t.duration_ms != null ? t.duration_ms + 'ms' : '—');
  document.getElementById('trace-modal-body').innerHTML =
    '<p style="font-family:var(--mono);font-size:10px;color:var(--ink-light);margin-bottom:12px">Pipeline v' + h(t.pipeline_version || '—') + ' · ' + (t.under_appeal ? '⚠ Under appeal' : 'Not under appeal') + '</p>'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr><th style="text-align:left;font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-light);padding:4px 8px;border-bottom:1px solid var(--rule)"></th>'
    + '<th style="text-align:left;font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-light);padding:4px 8px;border-bottom:1px solid var(--rule)">Stage</th>'
    + '<th style="text-align:right;font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-light);padding:4px 8px;border-bottom:1px solid var(--rule)">Duration</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>';
  document.getElementById('trace-modal').classList.add('open');
}
function closeTraceModal() {
  document.getElementById('trace-modal').classList.remove('open');
}

async function loadMatches() {
  var c = document.getElementById('mh-cards');
  if (!c) return;
  c.innerHTML = '<div style="padding:20px;color:var(--ink-faint)">Loading matches…</div>';
  var [data, appealData] = await Promise.all([
    api('GET', '/candidates/me/matches?limit=50'),
    api('GET', '/candidates/me/appeals'),
  ]);
  var appealedMatchIds = new Set(
    ((appealData && appealData.appeals) || [])
      .filter(function(a) { return a.status !== 'withdrawn'; })
      .map(function(a) { return a.match_id; })
  );
  var fts = document.querySelectorAll('#pg-matches .ft');
  function updateFilterCounts(all, matched, notMatched, borderline) {
    if (fts.length >= 4) {
      fts[0].textContent = 'All (' + all + ')';
      fts[1].textContent = 'Matched (' + matched + ')';
      fts[2].textContent = 'Not matched (' + notMatched + ')';
      fts[3].textContent = 'Borderline (' + borderline + ')';
    }
  }
  if (!data || !data.matches || !data.matches.length) {
    c.innerHTML = '<div style="padding:20px;color:var(--ink-faint)">No matches yet. Complete your profile and enable matching to get started.</div>';
    updateFilterCounts(0, 0, 0, 0);
    return;
  }
  c.innerHTML = '';
  var matchedCount = 0, notMatchedCount = 0, borderlineCount = 0;
  data.matches.forEach(function(m, i) {
    var dec   = m.decision || 'not_matched';
    if (dec === 'matched') matchedCount++;
    else if (dec === 'borderline') borderlineCount++;
    else notMatchedCount++;
    var score = parseFloat(m.composite_score || m.overall_score || 0);
    var date  = m.created_at ? new Date(m.created_at).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '';
    var adDate = m.appeal_deadline ? new Date(m.appeal_deadline).toLocaleDateString('en-GB', {day:'numeric',month:'short'}) : '30 days';

    var card = document.createElement('div');
    card.className = 'mc';
    card.style.animationDelay = (i * 0.06) + 's';
    card.dataset.decision = dec;

    var badgeCls = dec === 'matched' ? 'b-m' : (dec === 'borderline' ? 'b-b' : 'b-n');
    var chipCls  = dec === 'matched' ? 'ch-m' : (dec === 'borderline' ? 'ch-b' : 'ch-n');
    var badgeIco = dec === 'matched' ? '✓' : (dec === 'borderline' ? '▲' : '✕');
    var scoreCls = dec === 'matched' ? 'snum-m' : (dec === 'borderline' ? 'snum-b' : 'snum-n');
    var hdr = document.createElement('div');
    hdr.className = 'mc-hdr';
    hdr.setAttribute('onclick', 'toggleExp(this)');
    var compPct = m.company_compliance_score != null ? Math.round(m.company_compliance_score * 100) : null;
    var compBadge = compPct != null
      ? ' <span style="font-family:var(--mono);font-size:9px;color:' + scoreColor(m.company_compliance_score) + ';letter-spacing:0.04em">'
        + (m.company_compliance_score >= 0.9 ? '✓' : '⚠') + ' ' + compPct + '% compliance</span>'
      : '';
    hdr.innerHTML = '<div class="mc-badge ' + badgeCls + '">' + badgeIco + '</div>'
      + '<div class="mc-meta">'
      + '<div class="mc-role">' + h(m.job_title || 'Role') + '</div>'
      + '<div class="mc-co">' + h(m.company_name || '') + compBadge + '</div>'
      + '<div class="chips"><span class="chip ' + chipCls + '">' + dec.replace('_',' ') + '</span>'
      + '<span class="chip ch-x">' + date + '</span></div>'
      + '</div>'
      + '<div class="mc-score"><div class="snum ' + scoreCls + '">' + score.toFixed(2) + '</div><div class="slbl">score</div></div>';

    var xbar = document.createElement('div');
    xbar.className = 'xbar';
    xbar.setAttribute('onclick', 'toggleXbar(this)');
    xbar.innerHTML = '<span>Read full explanation</span><span class="xa">▾</span>';

    var xp = document.createElement('div');
    xp.className = 'xp';

    var ar = document.createElement('div');
    ar.className = 'ar';

    var an = document.createElement('span');
    an.className = 'an';
    an.textContent = dec === 'matched'
      ? 'Matched ' + date
      : (dec === 'borderline' ? 'Borderline' : 'Not matched') + ' ' + date + ' · appealable until ' + adDate;

    var btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.gap = '6px';

    var traceBtn = document.createElement('button');
    traceBtn.className = 'btn btn-o btn-sm';
    traceBtn.textContent = 'Trace ↗';
    var matchId = m.match_id;
    traceBtn.addEventListener('click', function() {
      api('GET', '/candidates/me/matches/' + matchId + '/trace').then(function(t) {
        if (t) openTraceModal(t);
      });
    });
    btns.appendChild(traceBtn);

    if (dec !== 'matched' && m.appeal_eligible !== false) {
      if (appealedMatchIds.has(matchId)) {
        var appealedTag = document.createElement('span');
        appealedTag.className = 'btn btn-sm';
        appealedTag.style.cssText = 'cursor:default;color:var(--ink-light);border:1px solid var(--rule)';
        appealedTag.textContent = 'Appeal submitted';
        btns.appendChild(appealedTag);
      } else {
        var appealBtn = document.createElement('button');
        appealBtn.className = 'btn btn-r btn-sm';
        appealBtn.textContent = 'Appeal →';
        var jobTitle = m.job_title || 'Role';
        appealBtn.addEventListener('click', function() { openAppeal(jobTitle, matchId); });
        btns.appendChild(appealBtn);
      }
    }

    ar.appendChild(an);
    ar.appendChild(btns);
    xp.innerHTML = buildExplanationHtml(m);
    xp.appendChild(ar);

    card.appendChild(hdr);
    card.appendChild(xbar);
    card.appendChild(xp);
    c.appendChild(card);
  });
  updateFilterCounts(data.matches.length, matchedCount, notMatchedCount, borderlineCount);
}

function toggleExp(hdr) {
  const mc = hdr.closest('.mc'), xp = mc.querySelector('.xp'), xa = mc.querySelector('.xa');
  const bar = mc.querySelector('.xbar span:first-child');
  const open = xp.classList.toggle('open');
  if (xa)  xa.classList.toggle('open', open);
  if (bar) bar.textContent = open ? 'Close explanation' : 'Read full explanation';
}
function toggleXbar(bar) {
  const mc = bar.closest('.mc'), xp = mc.querySelector('.xp'), xa = bar.querySelector('.xa');
  const open = xp.classList.toggle('open');
  xa.classList.toggle('open', open);
  bar.querySelector('span:first-child').textContent = open ? 'Close explanation' : 'Read full explanation';
}
function setFilter(tab) {
  document.querySelectorAll('#pg-matches .ft').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  var dec = tab.dataset.decision;
  document.querySelectorAll('#mh-cards .mc').forEach(function(card) {
    card.style.display = (!dec || card.dataset.decision === dec) ? '' : 'none';
  });
}

// ── HTML ESCAPE ───────────────────────────────────────────────────────────────────
function h(s) {
  return String(s ?? '').replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  }).replace(/[^\x00-\x7F]/g, function(c) { return '&#' + c.codePointAt(0) + ';'; });
}
function hasHtml(s) { return /<[a-z\/]/i.test(String(s ?? '')); }

// ── SKILLS EDITOR ────────────────────────────────────────────────────────────────
const PROF = ['aware','practitioner','proficient','expert','authority'];
const PC   = ['#b07030','#7a8030','#307060','#205050','#103838'];

// Global behavioural anchors — mirrors ontology/skills.json proficiency_level_definitions.
// Shown as a tooltip when the candidate clicks a level name.
const PROF_DEFS = {
  aware:        { ui_label:'Aware',        ui_prompt:'I understand the concepts and have tried this in a personal or learning context, but have not used it professionally.', criteria:['Completed a course, tutorial, or self-directed study on this skill','Can explain core concepts accurately to someone unfamiliar with the area','Has written code or produced work using this skill, but it was never shipped or relied on by others'] },
  practitioner: { ui_label:'Practitioner', ui_prompt:'I have used this in a real job, project, or open-source contribution. I get things done with it, sometimes looking things up.',     criteria:['Used this skill in a paid, volunteer, or open-source role to complete real work tasks','Has shipped or contributed to work that others relied on, even once','Completes standard tasks independently; looks things up or asks for help on complex problems'] },
  proficient:   { ui_label:'Proficient',   ui_prompt:'I work independently with this skill across varied situations. I debug hard problems and often help teammates.',                  criteria:['Owned a feature, system, or area of work end-to-end in a professional context','Resolved complex or production issues without escalation','Regularly reviews colleagues\' work in this area or is a go-to person for questions'] },
  expert:       { ui_label:'Expert',       ui_prompt:'I understand this deeply — internals, failure modes, trade-offs. I have shaped how it is used in an organisation, built tooling for others, or spoken or written about it publicly.', criteria:['Designed architecture, standards, or patterns that others in an organisation follow','Authored libraries, tooling, or internal frameworks used by other practitioners','Diagnosed deep or systemic issues that others could not resolve','Has presented, written, or published on this topic for a technical audience'] },
  authority:    { ui_label:'Authority',    ui_prompt:'I am a recognised leader in this area beyond my organisation — through open-source, published research, standards work, or community leadership.',                                      criteria:['Maintains a widely-used open-source project with external production users or significant community','Published research, specifications, or standards in this area','Invited speaker at major industry conferences on this topic','Co-authored a widely-adopted standard, specification, or framework'] },
};

// Skill-specific criteria overrides — 26 key skills from the ontology.
// Skills not listed here fall back to the PROF_DEFS global anchors above.
const SKILL_CRITERIA = {
  'fhp:skill:python':           { aware:['Can read Python code; has written basic scripts or followed tutorials','Has not shipped Python professionally'], practitioner:['Uses Python in a job, project, or internship to complete real tasks','Comfortable with pip, virtual environments, and the standard library'], proficient:['Writes production Python that others rely on','Debugs complex issues: async, concurrency, or performance problems','Reviews teammates\' Python and gives actionable feedback'], expert:['Understands CPython internals, the GIL, or memory model at a working level','Has written or maintained a library or tool that others use','Makes architectural decisions about Python use across a codebase'], authority:['Maintains a widely-used Python open-source project with external production users','Has contributed to CPython, PEPs, or the Python packaging ecosystem'] },
  'fhp:skill:javascript':       { aware:['Understands variables, functions, and basic DOM manipulation','Has followed tutorials; has not shipped JS professionally'], practitioner:['Uses JavaScript to build or maintain features in a job or project','Understands async/await, Promises, and event handling'], proficient:['Builds and debugs JS features end-to-end without assistance','Understands the event loop, closures, and prototype chain','Reviews teammates\' JS and explains trade-offs'], expert:['Deep understanding of JS engine behaviour (V8, JIT, garbage collection)','Has built or maintained a library or tooling used by other developers'], authority:['Maintains a widely-used JavaScript library or tool','Contributes to TC39, ECMA standards, or browser engine development'] },
  'fhp:skill:typescript':       { aware:['Understands TS adds static types to JS; reads annotated code but relies on `any`','Has not shipped TypeScript professionally'], practitioner:['Uses TypeScript day-to-day; writes typed interfaces and basic generics'], proficient:['Designs type-safe APIs and data models independently','Uses generics, conditional types, and mapped types to solve real problems'], expert:['Writes advanced TS: template literal types, infer, recursive types','Has authored typed libraries or contributed DefinitelyTyped definitions'], authority:['Core contributor to TypeScript or DefinitelyTyped','Recognised externally for TS expertise through speaking, writing, or open-source impact'] },
  'fhp:skill:sql':              { aware:['Can read a simple SELECT; understands what a relational database is','Has not queried a real database professionally'], practitioner:['Writes queries to retrieve and filter data in a job or project','Joins tables; uses GROUP BY, window functions at a basic level'], proficient:['Writes complex queries: CTEs, window functions, subqueries','Designs and normalises table schemas; understands indexes and slow query diagnosis'], expert:['Designs schemas for scale: partitioning, indexing strategy, query plan analysis','Understands MVCC, isolation levels, and concurrency trade-offs in production'], authority:['Core contributor to a database engine (PostgreSQL, MySQL, SQLite, etc.)'] },
  'fhp:skill:git':              { aware:['Has cloned a repo, committed, and pushed with step-by-step instructions'], practitioner:['Uses git daily: branch, merge, rebase, resolve conflicts independently'], proficient:['Uses advanced git: interactive rebase, cherry-pick, reflog, bisect','Recovers from complex states; sets up branching strategies for a team'], expert:['Understands git internals: objects, refs, pack files','Has written git hooks or tooling around git workflows'], authority:['Core contributor to git or a widely-used git tooling project'] },
  'fhp:skill:react':            { aware:['Has followed a React tutorial; has not shipped React professionally'], practitioner:['Builds and maintains React UI features in a job or project','Understands useState, useEffect, and basic component composition'], proficient:['Builds complex UIs: custom hooks, context, state management patterns','Understands rendering behaviour; avoids common performance pitfalls'], expert:['Deep understanding of React internals: Fiber, reconciliation, concurrent features','Has built component libraries or design systems used by others'], authority:['Core contributor to React or a major React ecosystem project'] },
  'fhp:skill:rest-api-design':  { aware:['Understands what a REST API is; can consume one using curl'], practitioner:['Has designed and implemented REST endpoints in a job or project'], proficient:['Designs APIs others consume reliably: versioning, pagination, error responses, auth','Reviews API designs for correctness, consistency, and usability'], expert:['Has designed a public or widely-consumed API used by external developers','Establishes API design standards across a team or organisation'], authority:['Recognised externally for API design expertise through influential standards or tooling'] },
  'fhp:skill:system-design':    { aware:['Can describe common patterns (caching, load balancing) at a high level','Has not designed a distributed system professionally'], practitioner:['Has designed or contributed to a service or feature design end-to-end'], proficient:['Designs multi-service architectures: bottlenecks, failure modes, retries, circuit breakers','Led or significantly contributed to the technical design of a production system'], expert:['Designs at scale: high-throughput, HA, or globally distributed systems','Drives technical design standards across a team or organisation'], authority:['Authored or co-authored widely-cited architecture papers or standards'] },
  'fhp:skill:software-testing': { aware:['Understands unit vs integration vs E2E tests conceptually; has not owned a test suite'], practitioner:['Writes unit and integration tests for own code in a job or project'], proficient:['Designs a testing strategy for a feature or service','Reviews others\' tests for coverage gaps and false confidence'], expert:['Designs testing architectures for large systems; has built CI test infrastructure for multiple teams'], authority:['Recognised externally as a software quality or testing expert'] },
  'fhp:skill:tdd':              { aware:['Understands red-green-refactor conceptually; has not practised it professionally'], practitioner:['Applies TDD on individual features or units in a job or project'], proficient:['Applies TDD consistently across a service; coaches teammates on TDD practices'], expert:['Drives TDD adoption across a team with measurable improvement to defect rates'], authority:['Recognised externally as a TDD or software craftsmanship leader'] },
  'fhp:skill:machine-learning': { aware:['Understands supervised/unsupervised learning conceptually; cannot train a model independently'], practitioner:['Trains and evaluates models using scikit-learn or similar; applies cross-validation and standard metrics'], proficient:['Builds ML pipelines end-to-end: data prep, training, evaluation, deployment','Has shipped an ML model to a production or real-world system'], expert:['Designs novel model architectures or training procedures','Leads ML strategy or research direction for a team'], authority:['Published ML research in peer-reviewed venues (NeurIPS, ICML, ICLR, etc.)'] },
  'fhp:skill:data-analysis':    { aware:['Can read charts and describe trends; cannot independently form and test a data hypothesis'], practitioner:['Queries data to answer business questions; produces summaries stakeholders can act on'], proficient:['Forms and tests hypotheses; understands common pitfalls (confounding, selection bias)','Has influenced a real business decision through data analysis'], expert:['Designs analytics frameworks used across a team or org','Leads complex analyses with ambiguous questions and noisy data'], authority:['Recognised externally as a leading data analyst through published methods or tooling'] },
  'fhp:skill:data-engineering':  { aware:['Understands what a data pipeline is; has not designed one independently'], practitioner:['Builds and maintains data pipelines in a job or project; familiar with at least one orchestration tool'], proficient:['Designs reliable, observable pipelines from scratch; has owned a pipeline or warehouse layer end-to-end'], expert:['Architects data platforms at scale: streaming, lakehouse, or multi-system'], authority:['Core contributor to Apache Spark, Flink, Airflow, dbt, or equivalent'] },
  'fhp:skill:docker':           { aware:['Understands containers vs VMs; has run a Docker image with instructions; has not written a Dockerfile professionally'], practitioner:['Writes Dockerfiles; builds and runs containers locally; uses docker-compose for dev environments'], proficient:['Writes optimised multi-stage Dockerfiles for production; debugs networking and resource limit issues'], expert:['Designs container strategies for large-scale or regulated environments; understands OCI spec and runtimes'], authority:['Core contributor to Docker, containerd, OCI, or a widely-used container tooling project'] },
  'fhp:skill:kubernetes':       { aware:['Understands what K8s does conceptually; has used kubectl with guidance; has not deployed a workload independently'], practitioner:['Deploys and updates workloads using Deployments, Services, and ConfigMaps'], proficient:['Designs and manages multi-service cluster configs; debugs scheduling failures and networking problems'], expert:['Architects clusters at scale: multi-cluster, multi-cloud; understands K8s internals (scheduler, controller manager)'], authority:['Core contributor to Kubernetes or a major CNCF project'] },
  'fhp:skill:aws':              { aware:['Can name core AWS services; has used the console with guidance; has not deployed a workload professionally'], practitioner:['Deploys and manages services on AWS; uses IAM for basic access control'], proficient:['Designs reliable, cost-effective AWS architectures; implements least-privilege IAM and VPC security'], expert:['Architects at scale: multi-region, HA, disaster recovery; drives cloud strategy across a team'], authority:['AWS Distinguished Engineer, Hero, or equivalent external recognition'] },
  'fhp:skill:ci-cd':            { aware:['Understands CI/CD conceptually; has triggered a pipeline but not configured one'], practitioner:['Configures pipelines in GitHub Actions, GitLab CI, Jenkins, etc.; debugs common failures'], proficient:['Designs pipeline architectures with caching and parallelism; implements blue-green or canary deployments'], expert:['Architects CI/CD platforms for multiple teams; builds custom pipeline tooling used by others'], authority:['Core contributor to a major CI/CD platform or widely-used ecosystem tool'] },
  'fhp:skill:application-security': { aware:['Familiar with OWASP Top 10 conceptually; has not applied security practices professionally'], practitioner:['Applies input validation, output encoding, and parameterised queries in code'], proficient:['Independently reviews code for vulnerabilities; conducts or leads threat modelling; has fixed real production vulnerabilities'], expert:['Designs security architectures; has discovered novel or critical vulnerabilities; drives security standards across an org'], authority:['Published CVEs, security research, or influential security tooling'] },
  'fhp:skill:product-management': { aware:['Understands the PM role; has worked alongside PMs but has not held a PM role'], practitioner:['Has written user stories and specs; runs discovery activities; ships features with a cross-functional team'], proficient:['Owns a product area end-to-end: discovery, prioritisation, delivery, measurement'], expert:['Defines product strategy and roadmap for a significant product; has shipped products with measurable business impact at scale'], authority:['Recognised externally as a product leader (CPO experience, published PM frameworks, conference keynotes)'] },
  'fhp:skill:ux-design':        { aware:['Understands user-centred design conceptually; has not produced professional UX deliverables independently'], practitioner:['Creates wireframes, user flows, and prototypes; conducts user interviews with guidance'], proficient:['Owns UX for a product area: research, design, iteration, validation'], expert:['Defines UX strategy for a significant product; has shipped improvements with measurable user outcome impact'], authority:['Recognised externally as a UX leader through major conference speaking, published research, or widely-adopted design systems'] },
  'fhp:skill:engineering-management': { aware:['Understands EM responsibilities conceptually; has not held a formal EM role'], practitioner:['Manages a small team (2–5); conducts 1:1s and translates requirements into engineering deliverables'], proficient:['Manages 5–10 engineers with full autonomy; recruits, retains, and manages performance independently'], expert:['Manages multiple teams; drives engineering strategy at an organisational level'], authority:['Recognised externally as an engineering leadership expert through published frameworks or conference keynotes'] },
  'fhp:skill:people-management': { aware:['Has informally supported colleagues but has not held a formal management role'], practitioner:['Manages a small team; conducts 1:1s and performance conversations'], proficient:['Independently manages performance including difficult conversations; builds a high-trust team environment'], expert:['Manages large teams or multiple teams; manages other managers; designs team structures and career frameworks'], authority:['Recognised externally for people leadership expertise through published work or widely-adopted frameworks'] },
  'fhp:skill:mentoring':        { aware:['Occasionally answers colleagues\' questions but has not taken on a formal mentoring role'], practitioner:['Mentors one or two individuals in a structured way; gives feedback that mentees act on'], proficient:['Maintains several mentoring relationships with visible impact; adapts coaching style to each person'], expert:['Has helped multiple people make significant career advances; designs or runs mentoring programmes'], authority:['Recognised externally for mentoring expertise; trains other mentors or coaches at scale'] },
  'fhp:skill:stakeholder-management': { aware:['Has regular stakeholder interactions as a contributor but has not managed a stakeholder landscape'], practitioner:['Communicates project status proactively; manages expectations; escalates with context'], proficient:['Manages complex stakeholder landscapes including senior and conflicting stakeholders'], expert:['Manages C-suite or external partner relationships in high-stakes contexts; drives change through alignment'], authority:['Recognised externally for stakeholder and influence leadership through published frameworks'] },
  'fhp:skill:project-management': { aware:['Understands PM concepts; has contributed to a project as a team member but not managed one'], practitioner:['Manages small to medium projects: planning, tracking, communication'], proficient:['Manages complex, multi-stakeholder projects; consistently delivers within scope, time, and budget'], expert:['Manages a portfolio or large high-stakes programme; establishes PM processes across a team or org'], authority:['Recognised externally as a PM expert through published methodologies or industry leadership'] },
  'fhp:skill:agile':            { aware:['Understands agile values and principles; has worked in an agile team as a contributor'], practitioner:['Contributes effectively in sprint ceremonies; applies agile values in daily work'], proficient:['Facilitates agile ceremonies; adapts practices to team context; uses retrospectives to drive improvement'], expert:['Coaches teams on agile at scale (SAFe, LeSS, etc.); drives agile transformation across a department'], authority:['Recognised externally as an agile expert through Agile Alliance leadership or widely-adopted frameworks'] },
};

// Short display labels for domain IDs returned by /v1/ontology/skills
const DOMAIN_LABELS = {
  'fhp:domain:software-engineering': 'Software Eng',
  'fhp:domain:data':                 'Data & Analytics',
  'fhp:domain:infrastructure':       'Infrastructure',
  'fhp:domain:security':             'Security',
  'fhp:domain:product':              'Product & Design',
  'fhp:domain:leadership':           'Leadership',
  'fhp:domain:communication':        'Communication',
  'fhp:domain:finance':              'Finance',
  'fhp:domain:legal':                'Legal',
  'fhp:domain:operations':           'Operations',
  'fhp:domain:people':               'People & HR',
  'fhp:domain:sales':                'Sales',
  'fhp:domain:marketing':            'Marketing',
  'fhp:domain:research':             'Research',
};
// Fallback used only when the API is unreachable
const ALL_SKILLS = [
  {id:'fhp:skill:python',      label:'Python',           domain:'Software Eng'},
  {id:'fhp:skill:javascript',  label:'JavaScript',       domain:'Software Eng'},
  {id:'fhp:skill:typescript',  label:'TypeScript',       domain:'Software Eng'},
  {id:'fhp:skill:java',        label:'Java',             domain:'Software Eng'},
  {id:'fhp:skill:go',          label:'Go',               domain:'Software Eng'},
  {id:'fhp:skill:rust',        label:'Rust',             domain:'Software Eng'},
  {id:'fhp:skill:csharp',      label:'C#',               domain:'Software Eng'},
  {id:'fhp:skill:cpp',         label:'C++',              domain:'Software Eng'},
  {id:'fhp:skill:react',       label:'React',            domain:'Software Eng'},
  {id:'fhp:skill:sql',         label:'SQL',              domain:'Software Eng'},
  {id:'fhp:skill:git',         label:'Git',              domain:'Software Eng'},
  {id:'fhp:skill:system-design',label:'System Design',   domain:'Software Eng'},
  {id:'fhp:skill:data-engineering',label:'Data Engineering',domain:'Data & Analytics'},
  {id:'fhp:skill:machine-learning',label:'Machine Learning',domain:'Data & Analytics'},
  {id:'fhp:skill:data-analysis',label:'Data Analysis',   domain:'Data & Analytics'},
  {id:'fhp:skill:spark',       label:'Apache Spark',     domain:'Data & Analytics'},
  {id:'fhp:skill:dbt',         label:'dbt',              domain:'Data & Analytics'},
  {id:'fhp:skill:docker',      label:'Docker',           domain:'Infrastructure'},
  {id:'fhp:skill:kubernetes',  label:'Kubernetes',       domain:'Infrastructure'},
  {id:'fhp:skill:aws',         label:'AWS',              domain:'Infrastructure'},
  {id:'fhp:skill:terraform',   label:'Terraform',        domain:'Infrastructure'},
  {id:'fhp:skill:ci-cd',       label:'CI/CD',            domain:'Infrastructure'},
];
const TRANSFERS = [
  {from:'fhp:skill:docker', to:'Kubernetes',          weight:70, fromLabel:'Docker'},
  {from:'fhp:skill:spark',  to:'Data Pipeline Design', weight:80, fromLabel:'Apache Spark'},
  {from:'fhp:skill:sql',    to:'Data Modelling',      weight:70, fromLabel:'Analytical SQL'},
  {from:'fhp:skill:dbt',    to:'ELT Pipeline Design', weight:90, fromLabel:'dbt'},
];

let skills = [];

function renderSkills() {
  const el = document.getElementById('skills-list');
  if (!el) return;
  el.innerHTML = skills.map((s, i) => `
    <div class="skill-row">
      <div class="sn2">${s.label}</div>
      <span class="sd">${s.domain}</span>
      <div class="pdots" title="${PROF[s.level]}">
        ${PROF.map((_, li) => `<div class="pdot ${li <= s.level ? 'on' : ''}"
          onclick="setLvl(${i},${li})" title="${PROF[li]}"
          style="${li <= s.level ? 'background:' + PC[s.level] + ';border-color:' + PC[s.level] : ''}"></div>`).join('')}
      </div>
      <span class="plvl" onclick="showCriteria(${i},event)" title="Click to see what this level means">${PROF[s.level]}</span>
      <input class="ev-inp" type="text" placeholder="Evidence URL" value="${h(s.evidence_url || '')}"
        oninput="skills[${i}].evidence_url=this.value;validateEvUrl(this);recalcStrength()"
        title="Link to portfolio, cert, or work sample">
      <button class="sdel" onclick="removeSkill(${i})">&#10005;</button>
    </div>`).join('');
  renderTransfers();
  document.querySelectorAll('#skills-list .ev-inp').forEach(validateEvUrl);
  recalcStrength();
}

function setLvl(i, l)  { skills[i].level = l; renderSkills(); }
function removeSkill(i) { skills.splice(i, 1); renderSkills(); }

function showCriteria(i, evt) {
  evt.stopPropagation();
  const s       = skills[i];
  const lvlKey  = PROF[s.level];
  const def     = PROF_DEFS[lvlKey];
  if (!def) return;
  const override = SKILL_CRITERIA[s.id];
  const criteria = (override && override[lvlKey]) ? override[lvlKey] : def.criteria;
  const popup    = document.getElementById('crit-popup');
  popup.innerHTML =
    '<div class="cp-level">' + h(def.ui_label) + '</div>' +
    '<div class="cp-prompt">' + h(def.ui_prompt) + '</div>' +
    '<div class="cp-hdg">Typical evidence</div>' +
    '<ul class="cp-list">' + criteria.map(function(c) { return '<li>' + h(c) + '</li>'; }).join('') + '</ul>' +
    '<div class="cp-note">2–3 matching criteria is a good signal for this level. Not all need to apply.</div>';
  var x = Math.min(evt.clientX + 12, window.innerWidth  - 360);
  var y = Math.min(evt.clientY + 12, window.innerHeight - 220);
  popup.style.left    = x + 'px';
  popup.style.top     = y + 'px';
  popup.style.display = 'block';
}
document.addEventListener('click', function() {
  var p = document.getElementById('crit-popup');
  if (p) p.style.display = 'none';
});

function renderTransfers() {
  const el = document.getElementById('xfer-list');
  if (!el) return;
  const active = TRANSFERS.filter(t =>
    skills.find(s => s.id === t.from) &&
    !skills.find(s => s.label === t.to));
  if (!active.length) {
    el.innerHTML = '<div class="text-faint-sm">No transfer credits identified for your current skill set.</div>';
    return;
  }
  el.innerHTML = active.map(t => {
    const src = skills.find(s => s.id === t.from);
    const credit = Math.round((src.level / 4) * t.weight);
    return `<div class="xi">
      <span style="font-size:13px;color:var(--teal-hi)">\u27f3</span>
      <div class="xi-lbl">${t.fromLabel} \u2192 ${t.to}
        <div class="xi-sub">Transfer weight: ${t.weight}% of your ${t.fromLabel} (${PROF[src.level]}) level</div>
      </div>
      <span class="xi-sc">+${credit}% credit</span>
    </div>`;
  }).join('');
}

let _skillSearchTimer = null;

function filterSkills(val) {
  const el = document.getElementById('sugg');
  if (!val || val.length < 2) { el.style.display = 'none'; return; }
  clearTimeout(_skillSearchTimer);
  _skillSearchTimer = setTimeout(function() {
    fetch(API + '/ontology/skills?q=' + encodeURIComponent(val) + '&limit=12')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var sugg = document.getElementById('sugg');
        if (!sugg) return;
        var results = (data.skills || []).filter(function(s) {
          return !skills.find(function(x) { return x.id === s.skill_id; });
        });
        if (!results.length) { sugg.style.display = 'none'; return; }
        sugg.style.display = 'block';
        sugg.innerHTML = results.map(function(s) {
          var domain = DOMAIN_LABELS[s.domain] || s.domain || '';
          var id     = s.skill_id.replace(/'/g, "\\'");
          var lbl    = s.label.replace(/'/g, "\\'");
          var dom    = domain.replace(/'/g, "\\'");
          return '<div class="sugg-item" onmousedown="pickSkill(\'' + id + '\',\'' + lbl + '\',\'' + dom + '\')">' +
            '<span style="font-size:13px;font-weight:500">' + h(s.label) + '</span>' +
            '<span class="mono-xs">' + h(domain) + '</span>' +
            '</div>';
        }).join('');
      })
      .catch(function() {
        // API unreachable — fall back to local list
        var sugg = document.getElementById('sugg');
        var lv   = val.toLowerCase();
        var hits = ALL_SKILLS.filter(function(s) {
          return s.label.toLowerCase().includes(lv) && !skills.find(function(x) { return x.id === s.id; });
        });
        if (!hits.length) { sugg.style.display = 'none'; return; }
        sugg.style.display = 'block';
        sugg.innerHTML = hits.map(function(s) {
          return '<div class="sugg-item" onmousedown="pickSkill(\'' + s.id + '\',\'' + s.label.replace(/'/g,"\\'") + '\',\'' + s.domain + '\')">' +
            '<span style="font-size:13px;font-weight:500">' + h(s.label) + '</span>' +
            '<span class="mono-xs">' + h(s.domain) + '</span>' +
            '</div>';
        }).join('');
      });
  }, 150);
}

function pickSkill(id, label, domain) {
  skills.push({ id, label, domain, level: 1 });
  renderSkills();
  document.getElementById('skill-inp').value = '';
  document.getElementById('sugg').style.display = 'none';
}

function addSkill() {
  const v = document.getElementById('skill-inp').value.trim();
  if (!v) return;
  // Free-text skills break matching — require selection from ontology suggestions
  const el = document.getElementById('sugg');
  el.style.display = 'block';
  el.innerHTML = '<div style="padding:7px 11px;font-size:12px;color:var(--rust)">Please select a skill from the suggestions list.</div>';
}

// ── WORK HISTORY ─────────────────────────────────────────────────────────────────
let workHistory = [];
let certifications = [];

function toggleRoleForm() {
  const f = document.getElementById('role-form');
  const hidden = getComputedStyle(f).display === 'none';
  f.style.display = hidden ? 'block' : 'none';
}

function renderRoles() {
  const list  = document.getElementById('role-list');
  const empty = document.getElementById('role-empty');
  if (!list) return;
  if (!workHistory.length) {
    list.innerHTML = '<div class="text-faint-sm" id="role-empty">No roles added yet.</div>';
    recalcStrength();
    return;
  }
  list.innerHTML = workHistory.map((r, i) => `
    <div class="role-item">
      <div class="flex-1">
        <div class="role-desc">&#8220;${h(r.description)}&#8221;</div>
        <div class="role-meta">${h(r.from || '?')} &#8594; ${h(r.to || 'Present')} &middot; ${h(r.seniority || '')} &middot; ${h(r.skills_context || '')}</div>
      </div>
      <button class="sdel" onclick="removeRole(${i})">&#10005;</button>
    </div>`).join('');
  recalcStrength();
}

function removeRole(i) {
  workHistory.splice(i, 1);
  renderRoles();
}

function saveRole() {
  const desc = document.getElementById('rd').value.trim();
  const from = document.getElementById('rf').value;
  const to   = document.getElementById('rt').value;
  const sen  = document.getElementById('rs').value;
  const sk   = document.getElementById('rk').value;
  if (!desc) { showError('Please enter a role description.', 'Role description required'); return; }
  if ([desc, from, to, sen, sk].some(hasHtml)) { showError('Role fields must not contain HTML or script tags.', 'Invalid input'); return; }
  workHistory.unshift({ description: desc, from, to, seniority: sen, skills_context: sk });
  renderRoles();
  ['rd','rf','rt','rk'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('rs').value = '';
  toggleRoleForm();
}

// ── LICENCES & CERTIFICATIONS ─────────────────────────────────────────────────────
function toggleCertForm() {
  const f = document.getElementById('cert-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

const PROF_LABELS = { aware:'Aware', practitioner:'Practitioner', proficient:'Proficient', expert:'Expert', authority:'Authority' };

let _selectedCert = null; // { cert_id, label, issuing_body, cert_type, has_expiry, validity_years, evidences }
let _certSearchTimer = null;
let _certSuggestions = []; // current suggestion results — indexed by onmousedown to avoid JSON-in-attribute escaping

function filterCerts(val) {
  const sugg = document.getElementById('cert-suggestions');
  if (!val || val.length < 2) { sugg.style.display = 'none'; return; }
  clearTimeout(_certSearchTimer);
  _certSearchTimer = setTimeout(function() {
    fetch(API + '/ontology/certifications?q=' + encodeURIComponent(val) + '&limit=12')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        _certSuggestions = (data.certifications || []).filter(function(c) {
          return !certifications.find(function(x) { return x.cert_id === c.cert_id; });
        });
        if (!_certSuggestions.length) {
          sugg.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--ink-faint)">No results — try a different search term</div>';
        } else {
          sugg.innerHTML = _certSuggestions.map(function(c, i) {
            var typeBadge = c.cert_type === 'licence'
              ? '<span class="cbadge-licence">licence</span>'
              : c.cert_type === 'membership'
                ? '<span class="cbadge-membership">membership</span>'
                : '<span class="cbadge-cert">certification</span>';
            return '<div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--rule);font-size:12px" '
              + 'onmouseover="this.style.background=\'var(--cream-d,#e8e0d4)\'" '
              + 'onmouseout="this.style.background=\'\'" '
              + 'onmousedown="selectCertByIndex(' + i + ')">'
              + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">'
              + '<span style="font-weight:500;color:var(--ink)">' + h(c.label) + '</span>'
              + typeBadge
              + '</div>'
              + '<div class="mono-xs">' + h(c.issuing_body) + '</div>'
              + '</div>';
          }).join('');
        }
        sugg.style.display = 'block';
      })
      .catch(function() { sugg.style.display = 'none'; });
  }, 180);
}

function selectCertByIndex(i) {
  selectCert(_certSuggestions[i]);
}

function selectCert(c) {
  _selectedCert = c;
  var searchEl = document.getElementById('cert-search');
  if (searchEl) searchEl.value = c.label;
  var sugg = document.getElementById('cert-suggestions');
  if (sugg) sugg.style.display = 'none';

  // Auto-fill expiry if cert has a standard validity and no expiry set yet
  var issuedEl = document.getElementById('cert-issued');
  var expiryEl = document.getElementById('cert-expiry');
  if (c.has_expiry && c.validity_years && issuedEl && issuedEl.value && expiryEl && !expiryEl.value) {
    var issued = new Date(issuedEl.value + '-01');
    issued.setFullYear(issued.getFullYear() + c.validity_years);
    expiryEl.value = issued.toISOString().slice(0, 7);
  }

  // Show preview card
  var preview = document.getElementById('cert-preview');
  if (preview) {
    var evText = '';
    if (c.evidences && c.evidences.length) {
      evText = '<div class="cevid">Evidences: '
        + c.evidences.map(function(e) {
            return (PROF_LABELS[e.min_proficiency] || e.min_proficiency) + ' ' + e.skill_id.replace('fhp:skill:', '');
          }).join(', ')
        + '</div>';
    }
    var typeBadge = c.cert_type === 'licence'
      ? '<span class="cbadge-licence">hard constraint in matching</span>'
      : c.cert_type === 'membership'
        ? '<span class="cbadge-membership">membership</span>'
        : '<span class="cbadge-cert">proficiency signal in matching</span>';
    preview.innerHTML = '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">'
      + '<strong>' + h(c.label) + '</strong>' + typeBadge + '</div>'
      + '<div class="mono-xs">' + h(c.issuing_body)
      + (c.has_expiry && c.validity_years ? ' &middot; valid ' + c.validity_years + ' years' : '') + '</div>'
      + evText;
    preview.style.display = 'block';
  }
}

function renderCerts() {
  const list = document.getElementById('cert-list');
  if (!list) return;
  if (!certifications.length) {
    list.innerHTML = '<div class="text-faint-sm">No licences or certifications added yet.</div>';
    return;
  }
  const now = new Date();
  list.innerHTML = certifications.map((c, i) => {
    const expDate  = c.expiry ? new Date(c.expiry + '-01') : null;
    const expired  = expDate && expDate < now;
    const expiring = expDate && !expired && (expDate - now) < 90 * 86400 * 1000;
    const statusBadge = expired
      ? '<span style="font-family:var(--mono);font-size:9px;background:var(--rust-bg,#fde);color:var(--rust);padding:2px 6px;border-radius:2px">expired</span>'
      : expiring
        ? '<span style="font-family:var(--mono);font-size:9px;background:var(--gold-bg);color:var(--gold);padding:2px 6px;border-radius:2px">expiring</span>'
        : '<span style="font-family:var(--mono);font-size:9px;background:var(--sage-bg);color:var(--sage);padding:2px 6px;border-radius:2px">active</span>';
    const typeBadge = c.cert_type === 'licence'
      ? '<span class="cbadge-licence">licence</span>'
      : c.cert_type === 'membership'
        ? '<span class="cbadge-membership">membership</span>'
        : '<span class="cbadge-cert">certification</span>';
    const evLine = c.evidences && c.evidences.length
      ? '<div class="cevid">Evidences: ' + c.evidences.map(e => (PROF_LABELS[e.min_proficiency] || e.min_proficiency) + ' ' + e.skill_id.replace('fhp:skill:', '')).join(', ') + '</div>'
      : '';
    const detLine = h(c.issuing_body || c.issuer || '')
      + (c.ref    ? ' &middot; ' + h(c.ref)    : '')
      + (c.issued ? ' &middot; Issued ' + h(c.issued) : '')
      + (c.expiry ? ' &middot; Expires ' + h(c.expiry) : '');
    return '<div class="cert-item">'
      + '<div class="flex-1">'
      + '<div style="display:flex;gap:6px;align-items:center;margin-bottom:2px">'
      + '<div class="cname">' + h(c.label || c.name || '') + '</div>'
      + typeBadge
      + '</div>'
      + '<div class="cdet">' + detLine + '</div>'
      + evLine
      + '</div>'
      + statusBadge
      + '<button class="sdel" onclick="removeCert(' + i + ')" style="margin-left:8px;flex-shrink:0">&#10005;</button>'
      + '</div>';
  }).join('');
  recalcStrength();
}

function removeCert(i) {
  certifications.splice(i, 1);
  renderCerts();
}

function saveCert() {
  if (!_selectedCert) {
    showError('Please select a certification or licence from the search suggestions.', 'No selection');
    return;
  }
  const ref    = document.getElementById('cert-ref')?.value.trim() || '';
  const issued = document.getElementById('cert-issued')?.value || '';
  const expiry = document.getElementById('cert-expiry')?.value || '';
  if (ref && hasHtml(ref)) { showError('Credential ID must not contain HTML or script tags.', 'Invalid input'); return; }
  certifications.push({
    cert_id:     _selectedCert.cert_id,
    label:       _selectedCert.label,
    issuing_body:_selectedCert.issuing_body,
    cert_type:   _selectedCert.cert_type,
    evidences:   _selectedCert.evidences || [],
    issued:      issued,
    expiry:      expiry,
    ref:         ref,
  });
  _selectedCert = null;
  const searchEl = document.getElementById('cert-search');
  if (searchEl) searchEl.value = '';
  ['cert-ref','cert-issued','cert-expiry'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const preview = document.getElementById('cert-preview');
  if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
  renderCerts();
  toggleCertForm();
}

// Legacy stub — replaced by toggleCertForm
function addCert() { toggleCertForm(); }

// ── LOCATIONS ─────────────────────────────────────────────────────────────────────
function addLoc() {
  const list = document.getElementById('loc-list');
  const div  = document.createElement('div');
  div.className = 'loc-entry';
  div.innerHTML = `
    <select class="pfld" style="font-size:12px">
      <option>UK</option><option>US</option><option>DE</option><option>FR</option>
      <option>NL</option><option>IE</option><option>AU</option><option>CA</option>
    </select>
    <input class="pfld" type="text" placeholder="City 1, City 2\u2026">
    <button class="btn btn-g btn-sm" onclick="this.closest('.loc-entry').remove();recalcStrength()">&#10005;</button>`;
  list.appendChild(div);
  recalcStrength();
}


// ── MODAL ─────────────────────────────────────────────────────────────────────────
function openAppeal(job, matchId) {
  document.getElementById('amod-ctx').textContent = 'Match: ' + matchId + ' — ' + job;
  document.getElementById('appeal-match-id').value = matchId || '';
  document.getElementById('appeal-ground').selectedIndex = 0;
  document.getElementById('appeal-detail').value = '';
  document.getElementById('amodal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('amodal').classList.remove('open');
  document.body.style.overflow = '';
}

async function loadAppeals() {
  const list = document.getElementById('appeals-list');
  if (!list) return;

  const data = await api('GET', '/candidates/me/appeals?limit=20');
  if (!data) {
    list.innerHTML = '<div style="font-size:13px;color:var(--ink-faint);padding:12px 0">Could not load appeals.</div>';
    return;
  }
  if (!data.appeals || data.appeals.length === 0) {
    list.innerHTML = '<div style="font-size:13px;color:var(--ink-faint);padding:12px 0">You have no appeals on record.</div>';
    return;
  }

  const STATUS_BADGE = {
    submitted:        '<span class="asbadge" style="background:var(--cream-d);color:var(--ink-mid)">Submitted</span>',
    twg_review:       '<span class="asbadge asb-twg">TWG Review</span>',
    pc_review:        '<span class="asbadge asb-a">PC Review</span>',
    resolved:         '<span class="asbadge asb-d">Resolved</span>',
    withdrawn:        '<span class="asbadge" style="background:var(--cream-d);color:var(--ink-faint)">Withdrawn</span>',
  };
  const GROUND_LABELS = {
    incorrect_skill_assessment: 'Incorrect skill assessment',
    preference_mismatch:        'Preference mismatch',
    suspected_bias:             'Suspected bias',

  };
  var withdrawable = ['submitted', 'twg_review'];

  function stepHtml(s, i, steps) {
    var firstPending = steps.findIndex(function(x) { return !x.done; });
    var cls  = s.done ? 'td-d' : (i === firstPending ? 'td-a' : 'td-p');
    var icon = s.done ? '&#10003;' : (i === firstPending ? '&#9679;' : String(i + 1));
    var det  = s.detail ? '<div class="tdet">' + s.detail + '</div>' : '';
    return '<div class="ts"><div class="td ' + cls + '">' + icon + '</div>'
         + '<div class="tc2"><div class="tlbl">' + s.label + '</div>' + det + '</div></div>';
  }

  list.innerHTML = data.appeals.map(function(a) {
    var badge    = STATUS_BADGE[a.status] || a.status;
    var ground   = GROUND_LABELS[a.ground] || a.ground;
    var subDate  = a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '';
    var deadline = a.deadline_twg_review ? new Date(a.deadline_twg_review).toLocaleDateString('en-GB', {day:'numeric',month:'short'}) : '';
    var steps = [
      { label: 'Submitted',           done: true,                                           detail: subDate },
      { label: 'TWG Technical Review', done: ['pc_review','resolved'].includes(a.status), detail: deadline ? 'Deadline ' + deadline : '' },
      { label: 'Protocol Council',     done: a.status === 'resolved',                      detail: '' },
      { label: 'Resolution',           done: a.status === 'resolved',                      detail: a.outcome || '' },
    ];
    var timeline = steps.map(function(s, i) { return stepHtml(s, i, steps); }).join('');
    var withdrawBtn = withdrawable.includes(a.status)
      ? '<button class="btn btn-g btn-sm" onclick="withdrawAppeal(this)">Withdraw appeal</button>'
      : '';
    var twgNote = a.twg_notes
      ? '<div class="acs" style="color:var(--teal-hi);margin-top:4px">TWG note: ' + h(a.twg_notes) + '</div>'
      : '';
    var dueSpan = deadline
      ? '<span style="font-size:11px;color:var(--ink-light);margin-left:auto">Due ' + deadline + '</span>'
      : '';
    return '<div class="ac" data-appeal-id="' + a.appeal_id + '">'
         + '<div class="ac-sr">'
         + '<span class="appeal-status">' + badge + '</span>'
         + '<span style="font-size:11px;color:var(--ink-light);font-family:var(--mono)">' + a.appeal_id.substring(0,8) + '&hellip;</span>'
         + dueSpan
         + '</div>'
         + '<div class="act">' + h(a.job_title || 'Role') + '</div>'
         + '<div class="acs">Ground: ' + h(ground) + ' &middot; Submitted ' + subDate + '</div>'
         + twgNote
         + '<div class="tl">' + timeline + '</div>'
         + withdrawBtn
         + '</div>';
  }).join('');
}


async function loadAppealableMatches() {
  const select = document.getElementById('appeal-match-select');
  if (!select) return;

  const [matchData, appealData] = await Promise.all([
    api('GET', '/candidates/me/matches?limit=50'),
    api('GET', '/candidates/me/appeals'),
  ]);
  if (!matchData || !matchData.matches) return;

  // Match IDs that already have an active (non-withdrawn) appeal
  const appealedMatchIds = new Set(
    ((appealData && appealData.appeals) || [])
      .filter(a => a.status !== 'withdrawn')
      .map(a => a.match_id)
  );

  // Only show not_matched or borderline within 30 days, without an existing appeal
  const appealable = matchData.matches.filter(m => {
    const eligible = m.decision === 'not_matched' || m.decision === 'borderline';
    const within30 = m.appeal_deadline ? new Date(m.appeal_deadline) > new Date() : true;
    return eligible && within30 && m.appeal_eligible !== false && !appealedMatchIds.has(m.match_id);
  });

  const section = document.getElementById('appeal-new-section');

  if (!appealable.length) {
    select.innerHTML = '<option value="">No appealable matches</option>';
    if (section) {
      section.innerHTML = '<p style="color:var(--text-secondary);font-size:0.9rem;margin:0">No appealable matches &#8212; only <em>not matched</em> or <em>borderline</em> outcomes within 30 days of the decision can be appealed.</p>';
    }
    return;
  }

  if (section) section.style.display = '';

  select.innerHTML = '<option value="">Select a match&#8230;</option>' +
    appealable.map(m =>
      `<option value="${m.match_id}">${m.match_id.substring(0, 8)}&#8230; &mdash; ${m.decision} &mdash; ${new Date(m.created_at).toLocaleDateString('en-GB')}</option>`
    ).join('');
}


async function withdrawAppeal(btn) {
  // Find the appeal ID from the closest appeal card
  const card = btn.closest('[data-appeal-id]');
  const appealId = card?.dataset?.appealId;
  if (!appealId) {
    showError('Could not identify this appeal. Please refresh and try again.', 'Error');
    return;
  }
  if (!confirm('Withdraw this appeal? This cannot be undone once it reaches Protocol Council review.')) return;
  btn.disabled = true;
  const result = await api('PUT', '/candidates/me/appeals/' + appealId, { action: 'withdraw' });
  if (result) {
    card.style.opacity = '0.5';
    const statusEl = card.querySelector('.appeal-status');
    if (statusEl) statusEl.textContent = 'withdrawn';
    btn.textContent = 'Withdrawn';
  } else {
    btn.disabled = false;
    showError('Could not withdraw appeal — it may already be at Protocol Council stage.', 'Cannot withdraw');
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeMenu(); }
});

// ── DEMOGRAPHICS ─────────────────────────────────────────────────────────────────
async function activateDemographicsConsent() {
  const check = document.getElementById('demo-consent-check');
  if (!check || !check.checked) {
    showError('Please tick the consent checkbox to continue.', 'Consent required');
    return;
  }
  // In production: POST to /v1/candidates/me/consents with consent_type=fairness_metrics
  document.getElementById('demo-consent-gate').style.display = 'none';
  document.getElementById('demo-form').style.display = 'block';
  document.getElementById('demo-status-badge').textContent = 'consent given';
  document.getElementById('demo-status-badge').style.background = 'var(--sage-bg)';
  document.getElementById('demo-status-badge').style.color = 'var(--sage)';
  const result = await api('POST', '/candidates/me/consents', {
    consent_type: 'fairness_metrics',
    legal_basis: 'GDPR Art. 9(2)(a) — explicit consent',
  });
  if (!result && result !== null) {
    showError('Could not record consent — please try again.', 'Error saving consent');
    return;
  }
}

async function saveDemographics() {
  const fields = {};
  const sex       = document.getElementById('demo-sex').value;
  const ethnicity = document.getElementById('demo-ethnicity').value;
  const religion  = document.getElementById('demo-religion').value;
  const birthYear = document.getElementById('demo-birthyear').value;
  const education = document.getElementById('demo-education').value;
  if (sex)       fields.sex             = sex;
  if (ethnicity) fields.ethnicity       = ethnicity;
  if (religion)  fields.religion        = religion;
  if (birthYear) fields.birth_year      = parseInt(birthYear);
  if (education) fields.education_level = education;
  const fieldsSet = Object.keys(fields);
  if (fieldsSet.length === 0) {
    showError('No fields filled in — please complete at least one field before saving.', 'Nothing to save');
    return;
  }
  document.getElementById('demo-status-badge').textContent = fieldsSet.length + ' field' + (fieldsSet.length > 1 ? 's' : '') + ' provided';
  document.getElementById('demo-status-badge').style.background = 'var(--teal-dim)';
  document.getElementById('demo-status-badge').style.color = 'var(--teal)';
  const saved = await api('PUT', '/candidates/me/demographics', fields);
  if (saved !== null) {
    var count = Object.keys(fields).length;
    sessionStorage.setItem('fhp_demo_fields_count', String(count));
    document.getElementById('demo-status-badge').textContent = count + ' field(s) provided';
    document.getElementById('demo-save-confirm').style.display = 'inline';
    setTimeout(function() { document.getElementById('demo-save-confirm').style.display = 'none'; }, 2500);
  } else {
    showError('Could not save demographic data. Check that you have given fairness consent first.', 'Save failed');
  }
}

async function deleteDemographics() {
  if (!confirm('Remove all demographic data? This removes your cohort memberships but does not withdraw consent.')) return;
  document.getElementById('demo-status-badge').textContent = 'not provided';
  document.getElementById('demo-status-badge').style.background = 'var(--cream-d)';
  document.getElementById('demo-status-badge').style.color = 'var(--ink-light)';
  ['demo-sex','demo-ethnicity','demo-religion','demo-education'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('demo-birthyear').value = '';
  const del = await api('DELETE', '/candidates/me/demographics');
  if (del) {
    document.getElementById('demo-status-badge').textContent = 'not provided';
    document.getElementById('demo-status-badge').style.background = 'var(--cream-d)';
    document.getElementById('demo-status-badge').style.color = 'var(--ink-light)';
    ['demo-sex','demo-ethnicity','demo-religion','demo-education'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('demo-birthyear').value = '';
  }
}

// ── API ───────────────────────────────────────────────────────────────────────────
const API = 'http://localhost:3000/v1';
let _token = sessionStorage.getItem('fhp_access_token');

// Redirect to landing page if no token
if (!_token) {
  // Allow viewing without token during development — just show a banner
  console.warn('No access token — API calls will fail. Login via landing-page.html first.');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + (_token || ''),
  };
}

// ── DOWNLOAD MY DATA ─────────────────────────────────────────────────────────────
function _triggerDownload(data, filename, type) {
  filename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  var blob = new Blob([data], { type: type });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 0);
}

async function downloadMyData(btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing download…';
  try {
    const res = await fetch(API + '/candidates/me/export', {
      headers: { Authorization: 'Bearer ' + (_token || '') },
    });
    if (!res.ok) throw new Error('Export failed: ' + res.status);
    const text = await res.text();
    _triggerDownload(
      text,
      'fhp-export-' + new Date().toISOString().slice(0, 10) + '.json',
      'application/json'
    );
  } catch(e) {
    btn.style.color = 'var(--rust)';
    btn.textContent = 'Download failed — please try again';
    setTimeout(() => { btn.style.color = ''; btn.textContent = label; btn.disabled = false; }, 3000);
    return;
  }
  btn.disabled = false;
  btn.textContent = label;
}

// ── DELETE ACCOUNT MODAL ──────────────────────────────────────────────────────────
function openDelModal() {
  document.getElementById('del-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDelModal() {
  document.getElementById('del-modal').classList.remove('open');
  document.body.style.overflow = '';
  const btn = document.getElementById('del-confirm-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Delete my account permanently'; }
}
async function confirmDeleteAccount() {
  const btn = document.getElementById('del-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  const result = await api('DELETE', '/candidates/me');
  if (result) {
    sessionStorage.clear();
    window.location.href = 'landing-page.html';
  } else {
    if (btn) { btn.disabled = false; btn.textContent = 'Delete my account permanently'; }
  }
}

function isValidEvidenceUrl(url) {
  if (!url || !url.trim()) return true; // empty is fine
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}
function validateEvUrl(input) {
  const ok = isValidEvidenceUrl(input.value);
  input.classList.toggle('ev-invalid', !ok && input.value.trim() !== '');
  input.title = (!ok && input.value.trim() !== '')
    ? 'Must be a valid http:// or https:// URL'
    : 'Link to portfolio, cert, or work sample';
  return ok || input.value.trim() === '';
}

let _lastApiError = null;
async function api(method, path, body) {
  _lastApiError = null;
  try {
    const res = await fetch(API + path, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      sessionStorage.clear();
      window.location.href = 'landing-page.html';
      return null;
    }
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

// ── Dashboard — load real data ─────────────────────────────────────────────────
async function loadDashboard() {
  // Notifications unread count
  const notifs = await api('GET', '/candidates/me/notifications?unread_only=true&limit=1');
  if (notifs) {
    const badge = document.getElementById('notif-badge');
    if (badge && notifs.unread_count > 0) {
      badge.textContent = notifs.unread_count;
      badge.style.display = 'inline-flex';
    }
  }

  // Match history summary + recent match cards
  const matches = await api('GET', '/candidates/me/matches?limit=3');
  const elTotal   = document.getElementById('kpi-active-matches');
  const elMatched = document.getElementById('kpi-matched');
  const dbCards   = document.getElementById('db-cards');
  if (matches && matches.matches) {
    const matchedCount = matches.matches.filter(m => m.decision === 'matched').length;
    if (elTotal)   elTotal.textContent   = matches.total ?? matches.matches.length;
    if (elMatched) elMatched.textContent = matchedCount;
    if (dbCards) {
      if (!matches.matches.length) {
        dbCards.innerHTML = '<div style="padding:16px 0;color:var(--ink-faint);font-size:13px">No matches yet. Complete your profile to get started.</div>';
      } else {
        dbCards.innerHTML = matches.matches.map(function(m) {
          var dec      = m.decision || 'not_matched';
          var score    = parseFloat(m.composite_score || m.overall_score || 0);
          var date     = m.created_at ? new Date(m.created_at).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '';
          var badgeCls = dec === 'matched' ? 'b-m' : (dec === 'borderline' ? 'b-b' : 'b-n');
          var chipCls  = dec === 'matched' ? 'ch-m' : (dec === 'borderline' ? 'ch-b' : 'ch-n');
          var badgeIco = dec === 'matched' ? '✓' : (dec === 'borderline' ? '▲' : '✕');
          var scoreCls = dec === 'matched' ? 'snum-m' : (dec === 'borderline' ? 'snum-b' : 'snum-n');
          return '<div class="mc" onclick="go(\'matches\')" style="cursor:pointer">'
            + '<div class="mc-hdr">'
            + '<div class="mc-badge ' + badgeCls + '">' + badgeIco + '</div>'
            + '<div class="mc-meta">'
            + '<div class="mc-role">' + h(m.job_title || 'Role') + '</div>'
            + '<div class="mc-co">' + h(m.company_name || '') + '</div>'
            + '<div class="chips"><span class="chip ' + chipCls + '">' + dec.replace('_', ' ') + '</span>'
            + '<span class="chip ch-x">' + date + '</span></div>'
            + '</div>'
            + '<div class="mc-score"><div class="snum ' + scoreCls + '">' + score.toFixed(2) + '</div><div class="slbl">score</div></div>'
            + '</div>'
            + '</div>';
        }).join('');
      }
    }
  } else {
    if (elTotal)   elTotal.textContent   = 0;
    if (elMatched) elMatched.textContent = 0;
    if (dbCards)   dbCards.innerHTML     = '<div style="padding:16px 0;color:var(--ink-faint);font-size:13px">No matches yet. Complete your profile to get started.</div>';
  }

  // Ghosting events
  const ghosting = await api('GET', '/candidates/me/ghosting?status=open');
  if (ghosting) {
    const el = document.getElementById('kpi-ghosts');
    if (el) el.textContent = ghosting.open_count ?? 0;
  }
}


async function loadConsentRecord() {
  var tbody = document.getElementById('consent-record-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="padding:12px 0;color:var(--ink-faint)">Loading…</td></tr>';

  var me = await api('GET', '/candidates/me');
  var consentsData = await api('GET', '/candidates/me/consents');
  if (!me) { tbody.innerHTML = ''; return; }

  var regDate = me.created_at
    ? new Date(me.created_at).toLocaleDateString('en-GB', {day:'numeric', month:'short'})
    : '—';

  var fairness = consentsData && consentsData.consents
    && consentsData.consents.find(function(c) { return c.consent_type === 'fairness_metrics' && !c.withdrawn_at; });
  var fairnessDate = fairness
    ? new Date(fairness.given_at).toLocaleDateString('en-GB', {day:'numeric', month:'short'})
    : null;

  var cellStyle = 'padding:8px 0;';
  var bdStyle = 'border-bottom:1px solid var(--rule);';
  var givenCell = function(d) {
    return '<td style="' + cellStyle + 'color:var(--sage);font-family:var(--mono);font-size:10px">✓ ' + d + '</td>';
  };
  var notGivenCell = '<td style="' + cellStyle + 'color:var(--ink-faint);font-family:var(--mono);font-size:10px">Not given</td>';

  var rows = '';
  rows += '<tr style="' + bdStyle + '"><td style="' + cellStyle + '">Job matching service</td>'
    + '<td style="' + cellStyle + 'padding:8px 10px;color:var(--ink-light)">Contract — necessary to provide the service</td>'
    + givenCell(regDate)
    + '<td style="' + cellStyle + 'font-size:11px;color:var(--ink-faint)">Delete account</td></tr>';

  rows += '<tr style="' + bdStyle + '"><td style="' + cellStyle + '">Age confirmation (18+)</td>'
    + '<td style="' + cellStyle + 'padding:8px 10px;color:var(--ink-light)">Legal obligation — minimum age required</td>'
    + givenCell(regDate)
    + '<td style="' + cellStyle + 'font-size:11px;color:var(--ink-faint)">Irrevocable</td></tr>';

  rows += '<tr style="' + bdStyle + '"><td style="' + cellStyle + '">Fairness metric contribution</td>'
    + '<td style="' + cellStyle + 'padding:8px 10px;color:var(--ink-light)">Explicit consent — special category demographic data</td>'
    + (fairnessDate ? givenCell(fairnessDate) : notGivenCell)
    + '<td style="' + cellStyle + '">'
    + (fairness
        ? '<button class="btn btn-g btn-sm" style="font-size:10px" onclick="showError(\'Withdrawing consent is not yet available. Please contact support.\',\'Not available\')">Withdraw</button>'
        : '<span style="font-size:11px;color:var(--ink-faint)">N/A</span>')
    + '</td></tr>';

  rows += '<tr><td style="' + cellStyle + '">Platform terms</td>'
    + '<td style="' + cellStyle + 'padding:8px 10px;color:var(--ink-light)">Contract</td>'
    + givenCell(regDate)
    + '<td style="' + cellStyle + '"><a href="landing-page.html#terms" target="_blank" rel="noopener" style="font-size:11px;color:var(--teal)">View terms</a></td></tr>';

  tbody.innerHTML = rows;
}

async function loadConsentAndDemographics() {
  // Check DB for active fairness consent
  const consents = await api('GET', '/candidates/me/consents');
  if (!consents) return;

  const fairness = consents.consents && consents.consents.find(function(c) {
    return c.consent_type === 'fairness_metrics' && !c.withdrawn_at;
  });
  if (!fairness) return;

  // Consent is active — show the form, hide the gate
  document.getElementById('demo-consent-gate').style.display = 'none';
  document.getElementById('demo-consent-check').checked = true;
  document.getElementById('demo-form').style.display = 'block';

  // Fetch options — this tells us consent_active and jurisdiction-appropriate field list
  // Raw demographic values are write-only (special category data) so we cannot fetch them back.
  // We show how many fields were provided, stored in sessionStorage when saved.
  const opts = await api('GET', '/candidates/me/demographics/options');
  const badge = document.getElementById('demo-status-badge');
  if (!badge) return;

  if (opts && opts.consent_active) {
    // Check sessionStorage for count set at save time
    var storedCount = sessionStorage.getItem('fhp_demo_fields_count');
    if (storedCount && parseInt(storedCount) > 0) {
      badge.textContent = storedCount + ' field(s) provided';
    } else {
      // Consent is active but we don't know count (e.g. saved in a previous session)
      // The DB has the data — we just can't read it back. Show "data provided".
      badge.textContent = 'data provided';
    }
    badge.style.background = 'var(--sage-bg)';
    badge.style.color = 'var(--sage)';
  }
}


// ── PROFILE PERSISTENCE ───────────────────────────────────────────────────────────
const PROF_KEYS = ['aware','practitioner','proficient','expert','authority'];

async function saveProfile() {
  const btn = document.getElementById('profile-save-btn');
  const ok  = document.getElementById('profile-save-status');
  const err = document.getElementById('profile-save-error');
  if (btn) btn.disabled = true;
  if (ok)  ok.style.display  = 'none';
  if (err) err.style.display = 'none';

  const badUrls = skills.filter(s => s.evidence_url && !isValidEvidenceUrl(s.evidence_url));
  if (badUrls.length > 0) {
    if (err) { err.textContent = 'Fix invalid evidence URL(s) before saving.'; err.style.display = 'inline'; }
    if (btn) btn.disabled = false;
    return;
  }

  // Build skills payload
  const skillsPayload = skills.map(s => ({
    ontology_id:     s.id,
    label:           s.label,
    domain:          s.domain,
    proficiency:     PROF_KEYS[s.level] || 'practitioner',
    evidence_url:    s.evidence_url || null,
    years_experience: null,
  }));

  // Read preferences from UI
  const chipVals = (groupId) => {
    const chips = document.querySelectorAll('#' + groupId + ' .pch.on');
    return Array.from(chips).map(c => c.dataset.val || c.textContent.trim().toLowerCase());
  };
  const locEntries = [...document.querySelectorAll('#loc-list .loc-entry')].map(e => {
    const sel = e.querySelector('select');
    const inp = e.querySelector('input');
    return { country: sel?.value || '', cities: inp?.value || '' };
  }).filter(l => l.country);

  const prefsPayload = {
    job_types:       chipVals('chips-job-type'),
    work_modes:      chipVals('chips-work-mode'),
    work_schedules:  chipVals('chips-schedule'),
    right_to_work:   chipVals('chips-rtw'),
    locations:       locEntries,
    salary_minimum: parseFloat(document.getElementById('pref-salary-min')?.value || '0'),
    salary_currency: document.getElementById('pref-currency')?.value || 'GBP',
    salary_period:  document.getElementById('pref-salary-period')?.value || 'annual',
    notice_period: {
      value: parseInt(document.getElementById('np-n')?.value || '0'),
      unit:  document.getElementById('np-u')?.value || 'weeks',
    },
  };

  const result = await api('PUT', '/candidates/me', {
    skills:         skillsPayload,
    work_history:   workHistory,
    certifications: certifications,
    preferences:    prefsPayload,
  });

  if (btn) btn.disabled = false;
  if (result) {
    if (ok)  { ok.style.display = 'inline'; setTimeout(() => { ok.style.display = 'none'; }, 2500); }
  } else {
    if (err) { err.textContent = (_lastApiError && _lastApiError.message) ? _lastApiError.message : 'Save failed — please try again.'; err.style.display = 'inline'; }
  }
}

async function loadProfile() {
  const profile = await api('GET', '/candidates/me');
  if (!profile) return;

  // Restore skills
  if (profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0) {
    skills = profile.skills.map(s => ({
      id:           s.ontology_id  || s.id || 'fhp:skill:unknown',
      label:        s.label        || s.ontology_id || 'Unknown',
      domain:       s.domain       || 'Other',
      level:        PROF_KEYS.indexOf(s.proficiency) >= 0 ? PROF_KEYS.indexOf(s.proficiency) : 1,
      evidence_url: s.evidence_url || '',
    }));
    renderSkills();
  }

  // Restore work history
  if (profile.work_history && Array.isArray(profile.work_history) && profile.work_history.length > 0) {
    workHistory = profile.work_history;
    renderRoles();
  }

  // Restore certifications (top-level column — not inside preferences)
  if (Array.isArray(profile.certifications) && profile.certifications.length > 0) {
    certifications = profile.certifications;
    renderCerts();
  }

  // Restore preferences
  if (profile.preferences) {
    const p = profile.preferences;

    // Salary
    if (p.salary_minimum) {
      const salEl = document.getElementById('pref-salary-min');
      if (salEl) salEl.value = p.salary_minimum;
    }
    if (p.salary_currency) {
      const curEl = document.getElementById('pref-currency');
      if (curEl) curEl.value = p.salary_currency;
    }
    if (p.salary_period) {
      const perEl = document.getElementById('pref-salary-period');
      if (perEl) perEl.value = p.salary_period;
    }

    // Notice period
    if (p.notice_period) {
      const npN = document.getElementById('np-n');
      const npU = document.getElementById('np-u');
      if (npN) npN.value = p.notice_period.value;
      if (npU) npU.value = p.notice_period.unit;
    }

    // Chips — job types
    if (Array.isArray(p.job_types)) {
      document.querySelectorAll('#chips-job-type .pch').forEach(chip => {
        chip.classList.toggle('on', p.job_types.includes(chip.dataset.val));
      });
    }

    // Chips — work modes
    if (Array.isArray(p.work_modes)) {
      document.querySelectorAll('#chips-work-mode .pch').forEach(chip => {
        chip.classList.toggle('on', p.work_modes.includes(chip.dataset.val));
      });
    }

    // Chips — work schedules
    if (Array.isArray(p.work_schedules)) {
      document.querySelectorAll('#chips-schedule .pch').forEach(chip => {
        chip.classList.toggle('on', p.work_schedules.includes(chip.dataset.val));
      });
    }

    // Chips — right to work
    if (Array.isArray(p.right_to_work)) {
      document.querySelectorAll('#chips-rtw .pch').forEach(chip => {
        chip.classList.toggle('on', p.right_to_work.includes(chip.dataset.val));
      });
    }

    // Preferred locations
    if (Array.isArray(p.locations) && p.locations.length > 0) {
      var locList = document.getElementById('loc-list');
      if (locList) {
        locList.innerHTML = '';
        p.locations.forEach(function(loc) {
          var country = typeof loc === 'object' ? (loc.country || '') : String(loc);
          var cities  = typeof loc === 'object' ? (loc.cities  || '') : '';
          var div = document.createElement('div');
          div.className = 'loc-entry';
          div.innerHTML = '<select class="pfld" style="font-size:12px">'
            + ['UK','US','DE','FR','NL','IE','AU','CA'].map(function(c) {
                return '<option' + (c === country ? ' selected' : '') + '>' + c + '</option>';
              }).join('')
            + '</select>'
            + '<input class="pfld" type="text" placeholder="City 1, City 2…" value="' + country.replace(/"/g, '&quot;') + '">'
            + '<button class="btn btn-g btn-sm" onclick="this.closest(\'.loc-entry\').remove();recalcStrength()">&#10005;</button>';
          // Fix: the input should show cities, not country
          var inp = div.querySelector('input');
          if (inp) inp.value = cities;
          locList.appendChild(div);
        });
      }
    }

    recalcStrength();
  }
  renderEligibility(profile.skills);
}

// ── MATCHING ELIGIBILITY ──────────────────────────────────────────────────────────
function renderEligibility(profileSkills) {
  var w = document.getElementById('eligibility-widget');
  if (!w) return;
  var hasSkills  = Array.isArray(profileSkills) && profileSkills.length > 0;
  var eligible   = hasSkills; // age + terms always true for registered users
  var iconColor  = eligible ? 'var(--sage)' : 'var(--gold)';
  var icon       = eligible ? '&#10003;' : '&#9888;';
  var label      = eligible ? 'Eligible for matching' : 'Not yet eligible';
  var labelColor = eligible ? 'var(--sage)' : 'var(--gold)';
  var checks = [
    { met: true,      text: 'Age confirmed' },
    { met: true,      text: 'Terms accepted' },
    { met: hasSkills, text: hasSkills ? skills.length + ' skill' + (skills.length === 1 ? '' : 's') + ' on profile' : 'Add at least 1 skill' },
  ];
  w.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
    + '<span style="font-size:17px;color:' + iconColor + '">' + icon + '</span>'
    + '<div style="font-size:13px;color:' + labelColor + ';font-weight:500">' + label + '</div>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--ink-light);line-height:1.8">'
    + checks.map(function(c) {
        return '<span style="color:' + (c.met ? 'var(--sage)' : 'var(--rust)') + '">'
          + (c.met ? '&#10003;' : '&#10007;') + '</span> ' + c.text;
      }).join(' &middot; ')
    + '</div>';
}

// ── PROFILE STRENGTH ─────────────────────────────────────────────────────────────
function toggleChip(el) { el.classList.toggle('on'); recalcStrength(); }

function recalcStrength() {
  const CIRC = 131.9;
  const components = [
    { weight: 20, met: skills.length > 0,
      tip: 'Add at least one skill to enable matching.' },
    { weight: 15, met: workHistory.length > 0,
      tip: 'Add a work history role to improve match quality.' },
    { weight: 15, met: parseFloat(document.getElementById('pref-salary-min')?.value || '0') > 0,
      tip: 'Set a salary minimum — it\'s a hard constraint in matching.' },
    { weight: 10, met: document.querySelectorAll('#chips-rtw .pch.on').length > 0,
      tip: 'Set your right-to-work countries.' },
    { weight: 10, met: document.querySelectorAll('#loc-list .loc-entry').length > 0,
      tip: 'Add at least one preferred location.' },
    { weight: 10, met: document.querySelectorAll('#chips-job-type .pch.on').length > 0,
      tip: 'Select your preferred job type (permanent, contract…).' },
    { weight: 10, met: document.querySelectorAll('#chips-work-mode .pch.on').length > 0,
      tip: 'Select your preferred work mode (remote, hybrid…).' },
    { weight: 10, met: skills.some(s => s.evidence_url && isValidEvidenceUrl(s.evidence_url)),
      tip: 'Add a valid evidence URL (http/https) to at least one skill claim.' },
  ];

  const pct = components.reduce((sum, c) => sum + (c.met ? c.weight : 0), 0);
  const offset = CIRC * (1 - pct / 100);
  const tips = components.filter(c => !c.met).map(c =>
    `<div class="tip"><span class="ti">&#128161;</span>${c.tip}</div>`).join('');

  document.querySelectorAll('.strength-arc').forEach(el => {
    el.setAttribute('stroke-dashoffset', offset.toFixed(1));
  });
  document.querySelectorAll('.strength-pct').forEach(el => {
    el.textContent = pct + '%';
  });
  document.querySelectorAll('.strength-tips').forEach(el => {
    el.innerHTML = tips;
  });
  renderEligibility(skills);
}

// ── INIT ─────────────────────────────────────────────────────────────────────────
renderSkills();
renderRoles();
renderCerts();
loadNotifications();
loadMatches();
loadDashboard();
loadConsentAndDemographics();
loadProfile();

const _startTab = window.location.hash.replace('#', '');
if (_startTab && document.getElementById('pg-' + _startTab)) {
  go(_startTab);
  history.replaceState(null, '', window.location.pathname);
}