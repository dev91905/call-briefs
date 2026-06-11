# Client Intelligence Portal — v1

A private portal where consultants turn Granola call notes into ~200-word client briefs, review them, and publish to per-client feeds. Clients log in by email OTP and read a clean feed.

## Stack

TanStack Start + Lovable Cloud (Supabase) + Lovable AI Gateway (`google/gemini-3-flash-preview`). Dark-only, Resend-style design system. No Tiptap — raw Markdown in an auto-growing textarea.

## Phase 1 — Foundation: schema, auth, design system

**Lovable Cloud enabled.** All tables RLS-enabled. Migration creates:

- `app_role` enum: `analyst` | `client` | `admin`
- `profiles` (id=auth.uid, email, full_name, role, is_admin, client_id, created_at)
- `user_roles` (id, user_id, role) + `has_role(uuid, app_role)` SECURITY DEFINER
- `clients` (id, name, created_at) — seeded with P150, Grantham Foundation, TradesForce/IOF
- `granola_connections` (id, analyst_id, api_key, created_at) — **NO grants to anon/authenticated**; only `service_role`. Keys never leave the server.
- `folder_mappings` (id, analyst_id, granola_folder_id, granola_folder_name, client_id) UNIQUE(analyst_id, granola_folder_id, client_id)
- `briefs` (id, client_id, analyst_id, granola_note_id, call_title, call_date, participants, body, status, skip_reason, published_at, created_at) UNIQUE(granola_note_id, client_id)
- `brief_reads` (brief_id, client_user_id, read_at) PK(brief_id, client_user_id)
- `requests` (id, client_id, brief_id, created_by, message, status, resolved_by, created_at)
- `handle_new_user()` trigger on `auth.users` → inserts profile row (role defaults to `client` unless admin pre-creates)

RLS policies enforce: clients SELECT only published briefs for their client_id; analysts SELECT/UPDATE own briefs, SELECT all requests; admin full CRUD; `granola_connections` invisible to all client/anon roles; `brief_reads` INSERT by reading client, SELECT by analysts.

**First admin:** seed user `jon@vangelder.co` — profile with `role='analyst'`, `is_admin=true` on first sign-in via trigger logic checking against a hardcoded admin email constant.

**Auth:** Supabase email OTP only. `/auth` route (public), `/_authenticated` integration-managed gate.

**Design system** in `src/styles.css`:
- Tokens: `--bg #000`, `--surface #0A0A0A`, `--surface-raised #141414`, `--border rgba(255,255,255,0.10)`, `--border-strong rgba(255,255,255,0.18)`, `--text #EDEDED`, `--text-muted #A1A1A1`, `--text-faint #666`
- Status: `--pending #F5A623`, `--published #3ECF8E`, `--destructive #F87171`
- Inter font, tabular-nums for dates
- Override shadcn variants: button (primary = white bg / black text), card, input, sheet, popover, select — all use tokens, no white surfaces
- Body: `bg-black`, no light variant, no theme toggle

## Phase 2 — Shell & navigation

- `__root.tsx`: dark `<body>`, top bar (wordmark left, tabs center, email + sign out right), single `onAuthStateChange` subscriber, `attachSupabaseAuth` registered in `src/start.ts`
- Role-based routing inside `_authenticated/`:
  - Analyst sees: Review Queue (`/`), Requests (`/requests`), Published (`/published`), Clients (admin-only `/clients`), Settings (`/settings`)
  - Client sees: Feed (`/`) only — same path, different component by role
- Mobile: tabs become bottom bar
- `/auth` route: centered 360px column, email → OTP code, white "Continue" button

## Phase 3 — Admin: clients & invites

`/clients` route (admin-only via `has_role` check in `beforeLoad`):
- List clients (inline-editable name)
- Per client: list of invited client users (email + last-seen), inline "+" to invite
- List of analysts mapped to that client (via folder_mappings)
- Invite flow: server fn calls `supabaseAdmin.auth.admin.inviteUserByEmail()`, pre-creates profile with role + client_id

## Phase 4 — Settings: Granola connection + folder mappings

`/settings` (analyst):
- Granola API key field — masked after save, shows "Connected ✓"
- Save via server fn `saveGranolaKey` (writes to `granola_connections`, never to client)
- Folder Mappings list: each row = [Granola folder dropdown] → [client dropdown] + inline "+"
- Folders loaded via server fn `listGranolaFolders` → calls `GET https://connector-gateway.lovable.dev/granola/v1/folders` using the analyst's stored key as `X-Connection-Api-Key` + `LOVABLE_API_KEY` bearer
- Unmappable key → inline error with Granola's exact message

**Note on Granola access:** spec calls for per-analyst keys. We store each analyst's key server-side and call the Granola REST API directly (Bearer their key) from server functions — the Lovable connector-gateway is a workspace-level shared connection, which doesn't fit per-analyst. Direct API calls per Granola docs: `https://public-api.granola.ai/v1/...`.

Correction to above: skip the gateway, call `https://public-api.granola.ai/v1/folders` and `/v1/notes` with `Authorization: Bearer <analyst_key>` directly from server functions.

## Phase 5 — Poll + draft pipeline

**Server route** `/api/public/cron/poll-granola` (called by Supabase pg_cron every 15 min, signed with `CRON_SECRET`):

