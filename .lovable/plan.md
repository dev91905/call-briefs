# Self-published briefs — manual compose

Kill the Granola API pull. Repurpose `/queue` as the analyst's compose surface: pick a client, write the brief, push it live.

## What changes for the analyst

`/queue` becomes a two-pane workspace:

- **Left rail — Drafts.** List of briefs in `draft` status (your unfinished work). Click to load into the editor. "+ New brief" button at top.
- **Right pane — Editor.** Single form for the active draft:
  - Client picker (required, dropdown of your assigned clients)
  - Call title
  - Call date (date picker)
  - Participants (free text)
  - Body (rich text / markdown)
  - Auto-saves on blur to `draft` status
  - Two actions at the bottom: **Save draft** and **Publish to client**

Publishing flips status to `published`, stamps `published_at`, and the client sees it in their feed immediately — same path published briefs use today.

Clients still see the same `/` feed. Nothing changes for them.

## What goes away

- Granola cron polling (`/api/public/cron/poll-granola`) — disabled
- `granola_connections` table — left in place but unused (no destructive migration)
- Settings → Granola connect UI — hidden
- The "Queue clear. New calls appear here within 15 minutes…" empty state copy

## Technical notes

- New serverFns in `src/lib/briefs.functions.ts`:
  - `createDraftBrief({ clientId, callTitle?, callDate?, participants?, body? })` — inserts a row with `status='draft'`, `analyst_id=auth.uid()`, returns the id
  - `getDrafts()` — lists analyst's drafts
  - `getMyClients()` — clients the analyst is mapped to via `folder_mappings`
- Extend `updateBriefDraft` to accept `callDate` and `clientId`.
- `publishBrief` already works as-is — it transitions `pending|draft → published`. Update its `.eq("status","pending")` filter to allow `draft` too.
- Add `'draft'` to the briefs status check (migration if there's a CHECK constraint; otherwise just write the value).
- Remove the cron job row from `cron.job` for `poll-granola` and delete the route file.
- Hide the Granola section in `/settings`.

## Out of scope

- Editing already-published briefs (publish is one-way for now)
- Scheduled publish / publish-later
- Attachments or images in the body
- Multi-analyst collaboration on the same draft

## Open question

When you hit **Publish**, should it (a) publish silently, or (b) also trigger the client notification email that goes out today on publish? I'll keep current behavior — publish triggers whatever notification path already fires — unless you say otherwise.
