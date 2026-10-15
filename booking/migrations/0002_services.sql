CREATE TABLE IF NOT EXISTS service_types (
    service_type TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    short_description TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 240),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO service_types
    (service_type, display_name, short_description, duration_minutes)
VALUES
    ('nikah',
     'Nikah & Matrimonial Services',
     'Religious guidance and ceremony support for couples and families.',
     60),
    ('religious_consultation',
     'Religious Consultation',
     'Faith-centered conversation and guidance on religious and personal questions.',
     60),
    ('community_consultation',
     'Social & Community Consultation',
     'Respectful listening and perspective on family, community, and social matters.',
     60),
    ('speaking_khutbah',
     'Speaker & Friday Khateeb',
     'Guest lectures, community programs, and Friday khutbah engagements by arrangement.',
     60);

CREATE TABLE IF NOT EXISTS service_availability_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_type TEXT NOT NULL,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    slot_minutes INTEGER NOT NULL DEFAULT 60,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (start_time < end_time),
    CHECK (slot_minutes BETWEEN 15 AND 240),
    FOREIGN KEY (service_type) REFERENCES service_types(service_type)
);

CREATE INDEX IF NOT EXISTS idx_service_availability
ON service_availability_rules (service_type, weekday, is_active);
