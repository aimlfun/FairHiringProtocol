/**
 * FHP API — Candidate Demographics
 *
 * PUT  /v1/candidates/me/demographics  — provide or update demographic data
 * DELETE /v1/candidates/me/demographics — remove all demographic data
 *
 * Design constraints:
 *   - Write-only from candidate perspective. No GET endpoint returning raw values.
 *   - Requires active fairness_metrics consent before any write is accepted.
 *   - All fields individually optional — partial provision is valid.
 *   - Providing no data at all is valid and has zero effect on matching.
 *   - This route uses the fhp_fairness_service DB connection, not fhp_api.
 *     The fhp_api connection cannot read matching.candidate_demographics at all.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCandidate }  from '../middleware/auth.ts';
import { ValidationError }   from '../errors/index.ts';

// ── Ethnicity options by jurisdiction ─────────────────────────────────────────
// The UK uses ONS 2021 categories. We expose the jurisdiction-appropriate list
// to the UI so candidates aren't shown irrelevant categories.
const ETHNICITY_BY_JURISDICTION: Record<string, string[]> = {
  GB: [
    'white_british','white_irish','white_gypsy_traveller','white_roma','white_other',
    'mixed_white_black_caribbean','mixed_white_black_african','mixed_white_asian','mixed_other',
    'asian_indian','asian_pakistani','asian_bangladeshi','asian_chinese','asian_other',
    'black_african','black_caribbean','black_other',
    'other_arab','other_ethnic_group','prefer_not_to_say',
  ],
  US: [
    // EEOC categories used in US EEO-1 reporting
    'white_british',       // maps to "White" in EEOC
    'black_african',       // maps to "Black or African American"
    'asian_other',         // maps to "Asian"
    'other_arab',          // maps to "Native Hawaiian or Other Pacific Islander"
    'mixed_other',         // maps to "Two or More Races"
    'other_ethnic_group',  // maps to "Some Other Race"
    'prefer_not_to_say',
  ],
  // Other jurisdictions fall back to a minimal cross-jurisdiction set
};

const DEFAULT_ETHNICITIES = [
  'white_other','mixed_other','asian_other','black_other',
  'other_ethnic_group','prefer_not_to_say',
];

export async function demographicsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/candidates/me/demographics/options
   * Returns the jurisdiction-appropriate options for the UI dropdowns.
   * Does NOT return the candidate's stored values.
   */
  app.get('/me/demographics/options', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Get demographic field options for this candidate\'s jurisdiction',
      description:
        'Returns the field options appropriate for the candidate\'s jurisdiction. ' +
        'Does not return any stored values. Safe to call at any time.',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;

    // Get jurisdiction from candidate profile
    const profile = await app.db`
      SELECT preferences->>'jurisdiction' AS jurisdiction
      FROM matching.candidate_profiles
      WHERE candidate_id = ${candidateId}
      LIMIT 1
    `;
    const jurisdiction = (profile[0]?.jurisdiction as string | null) ?? 'GB';
    const ethnicities  = ETHNICITY_BY_JURISDICTION[jurisdiction] ?? DEFAULT_ETHNICITIES;

    // Check if consent is active
    const consent = await app.db`
      SELECT given_at, withdrawn_at
      FROM matching.candidate_consents
      WHERE candidate_id  = ${candidateId}
        AND consent_type  = 'fairness_metrics'
      LIMIT 1
    `;
    const consentActive =
      !!consent[0] && !consent[0].withdrawn_at;

    return reply.send({
      consent_required:   !consentActive,
      consent_active:     consentActive,
      jurisdiction,
      fields: {
        sex: {
          label:    'Sex',
          options: [
            { value: 'male',              label: 'Male' },
            { value: 'female',            label: 'Female' },
            { value: 'intersex',          label: 'Intersex' },
            { value: 'prefer_not_to_say', label: 'Prefer not to say' },
          ],
          legal_ref: 'Equality Act 2010 s.11',
        },
        ethnicity: {
          label:   'Ethnicity',
          options: ethnicities.map(v => ({ value: v, label: formatLabel(v) })),
          legal_ref: 'Equality Act 2010 s.9 · ONS Census 2021',
        },
        religion: {
          label:   'Religion or belief',
          options: [
            { value: 'no_religion',        label: 'No religion' },
            { value: 'christian',          label: 'Christian (all denominations)' },
            { value: 'buddhist',           label: 'Buddhist' },
            { value: 'hindu',              label: 'Hindu' },
            { value: 'jewish',             label: 'Jewish' },
            { value: 'muslim',             label: 'Muslim' },
            { value: 'sikh',               label: 'Sikh' },
            { value: 'other_religion',     label: 'Other religion or belief' },
            { value: 'prefer_not_to_say',  label: 'Prefer not to say' },
          ],
          legal_ref: 'Equality Act 2010 s.10',
        },
        birth_year: {
          label:    'Birth year',
          type:     'integer',
          min:      1930,
          max:      new Date().getFullYear() - 16,
          legal_ref: 'Equality Act 2010 s.5',
        },
        education_level: {
          label:   'Highest education level',
          options: [
            { value: 'no_formal_qualifications',       label: 'No formal qualifications' },
            { value: 'gcse_or_equivalent',             label: 'GCSEs / O-levels or equivalent' },
            { value: 'a_level_or_equivalent',          label: 'A-levels / Highers or equivalent' },
            { value: 'foundation_degree_hnc_hnd',      label: 'Foundation degree / HNC / HND' },
            { value: 'bachelors_degree',               label: 'Bachelor\'s degree' },
            { value: 'postgraduate_certificate_diploma', label: 'Postgraduate certificate / diploma' },
            { value: 'masters_degree',                 label: 'Master\'s degree' },
            { value: 'doctorate_phd',                  label: 'Doctorate / PhD' },
            { value: 'professional_qualification',     label: 'Professional qualification (ACCA, CIMA, SQE, etc.)' },
            { value: 'apprenticeship_level_4_plus',    label: 'Apprenticeship (Level 4+)' },
            { value: 'self_taught_bootcamp',           label: 'Self-taught / Bootcamp' },
            { value: 'prefer_not_to_say',              label: 'Prefer not to say' },
          ],
          legal_ref: 'Socioeconomic monitoring — not a protected characteristic',
        },
      },
    });
  });

  /**
   * PUT /v1/candidates/me/demographics
   * Provide or update demographic data.
   * All fields are individually optional — omit any field to leave it unchanged.
   * Requires active fairness_metrics consent.
   *
   * This endpoint uses app.fairnessDb (fhp_fairness_service connection)
   * not app.db (fhp_api connection) — enforcing the DB-level access boundary.
   */
  app.put('/me/demographics', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Provide or update demographic data for fairness monitoring',
      description:
        'All fields are individually optional. ' +
        'Providing partial data is valid — only supplied fields are updated. ' +
        'Requires active fairness_metrics consent. ' +
        'This data is used only for fairness monitoring, never for matching.',
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          sex: {
            type: 'string',
            enum: ['male','female','intersex','prefer_not_to_say'],
          },
          ethnicity: {
            type: 'string',
            description: 'ONS 2021 category for GB; EEOC category for US',
          },
          religion: {
            type: 'string',
            enum: [
              'no_religion','christian','buddhist','hindu','jewish',
              'muslim','sikh','other_religion','prefer_not_to_say',
            ],
          },
          birth_year: {
            type: 'integer',
            minimum: 1930,
          },
          education_level: {
            type: 'string',
            enum: [
              'no_formal_qualifications','gcse_or_equivalent','a_level_or_equivalent',
              'foundation_degree_hnc_hnd','bachelors_degree',
              'postgraduate_certificate_diploma','masters_degree','doctorate_phd',
              'professional_qualification','apprenticeship_level_4_plus',
              'self_taught_bootcamp','prefer_not_to_say',
            ],
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            stored:       { type: 'boolean' },
            fields_set:   { type: 'array', items: { type: 'string' } },
            cohort_update_scheduled: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;
    const body = request.body as Record<string, string | number>;

    // Verify active fairness consent — mandatory before any write
    const consent = await app.db`
      SELECT consent_id, given_at, withdrawn_at
      FROM matching.candidate_consents
      WHERE candidate_id  = ${candidateId}
        AND consent_type  = 'fairness_metrics'
      LIMIT 1
    `;

    if (!consent[0] || consent[0].withdrawn_at) {
      throw new ValidationError(
        'Fairness metric consent is required before providing demographic data. ' +
        'Please provide explicit consent first — this is required under GDPR Article 9(2)(a) ' +
        'because demographic data is special category personal data.'
      );
    }

    // Build only the fields that were actually provided
    const b = body as Record<string, string | number>;
    const now = new Date();

    // Use fairnessDb — fhp_fairness_service role, which CAN write to candidate_demographics
    // app.db (fhp_api) is blocked by RLS on this table
    // Explicit upsert — each optional field updated only when provided
    await app.fairnessDb`
      INSERT INTO matching.candidate_demographics (
        candidate_id, consent_id, consented_at,
        sex, ethnicity, religion, birth_year, education_level,
        created_at, last_updated_at
      ) VALUES (
        ${candidateId},
        ${consent[0].consent_id as string},
        ${consent[0].given_at as Date},
        ${b.sex            ?? null},
        ${b.ethnicity      ?? null},
        ${b.religion       ?? null},
        ${b.birth_year     ?? null},
        ${b.education_level ?? null},
        ${now}, ${now}
      )
      ON CONFLICT (candidate_id) DO UPDATE SET
        sex             = COALESCE(${b.sex             ?? null}, matching.candidate_demographics.sex),
        ethnicity       = COALESCE(${b.ethnicity       ?? null}, matching.candidate_demographics.ethnicity),
        religion        = COALESCE(${b.religion        ?? null}, matching.candidate_demographics.religion),
        birth_year      = COALESCE(${b.birth_year      ?? null}, matching.candidate_demographics.birth_year),
        education_level = COALESCE(${b.education_level ?? null}, matching.candidate_demographics.education_level),
        last_updated_at = ${now}
    `;

    // Trigger async cohort reassignment for this candidate
    // In production this would enqueue a job; in reference impl we mark it inline
    await app.db`
      UPDATE matching.candidate_cohorts SET
        created_at = NOW()  -- touch record to trigger cohort refresh
      WHERE candidate_id = ${candidateId}
    `;

    return reply.send({
      stored:                   true,
      fields_set:               Object.keys(b).filter(k => b[k] !== null && b[k] !== undefined),
      cohort_update_scheduled:  true,
    });
  });

  /**
   * DELETE /v1/candidates/me/demographics
   * Remove all demographic data.
   * Cohort memberships are also removed.
   * This does not withdraw consent — do that separately if desired.
   */
  app.delete('/me/demographics', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Remove all provided demographic data',
      description:
        'Deletes all stored demographic values. Cohort memberships are removed. ' +
        'This does not automatically withdraw your fairness metric consent — ' +
        'do that separately via DELETE /v1/candidates/me/consents/fairness if desired.',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;

    // Delete via fairnessDb — fhp_api cannot touch this table
    await app.fairnessDb`
      DELETE FROM matching.candidate_demographics
      WHERE candidate_id = ${candidateId}
    `;

    // Remove cohort memberships (derived data, safe to delete)
    await app.db`
      DELETE FROM matching.candidate_cohorts
      WHERE candidate_id = ${candidateId}
    `;

    return reply.send({ deleted: true });
  });
}

// Helper: format snake_case DB value as readable label
function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
