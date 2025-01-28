import os
import sqlite3
from flask import Flask, request, jsonify, redirect, url_for, render_template, session
from dotenv import load_dotenv
import requests
from google.oauth2 import id_token, credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import json
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from pathlib import Path

# Get the base directory using Path
BASE_DIR = Path(__file__).resolve().parent
env_path = BASE_DIR / '.env'

# Load environment variables
print(f"Loading .env file from: {env_path}")
load_dotenv(dotenv_path=env_path, override=True)

# Verify loading
print("Environment variables loaded:")
print(f"GOOGLE_API_KEY exists: {'YES' if os.getenv('GOOGLE_API_KEY') else 'NO'}")
print(f"GOOGLE_API_KEY : {os.getenv('GOOGLE_API_KEY')}")
app = Flask(__name__, static_folder="static")  # static 폴더 지정
app.secret_key = os.environ.get("FLASK_SECRET_KEY") # Flask 에서 Session을 사용할 때 필요한 secret key 설정
# app.secret_key = os.urandom(24)
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
SCOPES = [
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/user.addresses.read",
    "https://www.googleapis.com/auth/user.birthday.read",
    "openid",
    "https://www.googleapis.com/auth/user.phonenumbers.read",
]
# 데이터베이스 연결 설정
def get_db_connection():
    conn = sqlite3.connect("travel_guide.db")
    conn.row_factory = sqlite3.Row
    return conn

# Google OAuth 흐름 설정
# app.py의 get_google_flow 함수 수정
def get_google_flow():
    client_config = {
        "web": {
            "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
            "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET"),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": [os.environ.get("GOOGLE_REDIRECT_URI", "https://gainworld-travel-guide-app/callback")]
        }
    }
    
    flow = Flow.from_client_config(
        client_config=client_config,
        scopes=SCOPES,
    )
    return flow

# 홈페이지
@app.route("/")
def index():
    return app.send_static_file("index.html")  # index.html 제공

# Google 로그인
@app.route("/login")
def login():
    flow = get_google_flow()
    authorization_url, state = flow.authorization_url(
        access_type="offline", include_granted_scopes="true"
    )
    session['state'] = state # 로그인 과정에서 state 값을 세션에 저장
    return redirect(authorization_url)

# Google 로그인 콜백
@app.route("/callback")
def callback():
    flow = get_google_flow()
    # URL에서 state 파라미터 가져오기
    state = request.args.get('state')

    # 세션에 저장된 state 값과 URL에서 가져온 state 값이 일치하는지 확인
    if 'state' not in session or state != session['state']:
        return jsonify({"error": "Invalid state parameter"}), 400
    
    code = request.args.get("code")
    try:
        flow.fetch_token(code=code)
        credentials = flow.credentials

        # google.auth.transport.requests.Request 객체 생성
        google_auth_request = GoogleAuthRequest(session=requests.Session())

        # ID 토큰에서 사용자 정보 가져오기
        idinfo = id_token.verify_oauth2_token(
            credentials.id_token, google_auth_request, GOOGLE_CLIENT_ID
        )

        # idinfo 딕셔너리에 'picture' 키가 포함되어 있는지 확인
        if "picture" not in idinfo:
            print("Error: 'picture' key not found in idinfo")
            # 'picture' 키가 없는 경우, 적절한 에러 처리 또는 기본 이미지 URL 설정
            idinfo["picture"] = "/static/default-profile-image.jpg"  # 기본 이미지

        conn = get_db_connection()
        cursor = conn.cursor()

        # 사용자 정보 데이터베이스에 저장 또는 업데이트
        cursor.execute(
            "INSERT OR REPLACE INTO users (google_id, access_token, refresh_token, name, profile_image) VALUES (?, ?, ?, ?, ?)",
            (
                idinfo["sub"],
                credentials.token,
                credentials.refresh_token,
                idinfo["name"],
                idinfo["picture"],  # 'picture' 키 값 사용
            ),
        )
        conn.commit()
        conn.close()

        # 로그인 성공 후 세션에 사용자 정보 저장
        session['logged_in'] = True
        session['google_id'] = idinfo['sub']

        return redirect(url_for("index"))  # 로그인 성공 후 index 페이지로 리디렉션

    except Exception as e:
        print(f"Error during callback: {e}")  # 에러 로깅
        return jsonify({"error": str(e)}), 500

