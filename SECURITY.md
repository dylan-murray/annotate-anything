# Security policy

## Reporting a vulnerability

Please don't open a public issue for a security problem. Report it privately
through GitHub instead: open the repository's **Security** tab and click
**Report a vulnerability**
([direct link](https://github.com/dylan-murray/annotate-anything/security/advisories/new)).
Only the maintainer sees the report, and the fix and advisory get worked out in
that same private thread.

A useful report says what you did, what happened, and what you expected: the
setup you use (Vite, Next.js, middleware or `serve`), the request or page
involved, and the version (`npx annotate-anything --version`).

annotate-anything is maintained by one person, so responses are best effort. You
should hear back within a week. Please give a reasonable window for a fix before
disclosing publicly; we'll agree on a date together in the advisory.

## Supported versions

annotate-anything is pre-1.0. Security fixes land on `main` and ship in the next
release; only the latest release is supported.

## What counts

Things we especially want to hear about:

- Another website, or another machine, reading or changing notes through the
  local server without `allowRemote` or `--origin` allowing it.
- The bar or its routes turning on in a production build.
- Note text changing what an agent's tools do, or forging the tool output an
  agent reads.
- Script running in the page from note text, replies or anything else stored in
  `.annotations/`.
- File reads or writes outside the notes folder.
- Anything in the GitHub Actions workflows that lets a pull request, issue or
  comment from outside the project reach secrets or write access.

Turning on `allowRemote`, or adding an origin you don't control with `--origin`,
is outside what annotate-anything defends against. So are other pages on
`localhost` calling `serve`, which is how it works with any local app.
