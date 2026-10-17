# Security

## Reporting a clawscore vulnerability

Open a **private GitHub security advisory** on this repository:

https://github.com/realmpastai-web/clawscore/security/advisories/new

Do not file a public issue that includes an exploit or live credentials.

## Reporting an OpenClaw vulnerability

Report it to OpenClaw, not here:

https://github.com/openclaw/openclaw/security/advisories/new

## What this tool does with secrets

clawscore redacts secret-looking values in every output (`[REDACTED]`). Fixtures use placeholders only. `clawscore fix` never invents tokens or rewrites secret values.
