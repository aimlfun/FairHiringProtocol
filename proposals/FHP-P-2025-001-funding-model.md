# FHP-P-2025-001: Establish a Sustainable Funding Model for FHP Infrastructure

**Status:** Draft  
**Submitted:** 2025-11-08  
**Submitted by:** [FHP Founding Team]  
**Affiliation:** FHP Foundation (founding members)  
**Assigned to:** Protocol Council  
**Review deadline:** 2025-12-08  
**FHP version targeted:** 1.0.0 (governance document update — no schema change)

---

## 1. Summary

FHP requires sustained infrastructure funding to operate as a centralised canonical platform. This proposal establishes a formal funding policy that is consistent with the anti-capture governance principles in `GOVERNANCE.md`, defines acceptable and prohibited funding sources, and creates a governance structure for financial oversight. It does not change any technical aspect of the protocol.

---

## 2. Motivation

The FHP platform requires real infrastructure: compute for the matching pipeline, database hosting, storage for the trace archive, and API call costs for the multi-model inference layer. These costs are not zero, and the project cannot operate sustainably on goodwill alone.

At the same time, `GOVERNANCE.md §4` explicitly prohibits corporate sponsorship that could influence the protocol, and the candidate rights charter guarantees that participation is free for candidates. Any funding model must satisfy both constraints: it must generate enough revenue to be sustainable, and it must not create dependencies that compromise protocol independence or candidate rights.

The founding team has identified four candidate approaches, each with different trade-offs. This proposal presents them for community review and proposes a recommended approach, while acknowledging that the community should decide.

**The core tension:** The approaches most likely to generate significant revenue (corporate partnerships, employer subscription fees) carry the highest capture risk. The approaches with the lowest capture risk (grants, foundations) are harder to scale and less predictable.

---

## 3. Proposal

### 3.1 Current situation

No formal funding model exists. The protocol is in development. Infrastructure costs are currently borne by the founding team. This is not sustainable beyond the initial launch period.

### 3.2 Candidate funding approaches

**Approach A: Foundation / charitable trust model**

FHP is constituted as a charitable foundation (UK: Charitable Incorporated Organisation; EU: equivalent structure). Funding comes from:
- Public grants (Innovate UK, EU Horizon, national employment agency grants)
- Philanthropic donations (individuals and non-commercial foundations)
- Academic partnerships (universities with employment research programmes)

*Advantages:* Lowest capture risk. Independent governance is structurally protected. Charitable status may attract gift aid and tax-efficient donations. Consistent with "public good" positioning.

*Disadvantages:* Unpredictable revenue. Grant applications are time-consuming. Harder to scale beyond a small team. May limit ability to compete for engineering talent.

*Estimated sustainable scale:* 2–4 full-time equivalent staff plus infrastructure costs. Suitable for a protocol stewardship organisation, not a technology company.

---

**Approach B: Voluntary employer contribution model**

Companies using FHP are invited (not required) to make voluntary annual contributions, tiered by hiring volume. A suggested contribution schedule might be:

| Monthly hiring volume | Suggested annual contribution |
|----------------------|-------------------------------|
| 1–5 roles | £0 (free tier) |
| 6–20 roles | £2,000 |
| 21–50 roles | £8,000 |
| 51+ roles | £20,000+ |

Contributions are voluntary and confer no governance rights whatsoever — this is explicitly stated in the contribution agreement. The Protocol Council publishes a list of contributing organisations annually, but contributing organisations have no more influence over the protocol than non-contributing ones.

*Advantages:* Revenue scales with usage. Companies that benefit from FHP contribute to its sustainability. No change to candidate pricing (still free).

*Disadvantages:* "Voluntary" contributions tend to become de facto mandatory over time, creating soft capture pressure. Companies may expect influence even if the agreement says otherwise. Requires active relationship management.

*Estimated sustainable scale:* 5–15 FTE at mature adoption. Infrastructure costs fully covered.

---

**Approach C: Infrastructure sponsorship with governance firewalls**

A small number of large employers (e.g., 3–5 "infrastructure partners") provide multi-year infrastructure funding in exchange for public recognition as FHP infrastructure partners. Governance firewalls are explicit and legally binding: infrastructure partners have zero governance rights, zero visibility into candidate data, and zero ability to influence protocol decisions.

*Advantages:* Predictable, significant funding. Larger employers have strong incentives to support a fair hiring standard (reduces their own legal risk, signals values).

*Disadvantages:* Highest perception risk. Even with genuine firewalls, the appearance of corporate control is damaging to the protocol's credibility. Requires extraordinarily robust governance documentation and independent auditing to maintain trust.

*Estimated sustainable scale:* Potentially very large. But trust, once lost, is very hard to recover.

---

**Approach D: Hybrid (Recommended)**

