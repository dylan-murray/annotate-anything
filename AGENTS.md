# annotate-anything contributor instructions

The project brief lives at `~/personal/agent-desk-notes/briefs/generic-annotator.md`.
Read it before designing or changing behaviour, along with the research notes
next to it (`annotate-anything-research.md`) and `docs/design.md` here.

- This is a personal project. Keep employer information out of the repo and its
  history: no work email addresses, company, client or product names, internal
  URLs or paths, and no code, styles, icons or names from work projects. Work
  reference implementations are read for behaviour only and are never named
  here, in commit messages or in pull requests. Commits use the personal GitHub
  noreply address. Local git hooks enforce this; never bypass them with
  `--no-verify`.
- Tests and screenshots use fixture data only.
- Every UI change is checked at 1440x900 and 390x844.
- Keep implemented, verified, accepted, rejected and unresolved distinct. A
  passing test is not Dylan's acceptance.
