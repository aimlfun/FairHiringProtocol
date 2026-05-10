# FHP — Pseudonymisation-on-Deletion Procedure

**Version:** 1.0.0-draft  
**Status:** Draft — requires DPO review and legal sign-off  
**Document:** `legal/pseudonymisation-procedure.md`

---

## 1. Purpose

This document defines the technical and procedural steps for pseudonymising a candidate's data when they exercise their right to erasure (GDPR Article 17 / UK GDPR Article 17), or when FHP must proactively delete an account (e.g., a minor is discovered to have registered).

### 1.1 Why pseudonymisation rather than deletion

The right to erasure does not require deletion of all data in all circumstances. Article 17(3) provides exceptions where retention is necessary for, among other reasons:

- Compliance with a legal obligation (Article 17(3)(b)) — FHP has legal obligations to retain audit records to defend against discrimination claims and comply with the EU AI Act's record-keeping requirements
- The establishment, exercise, or defence of legal claims (Article 17(3)(e)) — match traces and appeal records may be needed in legal proceedings

GDPR Recital 26 confirms that pseudonymised data to which the key no longer exists cannot be attributed to an identified natural person, and therefore falls outside the scope of the GDPR.

**The outcome of this procedure:** The candidate's personal data is deleted. What remains is a set of audit records containing only a new random UUID and skills data — data that cannot be linked to any individual and is therefore not personal data.

---

## 2. Triggers

This procedure is triggered by:

1. **Candidate-initiated deletion:** Candidate clicks "Delete my account" in the candidate portal
2. **Right to erasure request:** Candidate contacts FHP requesting erasure (email or in-app message)
3. **Minor discovered:** FHP discovers a registered user is under 18
4. **Inactivity deletion:** Account has been inactive beyond the retention period set by the candidate (30–730 days after last active session)
5. **Fraud/abuse:** Account is closed for policy violation — data retained in pseudonymised form for enforcement purposes

---

## 3. Timeline

| Step | Timeline |
|------|----------|
| Deletion request received | Day 0 |
| Acknowledgement sent to candidate | Within 24 hours |
| Pseudonymisation procedure completed | Within 30 calendar days |
| Confirmation sent to candidate | Within 30 calendar days |
| Any sub-processors notified to delete | Within 30 calendar days |

For minor discovery: compressed to **72 hours** for all steps.

---

## 4. Pre-Procedure Checks

Before executing the procedure:

1. **Verify identity:** Confirm the request is from the account holder. For in-app requests (authenticated), no further verification needed. For email requests, verify by sending a confirmation link to the registered email.

2. **Check for active appeals:** If the candidate has an active appeal (status: `submitted`, `twg_review`, `pc_review`, or `fob_review`), the appeal must be resolved or the candidate must explicitly confirm they wish to withdraw the appeal before deletion. Notify the candidate and the governance team.

3. **Check for active legal proceedings:** If FHP is aware of active legal proceedings in which the candidate's data is relevant, consult the DPO before proceeding. Article 17(3)(e) may permit temporary retention.

4. **Log the deletion request:** Create an entry in the `data_subject_requests` table before beginning.

---

## 5. Technical Procedure

Execute the following steps as a single database transaction. If any step fails, roll back the entire transaction and alert the engineering team.

