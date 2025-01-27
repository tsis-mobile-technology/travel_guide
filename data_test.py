import sqlite3

# 데이터베이스 연결 (파일이 없으면 생성됩니다)
conn = sqlite3.connect('travel_guide.db')

# 커서 생성
cursor = conn.cursor()

# SQL 쿼리 실행 (예: 테이블 생성)
cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        google_id TEXT PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        name TEXT,
        profile_image TEXT
    )
''')

# 변경 사항 저장
conn.commit()

# 연결 종료
conn.close()