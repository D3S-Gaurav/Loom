# Security policy

Loom handles authenticated sessions, Stripe webhooks, uploaded images, and a
public MCP endpoint, and it feeds untrusted goal text into agents that call
tools. Reports about any of that are welcome.

## Reporting a vulnerability

Report privately through GitHub, not in a public issue:

**[Open a private security advisory](https://github.com/D3S-Gaurav/Loom/security/advisories/new)**

Please include the affected version or commit, what an attacker gains, and the
smallest reproduction you have. A curl command or a failing test is ideal.

This project has one maintainer. I acknowledge reports as soon as I see them
and will tell you honestly if a fix is going to take a while rather than leave
you waiting. I will credit you in the advisory unless you ask me not to.

## In scope

- Authentication and session handling (Better Auth, Postgres sessions).
- Authorization: any path where one user reads or mutates another user's run.
- Stripe webhook signature verification and the entitlement projection.
- Rate limits and quota enforcement in Redis.
- Prompt injection that reaches a tool call, a network request, or stored state.
- The read-only MCP server: scope escapes, cross-account reads.
- Attachment handling and the Cloudinary signing path.

## Out of scope

- Findings that require a self-hosted instance the reporter has configured
  insecurely, for example a publicly exposed Redis or Temporal port.
- Missing hardening headers with no demonstrated impact.
- Output quality of a model. A wrong answer is a bug, not a vulnerability.
- Denial of service by simply sending a large volume of requests.

## Supported versions

`main` is the supported branch. Fixes land there first.
