# Forking in open source ≠ Forking in a fairness critical protocol

In normal open source:
- forking is healthy
- it encourages experimentation
- it prevents stagnation

But in a fairness critical system, forking can:
- fragment standards
- create incompatible ecosystems
- allow bad actors to remove fairness constraints
- dilute trust
- confuse companies and candidates

There should be one canonical implementation of the fairness logic.

Otherwise we get:
- “Uber style” forks that remove safety
- “dark patterns” creeping in
- companies choosing the least fair fork
- candidates being forced into fragmented systems

The matching engine should not be forked in the sense of “everyone runs their own version with their own rules.”

That would destroy the whole point.

# Protocol vs implementation

There are two layers:

## 1. The protocol (the rules, schemas, fairness standard)

This must be:
- singular
- canonical
- community governed
- versioned
- stable

## 2. The implementation (the code that follows the protocol)

This can be:
- open source
- contributed to
- improved
- extended
- optimized

…but must not diverge from the fairness standard.

Think of it like:
- HTML is the protocol
- Chrome, Firefox, Safari are implementations
- They can innovate, but they must follow the standard

Or:

- TLS is the protocol
- OpenSSL, BoringSSL, LibreSSL are implementations
- They can differ internally, but the handshake must be identical

*This is the model that preserves fairness and innovation.*

# So what does “no forking” really mean here?

It means:

❌ No forks of the fairness rules

❌ No forks of the matching logic

❌ No forks of the scoring criteria

❌ No forks of the bias mitigation layer

❌ No forks of the transparency requirements

Those must remain unified. But:

✅ Yes to forks of the UI

✅ Yes to forks of the MCP client

✅ Yes to forks of the database layer

✅ Yes to forks of the performance optimizations

✅ Yes to forks of the deployment model

✅ Yes to forks of the analytics dashboards

Those don’t affect fairness.

# Why this matters

If we allow forks of the fairness logic, we get:
- “Company friendly” forks that quietly reintroduce bias
- “Speed optimized” forks that cut corners
- “Data hungry” forks that violate privacy
- “Recruiter friendly” forks that reintroduce gatekeeping
- “Dark pattern” forks that manipulate candidates

we’d recreate the exact system we’re trying to replace.

# So the Fairness Standard should explicitly state:

**“The Fair Hiring Protocol (FHP) is a single, canonical standard.

Implementations may vary, but the matching logic must remain identical.”**

This is how we maintain:
- trust
- consistency
- auditability
- fairness
- interoperability

And it still allows the community to contribute meaningfully.

# The right model is: “governed core, open ecosystem”

Governed core
- fairness rules
- matching logic
- bias detection
- transparency requirements
- schemas
- protocol

Open ecosystem
- clients
- tools
- dashboards
- integrations
- extensions
- performance improvements

This is the same model used by:
- W3C
- IETF
- Linux Foundation
- OpenAI’s OpenAPI spec
- Kubernetes governance

It works because it balances:
- innovation
- stability
- fairness
- community involvement