```sql
BEGIN;

-- Step 1: Generate the replacement UUID
-- This is a new random UUID with no relationship to the original
DO $$
DECLARE
  original_id UUID := '[candidate_id_from_request]';
  replacement_id UUID := gen_random_uuid();
  deletion_hash TEXT;
BEGIN

  -- Step 2: Pseudonymise all tables that reference candidate_id
  -- The replacement_id replaces the original everywhere.
  -- After this, no record links to the original identity.

  UPDATE matching.match_events
    SET candidate_id = replacement_id
    WHERE candidate_id = original_id;

  UPDATE matching.match_explanations
    SET candidate_id = replacement_id
    WHERE candidate_id = original_id;

  UPDATE analytical.pipeline_traces
    SET candidate_id = replacement_id
    WHERE candidate_id = original_id;

  UPDATE matching.appeals
    SET candidate_id = replacement_id
    WHERE candidate_id = original_id;

  UPDATE matching.ghosting_events
    SET candidate_id = replacement_id
    WHERE candidate_id = original_id;

  UPDATE analytical.fairness_metrics_cohort_events
    SET candidate_id = replacement_id
    WHERE candidate_id = original_id;

  UPDATE matching.candidate_cohorts
    SET candidate_id = replacement_id
    WHERE candidate_id = original_id;

  -- Step 3: Delete the profile (skills, preferences — no PII but linked to identity)
  DELETE FROM matching.candidate_profiles
    WHERE candidate_id = original_id;

  -- Step 4: Delete the identity record (the only table containing true PII)
  DELETE FROM identity.candidate_identity
    WHERE candidate_id = original_id;

  -- Step 5: Delete the authentication credential
  DELETE FROM identity.candidate_auth
    WHERE candidate_id = original_id;

  -- Step 6: Record the deletion event for audit purposes
  -- Store a one-way hash of the original ID so we can confirm deletion was completed
  -- if asked, without being able to reverse it to the original identity
  deletion_hash := encode(digest(original_id::text, 'sha256'), 'hex');

  INSERT INTO audit.deletion_records (
    deletion_hash,
    replacement_id,
    trigger_type,   -- 'candidate_request' | 'minor_discovered' | 'inactivity' | 'enforcement'
    requested_at,
    completed_at,
    deleted_by      -- authenticated user role or 'system'
  ) VALUES (
    deletion_hash,
    replacement_id,
    '[trigger_type]',
    '[requested_at]',
    NOW(),
    current_user
  );

END $$;

COMMIT;
```

### 5.1 What this achieves

After the transaction completes:
- `candidate_identity` row: **deleted** (name, email, phone — all gone)
- `candidate_auth` row: **deleted** (login credential gone)
- `candidate_profiles` row: **deleted** (skills profile gone)
- All match records, traces, appeals, ghosting events: **pseudonymised** — they exist but reference only the new random UUID and contain no personal data
- A deletion audit record: **created** — confirms deletion was completed, using a one-way hash that cannot be reversed

### 5.2 Post-deletion state

The pseudonymised records that remain contain:
- A new random UUID (no link to the person)
- Skills ontology IDs (e.g., `fhp:skill:python`) — not personal data
- Proficiency levels — not personal data
- Match scores — not personal data
- Pipeline stage outcomes — not personal data

This is fully anonymous data. It is retained for:
- Governance audit trail integrity (removing records would create gaps exploitable by bad actors — a company could pressure candidates to delete accounts to remove evidence of ghosting)
- Fairness metric historical consistency
- Legal defence (the record shows what decisions were made, not who they were made about)

---

## 6. Notification to Candidate

Within 30 days of the deletion request:

```
Subject: Your FHP account has been deleted

Your account deletion is complete.

What has been deleted:
- Your email address and login credentials
- Your skills profile and preferences
- Your name and any contact information

What has been retained (anonymously):
- Technical audit records of match pipeline runs, pseudonymised to a random identifier
  with no link to you. These records are retained for governance and legal purposes
  as permitted under GDPR Article 17(3). They contain only technical data (skill
  category IDs and scores) — not your name, email, or any information that
  identifies you.

You can verify your deletion is complete because you will no longer be able to
log in to the FHP platform.

If you have any questions, contact privacy@fair-hiring-protocol.org
```

---

## 7. Sub-Processor Notification

Within 30 days, notify all sub-processors who hold copies of the candidate's personal data:
- Email/notification service provider: delete sending logs for this email address
- Authentication service: confirm credential deletion
- Any backup systems: flag for deletion on next backup rotation

---

## 8. Specific Case: Minor Discovered

If a user is discovered to be under 18:

1. **Immediately suspend the account** (block login)
2. **Do not process any further matches** for this account
3. **Complete the full pseudonymisation procedure within 72 hours**
4. **Do not notify the minor's parents or guardians** (this would itself be a data disclosure)
5. **Send deletion confirmation** to the registered email only
6. **Log the incident** in the DPO's incident register

---

## 9. Record-Keeping

The `audit.deletion_records` table must be maintained permanently. It contains only:
- A SHA-256 hash of the original candidate ID (non-reversible)
- The replacement UUID
- The trigger type
- Timestamps

This table allows FHP to confirm to a supervisory authority or in legal proceedings that a specific account was deleted and when, without retaining any personal data.

---

## 10. Testing

This procedure must be tested:
- Before go-live: full end-to-end test in staging environment
- Quarterly: spot-check that all tables referencing candidate_id are covered
- After any schema change: verify new tables have been added to the procedure

A conformance test (`deletion.conformance.test.ts`) must verify:
1. All candidate_id references are replaced in all tables
2. The identity and auth tables are empty for the original ID
3. The deletion record is created
4. The replacement_id does not appear in the identity table
