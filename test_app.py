import unittest
import json
from app import app, get_db_connection

class AppTestCase(unittest.TestCase):

    def setUp(self):
        self.app = app.test_client()
        self.db_conn = get_db_connection()

        # 테이블 생성
        self.db_conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                google_id TEXT PRIMARY KEY,
                access_token TEXT,
                refresh_token TEXT,
                name TEXT,
                profile_image TEXT
            )
        ''')
        self.db_conn.commit()

        # 기존 데이터 삭제 (테스트 격리 보장)
        self.db_conn.execute("DELETE FROM users")
        self.db_conn.commit()

    def tearDown(self):
        self.db_conn.close()

    def test_index(self):
        response = self.app.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.decode(), "Welcome to the Travel Guide App!")

    def test_userinfo_empty(self):
        response = self.app.get('/userinfo')
        data = json.loads(response.data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(data), 0)

    def test_place(self):
        response = self.app.get('/place')
        data = json.loads(response.data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(data), 5)

    def test_userinfo(self):
        # 데이터 삽입
        self.db_conn.execute("INSERT INTO users (google_id, access_token, name, profile_image) VALUES (?, ?, ?, ?)", ("123", "token123", "Test User", "image.jpg"))
        self.db_conn.commit()

        response = self.app.get('/userinfo')
        data = json.loads(response.data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['name'], 'Test User')


if __name__ == "__main__":
    unittest.main()