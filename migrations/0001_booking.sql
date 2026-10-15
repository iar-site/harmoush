PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS booking_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO booking_settings (setting_key, setting_value)
VALUES
    ('timezone', 'America/Los_Angeles'),
    ('advance_booking_days', '60'),
    ('minimum_notice_hours', '24');

CREATE TABLE IF NOT EXISTS availability_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    slot_minutes INTEGER NOT NULL DEFAULT 60,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (start_time < end_time),
    CHECK (slot_minutes BETWEEN 15 AND 240)
);

CREATE TABLE IF NOT EXISTS blocked_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocked_date TEXT NOT NULL UNIQUE,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    service_type TEXT NOT NULL CHECK (
        service_type IN (
            'nikah',
            'religious_consultation',
            'community_consultation',
            'speaking_khutbah'
        )
    ),
    requested_date TEXT NOT NULL,
    requested_time TEXT NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'confirmed', 'declined', 'alternative_offered', 'cancelled')
    ),
    admin_notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_booking_date_status
ON booking_requests (requested_date, requested_time, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_active_slot
ON booking_requests (requested_date, requested_time)
WHERE status IN ('pending', 'confirmed');