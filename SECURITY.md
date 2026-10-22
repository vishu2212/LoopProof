# Security Policy

## Scope

LoopProof is a hackathon prototype. It is not production-audited, and a successful test suite does not establish that the application or its smart contracts are free of vulnerabilities.

Please do not upload real personal data, device serial numbers, confidential evidence, production credentials, or private keys to demo records or public issue reports.

## Reporting a vulnerability

Please do not publish exploitable details in a public issue.

If GitHub's **Private vulnerability reporting** feature is enabled for this repository, use the repository's **Security → Advisories → Report a vulnerability** flow. Otherwise, contact the repository maintainer privately through a channel already listed on their GitHub profile and ask for a secure reporting route. Do not assume a public issue is a confidential channel.

Include the affected component and commit, impact, reproduction steps, and any safe proof of concept. Redact secrets, personal information, and real evidence files.

## Security boundaries and known limitations

- The web application's live workflow is backed by Supabase; it is separate from the Solidity contract reference implementation.
- The Solidity contracts have been tested on a local Hardhat network and are not documented as deployed to a public testnet.
- SHA-256 proves byte-level correspondence to a digest, not that evidence is truthful or that recycling occurred.
- The project has not undergone an independent security audit.
- Do not use real funds or rely on this prototype for regulatory, environmental-credit, or commercial compliance decisions.