A combination of Approach A and Approach B, structured to avoid the downsides of each:

1. **Foundation structure** — FHP is constituted as a charitable foundation. This is the structural anchor. All governance operates through the foundation.

2. **Public and philanthropic grants** — pursued actively, particularly from employment-focused public bodies (UK DWP, EU social fund equivalents, national AI governance initiatives). These grants align naturally with FHP's mission.

3. **Voluntary employer contributions** — offered as described in Approach B, with the contribution agreement making governance non-influence explicit and legally binding. Contributions fund infrastructure only — not governance operations, which are funded separately.

4. **Contribution cap per employer** — no single employer may contribute more than 15% of FHP's total annual operating budget. This prevents any single employer from becoming a de facto funder whose withdrawal would be catastrophic.

5. **Annual financial transparency report** — full publication of funding sources, amounts, and how funds were spent. This is the accountability mechanism that makes the firewall credible.

*Advantages:* Multiple revenue streams reduce dependence on any single source. Foundation structure provides structural independence. Transparency report provides accountability. Contribution cap prevents single-source dependency.

*Disadvantages:* More complex to operate than a single-source model. Requires active grant management.

### 3.3 Proposed governance addition

If Approach D is accepted, `GOVERNANCE.md` should be updated to add a new section:

> **§7. Financial Governance**
>
> FHP is funded in accordance with the Funding Policy (FHP-P-2025-001). Key principles:
>
> - No single funding source may exceed 15% of annual operating budget
> - Employer contributions are voluntary and confer zero governance rights
> - Infrastructure funding is legally and operationally separated from governance funding
> - Annual financial accounts are published within 90 days of financial year end
> - The Protocol Council appoints an independent financial auditor annually
> - Any proposed change to the funding model requires an FHP-P proposal and 4/6 PC vote

### 3.4 Backwards compatibility

This proposal adds a governance document section. No schema, protocol, or technical changes. No version increment required — governance document update only.

---

## 4. Fairness Impact Assessment

| Question | Answer |
|----------|--------|
| Does this affect matching outcomes? | No |
| Does this affect bias detection or correction? | No |
| Could this introduce or exacerbate disparate outcomes? | Indirectly — if funding fails, the platform fails, which affects all candidates equally. The funding model is a fairness risk mitigation. |
| Tested against conformance suite? | N/A |

**Additional fairness note:** The candidate's right to fee-free participation (Candidate Rights Charter §11) must be explicitly preserved in the funding policy. This proposal does not affect candidate pricing, which remains zero by design.

---

## 5. Implementation

### 5.1 Artefacts requiring change

- [ ] `GOVERNANCE.md` — add §7 Financial Governance
- [ ] New document: `legal/funding-policy.md` — full funding policy, contribution agreement template, contribution cap calculation methodology
- [ ] New document: `legal/contribution-agreement-template.md` — the legal agreement signed by contributing employers

### 5.2 Reference implementation

Not applicable — no technical changes.

### 5.3 Migration guide

Not applicable — no breaking changes.

---

## 6. Alternatives considered

**"Advertising / promoted listings"** — rejected. Allowing employers to pay for visibility in the matching results is structurally incompatible with fair matching. It would require the matching engine to weight paid employers' roles higher, which directly contradicts the protocol's core purpose.

**"Freemium for candidates"** — rejected. The candidate rights charter guarantees free participation. This is a foundational commitment, not a business decision.

**"Sell anonymised data"** — rejected. Selling aggregate fairness data or skills market data would be a secondary use of candidate data without the specific consent required under GDPR Article 5(1)(b). Incompatible with the legal framework.

---

## 7. Open questions

1. Should contributing employers be publicly listed? Arguments both ways: transparency argues for publication; privacy argues that smaller employers may not want public association with FHP before it is established.

2. What is the right contribution cap percentage? 15% is proposed — is this too high, too low?

3. Should the foundation structure be UK-based, EU-based, or jurisdiction-neutral (e.g., Swiss foundation)? This affects regulatory environment, grant eligibility, and tax treatment.

4. How should the transition from founding-team-funded to foundation-funded be managed? Is a bridge funding period needed?

---

## 8. References

- `GOVERNANCE.md §4` — Anti-capture safeguards
- `specs/candidate-rights-charter.md §11` — Right to fee-free participation
- `specs/legal-compliance.md §5` — Financial sector considerations
- UK Charitable Incorporated Organisation structure: charity.gov.uk
- EU social fund eligibility: ec.europa.eu/esf

---

## Review record

| Date | Body | Action | Notes |
|------|------|--------|-------|
| | TWG | | N/A — no technical changes |
| | Protocol Council | | |
| | FOB | | Review for capture risk |

**PC vote:** [Pending]  
**FOB veto:** [Pending]  
**Final status:** Draft  
**Effective from:** Governance update only — no version increment
