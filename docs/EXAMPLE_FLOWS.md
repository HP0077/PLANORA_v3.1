# Planora GT — Example Flows & Snippets

Group Creation + Member Search (REST)
- Create room (PM):
  POST `/api/chats/rooms/`
  Body: {"name":"Tech Fest","description":"Annual","date_time":"2025-10-03T10:00:00Z","online_flag":true}
  → 201 {id, name, ...}
- Search users (PM):
  GET `/api/users/search/?q=an` → 200 [{id, name, email}]
- Add member:
  POST `/api/chats/rooms/{id}/add_member/` {"user_id": 12}

Real-time Messaging (WebSocket)
- Connect: `wss://host/ws/chat/?room=42&token=<access>`
- Send:
  {"type":"message","room":42,"content":"Hello team!"}
- Receive:
  {"type":"message","id":77,"room":42,"sender":5,"content":"Hello team!","timestamp":"2025-09-19T09:12:33Z"}
- Typing:
  {"type":"typing","room":42,"is_typing":true}

Mark Task Complete
- PATCH `/api/tasks/123/` {"status":"DONE","completed_at":"2025-09-19T11:05:00Z"}
- Response 200 with updated task; triggers notification event to room

Generate Meeting Link (Phase 2 sample)
- Server calls Zoom/Google API and stores `meet_link`/`zoom_link` on room:
  POST `/api/integrations/meet/create/` {"room": 42} → 200 {"meet_link":"https://meet.google.com/abc-defg-hij"}

Bulk Certificate Generation (Phase 2 sample)
- Upload template: POST `/api/certificates/templates/` multipart → {template_id}
- Trigger generate: POST `/api/certificates/generate/` {"template_id":1,"csv_file":"<id>"} → {batch_id}
- Poll/download: GET `/api/certificates/download.zip?id=<batch_id>`

Files Upload (Receipts / Attachments)
- POST `/api/files/upload/` multipart → {id, url}
- Attach to budget item: PATCH `/api/budget/55/` {"receipts":["file://...", "s3://..."]}
