# Groups, Tags, Mentions, Map & Composer Polish

Surgical extension of the projects feature. Design system, layout, and existing composer chrome stay exactly as built — only what's listed here changes.

## 1. Database migration

New tables (RLS mirroring `entry_people` — members read/write; rename/delete via existing `project_role_of` helper for owner/co_owner):

- `groups(id, project_id, name, created_by, created_at)` — unique `(project_id, lower(name))`
- `entry_groups(entry_id, group_id)` — PK pair
- `tags(id, project_id, name, created_at)` — unique `(project_id, lower(name))`
- `entry_tags(entry_id, tag_id)` — PK pair

Alter `entry_people` to add `role text not null default 'participant' check (role in ('participant','mentioned'))`. Existing rows backfill as `participant`.

All four tables get the standard four-step block: CREATE TABLE → GRANT (authenticated + service_role) → ENABLE RLS → POLICIES (member read, member write; rename/delete restricted via role helper).

## 2. Server functions

New file `src/lib/groups.functions.ts`:
- `listProjectGroups({ projectId })` — name, entry count, last activity
- `suggestGroups({ projectId, query })`
- `createGroup({ projectId, name })`
- `renameGroup`, `deleteGroup` (owner/co_owner)
- `getGroupFeed({ projectId, groupId })` — published entries in that group

New file `src/lib/tags.functions.ts`:
- `suggestTags({ projectId, query })`
- `createTag({ projectId, name })`
- `topTagThisMonth({ projectId })`

Extend `src/lib/entries.functions.ts`:
- `loadEntries` joins `entry_tags(tags(id,name))`, `entry_groups(groups(id,name))`, and `entry_people.role`. `EntryListItem` gains `tags[]`, `groups[]`, `participants[]`, `mentioned[]`.
- `updateDraft` input adds `groupIds`, `tagIds`, `mentionedPeopleIds` and rewrites the join tables (dedup: a person who is participant stays participant, never demoted to mentioned).
- New `duplicateDraft({ id })` — clones title/body/entry_date and re-links people/groups/tags as a new draft owned by the caller.
- New `listFilteredEntries({ projectId, tagIds?, groupIds?, from?, to? })` for the feed filter popover.

Extend `src/lib/people.functions.ts`:
- `deletePerson({ projectId, personId })` — owner/co_owner only; unlinks from `entry_people` then deletes the `people` row.
- `getPersonDetail` additionally returns `connections[]` (co-occurring people on published entries, with `mentionOnly: boolean`).

## 3. Composer (`projects.$projectId.index.tsx`)

Keep the file's structure: utility row, 24px title, metadata band, body, footer. Surgical changes only.

- Metadata band gets a **second line** with the same `border-t` divider style and label color: `Group` (TagInput → `suggestGroups`/`createGroup`) and `Tags` (TagInput → `suggestTags`/`createTag`). The existing `TagInput` component is reused with a generic `kind: "people" | "groups" | "tags"` prop.
- Date field becomes a Popover (shadcn `popover` + the existing `calendar.tsx`) with a "Set to today" button pinned at the calendar's foot. New drafts default `entryDate` to today.
- Secondary button label changes from `Save draft — only you see it` to `Save draft`.
- Drafts rail items get a `ContextMenu` wrapper (existing `context-menu.tsx`) with `Duplicate` (`duplicateDraft`) and `Delete draft` (confirm via window.confirm to keep it spartan).

### Body editor — Tiptap

Install `@tiptap/react @tiptap/starter-kit @tiptap/extension-typography @tiptap/extension-mention @tiptap/suggestion`. Replace the textarea with a Tiptap `EditorContent` wrapped in the same border/spacing.

