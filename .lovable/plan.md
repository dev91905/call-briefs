# Client Portals + Network Intelligence

Reframe the app around **portals**. A portal is one client's intelligence workspace. Clients own portals, invite analysts (and co-owners), and each portal has its own people directory, intelligence feed, custom form schema, requests, and network map. One person can be the owner of one portal and an analyst in five others. Everything is scoped to portal.

## Roles and membership

Two scopes of role:

- **Global account role** — `client` (default for new sign-ups) or `analyst` (no platform-level admin tier; the existing `admin` flag stays for me as builder).
- **Per-portal role** — `owner`, `co_owner`, `analyst`. Anyone can be any per-portal role regardless of global role. Owners and co-owners can invite/remove members, change roles, and edit the form schema. Analysts contribute entries and view the feed.

A portal has exactly one owner (transferable). Co-owners and analysts are unlimited. Removal is instant; the removed user loses all access to that portal's data but keeps their entries authored elsewhere.

## Home dashboard (unified activity + portal rail)

Mobile-first single column, desktop adds a left rail.

- **Left rail (desktop) / top sheet (mobile):** list of portals the user belongs to, with unread counts and role chip. "+ New portal" at the bottom.
- **Main pane:** one chronological activity feed interleaving intel entries and requests across every portal the user belongs to. Each item shows portal badge, type chip (Intel / Request), subject, one-line preview, author, and relative timestamp. Filters at the top: portal (multi), type, mine vs all, unread.
- Click an item → opens it inside its portal context (route changes to the portal).

## Inside a portal

Tabs (sticky, mobile-friendly): **Feed · People · Map · Requests · Settings**.

- **Feed** — reverse-chron list of intelligence entries. Inline add at top. Each entry is a content atom card.
- **People** — searchable grid of everyone mentioned in the portal. Click a person → profile page with their entries, their relationships, and a mini ego-graph.
- **Map** — full-portal Obsidian-style force graph. Nodes are people, edges are typed relationships and co-mention links. Click a node to focus it; drag to reorganize; filter edge types.
- **Requests** — keeps current behavior, scoped to the portal.
- **Settings** — members + roles (owner/co-owner only can edit), form schema editor, portal name/logo.

## Intelligence entry (the atom)

Standard fields, always present:

- **Subject** — the person this entry is about. Inline-creates a directory entry if new.
- **Talked to** — who the analyst spoke with (free text; optional).
- **Readout** — rich text (Tiptap).
- **Mentions** — multi-select of portal people; inline-creates new ones; typing `@name` inside the readout also adds to mentions.
- **Call date** (optional).

Plus whatever **custom fields** the portal schema defines (text, long text, select, multi-select, date, number, person-ref). Custom fields render in the same form, drag-to-reorder in Settings.

Authoring is click-to-edit, autosave on blur. Long-press / right-click for duplicate, delete, copy link.

## People directory + typed relationships

Each portal owns its own private directory. People do not leak across portals (so the same human can appear in two portals as two records — by design, for confidentiality).

A **person** has: name, optional org/title/email/notes, and a list of **relationships**. A relationship is `(from_person, to_person, type, note)` where `type` is one of a portal-editable enum (defaults: `knows`, `works with`, `reports to`, `donor to`, `family`, `mentor`, `introduced by`). Relationships are directed but rendered as undirected unless the type implies direction.

Adding a relationship is inline on the person's profile and inside an entry ("Connections" section): pick or create a person, pick a type, optional note. Each relationship records who logged it and when.

## Network map

Force-directed graph (react-force-graph or sigma) per portal:

- Nodes: people. Node size = mention count. Color = optional tag.
- Edges: typed relationships (solid, color by type) + co-mention edges (thin, gray, weight by count).
- Click node → side panel: profile, last 5 entries, relationship list.
- Filter chips: edge type, date range, "people I added" vs all.
- Search jumps to a node and focuses its ego network.

## Custom form schema

Owner/co-owner-only editor in Settings → "Entry form". Drag-to-reorder fields, add field (type + label + required + options for selects), delete field. Schema changes apply going forward; existing entries keep whatever they had (missing fields render as empty).

## Migration from current state

- **Keep:** existing `clients` rows become **portals**. The user who is currently admin (me) becomes owner of every existing portal. `profiles` and `user_roles` stay; `analyst` and `client` global roles preserved.
- **Drop:** `briefs`, `brief_reads`, `requests`, `granola_connections`, `folder_mappings`, related drafts. Migration archives them to a `legacy_*` schema for safety but they are not surfaced anywhere.
- **Add:** new tables (see technical section). Existing routes that referenced briefs/requests get repointed or removed.

