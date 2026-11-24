# English Patterns

Use this list with the section on patterns to remove in [SKILL.md](../SKILL.md#要去掉的写法). Each entry is a lead to check, not a word to ban: when a phrase matches, decide by what the sentence does, and leave sentences that work.

## Common phrases

| Phrase | Developer docs | User docs |
| --- | --- | --- |
| does not replace / is not a substitute for / should not be taken as | Keep it when it states a gate or a boundary (e.g., "Static analysis does not replace integration tests"); delete it when it only hedges | Rewrite as a clear expectation or action, e.g., "Preview colours are approximate; check the exported file" |
| not yet / pending / TBD | Keep real status and gaps; state each gap once | State a schedule only when confirmed (e.g., "Planned for 2.1"); otherwise state the current limit ("Not supported yet") without inventing a timeline |
| not recommended / not suitable for | Keep it when a reason or consequence follows; delete otherwise | State when to use it or what risk it carries |
| only / solely / does not <do X> | Keep when it states permissions, real technical boundaries, or non-obvious behaviour; delete when it states an obvious job boundary (e.g., a check command "only reads and does not install") or repeats earlier text | State the supported scope or usage directly (e.g., "Supports JPG, PNG, and WebP") |
| fails immediately / throws an error / stops if | Keep only when the failure mode is counterintuitive or needs a specific recovery step; delete obvious outcomes (e.g., "fails on invalid JSON" or "stops when offline") | State what the user should do if the error occurs |
| It's not X, it's Y / rather than X, Y | Write Y; if needed for context, add "Previously X" | Write Y |
| mostly works / largely complete / basic support | Say what works and what is missing | Same |
| It's worth noting that / Note that / Keep in mind that | Drop the wrapper, keep the content | Same |
| In summary / In conclusion / Let's dive in / Here's a breakdown | Delete | Delete |
| may potentially / could possibly / in some cases might | State the conclusion if there is evidence; otherwise keep one "may" and say what evidence is missing | Same |
| ensures robust / significantly improves / greatly enhances | Give the measurement, or delete | Same |
| not just X, but Y / a testament to / marks a new era | Delete the praise; keep the fact | Same |
| we added / was introduced | Describe the current state; change logs may use these | Say what the reader can do |
| perform a scan / carry out validation | Use the verb: scan, validate | Same |

## Words to question

leverage, seamless, robust, holistic, synergy, empower, streamline, cutting-edge, best-in-class, paradigm, ecosystem (when no real ecosystem is meant), delve, crucial, pivotal, comprehensive.

When one of these appears, look for a plainer word. Terms defined in the project glossary and standard technical terms are fine.

## Register and tone

After removing corporate fluff, do not swing into chatty slang:

- **Table headers and enum values** (all docs): Use standard labels such as `Scenario`, `Field`, `Description`, `Action`, `Required`, and `Yes` / `No`.
- **Developer docs**: Use concise, standard technical prose, keep standard technical terms and API names (e.g., `desktop`, `frontend`, `DocumentProvider`, `file contents`, `mtime`), and use complete phrasing (e.g., `after configuration`, `recorded in`, `enter`).
- **User docs and UI copy**: Use plain, standard prose across docs and UI strings (buttons, tooltips, empty states, error messages), replacing internal jargon with user-facing outcomes and using standard verbs and states (e.g., `click`, `enabled`, `cannot select`, `Not connected`, `restore on failure`).

## Examples

**Developer doc, before (corporate fluff and hedged negation):**

> This refactor significantly improves the robustness of the import pipeline. It is worth noting that files larger than 1 GB have not yet been tested, so this should not be taken as evidence that they work, nor that they fail.

**After:**

> Imports of files larger than 1 GB are untested.

---

**Developer doc, before (defensive tool disclaimers, obvious failures, and vague shorthand):**

> `pnpm doctor` checks whether Node, pnpm, JDK, and the Android SDK are installed; it only reads the environment and does not install missing tools. Use `pnpm doctor --desktop` when working only on desktop to skip Android checks. `pnpm dev:mobile` opens the mobile web app in a browser for UI work; native features like directories and transfers only work inside the Android app. Commands fail immediately on invalid JSON.

**After:**

> `pnpm doctor` checks for Node, pnpm, JDK, and the Android SDK; pass `--desktop` to check only the desktop toolchain. `pnpm dev:mobile` opens the mobile web UI in a browser for layout work; features backed by Android native plugins, such as file-access grants and LAN transfers, must be tested on a device or emulator.

---

**Developer doc, before:**

> For devs editing, building, or releasing here. Run everything from repo root.
>
> | Case | Need a key? | What to put |
> | --- | --- | --- |
> | Local dev | No need | Leave blank |
> | Release build | Yep | Key path and password |
>
> **Read-only check changed file ctime.** Some doc providers change ctime after the first read grant. Look at raw content, size, and mtime instead.

**After:**

> This guide is for developers of this repository. Run all commands from the repository root.
>
> | Scenario | Signing key required | Description |
> | --- | --- | --- |
> | Local development | No | Uses the local debug keystore by default |
> | Release build | Yes | Provide the keystore path and password |
>
> **File `ctime` changes after Android SAF reads**  
> Some DocumentProvider implementations update `ctime` on the first granted read. Compare file contents, size, and `mtime` instead.

---

**Developer doc, leave as is:**

> Do not rename protocol fields until a maintainer approves the compatibility plan for both clients.

This sentence is a gate. Keep it.

---

**User doc, before:**

> This tool only performs local compression and does not upload any data. Only JPG, PNG and WebP are currently supported. Compression causes some quality loss, and results are not guaranteed to match the original.

**After:**

> Compression runs locally. Supports JPG, PNG, and WebP.
