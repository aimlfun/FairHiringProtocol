# FHP Conformance Test Suite

This directory contains the normative conformance tests for the Fair Hiring Protocol.

Any implementation claiming FHP compliance **must pass all tests in this suite** against the current protocol version. See `specs/fhp-overview.md §6`.

## Running the tests

```bash
npm run test:conform
```

## Test categories

| File | What it tests |
|------|--------------|
| `scoring.conformance.test.ts` | Scoring formula correctness per `scoring-spec.md` |
| `constraints.conformance.test.ts` | Constraint satisfaction logic and early abort |
| `transfer.conformance.test.ts` | Transferable skill compensation and cap |
| `bias.conformance.test.ts` | Bias correction delta computation |
| `trace.conformance.test.ts` | Trace immutability and checksum integrity |
| `explanation.conformance.test.ts` | Audience-aware field filtering |
| `ontology.conformance.test.ts` | Ontology ID validation and synonym resolution |
| `weights.conformance.test.ts` | Weight redistribution when nice-to-have absent |

## Fixtures

`fixtures/` contains canonical input/output pairs used by the conformance tests.
These fixtures are the normative reference — if your implementation produces
different outputs for these inputs, it is not compliant.

## Adding tests

Conformance tests may only be added or modified through the FHP-P proposal process
(TWG proposal + PC notification). They may not be changed unilaterally.
