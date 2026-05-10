# Fair Hiring Protocol — Privacy Policy

**Version:** 1.0.0-draft  
**Effective date:** [To be set on launch]  
**Last reviewed:** [Date]  
**Document:** `legal/privacy-policy.md`

> This policy must be reviewed by qualified legal counsel before publication. It is drafted to reflect FHP's architecture and the legal framework described in `specs/legal-compliance.md`.

---

## Who we are

The Fair Hiring Protocol ("FHP") is operated by [FHP Foundation / entity TBD], registered in [jurisdiction TBD] ("we", "us", "our"). We are the data controller for personal data processed through the FHP platform.

Our Data Protection Officer can be contacted at: [dpo@fair-hiring-protocol.org — TBD]

We are registered with [ICO / relevant supervisory authority — TBD], registration number [TBD].

---

## The short version

We designed FHP so that **your name, phone number, and any information that identifies you as a person is never used to match you to jobs.** The matching engine that decides whether your skills fit a role does not know who you are. It sees a skills profile attached to a random identifier — nothing more.

The only personal information we hold about you is your email address (used to log you in and send you notifications) and whatever you choose to add to your profile. We do not sell it, share it with employers without your explicit permission, or use it for anything other than running the matching service you signed up for.

If you want to delete your account and all your data, you can do so at any time from your account settings. We will complete the deletion within 30 days.

---

## What data we collect and why

### Data you provide

| Data | Why we collect it | Legal basis |
|------|-------------------|-------------|
| Email address | Authentication and notifications | Contract (GDPR Art. 6(1)(b)) |
| Skills and proficiency levels | Core matching function | Contract |
| Work preferences (salary, location, work mode) | Core matching function | Contract |
| Work history (role descriptions, not employer names) | Context for matching and explanations | Contract |
| Profile privacy settings | To respect your choices | Contract |

### Data we generate about you

| Data | What it is | Legal basis |
|------|-----------|-------------|
| Candidate ID (UUID) | A random identifier — not derived from your personal information | Contract |
| Match results | The outcome of matching your profile to job briefs | Contract |
| Match explanations | Plain-language records of why each match decision was made | Contract |
| Pipeline traces | Detailed technical audit logs of how each match was computed | Legitimate interests (legal defence, governance) |
| Appeal records | Records of any appeals you submit | Contract / Legitimate interests |

### Data we deliberately do not collect

We do not collect, and you should not provide:
- Your full name (we address you without it)
- Your phone number
- Your home address
- Your date of birth or age
- Your national insurance number, passport number, or other government identifiers
- Your photograph
- Any information about your race, ethnicity, religion, disability, or other protected characteristics (demographic data for fairness monitoring is strictly voluntary and separately handled — see below)

---

## How we use your data

We process your data for one purpose: to match your skills profile to job opportunities posted by companies using FHP, and to explain those match outcomes to you.

We do not use your data for:
- Advertising or marketing to you
- Profiling for any purpose other than job matching
- Training AI models (your data is not used to train the models in our pipeline)
- Sharing with third parties for their own purposes
- Any purpose you have not been told about

---

## Automated decision-making

FHP uses automated processes to match candidate profiles to job briefs. This is automated decision-making under **GDPR Article 22** that may significantly affect you.

**What the automated system does:** It computes a match score by comparing your declared skills against a job's requirements using a mathematical formula. The formula is public — you can read it at [link to scoring-spec.md].

**Your rights in relation to automated decisions:**
- You have the right to receive a plain-language explanation of any match outcome. This is provided automatically — you do not need to request it.
- You have the right to request human review of any decision. This is the appeal process, available from your match history for any outcome within 30 days.
- You have the right to express your point of view — you can add evidence and context to your profile at any time.

---

## Demographic data for fairness monitoring (strictly optional)

FHP monitors for bias in its matching outcomes. To do this meaningfully, we need some understanding of the demographic composition of candidates receiving different outcomes.

