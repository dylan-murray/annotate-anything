# Contributing

Thanks for helping build annotate-anything. The bar here is simple: small,
verified changes that keep it easy to drop into any web app.

## Setup

```sh
npm install
npx playwright install chromium
npm run dev            # fixture app with Headless UI, Radix and native dialogs
npm run typecheck
npm test               # builds, then runs the Playwright checks at 1440 and 390 wide
npm run check:package  # packs the package and tries it from a clean install
```

The `Checks` workflow runs these on Node 22 and 24. CodeQL and Semgrep scan every
pull request too.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

- **No runtime dependencies.** Framework packages stay optional peers.
- **Tests and screenshots use fixture data only.**
- **Check UI changes at 1440x900 and 390x844.**
- **Verify the real thing.** Drive the flow you changed in a browser, and for
  changes to what agents see, run the real command too.
- **No code comments** unless a constraint can't be expressed in code.

## For AI agents

`AGENTS.md` is the orientation for AI agents working in this repo.

## Releasing

Set the version in `package.json` on `main`, then push a matching tag, such as
`v0.1.0`. The `Release` workflow checks the tag is on `main`, reruns the checks,
waits for approval, publishes to npm with provenance and creates the GitHub
release.

## Reporting issues

Include your framework and version, what you did, what you expected, and any
error from the browser console or the CLI.

Security problems go through GitHub's private vulnerability reporting instead of
a public issue; see [SECURITY.md](SECURITY.md).
