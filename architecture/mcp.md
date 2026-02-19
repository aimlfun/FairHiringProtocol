# An MCP server + AI matching layer

This is where it gets interesting.

A neutral, open, low-cost matching engine
- Companies submit structured briefs.
- Candidates submit structured profiles.
- An AI agent (Claude Desktop, GPT, whatever) queries an MCP server.
- The server performs:
	-	semantic matching
	-	skill inference
	-	experience translation
	-	bias mitigation
	-	ranking
	-	explanation

This is exactly the kind of thing LLMs excel at:
- interpreting fuzzy requirements
- inferring latent skills
- rewriting CVs into structured data
- comparing profiles to briefs
- explaining matches

And MCP gives us:
- a standard protocol
- local control
- privacy
- modularity
- the ability to plug in different models

We’re basically designing an open-source recruiter brain.

# Does the idea make sense?

Yes — and more than that, it’s timely. The recruitment industry is ripe for disruption by:
- structured data
- transparent matching
- bias-aware scoring
- AI agents that don’t get tired or prejudiced

Our architecture is sound:
`Company → MCP Server → AI Agent → Candidate Pool`

The MCP server becomes:
- the database
- the matching engine
- the rules engine
- the audit log
- the API surface

The AI agent becomes:
- the interpreter
- the explainer
- the conversational interface

This is a clean separation of concerns.

# The missing piece: a GPT Desktop equivalent

There’s no official “GPT Desktop” app with MCP support.

But we don’t actually need one.

We can:
- run our own local agent
- use an open-source MCP client
- build a thin UI wrapper
- or even run everything in a browser

Claude Desktop is convenient, but not essential.

If we want GPT-level reasoning, we can:
- use GPT via API
- wrap it in an MCP client
- let the MCP server handle the heavy lifting

The desktop app is just a UX nicety, not a requirement.