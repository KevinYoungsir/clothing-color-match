# Security Policy

Clothing Color Match Studio processes images locally or through explicitly configured backend services. Security reports are especially important when they involve API keys, uploaded images, desktop packaging, provider configuration, or paths that could bypass mask and color-transfer safety checks.

## Supported Version

Security fixes are applied to the latest version on the `main` branch. Older snapshots and local experimental branches may not receive fixes.

## Reporting a Vulnerability

Please do not publish sensitive vulnerability details in a public issue before the problem can be assessed.

If GitHub private vulnerability reporting is available for this repository, use **Security → Report a vulnerability**. Otherwise, contact the repository maintainer privately through the contact method available on the maintainer's GitHub profile and include only the minimum information needed to reproduce the issue.

A useful report includes:

- affected component or file
- reproduction steps
- expected versus actual behavior
- potential impact
- whether secrets, private images, local files, or remote execution are involved
- a suggested fix, if known

Do not include real API keys, access tokens, private customer images, or other credentials in a report.

## Security Boundaries

The project is designed around several explicit boundaries:

- API keys and provider credentials belong in backend process environment variables, not frontend code, Electron resources, source control, logs, or screenshots.
- AI and multimodal analysis is advisory unless the user explicitly confirms or applies the result through the existing mask workflow.
- Low-confidence, partial, over-coverage, or otherwise unsafe masks should be blocked rather than silently passed to color transfer.
- Manual mask correction remains the safe fallback for ambiguous images.
- Model files, debug artifacts, local test assets, environment files, and generated outputs should remain untracked unless they are deliberately sanitized for publication.

## Scope of Security-Sensitive Changes

Changes deserve extra review when they affect:

- authentication or provider credentials
- file upload or local file access
- network requests
- Electron or desktop sidecar behavior
- image or model deserialization
- command execution or subprocess management
- ROI and mask validation gates
- automatic application of AI-generated masks
- export paths that may reuse stale processed results

## Disclosure

After a fix is available, a public summary may be added to the repository when doing so does not expose users to unnecessary risk.
