# Planora GT — Implementation Plan (MVP first, Phase 2 next)

This plan turns the WhatsApp-style group chat + event management requirements into an actionable backlog you can build against in this repo (Django + DRF + Channels backend; Vite + React + Tailwind frontend).

Assumptions
- Dev DB: SQLite (prod-ready migration path to Postgres/MySQL with minimal changes)
- Auth: JWT (SimpleJWT) with refresh, persisted client state (localStorage/IndexedDB) + server-authoritative fields
- Real-time: Django Channels WS with JWT auth
- Files: Local dev storage; pluggable to S3 with signed URLs

Success Criteria (MVP)
- PM can create events/groups, search users, add/remove members
- Real-time group chat with persisted messages, typing, read receipts (basic)
- Tasks: create/assign/complete with audit timestamps
- Budget: items with estimated vs actual and attachments (basic)
- Event dashboard summary
- File uploads and secure access in groups
- Restore last-viewed group and scroll position on login
- Responsive, mobile-first UI with light/dark themes and micro-interactions

---

MVP Backlog (Prioritized)
1) Auth & Users
   - Signup/Login (username or email), roles (PM/Attendee), profile
   - Persist last_viewed_group_id, last_scroll_position, drafts (JSON)
   - Endpoint: GET/PUT `/api/users/me/` to store/restore UX state

2) Groups/Events
   - Create group (event), fields: name, date_time, online_flag, location, description
   - Add/remove members via search (LIKE on name/email)
   - List user’s groups; event metadata and attendees

3) Chat (real-time + history)
   - JWT-auth WS connect per group; persist messages
   - Typing indicators & read receipts (minimum viable)
   - Message edit/delete (soft delete) + attachments

4) Tasks (per group)
   - Create, assign to attendee, deadline, priority, description
   - Mark complete; log `completed_at`; optional comments
   - Group dashboard shows progress

5) Budget (per group)
   - Expense items with `amount_estimated`, `amount_actual`, `category`
   - Upload receipts as file attachments; secure access
   - Summary on event dashboard; CSV/PDF export (basic CSV first)

6) Files & Gallery
   - Group-level uploads (images/docs), thumbnails for images, pagination
   - Secure download for members only

7) UX State Restore
   - Client caches and saves drafts/UI state; on login fetch server state and reconcile

8) UI/UX polish baseline
   - Design tokens (colors/spacing/typography), dark mode toggle, motion patterns
   - A11y (keyboard nav, ARIA labels, focus states, contrast)

---

Phase 2 Backlog
- Meeting link integration: Google Meet/Zoom API (create/revoke/regenerate)
- Poster editor (Canva-like): templates, layers, undo/redo, export PNG/PDF
- Certificates: template upload, CSV mapping, bulk generation + email
- Invitations: email with event details + WhatsApp share (prefilled message)
- Calendar & agenda with iCal/Google Calendar sync
- Notifications: in-app + optional email for messages, tasks, deadlines
- Analytics & charts: expenses breakdown, task burndown
- Approvals: poster versioning + review/approve/reject
- Real-time collaborative posters (WebRTC/OT later)

---

Architecture Notes
- Backend
  - DRF ViewSets for CRUD; Scoped permissions per membership/ownership
  - Channels consumer per room; broadcast to group; enforce membership
  - Storage interface with local FS; switchable to S3 (boto3) + signed URLs
  - Throttling for invites/emails; input validation on uploads
- Frontend
  - SPA routes: Login, Groups, Chat, Event Dashboard, Tasks, Budget, Files, Poster, Certificates, Calendar
  - Axios wrapper with refresh + retry; WS helper with token renewal
  - State: React Query or custom caching; localStorage/IndexedDB for drafts
  - UI: Tailwind + Framer Motion; headless components; themes via CSS vars

---

Acceptance Tests (MVP)
- Login persists and refreshes tokens; reload shows same group and scroll
- PM creates group, adds attendees; attendees see the new group
- WS chat: two users exchange messages; history appears after reload
- Task assignment → assignee sees and can mark Done; `completed_at` recorded
- Budget item create with receipt → visible to group; CSV export works
- File upload visible in gallery; non-members are forbidden
- Light/dark toggle persists; screen is responsive across breakpoints

---

Risk & Mitigations
- File security: ensure signed URLs or auth-protected streaming for downloads
- WS auth: rotate/refresh tokens; close on unauthorized
- SQLite limits: keep queries simple; add indexes; test with Postgres locally before prod
- Large files: limit size, MIME validation, background processing for thumbnails

---

Developer Prompt (execute MVP)
- Implement endpoints/spec in `docs/API_SPEC.md`
- Create schema/migrations per `docs/DB_SCHEMA_SQLITE.sql` mapped to Django models
- Build frontend screens/components from `docs/UI_WIREFRAMES_AND_COMPONENTS.md`
- Use example flows in `docs/EXAMPLE_FLOWS.md` to wire critical paths
