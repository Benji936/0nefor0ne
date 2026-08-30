# Working in this repo

## Attribution

Do not add `Co-Authored-By` trailers naming an AI model to commit messages, and
do not add "Generated with …" lines to commits or pull request bodies. Commits
are authored by the person running the session.

This is not a style preference to be re-litigated: the trailer was added by
default for most of this project's life, and stripping it later meant rewriting
history and force-pushing. Leave it off in the first place.

## Conventions

**All four locale files move together.** `frontend/src/locales/{en,de,fr,it}.json`
have identical key sets, and a key added to one and forgotten in the others is
the most common way i18n breaks here. German is informal ("Du"), French formal
("Vous"), Italian informal ("Tu").

**Logic lives in `frontend/src/lib/`, and that is where it is tested.** There is
no component-test infrastructure — `@vue/test-utils` is not installed. A rule
worth pinning goes in a `lib/*.js` module with a `lib/*.test.js` beside it,
rather than inside a `.vue` file where nothing can reach it.

**Tailwind spacing utilities need a `!` prefix.** Vuetify's reset ships an
unlayered `* { padding: 0; margin: 0 }`, and Tailwind v4 emits its utilities
inside `@layer utilities`, so unlayered CSS always wins. `p-4`, `py-2.5`,
`mt-0.5` and any arbitrary value compute to `0px` unless written `!p-4`, `!py-2.5`,
`!mt-0.5`. This is not subtle in effect — the element visibly collapses — but it
is invisible in the source.

## Sources of truth

- `DESIGN.md` — colour roles, type, elevation, and the named rules that govern them.
- `UX-CONTRACT.md` — the behavioural contract: canonical owner per capability,
  the flow ledger, responsive rules, and what has actually been verified.

Read the relevant one before changing how a screen looks or behaves, and update
it in the same change when the behaviour it describes moves.
