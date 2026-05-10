# Fair Hiring Protocol — Data Processing Agreement

**Version:** 1.0.0-draft  
**Document:** `legal/data-processing-agreement.md`

> This Data Processing Agreement ("DPA") is a draft only. It must be reviewed and finalised by qualified legal counsel before being presented to companies. It is intended to satisfy GDPR Article 28 requirements.

---

## Parties

**Data Controller:** [Company name], registered at [address] ("Company", "Controller")

**Data Processor:** [FHP Foundation / entity TBD], registered at [address] ("FHP", "Processor")

This DPA forms part of, and is incorporated into, the FHP Company Compliance Agreement entered into between the parties.

---

## Background

The Company uses the Fair Hiring Protocol platform operated by FHP to match job opportunities with candidate profiles. In providing this service, FHP processes personal data of candidates on behalf of the Company in its capacity as data controller.

This DPA sets out the terms on which FHP will process personal data on the Company's behalf, as required by Article 28 of the UK GDPR and EU GDPR.

---

## 1. Definitions

**"Personal Data"** has the meaning given in the UK GDPR / EU GDPR.

**"Processing"** has the meaning given in the UK GDPR / EU GDPR.

**"Data Subject"** means a candidate whose personal data is processed in connection with the Company's use of FHP.

**"Sub-processor"** means any third party engaged by FHP to process personal data on its behalf.

**"Services"** means the FHP matching platform services described in the Company Compliance Agreement.

---

## 2. Scope and nature of processing

### 2.1 Subject matter

FHP processes personal data of candidates for the purpose of matching their skills profiles to job briefs posted by the Company, generating match explanations, maintaining the governance audit trail, and enforcing SLA compliance obligations.

### 2.2 Duration

Processing continues for the duration of the Company Compliance Agreement, and for the data retention periods specified in FHP's Privacy Policy following termination.

### 2.3 Nature and purpose

| Processing activity | Purpose | Legal basis (on behalf of controller) |
|--------------------|---------|--------------------------------------|
| Matching candidate profiles to job briefs | Providing the matching service | Contract with data subject |
| Generating match explanations | Transparency and candidate rights | Contract |
| Recording pipeline traces | Audit trail and governance | Legitimate interests |
| SLA monitoring | Candidate protection and compliance | Contract / Legal obligation |
| Fairness metrics computation | Bias monitoring and correction | Legitimate interests / Legal obligation |

### 2.4 Categories of data subjects

Candidates who have registered with FHP and whose skills profiles have been matched, or eligible for matching, against the Company's job briefs.

### 2.5 Categories of personal data

- Candidate identifier (UUID — not linked to name or contact details)
- Skills profile (skill ontology IDs and proficiency levels)
- Work preferences (salary range, location, work mode)
- Match outcomes and explanations
- Pipeline traces

The Company does **not** receive, and FHP does not share with the Company:
- Candidate name
- Candidate email address or contact details
- Any demographic information
- Any information beyond the skills profile and match result, unless the candidate has explicitly consented to contact

---

## 3. FHP's obligations as processor

FHP shall:

**3.1** Process personal data only on documented instructions from the Company, unless required to do so by applicable law. The FHP Company Compliance Agreement and this DPA constitute the Company's processing instructions.

**3.2** Ensure that persons authorised to process personal data are bound by appropriate confidentiality obligations.

**3.3** Implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, including:
- Encryption of personal data in transit and at rest
- Ongoing confidentiality, integrity, and availability of processing systems
- Ability to restore access to personal data following an incident
- Regular testing and evaluation of security measures

FHP's specific technical measures are described in `specs/database-architecture.md` and include: schema-level PII separation, database row-level security, immutable trace records, and SHA-256 checksum tamper detection.

**3.4** Not engage sub-processors without prior written authorisation from the Company. The Company provides general authorisation for sub-processors listed in Schedule 1 of this DPA. FHP shall inform the Company of any intended changes to sub-processors and give the Company the opportunity to object.