For each `folder_mapping`:
1. `GET https://public-api.granola.ai/v1/notes?folder_id=<id>&created_after=<last_poll>` with analyst's key (respect 5 req/s, page size ≤30)
2. For each note where `(granola_note_id, client_id)` doesn't exist in `briefs`:
   - Fetch full note (summary; transcript fallback if no summary)
   - Call Lovable AI Gateway (`google/gemini-3-flash-preview`) with the fixed drafting prompt (stored as constant)
   - If model returns `SKIP: <reason>`, insert brief with `status='skipped'`, `skip_reason=<reason>`
   - Otherwise insert `status='pending'` with drafted body, parsed call_title, call_date, participants

**Drafting prompt** (constant in `src/lib/drafting-prompt.server.ts`):
- Readout arc: hook/setup → obstacle → next moves → stakes → where things stand
- Bolded lead sentences (Markdown `**`)
- Past tense for the call, present for standing facts
- 200–250 words
- Facts only from the note — invent nothing
- Client-safe rules verbatim from PRD (exclude candid criticism, personal matters, analyst business internals, off-the-record, jokes/profanity)
- "If no client-safe substance, output exactly: SKIP: <one-line reason>"

Cron is set up via a one-time SQL migration installing pg_cron job hitting the public endpoint.

## Phase 6 — Review Queue (analyst home)

`/` for analysts. Max-width 880px.
- Server fn `getPendingBriefs` returns analyst's pending briefs newest first
- `BriefCard` component, queue variant:
  - Client chip (top-left), call title (inline input, invisible until focus), date + participants line (13px muted, participants editable inline)
  - Body: auto-growing `<textarea>` styled identically to read state (Inter 15px, line-height 1.75, transparent bg, no inner scroll, `overflow-wrap: break-word`)
  - First-focus hint: "bold for lead sentences" in `--text-faint`
  - Autosave: 800ms debounce + blur → server fn `updateBriefDraft`. Status text "Saving…" / "Saved" / "Couldn't save — retry" (red)
  - Publish (white, primary) disabled during in-flight save; sets `status='published'`, `published_at=now()`. Card slides out 200ms
  - Reject (ghost, hover red on desktop; long-press menu on mobile)
- Empty: "Queue clear. New calls appear here within 15 minutes of filing them in Granola."

## Phase 7 — Client feed

`/` for clients. Max-width 680px (reading column).
- Server fn `getClientFeed` returns published briefs for client's `client_id`, newest first, joined with their `brief_reads` for unread dot
- `BriefCard` client variant: title (H3 16px semibold), date + participants line, body rendered through `MarkdownBody` (bold + paragraphs only, sanitized)
- "Request more detail" text button bottom-right → bottom sheet (mobile) / inline expansion (desktop) with one textarea → server fn `createRequest(briefId, message)` → "Sent. We'll come back to you."
- Persistent "Ask us anything" quiet button top of feed → same sheet without `brief_id`
- On card view (intersection observer), server fn `markBriefRead(briefId)` upserts `brief_reads`
- Relative timestamps ("2h ago") via `date-fns`

## Phase 8 — Requests (both sides) + Published archive

**`/requests` (analyst):**
- Open requests at top: client chip, requester name, message, linked brief title (tap expands brief inline), Resolve checkbox → `resolveRequest` server fn
- Resolved collapsed footer group
- Single red dot on the Requests tab when any open requests exist (only urgency color in the app)

**`/published` (analyst):**
- Compact rows: client chip, title, date, eye icon (filled if any `brief_reads` row exists)
- Client filter pills across top

## Phase 9 — Components & polish

Shared components in `src/components/portal/`:
- `BriefCard` — three variants: `queue` | `archive` | `feed`
- `MarkdownBody` — render `**bold**` and paragraphs only, sanitized (no HTML, no links, no lists, no headings); paragraphs 12px gap
- `RequestCard` — analyst + client variants
- `ClientChip` — name on tinted bg (subtle per-client hue derived from id hash)
- `MappingRow` — folder→client inline selects
- `FeedList` — generic newest-first list

Motion: 150ms ease on hovers; 200ms slide-out on publish. "Loading…" in `--text-faint`, no skeletons.

## Out of scope (v1)

- Email notifications, weekly digest, "ask questions of your briefs" chat, CSV/Notion export, deep read analytics — all v2
- Any cross-client visibility, client-side AI over unpublished content, auto-publish

## Technical notes

- **Secrets to add later (Phase 5):** `CRON_SECRET` for the public cron endpoint signature. `LOVABLE_API_KEY` auto-provisioned. Granola keys live in `granola_connections` (per-analyst, server-side only).
- **Server functions** under `src/lib/*.functions.ts`; server-only helpers under `*.server.ts`. Admin client (`supabaseAdmin`) lazy-imported inside handlers.
- **`requireSupabaseAuth`** on every protected server fn; `has_role(auth.uid(), 'admin')` check on admin fns.
- **Cron route** at `src/routes/api/public/cron/poll-granola.ts` — verifies `Authorization: Bearer ${CRON_SECRET}` header before any work.
- **Markdown rendering:** small custom renderer (no `react-markdown` dep needed) — split on `\n\n` for paragraphs, replace `**x**` with `<strong>`, escape everything else.
- **Realtime not used in v1** — polling cron + router invalidate on actions is enough.