If you choose to provide demographic information (such as gender group or age group), it is:
- Entirely optional — providing it or not has no effect on your match outcomes
- Used only in aggregate, anonymised fairness metrics — it is never associated with your individual match results in any report visible to employers
- Processed under **GDPR Article 9(2)(a) — explicit consent**, which you may withdraw at any time

The matching engine does not receive your demographic information. It is processed by a separate cohort service that provides only anonymised group signals.

---

## Who we share your data with

**Employers:** When you match to a job, the employer sees your skills profile and match score. They do **not** see your identity (name, email, or any identifying information) unless you explicitly choose to initiate contact or consent to your identity being shared.

**Governance bodies:** The Protocol Council, Fairness Oversight Board, and Technical Working Group may access match traces and records for the purpose of investigating appeals, conducting fairness audits, and governing the protocol. They operate under strict confidentiality obligations.

**Service providers:** We use third-party service providers for hosting and infrastructure. These providers act as data processors on our behalf under GDPR Article 28 data processing agreements. We do not share personal data with providers for their own purposes.

**Legal requirements:** We may disclose data where required by law (e.g., court order, regulatory request). Where legally permitted, we will notify affected individuals before disclosing.

We do not sell personal data. Ever.

---

## How long we keep your data

| Data type | Retention period |
|-----------|-----------------|
| Email and authentication credential | Duration of active account only |
| Skills profile and preferences | Duration of account + 30 days post-deletion |
| Match records (anonymised after account deletion) | 7 years |
| Pipeline traces (anonymised after account deletion) | 7 years |
| Appeal records | 7 years |
| Fairness metrics | Indefinitely (fully aggregate and anonymous) |

When you delete your account, your identity is pseudonymised within 30 days. All records that remain are fully anonymous — they contain only a random identifier and skills data, which cannot be linked back to you.

---

## Your rights

You have the following rights over your personal data:

**Access:** Request a copy of everything we hold about you. Available instantly via the "Export my data" function in your account settings.

**Rectification:** Correct any inaccurate data. Available via profile edit in your account settings.

**Erasure:** Delete your account and data. Available via "Delete account" in your account settings. Completed within 30 days.

**Restriction:** Pause processing of your data without deletion. Contact us at [privacy@fair-hiring-protocol.org].

**Portability:** Download your data in JSON format. Available via "Export my data" in your account settings.

**Object:** Object to processing for certain purposes. You can opt out of contributing to fairness metrics at any time in your privacy settings.

**Human review of automated decisions:** Request human review of any match outcome. Available via the appeal function in your match history within 30 days of each outcome.

To exercise any right, use the self-service tools in your account settings. For rights that cannot be exercised self-service, contact [privacy@fair-hiring-protocol.org]. We will respond within one calendar month.

---

## Minimum age

FHP is not for use by persons under 18. By registering, you confirm you are 18 or over. If we discover an account has been created by a minor, we will delete all data within 72 hours.

---

## Security

We protect your data using:
- Encryption in transit (TLS 1.3)
- Encryption at rest
- Database-level access controls: the matching engine cannot read your identity data
- Row-level security: you can only see your own data
- Audit logging of all access to personal data

Your email and authentication credentials are stored separately from your matching profile and are never accessible to the matching engine.

---

## Changes to this policy

We will notify you of material changes to this policy by email at least 30 days before they take effect. Minor changes (clarifications, corrections) will be published without notice but with a revised date.

---

## Complaints and supervisory authority

If you are unhappy with how we have handled your personal data, please contact us at [privacy@fair-hiring-protocol.org].

You also have the right to lodge a complaint with your national supervisory authority:
- **UK:** Information Commissioner's Office (ICO) — ico.org.uk
- **EU:** Your national data protection authority (list at edpb.europa.eu)
- **Other jurisdictions:** [to be completed by jurisdiction]

---

## Contact

Data Controller: [FHP Foundation — TBD]  
Data Protection Officer: [dpo@fair-hiring-protocol.org — TBD]  
Privacy queries: [privacy@fair-hiring-protocol.org — TBD]  
Postal address: [TBD]
