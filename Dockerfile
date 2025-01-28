# Python 3.9 기반 이미지 사용
FROM python:3.9-slim

# 작업 디렉토리 설정
WORKDIR /app

# 필요한 패키지 설치
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt 복사 및 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# SQLite 데이터베이스 초기화
RUN sqlite3 travel_guide.db < schema.sql

# 포트 5000 개방
EXPOSE 5000

# 환경 변수 설정
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV GOOGLE_REDIRECT_URI=https://gainworld-travel-guide-app.fly.dev/callback
ENV PATH="/usr/local/bin:${PATH}"

# gunicorn 실행 가능한지 확인
RUN which gunicorn

# 애플리케이션 실행
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]