---
name: Controlled number input "stuck digit" bug pattern
description: Why numeric <input type="number"> fields bound directly to a number state via Number(e.target.value) look like they can't be fully cleared, and the fix used in NailAdminPage.
---

Pattern that causes it: `<input type="number" value={n} onChange={e => setN(Number(e.target.value))} />`
where `n` is typed as `number`. When the user deletes the last digit, `e.target.value` is `""`,
`Number("")` is `0`, so state becomes `0` and the input re-renders showing `"0"` — on the very next
keystroke (another backspace) the same thing happens again. Visually this looks exactly like "the
first/only digit won't delete," which is how shop owners described it (queue-count / duration /
capacity fields in the nail admin schedule UI).

**Why:** a controlled `<input>` can never actually be empty if its bound value is coerced to a
number synchronously on every keystroke — there's no representable "empty" state to render.

**How to apply:** for any numeric input that a user might want to clear while editing, don't bind
directly to the numeric state. Use a wrapper that keeps a local string buffer during typing (allow
`""`/`"-"` through without forcing a parse), and only coerces/falls back to `min` on blur if left
invalid/empty. `NumberField` in `artifacts/store/src/pages/NailAdminPage.tsx` implements this; reuse
it (or the same pattern) for any new numeric input in that app instead of `Number(e.target.value)`
directly on a number-typed state.
