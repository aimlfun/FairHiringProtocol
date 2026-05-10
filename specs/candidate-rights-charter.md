# FHP Candidate Rights Charter

**Version:** 1.0.0-draft  
**Status:** Draft — awaiting Protocol Council ratification  
**Spec file:** `specs/candidate-rights-charter.md`

---

## Preamble

The Fair Hiring Protocol exists, first and foremost, for candidates.

Every other part of the system — the schemas, the matching engine, the governance bodies, the company compliance framework — exists in service of one underlying principle: that a person looking for work deserves to be treated with dignity, transparency, and fairness.

This charter formally enumerates the rights every candidate holds under FHP. These rights are not aspirational. They are structural — they are encoded in the protocol, enforced by the platform, and backed by the governance framework. No company, operator, or implementation may waive or diminish them.

## Legal Foundations

The rights in this charter are grounded in applicable law. FHP is designed to meet or exceed the requirements of:

- **GDPR and UK GDPR** — the primary data protection framework. FHP's lawful basis for processing candidate data is **contract** (Article 6(1)(b)): processing is necessary to perform the matching service the candidate has requested. The matching engine processes an anonymised skills profile, not personal data in the conventional sense — your name, contact details, and identity are never passed to the matching engine.
- **EU AI Act (Regulation 2024/1689)** — automated hiring systems are classified as high-risk AI under Annex III. FHP meets the Act's requirements through its technical documentation (the spec corpus), logging (the trace schema), transparency (the explanation schema), and human oversight (the appeal process).
- **UK Equality Act 2010** — prohibits direct and indirect discrimination on the basis of protected characteristics in employment decisions. FHP's bias detection and correction framework, prohibited filters list, and structured rejection taxonomy are designed to enforce these protections technically.
- **EU Equal Treatment Directives** — equivalent protections for EU member state deployments.
- **NYC Local Law 144 and equivalent US state AI hiring laws** — where FHP is deployed in relevant US jurisdictions, the bias audit outputs and candidate notification features satisfy these requirements.

Where applicable law grants rights beyond those listed in this charter, those legal rights always apply. This charter cannot diminish statutory rights.

---

---

## 1. The Right to a Fair Match

Every candidate is entitled to be evaluated on the basis of their skills, experience, and preferences — nothing else.

**This means:**

- You will never be filtered out based on educational institution, degree classification, or years since graduation
- You will never be filtered out based on job title history, employer prestige, or employment gaps
- You will never be filtered out based on any protected characteristic
- Your match score is computed deterministically from your skills and the job's requirements. The formula is public. You can understand why you received the score you did

**What fair matching does not mean:**  
Fair matching means equal treatment, not equal outcomes. If a role genuinely requires a skill you do not hold, you will not be matched to it. The protocol's job is to ensure that the reason for any non-match is a genuine capability gap — never an arbitrary or discriminatory filter.

---

## 2. The Right to an Explanation

You are entitled to a plain-language explanation for every match outcome — whether matched, borderline, or not matched.

**For a `not_matched` outcome, your explanation will tell you:**
- Which specific must-have skill requirements were not satisfied
- What proficiency level was required and what the system assessed your proficiency to be
- Whether any preference misalignment (salary, location, work mode) contributed to the outcome
- What steps, if any, could make you competitive for this type of role in the future

**Explanations must be:**
- Specific to your profile and this job — generic responses ("you were not selected at this time") are a protocol violation
- Written in plain language — not in scoring system jargon
- Delivered alongside the outcome — never withheld, delayed beyond 24 hours of the outcome decision, or made conditional on anything

**What explanations do not include:**  
Employer-facing scoring details and bias correction records are not shown in candidate explanations. This is not to obscure anything — it is to prevent employers from gaming explanations by working backwards. The governance-level record is complete and auditable.

---

## 3. The Right to Appeal

You may appeal any `not_matched` decision within **30 days** of receiving the explanation.

**Grounds for appeal:**
- You believe a skill was incorrectly assessed (e.g. you declared proficiency that the system did not recognise)
- You believe a preference mismatch was incorrectly computed
- You believe the match outcome may have been affected by bias

**The appeal process:**
1. Submit your appeal via the candidate portal, specifying the grounds
2. The Technical Working Group reviews the full pipeline trace for your match within 10 business days
3. The Protocol Council reviews the TWG's technical finding and issues a final decision within 10 further business days
4. If your appeal raises a potential systemic fairness issue, it is referred to the Fairness Oversight Board

**Possible outcomes:**
- `upheld` — the original decision stands; you are given a full explanation of why
- `overturned` — an error was found; your match outcome is corrected
- `partially_upheld` — a minor error was found, but it does not change the outcome; the explanation is amended
- `referred_to_fob` — your appeal has surfaced a systemic concern that requires broader review

**Your appeal right is unconditional.** No company may discourage, penalise, or retaliate against a candidate for submitting an appeal.

---

## 4. The Right to Silence on Rejection

When you receive a `not_matched` outcome, you are not required to engage further with that company. You do not owe them a response. You do not need to justify your appeal.

This is obvious, but it is stated explicitly because some hiring processes create implicit social pressure that can feel like an obligation. Under FHP, there is none.

---

## 5. The Right to No Ghosting

Every company using FHP commits to a defined response SLA at every stage of the hiring process (see `governance-escalation-spec.md` Part A for the full SLA table).

**Your entitlements:**
- If a company does not respond within their committed SLA window, the platform will notify you automatically
- You will be told that an SLA has been breached and that you are entitled to escalate
- If you escalate, the company faces formal governance consequences
- You will never be left wondering whether your application is still active — all active interactions have a defined response deadline

