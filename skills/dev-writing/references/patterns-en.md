# English Patterns

Use this list with the section on patterns to remove in [`SKILL.md`](../SKILL.md#要去掉的写法). Each entry is a lead to check, not a word to ban: when a phrase matches, decide by what the sentence does, and leave sentences that work.

## Common phrases

| Phrase | Developer docs | User docs |
| --- | --- | --- |
| does not replace / is not a substitute for / should not be taken as | Keep it when it states a gate or a boundary (e.g., "Static analysis does not replace integration tests"); delete it when it only hedges | Rewrite as a clear expectation or action, e.g., "Preview colors are approximate; check the exported file" |
| not yet / pending / TBD | Keep real status and gaps; state each gap once | State a schedule only when confirmed (e.g., "Planned for 2.1"); otherwise state the current limit ("Not supported yet") without inventing a timeline |
| not recommended / not suitable for | Keep it when a reason or consequence follows; delete otherwise | State when to use it or what risk it carries |
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

## Examples

**Developer doc, before:**

> This refactor significantly improves the robustness of the import pipeline. It is worth noting that files larger than 1 GB have not yet been tested, so this should not be taken as evidence that they work, nor that they fail.

**After:**

> Imports of files larger than 1 GB are untested.

---

**Developer doc, leave as is:**

> Do not rename protocol fields until a maintainer approves the compatibility plan for both clients.

This sentence is a gate. Keep it.

---

**User doc, before:**

> This tool only performs local compression and does not upload any data. Only JPG, PNG and WebP are currently supported. Compression causes some quality loss, and results are not guaranteed to match the original.

**After:**

> Compression runs locally. Supports JPG, PNG, and WebP. 
