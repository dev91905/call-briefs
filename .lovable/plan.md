
# Projects rebuild

A structural rebuild, not a visual one. Design tokens, `MarkdownBody`, and the `queue.tsx` editor interactions stay exactly as they are. The analyst/client split goes away; everyone is the same kind of user, and projects are the only container.

## Phase 1 — Schema (one migration, reviewed before run)

New enums (fresh names, do not reuse dropped ones):
- `project_role`: `owner | co_owner | member`
- `entry_status`: `draft | published`

New tables (all with grants + RLS + policies in the same migration):
- `projects` — name, created_by, timestamps
- `project_members` — (project_id, user_id) PK, role, created_at
- `pending_invites` — project_id, email, role, invited_by; unique (project_id, email)
- `entries` — project_id, author_id, title, entry_date, body, status, published_at, timestamps
- `people` — project_id, full_name, created_by; unique index on (project_id, lower(full_name))
- `entry_people` — (entry_id, person_id) PK

Security-definer helpers to avoid recursive policies:
- `is_project_member(pid uuid) returns boolean`
- `project_role(pid uuid) returns project_role`

RLS (exactly as spec'd):
- **projects**: SELECT members or `is_admin`; INSERT any authed; UPDATE owner/co_owner; DELETE owner.
- **project_members / pending_invites**: SELECT members; write owner/co_owner; user may DELETE their own membership.
- **entries**: SELECT members where `status='published' OR author_id=auth.uid()`; INSERT members with `author_id=auth.uid()`; UPDATE/DELETE only own rows with `status='draft'`.
- **people / entry_people**: SELECT/INSERT members; DELETE people only owner/co_owner.

## Phase 2 — Data migration (same or follow-up migration, after counts verified locally)

In order, in a transaction:
1. Delete `briefs` rows for the "Restored Client", then delete that client row. (Test junk.)
2. Insert one `projects` row per remaining `clients` row (P150, Grantham Foundation, TradesForce, IOF), `created_by` = the admin user (`jon@vangelder.co`).
3. Seed `project_members`:
   - Every profile with `client_id` → member of that client's project as `owner` if their `user_roles` row is `client`, else `member` if `analyst`.
   - Every admin/analyst user → `member` of all three projects if not already present.
4. Copy `briefs` where status in (`published`,`draft`) into `entries` (`call_title→title`, `call_date→entry_date`, `body→body`, `analyst_id→author_id`, same status, `published_at`). Skip `pending/rejected/skipped`.
5. For each migrated entry, split `participants` on commas, trim, upsert `people` per project, link via `entry_people`.
6. Verify counts (rows in/out logged), then drop in order: `requests`, `brief_reads`, `folder_mappings`, `granola_connections`, `briefs`, `clients`, enums `brief_status` and `request_status`, table `user_roles` and enum `app_role`. Keep `profiles.is_admin` as the only global flag.

## Phase 3 — Code cleanup

Delete:
- `src/lib/granola.functions.ts`
- `src/lib/requests.functions.ts`
- `src/lib/drafting-prompt.server.ts`
- All `src/routes/_authenticated/portals.*.tsx` stubs
- The auth/admin gating that referenced `user_roles` / `app_role`; replace any `has_role(..,'admin')` checks with `profiles.is_admin`.

Add redirects (replace existing route files' bodies) so `/queue`, `/published`, `/requests`, `/clients`, `/preview/$clientId` all `redirect({ to: '/' })`. Keep `/settings` as-is.

## Phase 4 — Server functions

New `src/lib/projects.functions.ts`:
- `listMyProjects()` → membership rows with name, role, member count, entry count
- `createProject({ name })` → inserts project + creator as `owner`; returns id
- `getProject({ id })`, `renameProject`, `deleteProject`
- `listMembers({ projectId })`, `inviteToProject({ projectId, email, role })` (creates `pending_invites` for unregistered, sends invite via existing email pipeline + `invite.tsx`), `setMemberRole`, `removeMember`, `transferOwnership`, `leaveProject`
- `claimPendingInvites()` — call on session bootstrap

New `src/lib/entries.functions.ts`:
- `createDraft({ projectId })`, `updateDraft({ id, title?, entryDate?, body?, participants? })` (writes `entry_people` diff), `publishEntry({ id })`, `deleteDraft({ id })`
- `listMyDrafts({ projectId })`, `listPublished({ projectId })`, `listLatestAcrossMyProjects()`

New `src/lib/people.functions.ts`:
- `listProjectPeople({ projectId })` with computed `entry_count` and `last_seen`
- `getPerson({ projectId, personId })` with entries
- `renamePerson`, `mergePeople({ projectId, fromId, toId })`
- `suggestPeople({ projectId, query })` for the tag input

All use `requireSupabaseAuth`; authorization is enforced by RLS plus explicit role checks for owner/co_owner-only ops (`project_role(pid)` helper).

## Phase 5 — Screens

Reuse design tokens, `MarkdownBody`, and the editor markup from `queue.tsx`. No visual redesign.

- **`/` Home (`_authenticated/index.tsx`)** — "Your projects" grid (ProjectCard + "+ New project"), then "Latest intelligence" feed with filter pills (All + one per project). Empty state: only the New Project CTA.
- **`/projects/new`** — single name field + Create.
- **`/projects/$projectId`** layout with tabs:
  - **Intelligence** (`/projects/$projectId/index.tsx`) — collapsed composer at top → expands to EntryComposer (refactored from `queue.tsx` editor, client picker removed). "Your drafts" group above the published feed. Save draft (ghost) vs Publish (white).
  - **People** (`/projects/$projectId/people.tsx` + `people.$personId.tsx`) — auto-built directory; person detail lists their published entries. Owner/co_owner can rename or merge.
  - **Settings** (`/projects/$projectId/settings.tsx`) — member list with role dropdowns (rules per spec), invite row, owner danger zone (rename, transfer ownership with confirmation, delete with typed confirmation).

## Phase 6 — Components

- `EntryComposer` — extracted from `queue.tsx` editor, project-scoped, autosave on blur preserved.
- `TagInput` — suggestion list from `suggestProjectPeople`, Enter on no-match creates person (chip marked "(new)" until blur); writes `entry_people` on save.
- `ProjectCard`, `EntryCard` (feed + expanded), `MemberRow`, `PersonCard`.
- Keep `MarkdownBody` unchanged.

## Phase 7 — Pending invite claim on auth

In `__root.tsx` `onAuthStateChange` (already filtered to SIGNED_IN/OUT/USER_UPDATED), on SIGNED_IN call `claimPendingInvites()` once before `queryClient.invalidateQueries()`.

## Out of scope (v2)

Editing published entries, comments, read receipts, per-person notes, email digests, cross-project people.

## Acceptance checks (verify before closing)

1. Brand-new user sees empty Home with only "+ New project".
2. Member of project A gets 401/empty when hitting project B's entries/people/members by id (RLS).
3. A draft is invisible to every other member, including owners.
4. Create participant via Enter → reopen composer → suggestion appears.
5. "Restored Client" and its lorem brief are gone from DB.
6. `/queue`, `/published`, `/requests`, `/clients`, `/preview/$clientId` all redirect to `/`; all `portals.*` stubs deleted.

---

### Technical details

- Migration runs in one call; data-migration block uses `INSERT ... SELECT` + a `DO $$` loop for the participants split, then the DROP block. I'll log row counts via `RAISE NOTICE` for verification.
- `pending_invites` claim: a serverFn that matches by lowercased email against `auth.users.email`, inserts to `project_members` (ON CONFLICT DO NOTHING), deletes claimed rows.
- Invite emails go through the existing `enqueue_email` + `invite.tsx` pipeline; no new infra.
- All new serverFns live in `src/lib/*.functions.ts` (client-safe path) with `requireSupabaseAuth`; admin-only ops use `profiles.is_admin` check inside the handler.
- Route tree: do not hand-edit `routeTree.gen.ts`; create the route files and let the plugin regenerate.

