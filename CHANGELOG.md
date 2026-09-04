# Changelog

## 0.1.0

- Replay and reduction must match the original normalized failure fingerprint and severity.
- Replay prepares the recorded commit, restores window and onboarding conditions, checks each action, and reports divergence with its step number.
- Versioned manifests and strict action validation reject malformed artifacts. Legacy manifests remain readable.
- Occurrences and replay attempts persist separately. Verified reproductions survive duplicate findings and unverified shorter candidates.
- Campaign JSON results and exit codes distinguish hard app findings from runner errors.
- Smoke CI prepares its target and propagates failures. A separate Windows regression job tests an injected crash using a hidden Electron app.
