# Security Policy

## Supported versions

Security fixes land on the latest stable desktop release (`vX.Y.Z` tags) and `main`.

| Version | Supported |
| --- | --- |
| Latest GitHub Release | Yes |
| Older releases | Best effort |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports.

Email **yasharyan307@outlook.com** with:

- A short description of the issue
- Steps to reproduce (or a proof of concept)
- Affected platform (macOS / Windows / Linux) and AnyLM version
- Impact assessment if you have one

We will acknowledge receipt within a few business days and coordinate disclosure after a fix is available or a mitigation is agreed.

## Scope notes

AnyLM is local-first. Inference stays on the machine when using local Ollama models. Account auth uses Firebase; org policy and usage limits rely on Firestore security rules and cooperative client reporting. See the root `README.md` for what enforcement does and does not guarantee.