- Input rules from StarterKit + Typography handle `# `, `## `, `- `, `**bold**` live.
- Markdown serialization: a small `tiptap-markdown.ts` helper converts the editor JSON to Markdown (headings, bold, lists, paragraphs, and the mention token `@[Name](person:uuid)`) on `onBlur` / save. Reverse parse on load splits mention tokens back into mention nodes; everything else is set as plain text so existing published entries are byte-identical when re-saved as text.
- Mention extension uses `suggestPeople` for `@`. Non-match offers create via `createPerson`. Mentions are tracked in editor state; on save, the composer extracts the set of mentioned person IDs and passes them to `updateDraft` so `entry_people` gets `(role:'mentioned')` rows.
- `MarkdownBody` is extended to render `@[Name](person:uuid)` as a styled inline link to `/projects/$projectId/people/$personId`. Bold continues to render. (No other syntax added — published rendering rules unchanged.)

## 4. Intelligence tab feed

- Remove any thought of tag pills. Header gets one `Filter` Popover (searchable tag list, searchable group list, optional date range) — active filters render as removable chips next to the button.
- Beside the filter, a muted line `Most active this month: {top tag}` from `topTagThisMonth`. Hidden when null.
- Entry meta line under the title appends tags and groups as plain muted text: `… · tags: a, b · groups: X`.

## 5. Groups tab

New route `src/routes/_authenticated/projects.$projectId.groups.tsx` (list) and `…/projects.$projectId.groups.$groupId.tsx` (feed). Cards: name, entry count, last activity. `+ New group` for any member; corner kebab on group page for owner/co_owner with Rename / Delete (confirm: removes the group and its links, entries untouched). Empty state copy as specified.

## 6. People tab additions

- Person page: top-right `Delete` action (visible only when `myRole in ('owner','co_owner')`). Confirm copy: `Removes {name} and their tags from {n} entries. The entries themselves are untouched.` Calls `deletePerson`, navigates back to People.
- Below entries list, `Connections` section: chips/list of co-appearing people, with `(mentioned)` suffix when the only shared link was mention-only.

## 7. Map tab

New route `…/projects.$projectId.map.tsx`. `getProjectGraph({ projectId, tagId?, range? })` server fn returns:
- `nodes`: `{ id, fullName, initials, mentionOnly }` — people on ≥1 published entry within range, `mentionOnly` true when all their links are mentions.
- `edges`: `{ source, target, weight, mentionOnly }` — pair co-occurrence on published entries.

Install `d3-force`. Render a force-directed SVG (no React-flow, no extra UI lib): dark circles with initials, label on hover and for top-weight nodes. Edge stroke 1–3px scaled by weight, dashed when `mentionOnly`. Click a node → person page. Two quiet selects top-right: tag filter, time range (all / 90d / 30d). Monochrome. Empty state as specified.

Tab nav in `projects.$projectId.tsx` updates to: Intelligence / People / Groups / Map / Settings.

## 8. Routing

New files under `src/routes/_authenticated/`:
- `projects.$projectId.groups.tsx`
- `projects.$projectId.groups.$groupId.tsx`
- `projects.$projectId.map.tsx`

(`routeTree.gen.ts` regenerates.)

## Technical notes

- Dependencies added: `@tiptap/react @tiptap/starter-kit @tiptap/extension-typography @tiptap/extension-mention @tiptap/suggestion d3-force`. All run in the browser; nothing new on the Worker.
- `entries.body` stays `text` storing Markdown — no schema change to entries. Old entries continue to render via `MarkdownBody`.
- All PostgREST joins use the same separate-fetch pattern we already use for `profiles` to avoid the FK-cache errors that bit us earlier.
- RLS on all four new tables follows the `entry_people` shape; member writes for create/link, role helper for rename/delete on `groups`.
- `deletePerson` runs as the authenticated user — RLS already allows owner/co_owner; we add an explicit role check inside the handler too as belt-and-braces.

## Acceptance

- Tab order Intelligence / People / Groups / Map / Settings.
- No tag pills anywhere in the feed.
- `# ` in the composer immediately formats as H1; stored body is plain Markdown; pre-update published entries render identically.
- `@Name` for a new person creates them, marks them mentioned, dashed on map, visible in People.
- Delete person removes them from People, map, and entry metadata; entry bodies untouched; action hidden from plain members.
- Right-click a draft → Duplicate or Delete; duplicate carries participants, groups, tags.
