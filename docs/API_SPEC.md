# Planora GT — REST API & WebSocket Spec (MVP)

Auth
- POST `/api/users/register/` → {username, email, password} → 201 {id, username, email}
- POST `/api/users/token/` → {username_or_email, password} → 200 {access, refresh}
- POST `/api/users/token/refresh/` → {refresh} → 200 {access}
- GET `/api/users/me/` → current user profile + UX state
- PUT `/api/users/me/` → update profile/state: {last_viewed_group_id, last_scroll_position, drafts}
	- drafts schema suggestion: { chat: { [roomId: string]: string }, poster?: { [draftId]: any } }
- GET `/api/users/search/?q=<term>` → 200 [{id, name, email}] (PM only for adding members)

Groups / Events
- GET `/api/chats/rooms/` → list rooms where user is member or owner
- POST `/api/chats/rooms/` → PM creates room {name, description, date_time, online_flag, location}
- POST `/api/chats/rooms/{id}/add_member/` → {user_id}
- POST `/api/chats/rooms/{id}/remove_member/` → {user_id}
- GET `/api/chats/rooms/{id}/` → details with members

Messages
- GET `/api/chats/rooms/{id}/messages/?cursor=<id>&limit=50` → paginated older/newer
- POST `/api/chats/rooms/{id}/messages/` → {content, attachments?}
- PATCH `/api/chats/messages/{message_id}/` → {content, edited_flag}
- DELETE `/api/chats/messages/{message_id}/`
- POST `/api/chats/messages/{message_id}/mark_read/` → marks read by current user; WS `read` broadcast

Tasks
- GET `/api/tasks/?room=<id>`
- POST `/api/tasks/` → {room, title, description, assignee, deadline, priority}
- PATCH `/api/tasks/{id}/` → {status, completed_at}
- POST `/api/tasks/{id}/comments/` → {content} (optional MVP)

Budget / Expenses
- GET `/api/budget/?room=<id>`
- POST `/api/budget/` → {room, title, amount_estimated, amount_actual?, category}
- File upload for receipts via `/api/files/upload/` (returns URL/id) then attach to budget item
- GET `/api/budget/export.csv?room=<id>` → CSV
- GET `/api/budget/export_pdf?room=<id>` → PDF (stub)

Files & Gallery
- POST `/api/files/` → multipart → {id, file (url), mime, size}
- GET `/api/files/{id}/download/` → auth checked, returns stream or signed URL
- GET `/api/files/{id}/` → metadata for a single asset
- GET `/api/files/?room=<id>&type=image|doc&page=1` → paginated list with filters

Poster
- Drafts
	- GET `/api/poster/drafts/` → list drafts where user is owner, room member, or event owner
	- POST `/api/poster/drafts/` → {name, event?, room?, state}
	- GET `/api/poster/drafts/{id}/`
	- PUT/PATCH `/api/poster/drafts/{id}/` → update
	- POST `/api/poster/drafts/{id}/lock/` → lock; 409 if locked by another
	- POST `/api/poster/drafts/{id}/unlock/` → unlock
	- POST `/api/poster/drafts/{id}/export/?format=png|jpg|pdf` → download raster/pdf (MVP)
- Templates
	- GET `/api/poster/templates/` → list
	- POST `/api/poster/templates/` → create
	- GET `/api/poster/templates/{id}/` → get
	- PUT/PATCH `/api/poster/templates/{id}/` → update
- WebSocket
	- `wss://<host>/ws/poster/{draft_id}/?token=<jwt>` — presence/lock notifications (echo)
		- client → `{type: 'presence'|'lock'|'unlock'}`
		- server → same + `{user_id}`

Certificates
- POST `/api/poster/certificate/preview/` → one-page preview PDF
- POST `/api/poster/certificates/generate/` → multipart csv `file` → returns ZIP of PDFs

Invites & Notifications (Phase 2)
- POST `/api/invites/email/` → {room, recipients[], message}
- GET share link: `/api/invites/whatsapp?room=<id>` → returns encoded message link
	- Event helpers:
		- GET `/api/events/{id}/whatsapp_share/` → {url}
		- POST `/api/events/{id}/email_invites/` → {recipients[]}
			- GET `/api/events/upcoming/` → list next 50 my events
			- POST `/api/events/{id}/send_reminders/` → stub OK

---

Permissions
- PM: can create rooms, add/remove members, manage tasks/budget
- Member: can read room data, send messages, update owned tasks status
- Non-member: 403 on any room resource

---

WebSocket (Channels) — `wss://<host>/ws/chat/?room=<id>&token=<jwt>`
Events (client → server):
- `typing` → {room, is_typing}
- `message` → {room, content, attachments?}
- `read` → {room, message_id}

Events (server → client):
- `message` → {id, room, sender, content, attachments, timestamp}
- `typing` → {room, user_id, is_typing}
- `read` → {room, message_id, user_id}
- `system` → {room, text}

Client behavior
- Auto-reconnect with exponential backoff if socket closes unexpectedly
- Show online/offline pill based on connection state; retry until connected

---

Error Model
- 401 Unauthorized, 403 Forbidden, 404 Not Found
- Validation: 400 {field: [errors]}

Rate Limits
- User search and invites: 10/min; file upload: 20/min; WS messages: server-side limit + size caps
