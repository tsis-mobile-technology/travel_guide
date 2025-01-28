-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    google_id TEXT PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    name TEXT,
    profile_image TEXT
);

-- 장소 테이블
CREATE TABLE IF NOT EXISTS places (
    place_id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT,
    place_name TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    google_place_id TEXT,
    FOREIGN KEY (google_id) REFERENCES users(google_id)
);