/**
 * FHP Mock Data Seed
 *
 * Inserts a realistic set of mock records so every dashboard tab renders
 * with data rather than empty states.
 *
 * Usage (note the extra -- before flags when using npm run):
 *   npm run seed:mock                          # insert (idempotent — safe to re-run)
 *   npm run seed:mock -- --clean               # delete all mock records first, then re-insert
 *   npm run seed:mock -- --company-id <uuid>   # target a specific company
 *   npx tsx scripts/seed-mock.ts --company-id <uuid>  # alternative without npm
 *
 * All mock records are identified by fixed UUIDs defined in MOCK_IDS below.
 * Deletion is by those IDs only — no other data is touched.
 *
 * Requires: DATABASE_URL in environment (or .env file)
 */

import 'dotenv/config';
import postgres from 'postgres';

// ── Fixed UUIDs (DO NOT change — these are the clean/idempotency anchors) ────

const MOCK = {
  candidateId:  '00000000-0000-4000-a000-000000000001',
  candidate2Id: '00000000-0000-4000-a000-000000000002',
  candidate3Id: '00000000-0000-4000-a000-000000000003',

  jobIds: [
    '00000000-0000-4000-a000-000001000001',  // Senior Backend Engineer
    '00000000-0000-4000-a000-000001000002',  // Product Manager
    '00000000-0000-4000-a000-000001000003',  // UX Designer
  ],

  matchIds: Array.from({ length: 12 }, (_, i) =>
    `00000000-0000-4000-a000-0000020000${String(i + 1).padStart(2, '0')}`),

  ghostingIds: [
    '00000000-0000-4000-a000-000004000001',
    '00000000-0000-4000-a000-000004000002',
    '00000000-0000-4000-a000-000004000003',
    '00000000-0000-4000-a000-000004000004',
  ],

  fairnessCompanyId:  '00000000-0000-4000-a000-000005000001',
  fairnessPlatformId: '00000000-0000-4000-a000-000005000002',
  fairnessJobIds: [
    '00000000-0000-4000-a000-000005000003',
    '00000000-0000-4000-a000-000005000004',
    '00000000-0000-4000-a000-000005000005',
  ],

  appealIds: [
    '00000000-0000-4000-a000-000006000001',
    '00000000-0000-4000-a000-000006000002',
    '00000000-0000-4000-a000-000006000003',
  ],

  escalationIds: [
    '00000000-0000-4000-a000-000007000001',  // protocol_council
    '00000000-0000-4000-a000-000007000002',  // protocol_council
    '00000000-0000-4000-a000-000007000003',  // fairness_oversight_board
    '00000000-0000-4000-a000-000007000004',  // fairness_oversight_board
    '00000000-0000-4000-a000-000007000005',  // twg
  ],

  proposalIds: [
    '00000000-0000-4000-a000-000008000001',
    '00000000-0000-4000-a000-000008000002',
  ],

  voteIds: [
    '00000000-0000-4000-a000-000009000001',
    '00000000-0000-4000-a000-000009000002',
    '00000000-0000-4000-a000-000009000003',
  ],

  strikeIds: [
    '00000000-0000-4000-a000-000010000001',
    '00000000-0000-4000-a000-000010000002',
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const clean     = process.argv.includes('--clean');
  const cidArg    = process.argv.indexOf('--company-id');
  const forcedCid = cidArg !== -1 ? process.argv[cidArg + 1] : null;

  const db = postgres(process.env.DATABASE_URL!, { max: 1 });

  try {
    // Resolve target company
    let companyId: string;
    if (forcedCid) {
      companyId = forcedCid;
    } else {
      const rows = await db`SELECT company_id FROM matching.companies LIMIT 1`;
      if (!rows[0]) {
        console.error('No companies found. Register a company first via the landing page.');
        process.exit(1);
      }
      companyId = rows[0].company_id as string;
    }
    console.log(`Seeding for company: ${companyId}`);

    // ── Clean ──────────────────────────────────────────────────────────────
    if (clean) {
      console.log('Cleaning existing mock data…');
      // Cannot delete: match_events (trigger-immutable) or job_briefs that match_events reference
      // (ON DELETE RESTRICT). Both are idempotent via ON CONFLICT DO NOTHING.
      // Everything else is safe to delete and re-insert.
      await db`DELETE FROM matching.company_strikes      WHERE strike_id     = ANY(${MOCK.strikeIds})`;
      await db`DELETE FROM matching.ghosting_events     WHERE ghosting_id   = ANY(${MOCK.ghostingIds})`;
      await db`DELETE FROM matching.appeals             WHERE appeal_id     = ANY(${MOCK.appealIds})`;
      await db`DELETE FROM matching.active_interactions WHERE match_id      = ANY(${MOCK.matchIds})`;
      await db`DELETE FROM analytical.fairness_metrics
               WHERE audit_id = ANY(${[MOCK.fairnessCompanyId, MOCK.fairnessPlatformId, ...MOCK.fairnessJobIds]})`;
      await db`DELETE FROM matching.governance_votes    WHERE vote_id       = ANY(${MOCK.voteIds})`;
      await db`DELETE FROM matching.governance_proposals WHERE proposal_id  = ANY(${MOCK.proposalIds})`;
      await db`DELETE FROM matching.escalations         WHERE escalation_id = ANY(${MOCK.escalationIds})`;
      console.log('Clean done.');
    }

    // ── Job Briefs ─────────────────────────────────────────────────────────
    console.log('Inserting job briefs…');
    const jobs = [
      {
        job_id: MOCK.jobIds[0],
        title: '[MOCK] Senior Backend Engineer',
        role_summary: 'Design and operate distributed microservices powering our core hiring platform. You will own reliability, performance, and observability for three critical services handling 50k daily events. The role sits within a 6-person platform squad and reports to the Engineering Lead.',
        salary_minimum: 75000, salary_maximum: 105000,
        work_mode: 'remote', hybrid_days: null, location_country: 'GB', location_city: 'London',
        response_sla_days: 5, expires_at: daysFromNow(45),
        skills: [
          { ontology_id: 'fhp:skill:typescript',    requirement_level: 'required',   minimum_proficiency: 4 },
          { ontology_id: 'fhp:skill:node',           requirement_level: 'required',   minimum_proficiency: 3 },
          { ontology_id: 'fhp:skill:microservices',  requirement_level: 'required',   minimum_proficiency: 3 },
          { ontology_id: 'fhp:skill:sql',            requirement_level: 'required',   minimum_proficiency: 3 },
          { ontology_id: 'fhp:skill:system-design',  requirement_level: 'preferred',  minimum_proficiency: 3 },
          { ontology_id: 'fhp:skill:git',            requirement_level: 'required',   minimum_proficiency: 2 },
        ],
      },
      {
        job_id: MOCK.jobIds[1],
        title: '[MOCK] Product Manager — Platform',
        role_summary: 'Define and deliver the roadmap for our candidate-facing matching platform. You will work across three squads, translate fairness requirements into product decisions, and own the quarterly OKRs for match quality and candidate experience. We are a metrics-driven team that ships weekly.',
        salary_minimum: 80000, salary_maximum: 115000,
        work_mode: 'hybrid', hybrid_days: 2, location_country: 'GB', location_city: 'London',
        response_sla_days: 7, expires_at: daysFromNow(60),
        skills: [
          { ontology_id: 'fhp:skill:product-management', requirement_level: 'required',  minimum_proficiency: 4 },
          { ontology_id: 'fhp:skill:agile',              requirement_level: 'required',  minimum_proficiency: 3 },
          { ontology_id: 'fhp:skill:stakeholder-mgmt',   requirement_level: 'required',  minimum_proficiency: 3 },
          { ontology_id: 'fhp:skill:product-analytics',  requirement_level: 'preferred', minimum_proficiency: 2 },
          { ontology_id: 'fhp:skill:a-b-testing',        requirement_level: 'preferred', minimum_proficiency: 2 },
        ],
      },
      {
        job_id: MOCK.jobIds[2],
        title: '[MOCK] Senior UX Designer',
        role_summary: 'Lead UX across our web and mobile candidate surfaces, from discovery to shipped design. You will run user research, own the design system, and collaborate directly with engineers to iterate on fairness-aware interfaces. The team currently serves 12,000 active candidates.',
        salary_minimum: 55000, salary_maximum: 78000,
        work_mode: 'hybrid', hybrid_days: 2, location_country: 'GB', location_city: 'Manchester',
        response_sla_days: 7, expires_at: daysFromNow(30),
        skills: [
          { ontology_id: 'fhp:skill:ux-design',         requirement_level: 'required',  minimum_proficiency: 4 },
          { ontology_id: 'fhp:skill:figma',             requirement_level: 'required',  minimum_proficiency: 3 },
          { ontology_id: 'fhp:skill:user-research',     requirement_level: 'required',  minimum_proficiency: 3 },
          { ontology_id: 'fhp:skill:ui-design',         requirement_level: 'preferred', minimum_proficiency: 3 },
        ],
      },
    ];

    for (const j of jobs) {
      await db`
        INSERT INTO matching.job_briefs (
          job_id, company_id, fhp_version, title, role_summary, status,
          skills_required, salary_currency, salary_minimum, salary_maximum, salary_period,
          work_mode, hybrid_days_on_site,
          location_country, location_city, response_sla_days, expires_at, activated_at,
          attest_no_degree_requirement, attest_no_institution_preference,
          attest_no_graduation_year_filter, attest_no_unpaid_work,
          employment_type, created_at
        ) VALUES (
          ${j.job_id}, ${companyId}, '1.0.0', ${j.title}, ${j.role_summary}, 'active',
          ${db.json(j.skills)},
          'GBP', ${j.salary_minimum}, ${j.salary_maximum}, 'annual',
          ${j.work_mode}, ${j.hybrid_days ?? null},
          ${j.location_country}, ${j.location_city}, ${j.response_sla_days},
          ${j.expires_at}, ${daysAgo(30)},
          TRUE, TRUE, TRUE, TRUE,
          'permanent', ${daysAgo(30)}
        )
        ON CONFLICT (job_id) DO NOTHING
      `;
    }

    // ── Match Events ───────────────────────────────────────────────────────
    console.log('Inserting match events…');
    const matchDefs = [
      // job 1 — 5 matches
      { idx: 0,  jobIdx: 0, candId: MOCK.candidateId,  score: 0.89, decision: 'matched',     biasCorrection: false, delta: 0 },
      { idx: 1,  jobIdx: 0, candId: MOCK.candidate2Id, score: 0.81, decision: 'matched',     biasCorrection: false, delta: 0 },
      { idx: 2,  jobIdx: 0, candId: MOCK.candidate3Id, score: 0.57, decision: 'borderline',  biasCorrection: true,  delta: 0.04 },
      { idx: 3,  jobIdx: 0, candId: MOCK.candidate2Id, score: 0.38, decision: 'not_matched', biasCorrection: false, delta: 0 },
      { idx: 4,  jobIdx: 0, candId: MOCK.candidateId,  score: 0.72, decision: 'matched',     biasCorrection: true,  delta: 0.03 },
      // job 2 — 4 matches
      { idx: 5,  jobIdx: 1, candId: MOCK.candidateId,  score: 0.78, decision: 'matched',     biasCorrection: false, delta: 0 },
      { idx: 6,  jobIdx: 1, candId: MOCK.candidate2Id, score: 0.62, decision: 'borderline',  biasCorrection: false, delta: 0 },
      { idx: 7,  jobIdx: 1, candId: MOCK.candidate3Id, score: 0.45, decision: 'not_matched', biasCorrection: true,  delta: 0.05 },
      { idx: 8,  jobIdx: 1, candId: MOCK.candidateId,  score: 0.83, decision: 'matched',     biasCorrection: false, delta: 0 },
      // job 3 — 3 matches
      { idx: 9,  jobIdx: 2, candId: MOCK.candidate3Id, score: 0.74, decision: 'matched',     biasCorrection: false, delta: 0 },
      { idx: 10, jobIdx: 2, candId: MOCK.candidate2Id, score: 0.66, decision: 'borderline',  biasCorrection: true,  delta: 0.02 },
      { idx: 11, jobIdx: 2, candId: MOCK.candidateId,  score: 0.41, decision: 'not_matched', biasCorrection: false, delta: 0 },
    ];

    for (const m of matchDefs) {
      await db`
        INSERT INTO matching.match_events (
          match_id, candidate_id, job_id, company_id,
          fhp_version, pipeline_version, decision,
          overall_score, pre_correction_score, skill_score,
          transferable_skill_score, preference_alignment_score,
          bias_correction_delta, bias_correction_triggered,
          qualified, created_at
        ) VALUES (
          ${MOCK.matchIds[m.idx]}, ${m.candId}, ${MOCK.jobIds[m.jobIdx]}, ${companyId},
          '1.0.0', '1.0.0', ${m.decision},
          ${m.score}, ${m.score - m.delta}, ${m.score + 0.05},
          0.05, ${m.score - 0.1},
          ${m.delta}, ${m.biasCorrection},
          TRUE, ${daysAgo(30 - m.idx * 2)}
        )
        ON CONFLICT (match_id) DO NOTHING
      `;
    }

    // ── Active Interactions ────────────────────────────────────────────────
    console.log('Inserting active interactions…');
    const interactionDefs = [
      // Active — various stages
      { matchIdx: 0, stage: 'interview_stage',    status: 'active',    outcome: null,      rejCode: null,    daysBack: 5 },
      { matchIdx: 1, stage: 'technical_assessment', status: 'active',  outcome: null,      rejCode: null,    daysBack: 8 },
      { matchIdx: 4, stage: 'offer_stage',         status: 'active',   outcome: null,      rejCode: null,    daysBack: 3 },
      { matchIdx: 5, stage: 'application_review',  status: 'active',   outcome: null,      rejCode: null,    daysBack: 2 },
      { matchIdx: 8, stage: 'screening_call',      status: 'active',   outcome: null,      rejCode: null,    daysBack: 6 },
      { matchIdx: 9, stage: 'interview_stage',     status: 'active',   outcome: null,      rejCode: null,    daysBack: 4 },
      // Completed — with structured rejections
      { matchIdx: 2, stage: 'completed',           status: 'completed', outcome: 'rejected', rejCode: 'skills_gap',          daysBack: 20 },
      { matchIdx: 3, stage: 'completed',           status: 'completed', outcome: 'rejected', rejCode: 'experience_level',    daysBack: 22 },
      { matchIdx: 6, stage: 'completed',           status: 'completed', outcome: 'rejected', rejCode: 'preference_mismatch', daysBack: 18 },
      { matchIdx: 7, stage: 'completed',           status: 'completed', outcome: 'rejected', rejCode: null,                  daysBack: 25 },
      { matchIdx: 10, stage: 'completed',          status: 'completed', outcome: 'hired',    rejCode: null,                  daysBack: 15 },
      { matchIdx: 11, stage: 'completed',          status: 'completed', outcome: 'candidate_withdrew', rejCode: null,        daysBack: 28 },
    ];

    for (const i of interactionDefs) {
      const enteredAt  = daysAgo(i.daysBack);
      const slaDeadline = new Date(enteredAt.getTime() + 7 * 86_400_000);
      await db`
        INSERT INTO matching.active_interactions (
          match_id, candidate_id, company_id, job_id,
          current_stage, stage_entered_at, sla_deadline,
          outcome, rejection_reason_code, rejection_notes, rejection_sent_at,
          status, last_contact_at, created_at
        ) VALUES (
          ${MOCK.matchIds[i.matchIdx]}, ${matchDefs[i.matchIdx].candId},
          ${companyId}, ${MOCK.jobIds[matchDefs[i.matchIdx].jobIdx]},
          ${i.stage}, ${enteredAt}, ${slaDeadline},
          ${i.outcome}, ${i.rejCode},
          ${i.rejCode ? 'Automated structured rejection sent via FHP.' : null},
          ${i.outcome === 'rejected' ? daysAgo(i.daysBack - 1) : null},
          ${i.status}, ${daysAgo(i.daysBack - 1)}, ${enteredAt}
        )
        ON CONFLICT (match_id) DO NOTHING
      `;
    }

    // ── Ghosting Events ────────────────────────────────────────────────────
    console.log('Inserting ghosting events…');
    const ghostDefs = [
      { idx: 0, matchIdx: 1, jobIdx: 0, hours: 52,  severity: 'significant', status: 'open',     candId: MOCK.candidate2Id },
      { idx: 1, matchIdx: 5, jobIdx: 1, hours: 128, severity: 'severe',      status: 'open',     candId: MOCK.candidateId  },
      { idx: 2, matchIdx: 7, jobIdx: 1, hours: 18,  severity: 'minor',       status: 'resolved', candId: MOCK.candidate3Id },
      { idx: 3, matchIdx: 3, jobIdx: 0, hours: 72,  severity: 'severe',      status: 'resolved', candId: MOCK.candidate2Id },
    ];

    for (const g of ghostDefs) {
      const detectedAt  = daysAgo(g.idx * 3 + 2);
      const slaDeadline = new Date(detectedAt.getTime() - g.hours * 3_600_000);
      await db`
        INSERT INTO matching.ghosting_events (
          ghosting_id, fhp_version, candidate_id, company_id, job_id, match_id,
          stage_name, last_contact_at, sla_deadline, detected_at, overdue_hours,
          severity, status, company_strike_count_at_detection,
          resolution_type, resolved_at, created_at
        ) VALUES (
          ${MOCK.ghostingIds[g.idx]}, '1.0.0', ${g.candId}, ${companyId},
          ${MOCK.jobIds[g.jobIdx]}, ${MOCK.matchIds[g.matchIdx]},
          'screening_call', ${daysAgo(g.idx * 3 + 4)}, ${slaDeadline},
          ${detectedAt}, ${g.hours}, ${g.severity}, ${g.status}, 0,
          ${g.status === 'resolved' ? 'late_response' : null},
          ${g.status === 'resolved' ? daysAgo(1) : null},
          ${detectedAt}
        )
        ON CONFLICT (ghosting_id) DO NOTHING
      `;
    }

    // ── Company Strikes ────────────────────────────────────────────────────
    // Two strikes for the two open ghosting events (idx 0 and 1).
    // Resolved ghosting events (idx 2, 3) do not generate strikes.
    console.log('Inserting company strikes…');
    await db`
      INSERT INTO matching.company_strikes (strike_id, company_id, ghosting_id, recorded_at, expires_at)
      VALUES (
        ${MOCK.strikeIds[0]}, ${companyId}, ${MOCK.ghostingIds[0]},
        ${daysAgo(8)}, ${daysFromNow(357)}
      )
      ON CONFLICT (strike_id) DO NOTHING
    `;
    await db`
      INSERT INTO matching.company_strikes (strike_id, company_id, ghosting_id, recorded_at, expires_at)
      VALUES (
        ${MOCK.strikeIds[1]}, ${companyId}, ${MOCK.ghostingIds[1]},
        ${daysAgo(5)}, ${daysFromNow(360)}
      )
      ON CONFLICT (strike_id) DO NOTHING
    `;

    // ── Fairness Metrics (company-level) ───────────────────────────────────
    console.log('Inserting fairness metrics…');
    const now = new Date();
    await db`
      INSERT INTO analytical.fairness_metrics (
        audit_id, computed_at, created_at, pipeline_version,
        window_from, window_to, window_type,
        scope_level, scope_company_id,
        total_matches_evaluated, suppressed_cohorts,
        dir_value, dir_within_bounds,
        eod_value, eod_within_bounds,
        sds_value, sds_within_bounds,
        threshold_dir_lower, threshold_dir_upper,
        threshold_eod_abs, threshold_sds_abs,
        any_metric_breached, consecutive_breach_windows,
        ghosting_sla_compliance_rate
      ) VALUES (
        ${MOCK.fairnessCompanyId}, ${now}, ${now}, '1.0.0',
        ${daysAgo(30)}, ${now}, 'rolling_30d',
        'company', ${companyId},
        12, 0,
        0.843, TRUE,
        0.021, TRUE,
        -0.012, TRUE,
        0.70, 1.30, 0.05, 0.05,
        FALSE, 0,
        0.91
      )
      ON CONFLICT (audit_id, created_at) DO NOTHING
    `;

    // Fairness metrics (platform-level)
    await db`
      INSERT INTO analytical.fairness_metrics (
        audit_id, computed_at, created_at, pipeline_version,
        window_from, window_to, window_type,
        scope_level,
        total_matches_evaluated, suppressed_cohorts,
        dir_value, dir_within_bounds,
        eod_value, eod_within_bounds,
        sds_value, sds_within_bounds,
        threshold_dir_lower, threshold_dir_upper,
        threshold_eod_abs, threshold_sds_abs,
        any_metric_breached, consecutive_breach_windows,
        ghosting_sla_compliance_rate
      ) VALUES (
        ${MOCK.fairnessPlatformId}, ${now}, ${now}, '1.0.0',
        ${daysAgo(30)}, ${now}, 'rolling_30d',
        'platform',
        847, 3,
        0.871, TRUE,
        0.018, TRUE,
        0.009, TRUE,
        0.70, 1.30, 0.05, 0.05,
        FALSE, 0,
        0.88
      )
      ON CONFLICT (audit_id, created_at) DO NOTHING
    `;

    // Fairness metrics (job-level — one per mock job)
    const jobFairness = [
      { auditId: MOCK.fairnessJobIds[0], jobId: MOCK.jobIds[0], dir: 0.831, eod:  0.018, sds: -0.008, matches: 5 },
      { auditId: MOCK.fairnessJobIds[1], jobId: MOCK.jobIds[1], dir: 0.794, eod:  0.042, sds:  0.021, matches: 4 },
      { auditId: MOCK.fairnessJobIds[2], jobId: MOCK.jobIds[2], dir: 0.912, eod: -0.011, sds: -0.004, matches: 3 },
    ];
    for (const jf of jobFairness) {
      await db`
        INSERT INTO analytical.fairness_metrics (
          audit_id, computed_at, created_at, pipeline_version,
          window_from, window_to, window_type,
          scope_level, scope_job_id, scope_company_id,
          total_matches_evaluated, suppressed_cohorts,
          dir_value, dir_within_bounds,
          eod_value, eod_within_bounds,
          sds_value, sds_within_bounds,
          threshold_dir_lower, threshold_dir_upper,
          threshold_eod_abs, threshold_sds_abs,
          any_metric_breached, consecutive_breach_windows,
          ghosting_sla_compliance_rate
        ) VALUES (
          ${jf.auditId}, ${now}, ${now}, '1.0.0',
          ${daysAgo(30)}, ${now}, 'rolling_30d',
          'job', ${jf.jobId}, ${companyId},
          ${jf.matches}, 0,
          ${jf.dir}, ${jf.dir >= 0.70},
          ${jf.eod}, ${Math.abs(jf.eod) <= 0.05},
          ${jf.sds}, ${Math.abs(jf.sds) <= 0.05},
          0.70, 1.30, 0.05, 0.05,
          FALSE, 0,
          0.90
        )
        ON CONFLICT (audit_id, created_at) DO NOTHING
      `;
    }

    // ── Appeals ────────────────────────────────────────────────────────────
    console.log('Inserting appeals…');
    const appealDefs = [
      {
        id: MOCK.appealIds[0], matchIdx: 2, jobIdx: 0, candId: MOCK.candidate3Id,
        ground: 'suspected_bias', status: 'twg_review',
        detail: 'The skill scoring appears inconsistent with my demonstrated experience in TypeScript and distributed systems.',
      },
      {
        id: MOCK.appealIds[1], matchIdx: 3, jobIdx: 0, candId: MOCK.candidate2Id,
        ground: 'incorrect_skill_assessment', status: 'pc_review',
        detail: 'I have 5 years of hands-on experience with this stack but the assessment scored me below the threshold.',
      },
      {
        id: MOCK.appealIds[2], matchIdx: 7, jobIdx: 1, candId: MOCK.candidate3Id,
        ground: 'preference_mismatch', status: 'resolved',
        detail: 'My preference profile clearly indicates remote-first but this role was scored as a high match despite on-site requirement.',
        outcome: 'upheld', twgFinding: 'Preference weighting correctly applied. Score overturned on EOD grounds.',
      },
    ];

    for (const a of appealDefs) {
      await db`
        INSERT INTO matching.appeals (
          appeal_id, match_id, candidate_id, job_id,
          ground, detail, status,
          twg_deadline, twg_finding, outcome, resolved_at,
          submission_deadline, created_at, updated_at
        ) VALUES (
          ${a.id}, ${MOCK.matchIds[a.matchIdx]}, ${a.candId}, ${MOCK.jobIds[a.jobIdx]},
          ${a.ground}, ${a.detail}, ${a.status},
          ${daysFromNow(5)},
          ${(a as any).twgFinding ?? null},
          ${(a as any).outcome ?? null},
          ${a.status === 'resolved' ? daysAgo(5) : null},
          ${daysFromNow(30)}, ${daysAgo(20)}, ${daysAgo(20)}
        )
        ON CONFLICT (appeal_id) DO NOTHING
      `;
    }

    // ── Escalations ────────────────────────────────────────────────────────
    console.log('Inserting escalations…');
    const escDefs = [
      {
        id: MOCK.escalationIds[0], type: 'candidate_appeal',
        body: 'protocol_council', priority: 'urgent',
        subject: 'match', subjectId: MOCK.matchIds[3],
        notes: '[MOCK] Candidate appeal escalated to PC — potential EOD breach in pipeline scoring.',
        pub:   'Appeal escalated to Protocol Council for EOD review.',
        daysUntilDeadline: 8,
      },
      {
        id: MOCK.escalationIds[1], type: 'company_compliance_violation',
        body: 'protocol_council', priority: 'critical',
        subject: 'company', subjectId: companyId,
        notes: '[MOCK] Company exceeded 90-day strike threshold. Suspension review initiated.',
        pub:   'Company compliance violation — suspension review in progress.',
        daysUntilDeadline: 3,
      },
      {
        id: MOCK.escalationIds[2], type: 'fairness_breach_escalation',
        body: 'fairness_oversight_board', priority: 'urgent',
        subject: 'company', subjectId: companyId,
        notes: '[MOCK] Consecutive SDS breaches over 2 rolling windows — FOB systemic review required.',
        pub:   'Systemic fairness breach referred to Fairness Oversight Board.',
        daysUntilDeadline: 14,
      },
      {
        id: MOCK.escalationIds[3], type: 'bias_correction_alert',
        body: 'fairness_oversight_board', priority: 'standard',
        subject: 'match', subjectId: MOCK.matchIds[2],
        notes: '[MOCK] Bias correction delta exceeded threshold during EOD computation — FOB notified.',
        pub:   'Bias correction alert raised for FOB review.',
        daysUntilDeadline: 21,
      },
      {
        id: MOCK.escalationIds[4], type: 'governance_challenge',
        body: 'twg', priority: 'standard',
        subject: 'governance_decision', subjectId: MOCK.proposalIds[0],
        notes: '[MOCK] Technical challenge raised against FHP-P-2025-001 — TWG review requested.',
        pub:   'Technical challenge against proposal FHP-P-2025-001 under TWG review.',
        daysUntilDeadline: 28,
      },
    ];

    for (const e of escDefs) {
      await db`
        INSERT INTO matching.escalations (
          escalation_id, escalation_type, subject_entity_type, subject_entity_id,
          linked_company_id, priority, assignee_body, status,
          outcome_notes, public_summary, resolution_deadline, raised_by, created_at, updated_at
        ) VALUES (
          ${e.id}, ${e.type}, ${e.subject}, ${e.subjectId},
          ${e.subject === 'company' ? companyId : null},
          ${e.priority}, ${e.body}, 'open',
          ${e.notes}, ${e.pub}, ${daysFromNow(e.daysUntilDeadline)},
          'platform_monitor', ${daysAgo(5)}, ${daysAgo(5)}
        )
        ON CONFLICT (escalation_id) DO NOTHING
      `;
    }

    // ── Governance Proposals ───────────────────────────────────────────────
    console.log('Inserting proposals…');
    await db`
      INSERT INTO matching.governance_proposals (
        proposal_id, proposal_ref, title, summary, submitted_by, affiliation,
        status, review_deadline, fhp_version_target, document, submitted_at, created_at
      ) VALUES (
        ${MOCK.proposalIds[0]}, 'FHP-P-2025-001',
        'Extend EOD window tolerance from ±0.05 to ±0.07 for senior roles',
        'Empirical data from 6-month cohort shows EOD variability is higher for senior roles without reflecting bias. Proposes a tiered tolerance.',
        'Protocol Council Research Subcommittee', 'protocol_council',
        'under_review', ${daysFromNow(21)}, '1.1.0',
        ${db.json({ sections: [{ heading: 'Background', body: 'Current EOD tolerance of ±0.05 was calibrated on junior roles.' }] })},
        ${daysAgo(14)}, ${daysAgo(14)}
      )
      ON CONFLICT (proposal_id) DO NOTHING
    `;
    await db`
      INSERT INTO matching.governance_proposals (
        proposal_id, proposal_ref, title, summary, submitted_by, affiliation,
        status, review_deadline, fhp_version_target, document, submitted_at, created_at
      ) VALUES (
        ${MOCK.proposalIds[1]}, 'FHP-P-2025-002',
        'Add structured feedback requirement for borderline decisions',
        'Candidates receiving borderline decisions should receive a plain-language explanation of which dimensions were marginal.',
        'Fairness Oversight Board', 'fairness_oversight_board',
        'under_review', ${daysFromNow(35)}, '1.1.0',
        ${db.json({ sections: [{ heading: 'Background', body: 'Currently only matched/not_matched decisions receive explanations.' }] })},
        ${daysAgo(7)}, ${daysAgo(7)}
      )
      ON CONFLICT (proposal_id) DO NOTHING
    `;

    // ── Governance Votes ───────────────────────────────────────────────────
    console.log('Inserting governance votes…');
    const voteDefs = [
      {
        id: MOCK.voteIds[0], ref: 'PC-2025-031', propId: null,
        question: 'Ratify company suspension — Acme Corp compliance violations',
        for: 5, against: 1, abstain: 0, result: 'passed',
        votedAt: daysAgo(10),
      },
      {
        id: MOCK.voteIds[1], ref: 'PC-2025-030', propId: null,
        question: 'Uphold appeal APP-2025-0089 on EOD grounds',
        for: 4, against: 2, abstain: 0, result: 'passed',
        votedAt: daysAgo(18),
      },
      {
        id: MOCK.voteIds[2], ref: 'PC-2025-032', propId: MOCK.proposalIds[0],
        question: 'Advance FHP-P-2025-001 to final review stage',
        for: 0, against: 0, abstain: 0, result: 'pending',
        votedAt: null,
      },
    ];

    for (const v of voteDefs) {
      await db`
        INSERT INTO matching.governance_votes (
          vote_id, resolution_ref, proposal_id, question,
          votes_for, votes_against, votes_abstain,
          total_eligible, majority_required, result,
          voted_at, created_at
        ) VALUES (
          ${v.id}, ${v.ref}, ${v.propId}, ${v.question},
          ${v.for}, ${v.against}, ${v.abstain},
          6, 4, ${v.result},
          ${v.votedAt}, ${daysAgo(20)}
        )
        ON CONFLICT (vote_id) DO NOTHING
      `;
    }

    // ── Audit Log ──────────────────────────────────────────────────────────
    console.log('Inserting audit log entries…');
    const auditEntries = [
      {
        type: 'escalation_opened', company_id: companyId,
        summary: '[MOCK] Ghosting event detected for candidate at screening_call stage. SLA exceeded by 52 hours.',
        public_summary: 'Ghosting event detected. SLA overdue — company notified.',
        is_public: true, actor_body: 'platform' as const, daysBack: 12,
      },
      {
        type: 'fairness_breach_detected', company_id: companyId,
        summary: '[MOCK] SDS metric outside bounds for company — value -0.08 vs threshold ±0.05.',
        public_summary: 'SDS fairness metric breach detected for a registered company.',
        is_public: true, actor_body: 'platform' as const, daysBack: 9,
      },
      {
        type: 'appeal_submitted', company_id: null,
        summary: '[MOCK] New appeal submitted under ground: suspected_bias. Assigned to TWG.',
        public_summary: 'Appeal submitted and assigned to Technical Working Group for review.',
        is_public: true, actor_body: 'platform' as const, daysBack: 7,
      },
      {
        type: 'pc_vote_recorded', company_id: null,
        summary: '[MOCK] PC vote PC-2025-031 recorded. Result: passed (5–1). Company suspension ratified.',
        public_summary: 'Protocol Council vote recorded on compliance matter. Result: passed.',
        is_public: true, actor_body: 'protocol_council' as const, daysBack: 10,
      },
      {
        type: 'ghosting_event_resolved', company_id: companyId,
        summary: '[MOCK] Ghosting event resolved by company. Resolution type: late_response.',
        public_summary: null, is_public: false, actor_body: 'system' as const, daysBack: 6,
      },
      {
        type: 'bias_correction_alert', company_id: companyId,
        summary: '[MOCK] Bias correction triggered during EOD computation. Delta: +0.05.',
        public_summary: 'Bias correction applied during pipeline run.',
        is_public: true, actor_body: 'platform' as const, daysBack: 4,
      },
    ];

    for (const e of auditEntries) {
      await db`
        INSERT INTO audit.audit_log (
          event_type, company_id, summary, public_summary,
          is_public, actor_body, occurred_at, created_at
        ) VALUES (
          ${e.type}, ${e.company_id}, ${e.summary}, ${e.public_summary},
          ${e.is_public}, ${e.actor_body}, ${daysAgo(e.daysBack)}, ${daysAgo(e.daysBack)}
        )
      `;
    }

    // ── Update company compliance score ────────────────────────────────────
    console.log('Updating company compliance score…');
    await db`
      UPDATE matching.companies
      SET compliance_score = 0.84, strike_count_90d = 1
      WHERE company_id = ${companyId}
    `;

    console.log('\n✓ Mock data seeded successfully.');
    console.log('  Jobs:          3');
    console.log('  Match events:  12');
    console.log('  Interactions:  12');
    console.log('  Ghosting:      4 (2 open, 2 resolved)');
    console.log('  Strikes:       2 (one per open ghosting event)');
    console.log('  Appeals:       3');
    console.log('  Escalations:   5 (PC×2, FOB×2, TWG×1)');
    console.log('  Proposals:     2');
    console.log('  Votes:         3 (2 passed, 1 pending)');
    console.log('  Audit entries: 6');

  } finally {
    await db.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