# 사용자 정보 가져오기
@app.route("/userinfo")
def userinfo():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 로그인 여부 확인 (예: 세션 사용)
    if "logged_in" not in session:
        conn.close()
        return jsonify({"error": "User not logged in"}), 401  # 401 에러 반환

    # 데이터베이스에서 사용자 ID 가져오기 (예: 세션에서 가져온 google_id 사용)
    google_id = session.get("google_id")
    if not google_id:
        conn.close()
        return jsonify({"error": "User ID not found in session"}), 401

    # 사용자 ID를 기반으로 데이터베이스에서 사용자 정보 가져오기
    cursor.execute("SELECT * FROM users WHERE google_id = ?", (google_id,))
    user = cursor.fetchone()
    conn.close()

    if user is None:
        print("Error: User not found in database") # 디버깅을 위한 print 추가
        return jsonify({"error": "User not found"}), 404

    # print("User info fetched from database:", dict(user)) # 디버깅을 위한 print 추가
    return jsonify(dict(user))

@app.route('/places')
def get_places():
    conn = get_db_connection()
    cursor = conn.cursor()

    if 'logged_in' not in session:
        conn.close()
        return jsonify({'error': 'User not logged in'}), 401

    google_id = session.get('google_id')
    if not google_id:
        conn.close()
        return jsonify({'error': 'User ID not found in session'}), 401

    try:
        # 중복 제거를 위해 DISTINCT 사용하고 위도/경도로 그룹화
        cursor.execute("""
            SELECT DISTINCT latitude, longitude, MIN(place_id) as place_id,
            place_name, address, google_place_id, google_id
            FROM places 
            WHERE google_id = ?
            GROUP BY latitude, longitude
        """, (google_id,))
        
        rows = cursor.fetchall()
        print(f"Fetched unique places: {len(rows)}")

        places = []
        for row in rows:
            places.append({
                'place_id': row['place_id'],
                'google_id': row['google_id'],
                'name': row['place_name'],
                'address': row['address'],
                'latitude': row['latitude'],
                'longitude': row['longitude'],
                'google_place_id': row['google_place_id']
            })

        # 중복 데이터 정리 (선택적)
        cursor.execute("""
            DELETE FROM places 
            WHERE place_id NOT IN (
                SELECT MIN(place_id)
                FROM places
                WHERE google_id = ?
                GROUP BY latitude, longitude
            )
            AND google_id = ?
        """, (google_id, google_id))
        
        if cursor.rowcount > 0:
            print(f"Cleaned up {cursor.rowcount} duplicate entries")
            conn.commit()

        return jsonify(places)

    except Exception as e:
        print(f"Error fetching places: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# 가고 싶은 장소 추가
@app.route('/add_place', methods=['POST'])
def add_place():
    conn = get_db_connection()
    cursor = conn.cursor()

    if 'logged_in' not in session:
        conn.close()
        return jsonify({'error': 'User not logged in'}), 401

    google_id = session.get('google_id')
    if not google_id:
        conn.close()
        return jsonify({'error': 'User ID not found in session'}), 401

    data = request.get_json()
    place_name = data.get('name')
    address = data.get('address')
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    google_place_id = data.get('google_place_id')

    try:
        # 동일한 위치(위도/경도)의 장소가 이미 있는지 확인
        cursor.execute("""
            SELECT * FROM places 
            WHERE google_id = ? 
            AND latitude = ? 
            AND longitude = ?
        """, (google_id, latitude, longitude))
        
        existing_place = cursor.fetchone()
        
        if existing_place:
            conn.close()
            return jsonify({'message': 'Place already exists'}), 200
        
        # 새로운 장소 추가
        cursor.execute("""
            INSERT INTO places 
            (google_id, place_name, address, latitude, longitude, google_place_id) 
            VALUES (?, ?, ?, ?, ?, ?)
        """, (google_id, place_name, address, latitude, longitude, google_place_id))
        
        conn.commit()
        conn.close()
        return jsonify({'message': 'Place added successfully'}), 200
        
    except Exception as e:
        print(f"Error adding place: {e}")
        return jsonify({'error': 'Failed to add place'}), 500

# 가고 싶은 장소 삭제
@app.route('/remove_place/<place_id>', methods=['DELETE'])
def remove_place(place_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    # 로그인 여부 확인
    if 'logged_in' not in session:
        conn.close()
        return jsonify({'error': 'User not logged in'}), 401

    google_id = session.get('google_id')
    if not google_id:
        conn.close()
        return jsonify({'error': 'User ID not found in session'}), 401

    try:
        cursor.execute("DELETE FROM places WHERE google_id = ? AND place_id = ?", (google_id, place_id))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Place removed successfully'}), 200
    except Exception as e:
        print(f"Error removing place: {e}")
        return jsonify({'error': 'Failed to remove place'}), 500

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    session.pop('google_id', None)
    return redirect(url_for('index'))

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)