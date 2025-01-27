import os
from pathlib import Path
from dotenv import load_dotenv

# 현재 환경 변수 상태 출력
print("\n=== Before loading .env ===")
print(f"GOOGLE_API_KEY: {os.environ.get('GOOGLE_API_KEY', 'Not set')}")

# .env 파일 존재 여부 확인
env_path = Path(__file__).resolve().parent / '.env'
print(f"\n=== .env file check ===")
print(f"Looking for .env at: {env_path}")
print(f".env file exists: {env_path.exists()}")

# 가능한 모든 .env 파일 위치 검사
possible_paths = [
    Path(__file__).resolve().parent / '.env',
    Path(__file__).resolve().parent.parent / '.env',
    Path.home() / '.env',
    Path.cwd() / '.env'
]

print("\n=== Checking all possible .env locations ===")
for path in possible_paths:
    print(f"Checking {path}: {'EXISTS' if path.exists() else 'NOT FOUND'}")

# 현재 프로세스의 모든 환경 변수 출력
print("\n=== All environment variables ===")
env_vars = {key: value for key, value in os.environ.items() if 'GOOGLE' in key}
for key, value in env_vars.items():
    print(f"{key}: {value[:5]}..." if value else f"{key}: None")