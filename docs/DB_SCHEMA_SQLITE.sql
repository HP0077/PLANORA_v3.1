-- Planora GT - SQLite schema (maps to Django models but portable)

-- Users
CREATE TABLE IF NOT EXISTS users_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    role TEXT CHECK(role IN ('PM','ATTENDEE')) NOT NULL DEFAULT 'ATTENDEE',
    profile_pic TEXT,
    last_seen DATETIME,
    last_viewed_group_id INTEGER,
    drafts TEXT, -- JSON
    is_active BOOLEAN NOT NULL DEFAULT 1,
    date_joined DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_user_email_ci ON users_user(email);
CREATE INDEX IF NOT EXISTS idx_users_user_username_ci ON users_user(username);

-- Events / Groups
CREATE TABLE IF NOT EXISTS chats_chatroom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    date_time DATETIME,
    online_flag BOOLEAN NOT NULL DEFAULT 0,
    location TEXT,
    meet_link TEXT,
    zoom_link TEXT,
    budget NUMERIC DEFAULT 0,
    event_type TEXT,
    event_id INTEGER, -- if separate events table exists
    created_by_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by_id) REFERENCES users_user(id)
);
CREATE INDEX IF NOT EXISTS idx_chatroom_created_by ON chats_chatroom(created_by_id);

-- Group members
CREATE TABLE IF NOT EXISTS chats_chatmembership (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role_in_group TEXT CHECK(role_in_group IN ('PM','ATTENDEE')) DEFAULT 'ATTENDEE',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, user_id),
    FOREIGN KEY(room_id) REFERENCES chats_chatroom(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users_user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chatmembership_room ON chats_chatmembership(room_id);
CREATE INDEX IF NOT EXISTS idx_chatmembership_user ON chats_chatmembership(user_id);

-- Messages
CREATE TABLE IF NOT EXISTS chats_message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    sender_id INTEGER,
    content TEXT,
    attachments TEXT, -- JSON array of file URLs/IDs
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    edited_flag BOOLEAN DEFAULT 0,
    deleted_flag BOOLEAN DEFAULT 0,
    FOREIGN KEY(room_id) REFERENCES chats_chatroom(id) ON DELETE CASCADE,
    FOREIGN KEY(sender_id) REFERENCES users_user(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_message_room_time ON chats_message(room_id, timestamp);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks_app_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    assignee_id INTEGER,
    status TEXT CHECK(status IN ('TODO','IN_PROGRESS','DONE')) DEFAULT 'TODO',
    priority TEXT CHECK(priority IN ('LOW','MEDIUM','HIGH')) DEFAULT 'MEDIUM',
    deadline DATETIME,
    created_by_id INTEGER,
    completed_at DATETIME,
    attachments TEXT, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(room_id) REFERENCES chats_chatroom(id) ON DELETE CASCADE,
    FOREIGN KEY(assignee_id) REFERENCES users_user(id) ON DELETE SET NULL,
    FOREIGN KEY(created_by_id) REFERENCES users_user(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_task_room ON tasks_app_task(room_id);
CREATE INDEX IF NOT EXISTS idx_task_assignee ON tasks_app_task(assignee_id);

-- Expenses / Budget Items
CREATE TABLE IF NOT EXISTS budget_budgetitem (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER,
    title TEXT NOT NULL,
    amount_estimated NUMERIC DEFAULT 0,
    amount_actual NUMERIC,
    receipts TEXT, -- JSON array of file URLs/IDs
    category TEXT,
    created_by_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(room_id) REFERENCES chats_chatroom(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by_id) REFERENCES users_user(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_budget_room ON budget_budgetitem(room_id);

-- Posters
CREATE TABLE IF NOT EXISTS poster_poster (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER,
    author_id INTEGER,
    state TEXT CHECK(state IN ('DRAFT','PUBLISHED')) DEFAULT 'DRAFT',
    file_urls TEXT, -- JSON array (versions or assets)
    versions TEXT, -- JSON version history
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    FOREIGN KEY(room_id) REFERENCES chats_chatroom(id) ON DELETE CASCADE,
    FOREIGN KEY(author_id) REFERENCES users_user(id) ON DELETE SET NULL
);

-- Certificates
CREATE TABLE IF NOT EXISTS certificates_template (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    placeholders TEXT -- JSON: {name, role, event, date}
);
CREATE TABLE IF NOT EXISTS certificates_generated (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    metadata TEXT, -- JSON mapping from CSV row
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(template_id) REFERENCES certificates_template(id) ON DELETE CASCADE
);