## Out of scope for v1

- Cross-portal people deduping / global identity graph.
- Public share links for entries or maps.
- File attachments on entries (text-only v1).
- Mobile push notifications (email digests only, reusing existing infra).
- Realtime collaborative editing (autosave + last-write-wins is fine).

---

## Technical notes

### Database (new schema, all RLS-on, with GRANTs)

- `portals` — id, name, slug, owner_id, created_at.
- `portal_members` — portal_id, user_id, role (`owner`|`co_owner`|`analyst`), invited_by, joined_at. Unique on (portal_id, user_id).
- `portal_people` — id, portal_id, name, org, title, email, notes, created_by, created_at. Indexed on (portal_id, lower(name)).
- `portal_relationships` — id, portal_id, from_person_id, to_person_id, type, note, created_by, created_at. Type is text validated against portal config.
- `portal_form_schema` — portal_id, fields jsonb (ordered array of `{key, label, type, required, options?}`), updated_by, updated_at.
- `portal_entries` — id, portal_id, subject_person_id, talked_to, readout (jsonb Tiptap doc), call_date, custom jsonb (keyed by schema field key), author_id, created_at, updated_at.
- `portal_entry_mentions` — entry_id, person_id (unique pair). Populated on save by parsing the entry's mentions + readout `@` refs.
- `portal_requests` — replaces existing `requests`, portal-scoped.
- `portal_activity` — denormalized feed table (entry/request created or updated). Drives the home unified feed efficiently.

RLS pattern: a `is_portal_member(_user, _portal, _min_role)` security-definer function gates every portal table. Owners/co-owners check via the same function with `_min_role := 'co_owner'`. Service role bypasses for admin tasks. Use `has_role(_user, 'admin')` only for my builder access.

### Server functions (`src/lib/portals.functions.ts`, `entries.functions.ts`, `people.functions.ts`, `graph.functions.ts`)

All `requireSupabaseAuth`. Each performs a portal-membership check via the security-definer function before touching data. No admin-client usage in normal flows.

- `listMyPortals`, `createPortal`, `getPortal`, `updatePortal`, `listMembers`, `inviteMember(email, role)`, `setMemberRole`, `removeMember`, `transferOwnership`.
- `listFeed({ portalIds?, types?, mine?, cursor })` — unified activity for home.
- `listPortalEntries`, `createEntry`, `updateEntry`, `deleteEntry`.
- `listPeople`, `getPerson`, `upsertPerson`, `mergePeople` (later).
- `listRelationships(portalId)`, `addRelationship`, `removeRelationship`, `editRelationshipType`.
- `getFormSchema`, `updateFormSchema`.
- `getGraph(portalId, { edgeTypes?, since?, focusPersonId? })` — returns `{ nodes, edges }` shaped for the graph view.

### Routes (TanStack file-based)

```
src/routes/
  index.tsx                                  # marketing / signed-out
  _authenticated/
    home.tsx                                 # unified feed + portal rail
    portals.new.tsx                          # create portal
    portals.$portalId.tsx                    # portal layout (tabs)
    portals.$portalId.index.tsx              # Feed
    portals.$portalId.people.tsx
    portals.$portalId.people.$personId.tsx
    portals.$portalId.map.tsx
    portals.$portalId.requests.tsx
    portals.$portalId.settings.tsx
```

Old `/queue`, `/clients`, `/briefs`, `/preview/$clientId` are removed.

### Graph rendering

`react-force-graph-2d` for the map (Worker-safe; no native deps). Server returns plain `{nodes, edges}` DTOs. Client computes co-mention edges client-side from the entry-mention join if cheaper than serving them.

### Migration plan

One migration: create new tables + RLS + GRANTs + security-definer helpers; copy `clients` rows into `portals` with me as owner; rename `requests` → `legacy_requests`, `briefs` → `legacy_briefs`, etc., and drop their RLS-exposed grants from `anon`/`authenticated` so they disappear from the app. No data loss, but nothing legacy is rendered.

### Notes for later

- Email digests reuse the existing email infra; one job per portal per day summarizing new entries.
- Cross-portal person identity is intentionally not solved — same human in two portals = two records. Revisit only if users ask.