**3.5** Assist the Company in responding to requests from data subjects exercising their rights under the UK GDPR / EU GDPR (access, rectification, erasure, restriction, portability, objection). FHP's self-service tools in the candidate portal handle most such requests directly; FHP will notify the Company of any request that requires the Company's action.

**3.6** Assist the Company in ensuring compliance with the security obligations, breach notification requirements, data protection impact assessments, and prior consultation obligations under Articles 32–36 of the UK GDPR / EU GDPR.

**3.7** At the Company's choice, delete or return all personal data to the Company on termination of the Services, and delete existing copies unless applicable law requires retention.

**3.8** Make available to the Company all information necessary to demonstrate compliance with the obligations under Article 28, and allow for and contribute to audits and inspections conducted by the Company or an auditor mandated by the Company. Audit rights are subject to reasonable notice (minimum 30 days), confidentiality obligations, and the right of FHP to object to auditors who are competitors.

---

## 4. Company's obligations as controller

The Company shall:

**4.1** Ensure there is a lawful basis for the processing described in this DPA, and that candidates have been informed of the processing through FHP's Privacy Policy or equivalent disclosure.

**4.2** Not instruct FHP to process personal data in a manner that would violate applicable data protection law, the FHP Company Compliance Agreement, or this DPA.

**4.3** Promptly notify FHP of any instruction that FHP considers would breach applicable data protection law, to allow FHP to suspend processing and seek clarification.

**4.4** Ensure that any personal data about candidates received through FHP (match results, explanations) is used only for the specific hiring process for which it was provided, is not retained beyond the conclusion of that process, and is not shared with third parties.

**4.5** Notify FHP within 24 hours of becoming aware of a personal data breach involving FHP candidate data held by the Company.

---

## 5. International transfers

FHP's primary data processing occurs within the UK/EU. Where personal data is transferred outside the UK/EU (for example, to cloud infrastructure providers), FHP ensures appropriate safeguards are in place (Standard Contractual Clauses or adequacy decisions, as applicable).

Where the Company is located outside the UK/EU and receives personal data from FHP, the Company agrees to process that data under the applicable Standard Contractual Clauses (Module 2 — Controller to Processor), which are incorporated into this DPA by reference.

---

## 6. Sub-processors

**Schedule 1 — Authorised sub-processors**

| Sub-processor | Location | Processing activity |
|--------------|----------|-------------------|
| [Cloud hosting provider TBD] | [UK/EU — TBD] | Infrastructure hosting |
| [Email service provider TBD] | [UK/EU — TBD] | Notification delivery |
| [Authentication service TBD] | [UK/EU — TBD] | Candidate authentication |

FHP shall ensure all sub-processors are bound by obligations equivalent to those in this DPA.

---

## 7. Data breaches

FHP shall notify the Company without undue delay, and no later than 48 hours after becoming aware, of a personal data breach affecting personal data processed under this DPA.

Notification shall include, to the extent available:
- Nature of the breach, categories and approximate number of data subjects affected
- Name and contact details of the DPO or other contact point
- Likely consequences of the breach
- Measures taken or proposed to address the breach

FHP shall coordinate with the Company on any regulatory notification required within the 72-hour GDPR window.

---

## 8. Term and termination

This DPA remains in force for the duration of the Company Compliance Agreement. Termination of the Company Compliance Agreement automatically terminates this DPA.

On termination, FHP shall, at the Company's written request, either return or securely delete all personal data processed under this DPA within 30 days, subject to applicable legal retention requirements.

---

## 9. Governing law and disputes

This DPA is governed by [English law / the law of the jurisdiction of the FHP Foundation — TBD].

Disputes shall be resolved through the FHP governance process in the first instance, and thereafter through [jurisdiction TBD] courts.

---

## Signatures

**For and on behalf of the Company:**

Signed: ___________________________  
Name: ___________________________  
Title: ___________________________  
Date: ___________________________  

**For and on behalf of FHP:**

Signed: ___________________________  
Name: ___________________________  
Title: ___________________________  
Date: ___________________________  
