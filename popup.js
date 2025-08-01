// Supabase 설정 (실제 사용 시 환경변수로 관리해야 함)
const SUPABASE_URL = 'https://afijdjuakyhnfnlllxcs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmaWpkanVha3lobmZubGxseGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwMjE3NDksImV4cCI6MjA2NjU5Nzc0OX0.bE8OmYJoZFcb-AnvRzFQA0DFWlRN_enjPevMy5qKQ_Y';

// 오프라인 모드 확인
const IS_OFFLINE_MODE = SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY';

class HanjumMemo {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.currentGroup = null;
        this.memos = [];
        this.groups = [];
        this.searchTerm = '';
        this.isOfflineMode = IS_OFFLINE_MODE;
        
        // 성능 관련 설정
        this.performanceConfig = {
            searchDebounceTime: 300,
            virtualScrollThreshold: 50,
            animationsEnabled: true,
            performanceLogging: false // 개발 시에만 true로 설정
        };
        
        this.init();
    }

    async init() {
        try {
            // 이벤트 리스너 등록
            this.bindEvents();
            
            // 저장된 인증 정보 확인 (이 과정에서 오프라인/온라인 모드 결정)
            await this.checkAuth();
            
            console.log('한줌 메모 초기화 완료 (' + (this.isOfflineMode ? '오프라인' : '온라인') + ' 모드)');
        } catch (error) {
            console.error('초기화 오류:', error);
            this.showError('초기화 중 오류가 발생했습니다: ' + error.message);
        }
    }

    // Supabase 클라이언트 초기화 (필요한 경우에만)
    initializeSupabase() {
        if (!this.supabase && !this.isOfflineMode) {
            console.log('Supabase 클라이언트 초기화');
            this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
    }

    bindEvents() {

        // 그룹 관리
        document.getElementById('groupSelect').addEventListener('change', (e) => this.selectGroup(e.target.value));
        document.getElementById('addGroupBtn').addEventListener('click', () => this.showAddGroupForm());
        document.getElementById('deleteGroupBtn').addEventListener('click', () => this.deleteGroup());
        document.getElementById('saveGroupBtn').addEventListener('click', () => this.saveGroup());
        document.getElementById('cancelGroupBtn').addEventListener('click', () => this.hideAddGroupForm());

        // 검색 (디바운싱 적용)
        document.getElementById('searchInput').addEventListener('input', (e) => this.debouncedSearch(e.target.value));
        document.getElementById('clearSearchBtn').addEventListener('click', () => this.clearSearch());

        // 메모 관리
        document.getElementById('addMemoBtn').addEventListener('click', () => this.addMemo());
        document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAllMemos());
        document.getElementById('memoInput').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.addMemo();
            }
        });

        // 내보내기/불러오기
        document.getElementById('exportBtn').addEventListener('click', () => this.showExportImportSection());
        document.getElementById('closeExportImportBtn').addEventListener('click', () => this.hideExportImportSection());
        document.getElementById('quickCloseBtn').addEventListener('click', () => this.hideExportImportSection());
        document.getElementById('executeExportBtn').addEventListener('click', () => this.executeExport());
        document.getElementById('selectFileBtn').addEventListener('click', () => this.selectImportFile());
        document.getElementById('executeImportBtn').addEventListener('click', () => this.executeImport());
        document.getElementById('importFileInput').addEventListener('change', (e) => this.handleFileSelect(e));

        // 페이지 언로드 시 정리 작업
        window.addEventListener('beforeunload', () => this.cleanup());
        window.addEventListener('unload', () => this.cleanup());
    }

    async checkAuth() {
        try {
            if (this.isOfflineMode) {
                // 오프라인 모드: Chrome Google 계정 자동 감지
                await this.detectChromeGoogleAccount();
                return;
            }

            // 온라인 모드: Chrome Google 계정으로 Supabase 자동 로그인
            await this.autoLoginWithChromeAccount();
            
        } catch (error) {
            console.error('인증 확인 오류:', error);
            this.showError('계정 확인 중 오류가 발생했습니다: ' + error.message);
        }
    }

    // Chrome Google 계정 자동 감지 (OAuth 없이)
    async detectChromeGoogleAccount() {
        return new Promise((resolve) => {
            chrome.identity.getProfileUserInfo((userInfo) => {
                if (userInfo && userInfo.email) {
                    console.log('Chrome Google 계정 감지:', userInfo.email);
                    
                    // 가상 사용자 객체 생성
                    this.currentUser = {
                        id: `chrome-${btoa(userInfo.email)}`, // Base64로 인코딩된 이메일을 ID로 사용
                        email: userInfo.email,
                        name: userInfo.email.split('@')[0], // 이메일에서 이름 추출
                        provider: 'chrome-google'
                    };

                    this.showAuthenticatedState();
                    this.loadUserData();
                    resolve();
                } else {
                    console.log('Chrome Google 계정을 찾을 수 없습니다');
                    
                    // Google 계정이 없으면 익명 사용자로 처리
                    this.currentUser = {
                        id: 'anonymous-user',
                        email: 'anonymous@local.chrome',
                        name: '익명 사용자',
                        provider: 'anonymous'
                    };

                    this.showAuthenticatedState();
                    this.loadUserData();
                    resolve();
                }
            });
        });
    }

    // Chrome Google 계정으로 Supabase 자동 로그인
    async autoLoginWithChromeAccount() {
        return new Promise((resolve, reject) => {
            chrome.identity.getProfileUserInfo(async (userInfo) => {
                try {
                    if (userInfo && userInfo.email) {
                        console.log('Chrome Google 계정으로 Supabase 로그인:', userInfo.email);
                        
                        // Supabase 클라이언트 초기화
                        this.initializeSupabase();
                        
                        await this.loginWithChromeGoogleAccount(userInfo);
                        resolve();
                    } else {
                        console.log('Chrome Google 계정이 없습니다. 익명 모드로 전환합니다.');
                        
                        // Chrome에 Google 계정이 없으면 오프라인 모드로 전환
                        this.isOfflineMode = true;
                        await this.detectChromeGoogleAccount();
                        resolve();
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    // Chrome Google 계정 정보로 Supabase 로그인/가입 처리
    async loginWithChromeGoogleAccount(userInfo) {
        try {
            const email = userInfo.email;
            const fixedPassword = 'chrome-google-sso-' + btoa(email); // 이메일 기반 고정 패스워드

            // 기존 사용자 로그인 시도
            let { data: loginData, error: loginError } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: fixedPassword
            });

            if (!loginError && loginData.user) {
                // 로그인 성공
                this.currentUser = loginData.user;
                this.showAuthenticatedState();
                await this.loadUserData();
                console.log('기존 Chrome Google 사용자 로그인 완료:', email);
                return;
            }

            // 로그인 실패 시 새 사용자 생성
            console.log('새 Chrome Google 사용자 생성:', email);
            
            const { data: signUpData, error: signUpError } = await this.supabase.auth.signUp({
                email: email,
                password: fixedPassword,
                options: {
                    data: {
                        name: email.split('@')[0],
                        provider: 'chrome-google'
                    }
                }
            });

            if (signUpError) {
                throw signUpError;
            }

            // 새 사용자 생성 완료
            this.currentUser = signUpData.user;
            this.showAuthenticatedState();
            await this.loadUserData();
            console.log('새 Chrome Google 사용자 생성 완료:', email);

        } catch (error) {
            console.error('Chrome Google 계정 Supabase 처리 오류:', error);
            
            // Supabase 연동 실패 시 오프라인 모드로 fallback
            console.log('Supabase 연동 실패, 오프라인 모드로 전환');
            this.isOfflineMode = true;
            this.supabase = null; // Supabase 인스턴스 정리
            await this.detectChromeGoogleAccount();
        }
    }

    // Chrome Google 계정으로 자동 로그인 시도
    async tryAutoLogin() {
        try {
            console.log('Chrome Google 계정으로 자동 로그인 시도...');
            
            // Chrome에서 Google 토큰 획득 (사용자 상호작용 없이)
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ 
                    interactive: false  // 팝업 없이 시도
                }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(token);
                    }
                });
            });

            if (token) {
                await this.authenticateWithGoogleToken(token);
            } else {
                // 토큰이 없으면 로그인 버튼 표시
                this.showUnauthenticatedState();
            }

        } catch (error) {
            console.log('자동 로그인 실패:', error.message);
            // 자동 로그인이 실패해도 수동 로그인 옵션 제공
            this.showUnauthenticatedState();
        }
    }

    // Google 토큰으로 Supabase 인증
    async authenticateWithGoogleToken(token) {
        try {
            // Google API에서 사용자 정보 획득
            const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${token}`);
            const userInfo = await response.json();

            if (!userInfo.email) {
                throw new Error('Google 사용자 정보를 가져올 수 없습니다');
            }

            console.log('Google 사용자 정보:', userInfo.email);

            // Supabase에 Google 토큰으로 로그인
            const { data, error } = await this.supabase.auth.signInWithIdToken({
                provider: 'google',
                token: token
            });

            if (error) {
                // ID 토큰이 작동하지 않으면 이메일 기반 로그인으로 대체
                console.log('ID 토큰 로그인 실패, 이메일 기반 처리:', error.message);
                await this.handleGoogleUserWithEmail(userInfo, token);
                return;
            }

            // 로그인 성공
            this.currentUser = data.user;
            this.showAuthenticatedState();
            await this.loadUserData();
            this.showSuccess(`환영합니다, ${userInfo.name || userInfo.email}님!`);

        } catch (error) {
            console.error('Google 토큰 인증 오류:', error);
            throw error;
        }
    }

    // Google 사용자 정보로 이메일 기반 처리
    async handleGoogleUserWithEmail(userInfo, token) {
        try {
            // 기존 사용자인지 확인
            const { data: existingUser, error: signInError } = await this.supabase.auth.signInWithPassword({
                email: userInfo.email,
                password: 'google-sso-user' // 고정 패스워드 (Google SSO 사용자 식별용)
            });

            if (!signInError) {
                // 기존 사용자 로그인 성공
                this.currentUser = existingUser.user;
                this.showAuthenticatedState();
                await this.loadUserData();
                this.showSuccess(`환영합니다, ${userInfo.name || userInfo.email}님!`);
                return;
            }

            // 새 사용자 생성
            const { data: newUser, error: signUpError } = await this.supabase.auth.signUp({
                email: userInfo.email,
                password: 'google-sso-user',
                options: {
                    data: {
                        name: userInfo.name,
                        avatar_url: userInfo.picture,
                        provider: 'google'
                    }
                }
            });

            if (signUpError) {
                throw signUpError;
            }

            this.currentUser = newUser.user;
            this.showAuthenticatedState();
            await this.loadUserData();
            this.showSuccess(`환영합니다, ${userInfo.name || userInfo.email}님! 계정이 생성되었습니다.`);

        } catch (error) {
            console.error('이메일 기반 Google 사용자 처리 오류:', error);
            throw error;
        }
    }

    // Google 로그인 시도 (수동)
    async showLoginForm() {
        if (this.isOfflineMode) {
            this.showInfo('오프라인 모드에서는 로그인이 필요하지 않습니다. Supabase를 설정하여 온라인 동기화를 사용하세요.');
            return;
        }

        try {
            this.showLoading(true);
            console.log('사용자가 Google 로그인 버튼 클릭');

            // Chrome Google 계정으로 로그인 (사용자 상호작용 포함)
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ 
                    interactive: true  // 필요시 팝업 표시
                }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(token);
                    }
                });
            });

            if (token) {
                await this.authenticateWithGoogleToken(token);
            } else {
                this.showError('Google 로그인이 취소되었습니다.');
            }

        } catch (error) {
            console.error('Google 로그인 오류:', error);
            this.showError('Google 로그인 중 오류가 발생했습니다: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    // 로그인 폼 숨기기
    hideLoginForm() {
        document.getElementById('loginForm').style.display = 'none';
        this.clearLoginForm();
    }

    // 회원가입 폼 표시
    showSignupForm() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('signupForm').style.display = 'block';
        document.getElementById('signupEmailInput').focus();
    }

    // 회원가입 폼 숨기기
    hideSignupForm() {
        document.getElementById('signupForm').style.display = 'none';
        this.clearSignupForm();
    }

    // 폼 초기화
    clearLoginForm() {
        document.getElementById('emailInput').value = '';
        document.getElementById('passwordInput').value = '';
    }

    clearSignupForm() {
        document.getElementById('signupEmailInput').value = '';
        document.getElementById('signupPasswordInput').value = '';
        document.getElementById('confirmPasswordInput').value = '';
    }

    // 이메일로 로그인
    async signIn() {
        const email = document.getElementById('emailInput').value.trim();
        const password = document.getElementById('passwordInput').value;

        if (!email || !password) {
            this.showError('이메일과 패스워드를 입력해주세요.');
            return;
        }

        try {
            this.showLoading(true);

            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            this.currentUser = data.user;
            this.showAuthenticatedState();
            await this.loadUserData();
            this.hideLoginForm();
            this.showSuccess(`환영합니다, ${data.user.email}님!`);

        } catch (error) {
            console.error('로그인 오류:', error);
            
            // 구체적인 오류 메시지 제공
            let errorMessage = '로그인 실패: ';
            if (error.message.includes('Invalid login credentials')) {
                errorMessage += '이메일 또는 패스워드가 올바르지 않습니다. 회원가입을 먼저 해주세요.';
            } else if (error.message.includes('Email not confirmed')) {
                errorMessage += '이메일 확인이 필요합니다. 이메일을 확인해주세요.';
            } else {
                errorMessage += error.message;
            }
            
            this.showError(errorMessage);
        } finally {
            this.showLoading(false);
        }
    }

    // 회원가입
    async signUp() {
        const email = document.getElementById('signupEmailInput').value.trim();
        const password = document.getElementById('signupPasswordInput').value;
        const confirmPassword = document.getElementById('confirmPasswordInput').value;

        if (!email || !password || !confirmPassword) {
            this.showError('모든 필드를 입력해주세요.');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('패스워드가 일치하지 않습니다.');
            return;
        }

        if (password.length < 6) {
            this.showError('패스워드는 6자 이상이어야 합니다.');
            return;
        }

        try {
            this.showLoading(true);

            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password
            });

            if (error) throw error;

            this.hideSignupForm();
            
            if (data.user && !data.session) {
                // 이메일 확인이 필요한 경우
                this.showSuccess(`회원가입이 완료되었습니다! ${email}로 확인 이메일이 발송되었습니다. 이메일 확인 후 로그인해주세요.`);
            } else if (data.session) {
                // 바로 로그인된 경우 (이메일 확인 비활성화)
                this.currentUser = data.user;
                this.showAuthenticatedState();
                await this.loadUserData();
                this.showSuccess(`회원가입과 로그인이 완료되었습니다! 환영합니다, ${data.user.email}님!`);
            } else {
                this.showSuccess(`회원가입이 완료되었습니다! 이제 로그인해주세요.`);
            }

        } catch (error) {
            console.error('회원가입 오류:', error);
            
            // 구체적인 오류 메시지 제공
            let errorMessage = '회원가입 실패: ';
            if (error.message.includes('User already registered')) {
                errorMessage += '이미 가입된 이메일입니다. 로그인을 시도해주세요.';
            } else if (error.message.includes('Password should be at least')) {
                errorMessage += '패스워드는 6자 이상이어야 합니다.';
            } else if (error.message.includes('Invalid email')) {
                errorMessage += '올바른 이메일 형식을 입력해주세요.';
            } else {
                errorMessage += error.message;
            }
            
            this.showError(errorMessage);
        } finally {
            this.showLoading(false);
        }
    }

    // Google OAuth 로그인 (나중에 사용)
    async loginWithGoogle() {
        try {
            this.showLoading(true);
            
            // Chrome 확장 프로그램용 OAuth URL 생성
            const { data, error } = await this.supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${chrome.runtime.getURL('popup.html')}`,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                }
            });

            if (error) throw error;

            // 새 탭에서 OAuth 진행
            if (data?.url) {
                const authTab = await chrome.tabs.create({ 
                    url: data.url,
                    active: true 
                });

                this.monitorAuthTab(authTab.id);
                this.showInfo('Google 로그인 창에서 인증을 완료해주세요.');
            }
            
        } catch (error) {
            console.error('Google 로그인 오류:', error);
            this.showError('Google 로그인 중 오류가 발생했습니다: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    // 인증 탭 모니터링
    monitorAuthTab(tabId) {
        const checkAuthStatus = async () => {
            try {
                const { data: { session } } = await this.supabase.auth.getSession();
                if (session) {
                    // 로그인 성공
                    this.currentUser = session.user;
                    this.showAuthenticatedState();
                    await this.loadUserData();
                    this.showSuccess('로그인이 완료되었습니다!');
                    
                    // 인증 탭 닫기
                    try {
                        await chrome.tabs.remove(tabId);
                    } catch (e) {
                        // 탭이 이미 닫혔을 수 있음
                    }
                    return;
                }
            } catch (error) {
                console.log('인증 상태 확인 중...', error);
            }

            // 1초 후 다시 확인
            setTimeout(checkAuthStatus, 1000);
        };

        // 탭 변경 감지
        chrome.tabs.onUpdated.addListener((updatedTabId, changeInfo, tab) => {
            if (updatedTabId === tabId && changeInfo.url) {
                // Supabase 콜백 URL 감지
                if (changeInfo.url.includes(chrome.runtime.getURL('popup.html')) && 
                    changeInfo.url.includes('access_token')) {
                    checkAuthStatus();
                }
            }
        });

        // 탭이 닫히면 모니터링 중단
        chrome.tabs.onRemoved.addListener((removedTabId) => {
            if (removedTabId === tabId) {
                this.showInfo('로그인이 취소되었습니다.');
            }
        });

        // 주기적 인증 상태 확인 시작
        setTimeout(checkAuthStatus, 2000);
    }

    async logout() {
        try {
            if (this.isOfflineMode) {
                this.showInfo('오프라인 모드에서는 로그아웃이 필요하지 않습니다.');
                return;
            }

            this.showLoading(true);

            // Supabase 로그아웃
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;

            // Chrome Identity 토큰 제거
            try {
                const token = await new Promise((resolve, reject) => {
                    chrome.identity.getAuthToken({ interactive: false }, (token) => {
                        if (chrome.runtime.lastError) {
                            resolve(null);
                        } else {
                            resolve(token);
                        }
                    });
                });

                if (token) {
                    chrome.identity.removeCachedAuthToken({ token: token }, () => {
                        console.log('Chrome 인증 토큰 제거 완료');
                    });
                }
            } catch (error) {
                console.log('Chrome 토큰 제거 중 오류 (무시됨):', error.message);
            }

            // 상태 초기화
            this.currentUser = null;
            this.currentGroup = null;
            this.memos = [];
            this.groups = [];
            
            this.showUnauthenticatedState();
            this.clearUI();
            this.showSuccess('로그아웃되었습니다.');
            
        } catch (error) {
            console.error('로그아웃 오류:', error);
            this.showError('로그아웃 중 오류가 발생했습니다.');
        } finally {
            this.showLoading(false);
        }
    }

    showAuthenticatedState() {
        const userInfo = document.getElementById('userInfo');
        const displayName = this.currentUser?.name || this.currentUser?.email || '사용자';
        
        if (this.currentUser?.provider === 'chrome-google') {
            userInfo.textContent = `👤 ${displayName}`;
        } else if (this.currentUser?.provider === 'anonymous') {
            userInfo.textContent = `👤 ${displayName} (로컬)`;
        } else {
            userInfo.textContent = `👤 ${displayName}`;
        }
        
        userInfo.style.display = 'inline';
        console.log('사용자 인증 상태 표시:', displayName);
    }

    showUnauthenticatedState() {
        const userInfo = document.getElementById('userInfo');
        userInfo.textContent = '❌ 계정을 확인할 수 없습니다';
        userInfo.style.display = 'inline';
    }

    async loadUserData() {
        try {
            await this.loadGroups();
            if (this.groups.length > 0) {
                this.currentGroup = this.groups[0].id;
                document.getElementById('groupSelect').value = this.currentGroup;
                await this.loadMemos();
            }
        } catch (error) {
            console.error('사용자 데이터 로드 오류:', error);
            this.showError('데이터를 불러오는 중 오류가 발생했습니다.');
        }
    }

    async loadGroups() {
        try {
            if (this.isOfflineMode) {
                // 오프라인 모드: Chrome storage 사용
                const result = await chrome.storage.local.get(['groups']);
                this.groups = result.groups || [
                    { id: 'default', name: '기본 그룹', user_id: 'offline-user', created_at: new Date().toISOString() }
                ];
                this.updateGroupSelect();
                return;
            }

            const { data, error } = await this.supabase
                .from('memo_groups')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: true });

            if (error) throw error;

            this.groups = data || [];
            this.updateGroupSelect();
            
        } catch (error) {
            console.error('그룹 로드 오류:', error);
            throw error;
        }
    }

    updateGroupSelect() {
        const select = document.getElementById('groupSelect');
        select.innerHTML = '<option value="">그룹 선택</option>';
        
        this.groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            select.appendChild(option);
        });
    }

    showAddGroupForm() {
        document.getElementById('addGroupForm').style.display = 'block';
        document.getElementById('groupNameInput').focus();
    }

    hideAddGroupForm() {
        document.getElementById('addGroupForm').style.display = 'none';
        document.getElementById('groupNameInput').value = '';
    }

    async saveGroup() {
        const groupName = document.getElementById('groupNameInput').value.trim();
        
        if (!groupName) {
            this.showError('그룹명을 입력해주세요.');
            return;
        }

        if (!this.currentUser) {
            this.showError('로그인이 필요합니다.');
            return;
        }

        try {
            this.showLoading(true);

            let newGroupId = null;

            if (this.isOfflineMode) {
                // 오프라인 모드: Chrome storage 사용
                const newGroup = {
                    id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: groupName,
                    user_id: this.currentUser.id,
                    created_at: new Date().toISOString()
                };

                // 기존 그룹 목록에 추가
                const result = await chrome.storage.local.get(['groups']);
                const groups = result.groups || [];
                groups.push(newGroup);
                await chrome.storage.local.set({ groups: groups });

                newGroupId = newGroup.id;
            } else {
                // 온라인 모드: Supabase 사용
                const { data, error } = await this.supabase
                    .from('memo_groups')
                    .insert([
                        {
                            name: groupName,
                            user_id: this.currentUser.id
                        }
                    ])
                    .select();

                if (error) throw error;
                
                if (data && data[0]) {
                    newGroupId = data[0].id;
                }
            }

            await this.loadGroups();
            this.hideAddGroupForm();
            this.showSuccess('그룹이 추가되었습니다.');
            
            // 새로 생성된 그룹 선택
            if (newGroupId) {
                this.selectGroup(newGroupId);
            }
            
        } catch (error) {
            console.error('그룹 저장 오류:', error);
            this.showError('그룹 저장 중 오류가 발생했습니다.');
        } finally {
            this.showLoading(false);
        }
    }

    async deleteGroup() {
        if (!this.currentGroup) {
            this.showError('삭제할 그룹을 선택해주세요.');
            return;
        }

        const groupName = this.groups.find(g => g.id === this.currentGroup)?.name;
        
        if (!confirm(`"${groupName}" 그룹과 모든 메모를 삭제하시겠습니까?`)) {
            return;
        }

        try {
            this.showLoading(true);

            if (this.isOfflineMode) {
                // 오프라인 모드: Chrome storage 사용
                
                // 1. 그룹의 메모들 삭제
                const memoStorageKey = `memos_${this.currentGroup}`;
                await chrome.storage.local.remove([memoStorageKey]);

                // 2. 그룹 목록에서 제거
                const result = await chrome.storage.local.get(['groups']);
                const groups = result.groups || [];
                const filteredGroups = groups.filter(g => g.id !== this.currentGroup);
                await chrome.storage.local.set({ groups: filteredGroups });

            } else {
                // 온라인 모드: Supabase 사용
                
                // 그룹의 모든 메모 삭제
                await this.supabase
                    .from('memos')
                    .delete()
                    .eq('group_id', this.currentGroup);

                // 그룹 삭제
                const { error } = await this.supabase
                    .from('memo_groups')
                    .delete()
                    .eq('id', this.currentGroup);

                if (error) throw error;
            }

            await this.loadGroups();
            this.currentGroup = null;
            this.memos = [];
            this.updateMemoList();
            document.getElementById('groupSelect').value = '';
            this.showSuccess('그룹이 삭제되었습니다.');
            
        } catch (error) {
            console.error('그룹 삭제 오류:', error);
            this.showError('그룹 삭제 중 오류가 발생했습니다.');
        } finally {
            this.showLoading(false);
        }
    }

    async selectGroup(groupId) {
        this.currentGroup = groupId;
        if (groupId) {
            await this.loadMemos();
        } else {
            // 전체 메모 보기
            await this.loadAllMemos();
        }
    }

    // 전체 메모 로드 (모든 그룹의 메모들)
    async loadAllMemos() {
        try {
            this.memos = [];
            
            if (this.isOfflineMode) {
                // 오프라인 모드: 모든 그룹의 메모들 수집
                for (const group of this.groups) {
                    const storageKey = `memos_${group.id}`;
                    const result = await chrome.storage.local.get([storageKey]);
                    const groupMemos = result[storageKey] || [];
                    
                    // 각 메모에 그룹 정보 추가
                    const memosWithGroup = groupMemos.map(memo => ({
                        ...memo,
                        group_name: group.name
                    }));
                    
                    this.memos.push(...memosWithGroup);
                }
            } else {
                // 온라인 모드: Supabase에서 모든 메모 가져오기
                const { data, error } = await this.supabase
                    .from('memos')
                    .select(`
                        *,
                        memo_groups!inner(name)
                    `)
                    .eq('user_id', this.currentUser.id)
                    .order('pinned', { ascending: false })
                    .order('created_at', { ascending: false });

                if (error) throw error;

                // 메모에 그룹명 추가
                this.memos = (data || []).map(memo => ({
                    ...memo,
                    group_name: memo.memo_groups.name
                }));
            }

            // 고정된 메모를 먼저, 그 다음 최신순으로 정렬
            this.memos.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return new Date(b.created_at) - new Date(a.created_at);
            });

            this.updateMemoList();
            
        } catch (error) {
            console.error('전체 메모 로드 오류:', error);
            this.showError('전체 메모를 불러오는 중 오류가 발생했습니다.');
        }
    }

    async loadMemos() {
        if (!this.currentGroup) return;

        try {
            if (this.isOfflineMode) {
                // 오프라인 모드: Chrome storage 사용
                const storageKey = `memos_${this.currentGroup}`;
                const result = await chrome.storage.local.get([storageKey]);
                this.memos = result[storageKey] || [];
                this.updateMemoList();
                return;
            }

            const { data, error } = await this.supabase
                .from('memos')
                .select('*')
                .eq('group_id', this.currentGroup)
                .order('pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.memos = data || [];
            this.updateMemoList();
            
        } catch (error) {
            console.error('메모 로드 오류:', error);
            this.showError('메모를 불러오는 중 오류가 발생했습니다.');
        }
    }

    async addMemo() {
        const content = document.getElementById('memoInput').value.trim();
        
        if (!content) {
            this.showError('메모 내용을 입력해주세요.');
            return;
        }

        if (!this.currentGroup) {
            this.showError('그룹을 선택해주세요.');
            return;
        }

        try {
            this.showLoading(true);

            if (this.isOfflineMode) {
                // 오프라인 모드: Chrome storage 사용
                const newMemo = {
                    id: Date.now().toString(),
                    content: content,
                    group_id: this.currentGroup,
                    user_id: this.currentUser.id,
                    pinned: false,
                    created_at: new Date().toISOString()
                };

                const storageKey = `memos_${this.currentGroup}`;
                const result = await chrome.storage.local.get([storageKey]);
                const memos = result[storageKey] || [];
                memos.unshift(newMemo);
                
                await chrome.storage.local.set({ [storageKey]: memos });
                
                // 성능 최적화: 전체 리로드 대신 새 메모만 추가
                this.memos.unshift(newMemo);
                this.addMemoToDOM(newMemo);
                this.updateMemoCount();
                
                document.getElementById('memoInput').value = '';
                this.showSuccess('메모가 추가되었습니다.');
                return;
            }

            const { data, error } = await this.supabase
                .from('memos')
                .insert([
                    {
                        content: content,
                        group_id: this.currentGroup,
                        user_id: this.currentUser.id,
                        pinned: false
                    }
                ])
                .select();

            if (error) throw error;

            // 성능 최적화: 전체 리로드 대신 새 메모만 추가
            if (data && data[0]) {
                const newMemo = data[0];
                this.memos.unshift(newMemo);
                this.addMemoToDOM(newMemo);
                this.updateMemoCount();
            }

            document.getElementById('memoInput').value = '';
            this.showSuccess('메모가 추가되었습니다.');
            
        } catch (error) {
            console.error('메모 추가 오류:', error);
            this.showError('메모 추가 중 오류가 발생했습니다.');
        } finally {
            this.showLoading(false);
        }
    }

    async deleteMemo(memoId) {
        if (!confirm('이 메모를 삭제하시겠습니까?')) {
            return;
        }

        try {
            if (this.isOfflineMode) {
                // 오프라인 모드: Chrome storage 사용
                const memo = this.memos.find(m => m.id === memoId);
                if (!memo) return;
                
                const storageKey = `memos_${memo.group_id}`;
                const result = await chrome.storage.local.get([storageKey]);
                const memos = result[storageKey] || [];
                const filteredMemos = memos.filter(m => m.id !== memoId);
                
                await chrome.storage.local.set({ [storageKey]: filteredMemos });
                
                // 현재 보기 모드에 따라 메모 다시 로드
                if (this.currentGroup) {
                    await this.loadMemos();
                } else {
                    await this.loadAllMemos();
                }
                this.showSuccess('메모가 삭제되었습니다.');
                return;
            }

            const { error } = await this.supabase
                .from('memos')
                .delete()
                .eq('id', memoId);

            if (error) throw error;

            // 현재 보기 모드에 따라 메모 다시 로드
            if (this.currentGroup) {
                await this.loadMemos();
            } else {
                await this.loadAllMemos();
            }
            this.showSuccess('메모가 삭제되었습니다.');
            
        } catch (error) {
            console.error('메모 삭제 오류:', error);
            this.showError('메모 삭제 중 오류가 발생했습니다.');
        }
    }

    async togglePin(memoId, currentPinned) {
        try {
            if (this.isOfflineMode) {
                // 오프라인 모드: Chrome storage 사용
                const memo = this.memos.find(m => m.id === memoId);
                if (!memo) return;
                
                const storageKey = `memos_${memo.group_id}`;
                const result = await chrome.storage.local.get([storageKey]);
                const memos = result[storageKey] || [];
                const updatedMemos = memos.map(m => 
                    m.id === memoId ? { ...m, pinned: !currentPinned } : m
                );
                
                await chrome.storage.local.set({ [storageKey]: updatedMemos });
                
                // 현재 보기 모드에 따라 메모 다시 로드
                if (this.currentGroup) {
                    await this.loadMemos();
                } else {
                    await this.loadAllMemos();
                }
                return;
            }

            const { error } = await this.supabase
                .from('memos')
                .update({ pinned: !currentPinned })
                .eq('id', memoId);

            if (error) throw error;

            // 현재 보기 모드에 따라 메모 다시 로드
            if (this.currentGroup) {
                await this.loadMemos();
            } else {
                await this.loadAllMemos();
            }
            
        } catch (error) {
            console.error('핀 토글 오류:', error);
            this.showError('핀 설정 중 오류가 발생했습니다.');
        }
    }

    async clearAllMemos() {
        let confirmMessage;
        
        if (!this.currentGroup) {
            // 전체 메모 보기 모드
            confirmMessage = '모든 그룹의 모든 메모를 삭제하시겠습니까?';
        } else {
            // 특정 그룹 선택 모드
            const groupName = this.groups.find(g => g.id === this.currentGroup)?.name;
            confirmMessage = `"${groupName}" 그룹의 모든 메모를 삭제하시겠습니까?`;
        }

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            this.showLoading(true);

            if (this.isOfflineMode) {
                // 오프라인 모드
                if (!this.currentGroup) {
                    // 모든 그룹의 메모 삭제
                    const keys = this.groups.map(group => `memos_${group.id}`);
                    await chrome.storage.local.remove(keys);
                } else {
                    // 특정 그룹의 메모만 삭제
                    const storageKey = `memos_${this.currentGroup}`;
                    await chrome.storage.local.remove([storageKey]);
                }
            } else {
                // 온라인 모드
                if (!this.currentGroup) {
                    // 모든 메모 삭제
                    const { error } = await this.supabase
                        .from('memos')
                        .delete()
                        .eq('user_id', this.currentUser.id);

                    if (error) throw error;
                } else {
                    // 특정 그룹의 메모만 삭제
                    const { error } = await this.supabase
                        .from('memos')
                        .delete()
                        .eq('group_id', this.currentGroup);

                    if (error) throw error;
                }
            }

            this.memos = [];
            this.updateMemoList();
            this.showSuccess('메모가 삭제되었습니다.');
            
        } catch (error) {
            console.error('전체 삭제 오류:', error);
            this.showError('메모 삭제 중 오류가 발생했습니다.');
        } finally {
            this.showLoading(false);
        }
    }

    // 디바운싱된 검색 (성능 최적화)
    debouncedSearch(term) {
        // 이전 타이머 취소
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // 즉시 피드백: 검색 중 표시
        if (term.trim()) {
            this.showSearchFeedback();
        }
        
        // 설정된 시간 후에 검색 실행
        this.searchTimeout = setTimeout(() => {
            this.search(term);
            this.hideSearchFeedback();
        }, this.performanceConfig.searchDebounceTime);
    }

    // 검색 중 피드백 표시
    showSearchFeedback() {
        const searchInput = document.getElementById('searchInput');
        searchInput.style.borderColor = '#667eea';
        searchInput.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.2)';
        
        // 메모 카운트에 검색 중 표시
        const memoCount = document.getElementById('memoCount');
        if (memoCount) {
            memoCount.textContent = '검색 중...';
        }
    }

    // 검색 중 피드백 숨기기
    hideSearchFeedback() {
        const searchInput = document.getElementById('searchInput');
        searchInput.style.borderColor = '';
        searchInput.style.boxShadow = '';
    }

    search(term) {
        this.searchTerm = term.toLowerCase();
        this.updateMemoList();
    }

    clearSearch() {
        document.getElementById('searchInput').value = '';
        this.searchTerm = '';
        this.updateMemoList();
    }

    getFilteredMemos() {
        if (!this.searchTerm) {
            return this.memos;
        }
        
        return this.memos.filter(memo => {
            const contentMatch = memo.content.toLowerCase().includes(this.searchTerm);
            const groupMatch = memo.group_name && memo.group_name.toLowerCase().includes(this.searchTerm);
            
            return contentMatch || groupMatch;
        });
    }

    updateMemoList() {
        const memoList = document.getElementById('memoList');
        const filteredMemos = this.getFilteredMemos();
        
        // 성능 개선: 메모 개수만 업데이트
        const memoCountElement = document.getElementById('memoCount');
        if (memoCountElement.textContent !== filteredMemos.length.toString()) {
            memoCountElement.textContent = filteredMemos.length;
        }

        if (filteredMemos.length === 0) {
            memoList.innerHTML = `
                <div class="empty-state">
                    <h3>📝</h3>
                    <p>${this.searchTerm ? '검색 결과가 없습니다.' : '아직 메모가 없습니다.'}</p>
                    <p>${this.searchTerm ? '다른 키워드로 검색해보세요.' : '첫 번째 메모를 추가해보세요!'}</p>
                </div>
            `;
            return;
        }

        // 성능 최적화: 가상 스크롤링 (설정된 임계값 이상일 때)
        const shouldUseVirtualScrolling = filteredMemos.length > this.performanceConfig.virtualScrollThreshold;
        
        if (shouldUseVirtualScrolling) {
            this.renderVirtualizedMemos(filteredMemos, memoList);
        } else {
            this.renderAllMemos(filteredMemos, memoList);
        }
    }

    // 모든 메모 렌더링 (50개 이하)
    renderAllMemos(memos, container) {
        const fragment = document.createDocumentFragment();
        
        memos.forEach(memo => {
            const memoElement = this.createMemoElement(memo);
            fragment.appendChild(memoElement);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    // 가상 스크롤링 (50개 이상)
    renderVirtualizedMemos(memos, container) {
        const itemHeight = 120; // 메모 아이템 예상 높이
        const containerHeight = 300; // 메모 리스트 컨테이너 높이
        const visibleCount = Math.ceil(containerHeight / itemHeight) + 5; // 버퍼 포함

        // 현재 스크롤 위치에 따른 시작 인덱스 계산
        const scrollTop = container.scrollTop || 0;
        const startIndex = Math.floor(scrollTop / itemHeight);
        const endIndex = Math.min(startIndex + visibleCount, memos.length);

        // 가상 스크롤링 컨테이너 생성
        const totalHeight = memos.length * itemHeight;
        const offsetY = startIndex * itemHeight;

        container.innerHTML = `
            <div style="height: ${totalHeight}px; position: relative;">
                <div id="visible-memos" style="transform: translateY(${offsetY}px);">
                </div>
            </div>
        `;

        // 보이는 범위의 메모만 렌더링
        const visibleContainer = container.querySelector('#visible-memos');
        const fragment = document.createDocumentFragment();

        for (let i = startIndex; i < endIndex; i++) {
            if (memos[i]) {
                const memoElement = this.createMemoElement(memos[i]);
                fragment.appendChild(memoElement);
            }
        }

        visibleContainer.appendChild(fragment);

        // 스크롤 이벤트 핸들러 (디바운싱 적용)
        this.setupVirtualScrolling(container, memos);
    }

    // 가상 스크롤링 이벤트 설정
    setupVirtualScrolling(container, memos) {
        if (this.virtualScrollHandler) {
            container.removeEventListener('scroll', this.virtualScrollHandler);
        }

        this.virtualScrollHandler = this.debounce(() => {
            this.renderVirtualizedMemos(memos, container);
        }, 16); // 60fps

        container.addEventListener('scroll', this.virtualScrollHandler);
    }

    // 범용 디바운스 함수
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 성능 측정 도구 (개발용)
    measurePerformance(label, fn) {
        if (typeof fn !== 'function') return fn;
        
        return (...args) => {
            const start = performance.now();
            const result = fn.apply(this, args);
            
            if (result instanceof Promise) {
                return result.then(res => {
                    const end = performance.now();
                    if (this.performanceConfig.performanceLogging) {
                        console.log(`⚡ ${label}: ${(end - start).toFixed(2)}ms`);
                    }
                    return res;
                });
            } else {
                const end = performance.now();
                if (this.performanceConfig.performanceLogging) {
                    console.log(`⚡ ${label}: ${(end - start).toFixed(2)}ms`);
                }
                return result;
            }
        };
    }

    // 메모 DOM 엘리먼트 생성 (재사용 가능)
    createMemoElement(memo) {
        const memoDiv = document.createElement('div');
        memoDiv.className = `memo-item ${memo.pinned ? 'pinned' : ''}`;
        memoDiv.dataset.memoId = memo.id;

        memoDiv.innerHTML = `
            <div class="memo-header">
                <div class="memo-content">${this.escapeHtml(memo.content)}</div>
                <div class="memo-actions-btn">
                    <button class="action-btn pin-btn ${memo.pinned ? 'active' : ''}" 
                            onclick="app.togglePin('${memo.id}', ${memo.pinned})"
                            title="${memo.pinned ? '고정 해제' : '고정'}">
                        ${memo.pinned ? '📌' : '📍'}
                    </button>
                    <button class="action-btn delete-btn" 
                            onclick="app.deleteMemo('${memo.id}')"
                            title="삭제">
                        🗑️
                    </button>
                </div>
            </div>
            <div class="memo-meta">
                ${memo.group_name && !this.currentGroup ? `<span class="memo-group">📁 ${this.escapeHtml(memo.group_name)}</span>` : ''}
                <span class="memo-time">${this.formatDate(memo.created_at)}</span>
            </div>
        `;

        return memoDiv;
    }

    // 성능 최적화: 새 메모를 DOM에 직접 추가
    addMemoToDOM(memo) {
        const memoList = document.getElementById('memoList');
        
        // 빈 상태 메시지가 있다면 제거
        const emptyState = memoList.querySelector('.empty-state');
        if (emptyState) {
            memoList.innerHTML = '';
        }

        // 새 메모 엘리먼트 생성
        const memoElement = this.createMemoElement(memo);
        
        // 고정된 메모라면 맨 위에, 아니라면 일반 메모 섹션 맨 위에 추가
        if (memo.pinned) {
            memoList.insertBefore(memoElement, memoList.firstChild);
        } else {
            // 고정된 메모들 이후에 추가
            const pinnedMemos = memoList.querySelectorAll('.memo-item.pinned');
            if (pinnedMemos.length > 0) {
                const lastPinned = pinnedMemos[pinnedMemos.length - 1];
                lastPinned.insertAdjacentElement('afterend', memoElement);
            } else {
                memoList.insertBefore(memoElement, memoList.firstChild);
            }
        }

        // 애니메이션 효과 (설정에 따라)
        if (this.performanceConfig.animationsEnabled) {
            memoElement.style.opacity = '0';
            memoElement.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                memoElement.style.transition = 'all 0.3s ease';
                memoElement.style.opacity = '1';
                memoElement.style.transform = 'translateY(0)';
            }, 10);
        }
    }

    // 메모 개수만 업데이트
    updateMemoCount() {
        const filteredMemos = this.getFilteredMemos();
        document.getElementById('memoCount').textContent = filteredMemos.length;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return '방금 전';
        if (minutes < 60) return `${minutes}분 전`;
        if (hours < 24) return `${hours}시간 전`;
        if (days < 7) return `${days}일 전`;
        
        return date.toLocaleDateString('ko-KR');
    }

    clearUI() {
        document.getElementById('groupSelect').innerHTML = '<option value="">전체 메모</option>';
        document.getElementById('memoInput').value = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('memoList').innerHTML = '';
        document.getElementById('memoCount').textContent = '0';
        this.hideAddGroupForm();
        this.hideExportImportSection();
        this.cleanup(); // 메모리 정리
    }

    // 메모리 누수 방지를 위한 정리 함수
    cleanup() {
        // 검색 타이머 정리
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
        }

        // 가상 스크롤링 핸들러 정리
        if (this.virtualScrollHandler) {
            const memoList = document.getElementById('memoList');
            if (memoList) {
                memoList.removeEventListener('scroll', this.virtualScrollHandler);
            }
            this.virtualScrollHandler = null;
        }
    }

    // 내보내기/불러오기 섹션 표시
    showExportImportSection() {
        document.getElementById('exportImportSection').style.display = 'block';
    }

    // 내보내기/불러오기 섹션 숨기기
    hideExportImportSection() {
        document.getElementById('exportImportSection').style.display = 'none';
        document.getElementById('importFileInput').value = '';
        document.getElementById('executeImportBtn').style.display = 'none';
        document.getElementById('selectedFileName').style.display = 'none';
    }

    // 내보내기 실행
    async executeExport() {
        try {
            this.showLoading(true);

            const exportScope = document.querySelector('input[name="exportScope"]:checked').value;
            const exportFormat = document.querySelector('input[name="exportFormat"]:checked').value;

            let exportData;

            if (exportScope === 'all') {
                exportData = await this.exportAllData();
            } else if (exportScope === 'current') {
                if (!this.currentGroup) {
                    this.showError('현재 선택된 그룹이 없습니다.');
                    return;
                }
                exportData = await this.exportCurrentGroupData();
            }

            if (exportFormat === 'json') {
                this.downloadJSON(exportData);
            } else if (exportFormat === 'csv') {
                this.downloadCSV(exportData);
            }

            this.showSuccess('데이터 내보내기가 완료되었습니다!');
            this.hideExportImportSection();

        } catch (error) {
            console.error('내보내기 오류:', error);
            this.showError('내보내기 중 오류가 발생했습니다: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    // 모든 데이터 내보내기
    async exportAllData() {
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            appName: '한줌 메모',
            user: {
                email: this.currentUser?.email || 'unknown',
                provider: this.currentUser?.provider || 'unknown'
            },
            groups: []
        };

        // 모든 그룹과 해당 메모들 수집
        for (const group of this.groups) {
            const groupData = {
                id: group.id,
                name: group.name,
                created_at: group.created_at,
                memos: []
            };

            // 그룹의 메모들 가져오기
            try {
                if (this.isOfflineMode) {
                    const storageKey = `memos_${group.id}`;
                    const result = await chrome.storage.local.get([storageKey]);
                    groupData.memos = result[storageKey] || [];
                } else {
                    const { data: memos, error } = await this.supabase
                        .from('memos')
                        .select('*')
                        .eq('group_id', group.id)
                        .order('created_at', { ascending: false });

                    if (error) throw error;
                    groupData.memos = memos || [];
                }
            } catch (error) {
                console.error(`그룹 ${group.name}의 메모를 가져오는 중 오류:`, error);
                groupData.memos = [];
            }

            exportData.groups.push(groupData);
        }

        return exportData;
    }

    // 현재 그룹 데이터만 내보내기
    async exportCurrentGroupData() {
        const currentGroupInfo = this.groups.find(g => g.id === this.currentGroup);
        
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            appName: '한줌 메모',
            user: {
                email: this.currentUser?.email || 'unknown',
                provider: this.currentUser?.provider || 'unknown'
            },
            groups: [{
                id: currentGroupInfo.id,
                name: currentGroupInfo.name,
                created_at: currentGroupInfo.created_at,
                memos: this.memos || []
            }]
        };

        return exportData;
    }

    // JSON 파일 다운로드
    downloadJSON(data) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const filename = `한줌메모_${new Date().toISOString().split('T')[0]}.json`;
        this.downloadFile(url, filename);
    }

    // CSV 파일 다운로드
    downloadCSV(data) {
        let csvContent = '\uFEFF'; // BOM for Excel UTF-8 support
        csvContent += 'Group,Memo Content,Pinned,Created Date\n';

        data.groups.forEach(group => {
            group.memos.forEach(memo => {
                const content = memo.content.replace(/"/g, '""').replace(/\n/g, ' ');
                const pinned = memo.pinned ? 'Yes' : 'No';
                const createdDate = new Date(memo.created_at).toLocaleString('ko-KR');
                
                csvContent += `"${group.name}","${content}","${pinned}","${createdDate}"\n`;
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const filename = `한줌메모_${new Date().toISOString().split('T')[0]}.csv`;
        this.downloadFile(url, filename);
    }

    // 파일 다운로드 공통 함수
    downloadFile(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 파일 선택 버튼 클릭
    selectImportFile() {
        document.getElementById('importFileInput').click();
    }

    // 파일 선택 후 처리
    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const fileName = file.name;
        const fileExt = fileName.split('.').pop().toLowerCase();

        if (fileExt !== 'json' && fileExt !== 'csv') {
            this.showError('JSON 또는 CSV 파일만 지원됩니다.');
            return;
        }

        document.getElementById('selectedFileName').textContent = `선택된 파일: ${fileName}`;
        document.getElementById('selectedFileName').style.display = 'block';
        document.getElementById('executeImportBtn').style.display = 'inline-block';
    }

    // 불러오기 실행
    async executeImport() {
        try {
            this.showLoading(true);

            const fileInput = document.getElementById('importFileInput');
            const file = fileInput.files[0];
            
            if (!file) {
                this.showError('파일을 선택해주세요.');
                return;
            }

            const importMode = document.querySelector('input[name="importMode"]:checked').value;
            const fileExt = file.name.split('.').pop().toLowerCase();

            let importData;

            if (fileExt === 'json') {
                importData = await this.parseJSONFile(file);
            } else if (fileExt === 'csv') {
                importData = await this.parseCSVFile(file);
            }

            await this.processImportData(importData, importMode);
            
            this.showSuccess('데이터 불러오기가 완료되었습니다!');
            this.hideExportImportSection();
            
            // 데이터 새로고침
            await this.loadGroups();
            if (this.currentGroup) {
                await this.loadMemos();
            }

        } catch (error) {
            console.error('불러오기 오류:', error);
            this.showError('불러오기 중 오류가 발생했습니다: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    // JSON 파일 파싱
    async parseJSONFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.groups || !Array.isArray(data.groups)) {
                        throw new Error('유효하지 않은 JSON 형식입니다.');
                    }
                    resolve(data);
                } catch (error) {
                    reject(new Error('JSON 파일을 파싱할 수 없습니다: ' + error.message));
                }
            };
            reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
            reader.readAsText(file);
        });
    }

    // CSV 파일 파싱
    async parseCSVFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const csvText = e.target.result;
                    const lines = csvText.split('\n').filter(line => line.trim());
                    
                    if (lines.length < 2) {
                        throw new Error('CSV 파일이 비어있거나 헤더만 있습니다.');
                    }

                    // 헤더 건너뛰기
                    const dataLines = lines.slice(1);
                    
                    const groupsMap = new Map();

                    dataLines.forEach(line => {
                        const [groupName, content, pinnedStr, createdDate] = this.parseCSVLine(line);
                        
                        if (!groupName || !content) return;

                        if (!groupsMap.has(groupName)) {
                            groupsMap.set(groupName, {
                                id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                name: groupName,
                                created_at: new Date().toISOString(),
                                memos: []
                            });
                        }

                        const memo = {
                            id: `imported-memo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            content: content,
                            pinned: pinnedStr.toLowerCase() === 'yes' || pinnedStr === '예',
                            created_at: createdDate ? new Date(createdDate).toISOString() : new Date().toISOString()
                        };

                        groupsMap.get(groupName).memos.push(memo);
                    });

                    const importData = {
                        version: '1.0',
                        exportDate: new Date().toISOString(),
                        appName: '한줌 메모 (CSV 가져오기)',
                        groups: Array.from(groupsMap.values())
                    };

                    resolve(importData);
                } catch (error) {
                    reject(new Error('CSV 파일을 파싱할 수 없습니다: ' + error.message));
                }
            };
            reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
            reader.readAsText(file);
        });
    }

    // CSV 라인 파싱 (간단한 구현)
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // 다음 따옴표 건너뛰기
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }

    // 불러온 데이터 처리
    async processImportData(importData, importMode) {
        if (importMode === 'replace') {
            // 기존 데이터 삭제
            if (confirm('기존의 모든 데이터가 삭제됩니다. 계속하시겠습니까?')) {
                await this.clearAllData();
            } else {
                throw new Error('사용자가 취소했습니다.');
            }
        }

        // 그룹과 메모 가져오기
        for (const groupData of importData.groups) {
            await this.importGroup(groupData, importMode);
        }
    }

    // 그룹 가져오기
    async importGroup(groupData, importMode) {
        try {
            let groupId;

            if (this.isOfflineMode) {
                // 오프라인 모드: Chrome storage 사용
                const newGroup = {
                    id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: groupData.name,
                    user_id: this.currentUser.id,
                    created_at: groupData.created_at || new Date().toISOString()
                };

                // 기존 그룹에 추가
                const result = await chrome.storage.local.get(['groups']);
                const groups = result.groups || [];
                groups.push(newGroup);
                await chrome.storage.local.set({ groups: groups });

                groupId = newGroup.id;
            } else {
                // 온라인 모드: Supabase 사용
                const { data, error } = await this.supabase
                    .from('memo_groups')
                    .insert([{
                        name: groupData.name,
                        user_id: this.currentUser.id
                    }])
                    .select();

                if (error) throw error;
                groupId = data[0].id;
            }

            // 그룹의 메모들 가져오기
            for (const memoData of groupData.memos) {
                await this.importMemo(memoData, groupId);
            }

        } catch (error) {
            console.error('그룹 가져오기 오류:', error);
            throw error;
        }
    }

    // 메모 가져오기
    async importMemo(memoData, groupId) {
        try {
            if (this.isOfflineMode) {
                // 오프라인 모드
                const newMemo = {
                    id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    content: memoData.content,
                    group_id: groupId,
                    user_id: this.currentUser.id,
                    pinned: memoData.pinned || false,
                    created_at: memoData.created_at || new Date().toISOString()
                };

                const storageKey = `memos_${groupId}`;
                const result = await chrome.storage.local.get([storageKey]);
                const memos = result[storageKey] || [];
                memos.push(newMemo);
                await chrome.storage.local.set({ [storageKey]: memos });
            } else {
                // 온라인 모드
                const { error } = await this.supabase
                    .from('memos')
                    .insert([{
                        content: memoData.content,
                        group_id: groupId,
                        user_id: this.currentUser.id,
                        pinned: memoData.pinned || false
                    }]);

                if (error) throw error;
            }
        } catch (error) {
            console.error('메모 가져오기 오류:', error);
            throw error;
        }
    }

    // 모든 데이터 삭제 (덮어쓰기 모드용)
    async clearAllData() {
        try {
            if (this.isOfflineMode) {
                // 오프라인 모드: 모든 관련 스토리지 데이터 삭제
                const keys = ['groups'];
                this.groups.forEach(group => {
                    keys.push(`memos_${group.id}`);
                });
                await chrome.storage.local.remove(keys);
            } else {
                // 온라인 모드: Supabase에서 삭제
                // 메모 먼저 삭제 (외래키 제약 때문)
                const { error: memoError } = await this.supabase
                    .from('memos')
                    .delete()
                    .eq('user_id', this.currentUser.id);

                if (memoError) throw memoError;

                // 그룹 삭제
                const { error: groupError } = await this.supabase
                    .from('memo_groups')
                    .delete()
                    .eq('user_id', this.currentUser.id);

                if (groupError) throw groupError;
            }

            // 로컬 상태 초기화
            this.groups = [];
            this.memos = [];
            this.currentGroup = null;
            this.updateGroupSelect();
            this.updateMemoList();

        } catch (error) {
            console.error('데이터 삭제 오류:', error);
            throw error;
        }
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'flex' : 'none';
    }

    showError(message) {
        // 간단한 알림 (실제로는 더 나은 UI로 개선 가능)
        alert('❌ ' + message);
    }

    showSuccess(message) {
        // 간단한 알림 (실제로는 더 나은 UI로 개선 가능)
        alert('✅ ' + message);
    }

    showInfo(message) {
        // 간단한 알림 (실제로는 더 나은 UI로 개선 가능)
        alert('ℹ️ ' + message);
    }
}

// 앱 인스턴스 생성
const app = new HanjumMemo();

// 인증 상태 변경 감지 (온라인 모드에서만)
if (typeof supabase !== 'undefined' && !IS_OFFLINE_MODE) {
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log('인증 상태 변경:', event, session?.user?.email);
        
        if (event === 'SIGNED_IN' && session) {
            app.currentUser = session.user;
            app.showAuthenticatedState();
            await app.loadUserData();
            app.showSuccess(`환영합니다, ${session.user.email}님!`);
        } else if (event === 'SIGNED_OUT') {
            app.currentUser = null;
            app.showUnauthenticatedState();
            app.clearUI();
            app.showInfo('로그아웃되었습니다.');
        } else if (event === 'TOKEN_REFRESHED') {
            console.log('토큰이 갱신되었습니다.');
        }
    });
} 