**Ghosting is a compliance violation.** Companies that ghost candidates accumulate strikes. Persistent ghosting leads to account suspension. This is not a soft incentive — it is an enforcement mechanism.

---

## 6. The Right to Data Control

Your profile is yours. You have full control over your data at all times.

**Specifically:**

**Access (GDPR Article 15 / UK GDPR Article 15):** You may download a complete copy of your profile, your match history, and all explanations you have received at any time, in a machine-readable format (JSON conforming to FHP schemas).

**Correction (GDPR Article 16):** You may update any field of your profile at any time. Updates take effect on the next pipeline run — they do not retroactively change historical match outcomes.

**Visibility control:** You control whether your profile is searchable by employers. You may make your profile invisible to proactive employer searches at any time without affecting your ability to apply to specific roles.

**Anonymised matching:** By default, your identity (name, contact details) is withheld from employers until you explicitly consent to contact. Employers see your skills and match score, not who you are, until you choose to reveal yourself.

**Deletion (GDPR Article 17):** You may delete your account at any time. When you request deletion, your identifying information is removed and your profile is permanently pseudonymised — your candidate ID is replaced with a new random identifier across all historical records, your login credential is deleted, and your identity record is purged. Match records, traces, and fairness audit records are retained in this fully anonymised form to preserve the governance audit trail, as permitted under GDPR where retention serves a legitimate purpose that overrides the individual erasure right. Your individual data is gone. Your contribution to the fairness record is retained anonymously.

**Data retention:** Your data is retained for the period you specify (minimum 30 days, maximum 730 days after your last active session). You may extend or shorten this at any time.

**Portability (GDPR Article 20):** Your profile is expressed in a public, open schema. You may export it and import it to any other FHP-compliant implementation. You are not locked in.

---

## 7. The Right to Privacy in Matching

The matching engine never receives your name, email address, phone number, or any other directly identifying information. It operates on your `candidate_id` — an opaque, randomly generated identifier — and your skill declarations.

Demographic information, where you choose to provide it to support the platform's fairness monitoring, is handled by a separate cohort service. This service provides only anonymised cohort membership signals to the matching engine. Your demographic attributes are never directly processed by the matching pipeline.

Employers who receive your match result see your skills and a score band. They do not see your identity until you explicitly consent to contact. They do not see your demographic data. Ever.

---

## 8. The Right to Human Review of Automated Decisions

FHP uses automated matching. Under **GDPR Article 22** and equivalent national laws, you have the right not to be subject to a decision based solely on automated processing when that decision significantly affects you.

FHP satisfies this right through the appeal process. Any automated match outcome can be reviewed by a human governance body — the Technical Working Group and Protocol Council — on request. This is not a theoretical safeguard; it is a mandatory, time-bound, formal process with defined outcomes and governance accountability.

**In practice, this means:**
- You do not have to accept any automated outcome
- You can request human review of any not_matched, borderline, or matched decision within 30 days
- The human review examines the full pipeline trace — every decision made during your match run
- If a human reviewer finds an error, your outcome is corrected

This right is in addition to, not instead of, the right to an explanation. You are entitled to both.

---

## 9. The Right to Know How You Were Scored

The FHP scoring formula is public (see `scoring-spec.md`). The weights, thresholds, and bias correction constants are published and governance-controlled. No part of the scoring model is proprietary or hidden.

You are entitled to a breakdown of your score across the key components: skill match, transferable skill compensation, and preference alignment. This breakdown is included in your match explanation.

You are also entitled to know whether bias correction was applied to your match. If it was, your explanation will say so. The direction and magnitude of any correction is part of the governance record — accessible on appeal.

---

## 9. The Right to Structured Rejection

When a company decides not to proceed with your application at any stage, they are required to provide a structured rejection. A structured rejection must include:

- The specific stage at which the decision was made
- A clear reason drawn from a defined set of reason codes (not a free-text "not a good fit")
- If you have progressed beyond the screening stage: a brief, specific note on the assessment

"We have decided to go in a different direction" is not a structured rejection. "Following the technical assessment, your solution did not demonstrate the required approach to X" is.

If you believe a rejection reason was pretextual or discriminatory, this is grounds for an appeal.

---

## 11. The Right to Fee-Free Participation

Candidates never pay to participate in FHP. No feature of the candidate experience — profile creation, matching, explanations, appeals, data export — is gated behind a payment.

This right is structural: the governance model prohibits any FHP implementation from charging candidates for core protocol participation. It is not a business decision that can be reversed.

---

## 12. Enforcement

These rights are enforced through three mechanisms:

**Technical enforcement:** The schemas, pipeline, and platform encode these rights structurally. A company cannot, for example, skip explanation generation — the pipeline will not produce a match outcome without one.

**Governance enforcement:** The Protocol Council and Fairness Oversight Board exist to investigate and act on violations. Candidates may raise violations directly with governance via the appeals process.

**Transparency enforcement:** All governance decisions are public. Companies that violate candidate rights face public record of those violations. This is by design — transparency is itself an enforcement mechanism.

---

## 13. Amendments

This charter may be amended through the standard FHP-P proposal process. Any proposed amendment that weakens candidate rights requires:

- A 30-day public comment period
- A fairness impact assessment by the Fairness Oversight Board
- A 5/6 supermajority Protocol Council vote (raised from the standard 4/6)
- No FOB veto

Rights can be strengthened by the standard 4/6 majority. They cannot be weakened easily. This asymmetry is intentional.
