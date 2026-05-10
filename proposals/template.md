# FHP-P Proposal Template

**File naming:** `proposals/FHP-P-YYYY-NNN-short-title.md`  
**Example:** `proposals/FHP-P-2025-001-expand-ontology-data-skills.md`

Copy this file, fill in every section, and submit as a pull request against the `/proposals` directory. Incomplete proposals will be returned without review.

---

# FHP-P-YYYY-NNN: [Short descriptive title]

**Status:** Draft | Under Review | Accepted | Rejected | Withdrawn  
**Submitted:** YYYY-MM-DD  
**Submitted by:** [GitHub handle or name]  
**Affiliation:** [Organisation, or "Independent contributor"]  
**Assigned to:** [TWG | Protocol Council | FOB — assigned by maintainers on submission]  
**Review deadline:** [Set by maintainers — 30 days from submission date]  
**FHP version targeted:** [e.g. 1.1.0]  

---

## 1. Summary

*One paragraph. What are you proposing to change, and why? A reviewer should understand the full scope from this paragraph alone.*

---

## 2. Motivation

*Why is this change needed? What problem does it solve? Be specific. Reference real observed behaviour, candidate feedback, fairness audit findings, or governance decisions where applicable. If triggered by a governance escalation or FOB report, reference it here.*

---

## 3. Proposal

### 3.1 Current behaviour

*How does the protocol behave today in the area you are changing?*

### 3.2 Proposed behaviour

*The precise technical change. Show diffs for schemas, mathematical changes with worked examples for scoring, current and proposed text for governance rules.*

### 3.3 Backwards compatibility

*Breaking change? If so, migration path. Breaking = MAJOR version. Non-breaking addition = MINOR. Clarification = PATCH.*

---

## 4. Fairness Impact Assessment

*Mandatory. FOB reviews this section independently.*

| Question | Answer |
|----------|--------|
| Does this affect matching outcomes? | Yes / No |
| Does this affect bias detection or correction? | Yes / No |
| Could this introduce or exacerbate disparate outcomes? | Yes / No / Unknown |
| Tested against conformance suite? | Yes / No / N/A |

*If any answer above is Yes or Unknown, explain the risk and mitigation below:*

**FOB recommendation:** *[Completed by FOB during review — leave blank]*

---

## 5. Implementation

### 5.1 Artefacts requiring change

- [ ] Schema: `specs/...`
- [ ] Specification: `specs/...`
- [ ] Reference implementation: `reference-impl/...`
- [ ] Conformance tests: `reference-impl/tests/conformance/...`
- [ ] Ontology: `ontology/skills.json`
- [ ] Database migration: `db/migrations/...`
- [ ] Governance/legal documents
- [ ] Other:

### 5.2 Reference implementation built?

Yes / No — [link to branch or PR if yes]

### 5.3 Migration guide

*For breaking changes: steps existing implementations must take to upgrade.*

---

## 6. Alternatives considered

*What else did you consider, and why did you choose this approach?*

---

## 7. Open questions

*Unresolved aspects where you are seeking community or governance input.*

---

## 8. References

---

## Review record

*Completed by governance — do not fill in as submitter.*

| Date | Body | Action | Notes |
|------|------|--------|-------|
| | TWG | | |
| | Protocol Council | | |
| | FOB | | |

**PC vote:** [e.g. 5/6 — passed]  
**FOB veto:** Yes / No  
**Final status:** Accepted / Rejected / Withdrawn  
**Effective from:** FHP [version]
