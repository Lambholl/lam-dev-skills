# English Patterns

Use this list with the section on patterns to remove in [`SKILL.md`](../SKILL.md#要去掉的写法). Each entry is a lead to check, not a word to ban: when a phrase matches, decide by what the sentence does, and leave sentences that work.

## Common phrases

| Phrase | Developer docs | User docs |
| --- | --- | --- |
| does not replace / is not a substitute for / should not be taken as | Keep it when it states a gate or a boundary; delete it when it only defends the author | Rewrite as an action the reader takes |
| not yet / pending / TBD | Keep real status and gaps; state each gap once | Use a short statement: "Coming in 2.1" |
| not recommended / not suitable for | Keep it when a reason follows; delete it otherwise | Rewrite as "Use X when …" |
| It's not X, it's Y / rather than X, Y | Write Y | Write Y |
| mostly works / largely complete / basic support | Say what works and what is missing | Same |
| It's worth noting that / Note that / Keep in mind that | Drop the wrapper, keep the content | Same |
| In summary / In conclusion / Let's dive in / Here's a breakdown | Delete | Delete |
| may potentially / could possibly / in some cases might | State the conclusion if there is evidence; otherwise keep one "may" and say what evidence is missing | Same |
| ensures robust / significantly improves / greatly enhances | Give the measurement, or delete | Same |
| not just X, but Y / a testament to / marks a new era | Delete; keep the fact | Same |
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

> Images are compressed on your computer and never uploaded. JPG, PNG and WebP are supported. Compression lowers quality, so keep the original if you need it.
