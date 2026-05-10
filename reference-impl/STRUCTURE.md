# FHP Reference Implementation — Structure

This directory contains the minimal, canonical implementation of the Fair Hiring Protocol.
It is the authoritative example of correct behaviour. It is not a production system.

## Directory map

```
reference-impl/
│
├── STRUCTURE.md                  ← this file
├── package.json                  ← Node.js project definition
├── tsconfig.json                 ← TypeScript configuration
├── .env.example                  ← required environment variables
│
├── shared/                       ← cross-cutting concerns
│   ├── schemas/                  ← JSON schema validators (compiled from /specs)
│   ├── errors/                   ← canonical error types
│   ├── logger/                   ← structured logging (trace-aware)
│   └── config/                   ← governance constants loader
│
├── ontology/                     ← skill ontology runtime module
│   ├── loader.ts                 ← loads and validates ontology at startup
│   ├── resolver.ts               ← skill ID lookup, synonym expansion
│   └── transfer.ts               ← transfer relationship queries
│
├── matching-engine/              ← the nine-stage pipeline
│   ├── pipeline.ts               ← orchestrator: runs all stages in order
│   ├── context.ts                ← PipelineContext type and builder
│   ├── stages/
│   │   ├── 1-normalise.ts
│   │   ├── 2-expand.ts
│   │   ├── 3-constraints.ts
│   │   ├── 4-skill-score.ts
│   │   ├── 5-transfer.ts
│   │   ├── 6-preference.ts
│   │   ├── 7-bias-detect.ts
│   │   ├── 8-bias-correct.ts
│   │   └── 9-explain.ts
│   └── utils/
│       ├── proficiency.ts        ← proficiency scale numeric mapping
│       ├── weights.ts            ← weight redistribution logic
│       └── scoring.ts            ← shared scoring helpers
│
├── bias/                         ← bias detection and correction
│   ├── metrics.ts                ← DIR, EOD, SDS computation
│   ├── cohort.ts                 ← cohort service interface and stub
│   └── correction.ts             ← delta computation and application
│
├── fairness/                     ← nightly fairness computation job
│   ├── job.ts                    ← job entry point (scheduled)
│   ├── compute.ts                ← metric computation over match windows
│   ├── suppress.ts               ← cohort suppression (min size enforcement)
│   └── store.ts                  ← fairness metrics read/write
│
├── sla/                          ← SLA monitoring and ghosting enforcement
│   ├── monitor.ts                ← polls active interactions, detects breaches
│   ├── deadlines.ts              ← SLA window computation per stage
│   ├── ghosting.ts               ← GhostingEvent creation and lifecycle
│   └── notify.ts                 ← candidate and company notification stubs
│
├── appeals/                      ← appeal submission, routing, state machine
│   ├── submit.ts                 ← appeal intake and validation
│   ├── router.ts                 ← routes to TWG / PC / FOB
│   ├── state-machine.ts          ← appeal status transitions
│   └── store.ts                  ← appeal record persistence
│
├── api/                          ← HTTP API (minimal, for integration testing)
│   ├── server.ts                 ← express app setup
│   ├── routes/
│   │   ├── candidates.ts         ← candidate profile CRUD
│   │   ├── jobs.ts               ← job brief CRUD
│   │   ├── matches.ts            ← trigger match, retrieve explanation
│   │   ├── appeals.ts            ← appeal submission and status
│   │   └── health.ts             ← conformance and health endpoints
│   ├── middleware/
│   │   ├── validate.ts           ← schema validation middleware
│   │   └── trace.ts              ← request trace ID injection
│   └── validators/               ← per-route input validators
│
└── tests/
    ├── unit/                     ← unit tests per module
    ├── integration/              ← cross-module integration tests
    └── conformance/              ← FHP conformance test suite
        ├── README.md
        ├── fixtures/             ← canonical input/output pairs
        └── *.conformance.test.ts ← normative conformance tests
```

## Technology choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript | Type safety aligns with schema-first design; widely understood |
| Runtime | Node.js 20 LTS | Stable, well-supported, async-native |
| Schema validation | ajv (JSON Schema draft 2020-12) | Fastest JS validator; supports our schema version |
| HTTP framework | Express 5 | Minimal, well-understood |
| Test runner | Vitest | Fast, TypeScript-native |
| Database | SQLite (via better-sqlite3) | Zero-config for reference impl; swap for Postgres in production |
| Logging | pino | Structured JSON logging; trace-ID aware |

These are reference implementation choices. Production implementations may use any stack that correctly implements the protocol.
