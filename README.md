# 📝 한줌 메모 - Chrome Extension

**중요한 정보를 간단하게 저장하고 어디서든 접근할 수 있는 크롬 확장 프로그램**

## ✨ 주요 기능

- 🗂️ **그룹별 메모 관리**: 카테고리별로 메모를 체계적으로 관리
- 📌 **메모 고정**: 중요한 메모를 상단에 고정
- 🔍 **실시간 검색**: 메모 내용을 빠르게 검색
- ☁️ **클라우드 동기화**: Supabase를 통한 구글 계정 연동
- 🌐 **멀티 디바이스 지원**: 어느 기기에서든 동일한 구글 계정으로 접근 가능
- 🎨 **현대적 UI**: 깔끔하고 사용하기 쉬운 인터페이스

## 🚀 설치 및 설정

### 1. 프로젝트 클론

```bash
git clone <your-repository-url>
cd chrome-extension-hanjum-memo
```

### 2. Supabase 프로젝트 설정

#### 2.1 Supabase 프로젝트 생성
1. [Supabase](https://supabase.com) 가입 및 로그인
2. 새 프로젝트 생성
3. 프로젝트 URL과 API Key 확인

#### 2.2 데이터베이스 테이블 생성

Supabase SQL Editor에서 다음 쿼리를 실행하세요:

```sql
-- 메모 그룹 테이블
CREATE TABLE memo_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 메모 테이블
CREATE TABLE memos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    content TEXT NOT NULL,
    group_id UUID REFERENCES memo_groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX idx_memo_groups_user_id ON memo_groups(user_id);
CREATE INDEX idx_memos_user_id ON memos(user_id);
CREATE INDEX idx_memos_group_id ON memos(group_id);
CREATE INDEX idx_memos_pinned ON memos(pinned);

-- RLS (Row Level Security) 정책 설정
ALTER TABLE memo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;

-- 그룹 정책
CREATE POLICY "Users can view their own groups" ON memo_groups
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own groups" ON memo_groups
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own groups" ON memo_groups
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own groups" ON memo_groups
    FOR DELETE USING (auth.uid() = user_id);

-- 메모 정책
CREATE POLICY "Users can view their own memos" ON memos
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memos" ON memos
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memos" ON memos
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own memos" ON memos
    FOR DELETE USING (auth.uid() = user_id);

-- 트리거 함수 (updated_at 자동 업데이트)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
CREATE TRIGGER update_memo_groups_updated_at 
    BEFORE UPDATE ON memo_groups 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memos_updated_at 
    BEFORE UPDATE ON memos 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### 2.3 Google OAuth 설정
1. Supabase 대시보드 → Authentication → Providers
2. Google 활성화
3. Google Cloud Console에서 OAuth 2.0 클라이언트 ID 생성
4. Authorized redirect URIs에 Supabase callback URL 추가

### 3. 확장 프로그램 설정

#### 3.1 Supabase 연결 정보 설정

`popup.js` 파일에서 다음 부분을 수정하세요:

```javascript
// Supabase 설정
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

#### 3.2 아이콘 추가

`icons/` 폴더에 다음 크기의 아이콘 파일을 추가하세요:
- `icon16.png` (16x16px)
- `icon32.png` (32x32px)
- `icon48.png` (48x48px)
- `icon128.png` (128x128px)

### 4. Chrome에 확장 프로그램 로드

1. Chrome 브라우저에서 `chrome://extensions/` 접속
2. "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. 프로젝트 폴더 선택

## 📖 사용법

### 기본 사용법

1. **로그인**: 확장 프로그램 아이콘 클릭 후 Google 계정으로 로그인
2. **그룹 생성**: "그룹 추가" 버튼으로 새 그룹 생성
3. **메모 작성**: 텍스트 영역에 메모 입력 후 "메모 추가" 클릭
4. **메모 관리**: 각 메모의 📌(고정), 🗑️(삭제) 버튼 활용

### 고급 기능

- **메모 검색**: 검색창에 키워드 입력으로 실시간 검색
- **메모 고정**: 📌 버튼으로 중요한 메모를 상단에 고정
- **단축키**: `Ctrl + Enter`로 빠른 메모 추가
- **컨텍스트 메뉴**: 웹페이지에서 텍스트 선택 후 우클릭으로 바로 저장

## 🔧 개발 정보

### 프로젝트 구조

```
chrome-extension-hanjum-memo/
├── manifest.json          # 확장 프로그램 설정
├── popup.html             # 팝업 UI
├── popup.css              # 스타일시트
├── popup.js               # 메인 로직
├── background.js          # 백그라운드 스크립트
├── icons/                 # 아이콘 파일들
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # 이 파일
```

### 기술 스택

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Supabase (PostgreSQL)
- **인증**: Google OAuth 2.0
- **API**: Supabase REST API
- **플랫폼**: Chrome Extension Manifest V3

### 주요 API

- **Chrome Extension APIs**:
  - `chrome.storage`: 로컬 데이터 저장
  - `chrome.runtime`: 메시지 통신
  - `chrome.contextMenus`: 우클릭 메뉴
  - `chrome.action`: 확장 프로그램 아이콘

- **Supabase APIs**:
  - Authentication API
  - Database REST API
  - Real-time subscriptions

## 🔐 보안 고려사항

1. **Row Level Security (RLS)**: 사용자별 데이터 격리
2. **OAuth 인증**: 안전한 Google 계정 연동
3. **HTTPS 통신**: 모든 API 통신 암호화
4. **Content Security Policy**: XSS 공격 방지

## 🐛 문제 해결

### 자주 발생하는 문제

#### 1. 로그인이 안 되는 경우
- Supabase 프로젝트 URL과 API Key 확인
- Google OAuth 설정 확인
- 브라우저 팝업 차단 해제

#### 2. 데이터가 동기화되지 않는 경우
- 인터넷 연결 상태 확인
- Supabase 프로젝트 상태 확인
- 브라우저 개발자 도구에서 콘솔 오류 확인

#### 3. 확장 프로그램이 로드되지 않는 경우
- `manifest.json` 파일 문법 오류 확인
- 필수 파일 존재 여부 확인
- Chrome 개발자 모드 활성화 확인

### 디버깅

1. 브라우저 개발자 도구 열기
2. Extensions 탭에서 확장 프로그램 찾기
3. "inspect views: popup" 클릭
4. Console 탭에서 오류 메시지 확인

## 📝 라이센스

이 프로젝트는 MIT 라이센스 하에 배포됩니다.

## 🤝 기여하기

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📧 문의

프로젝트에 대한 문의사항이나 버그 리포트는 GitHub Issues를 이용해 주세요.

---

**한줌 메모**로 더 체계적이고 효율적인 메모 관리를 경험해보세요! 🚀 