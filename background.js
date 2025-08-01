// 한줌 메모 - Service Worker
console.log('한줌 메모 Service Worker 시작');

// 확장 프로그램 설치/업데이트 시 실행
chrome.runtime.onInstalled.addListener((details) => {
    console.log('한줌 메모 설치/업데이트:', details.reason);
    
    // 기본 설정 저장
    chrome.storage.local.set({
        isFirstRun: details.reason === 'install',
        installDate: new Date().toISOString(),
        version: chrome.runtime.getManifest().version
    });

    // 컨텍스트 메뉴 생성
    try {
        chrome.contextMenus.create({
            id: 'hanjum-memo-quick-save',
            title: '선택된 텍스트를 한줌 메모에 저장',
            contexts: ['selection'],
            documentUrlPatterns: ['http://*/*', 'https://*/*']
        });
        console.log('컨텍스트 메뉴 생성 완료');
    } catch (error) {
        console.log('컨텍스트 메뉴 생성 오류:', error);
    }
});

// 브라우저 시작 시 실행
chrome.runtime.onStartup.addListener(() => {
    console.log('브라우저 시작 - 한줌 메모 Service Worker 활성화');
});

// 메시지 처리
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Service Worker 메시지 수신:', request);
    
    switch (request.action) {
        case 'getStorageData':
            // 로컬 스토리지 데이터 조회
            chrome.storage.local.get(request.keys || null, (result) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ error: chrome.runtime.lastError.message });
                } else {
                    sendResponse(result);
                }
            });
            return true; // 비동기 응답

        case 'setStorageData':
            // 로컬 스토리지 데이터 저장
            chrome.storage.local.set(request.data || {}, () => {
                if (chrome.runtime.lastError) {
                    sendResponse({ error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ success: true });
                }
            });
            return true; // 비동기 응답

        case 'clearStorageData':
            // 로컬 스토리지 데이터 삭제
            if (request.keys) {
                chrome.storage.local.remove(request.keys, () => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ error: chrome.runtime.lastError.message });
                    } else {
                        sendResponse({ success: true });
                    }
                });
            } else {
                chrome.storage.local.clear(() => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ error: chrome.runtime.lastError.message });
                    } else {
                        sendResponse({ success: true });
                    }
                });
            }
            return true; // 비동기 응답

        case 'openTab':
            // 새 탭 열기
            chrome.tabs.create({ 
                url: request.url,
                active: request.active !== false 
            }, (tab) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ success: true, tabId: tab.id });
                }
            });
            return true;

        default:
            console.log('알 수 없는 액션:', request.action);
            sendResponse({ error: 'Unknown action: ' + request.action });
    }
});

// 컨텍스트 메뉴 클릭 처리
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'hanjum-memo-quick-save') {
        console.log('선택된 텍스트 저장:', info.selectionText);
        
        // 선택된 텍스트를 임시 저장
        const quickSaveData = {
            text: info.selectionText,
            url: tab.url,
            title: tab.title,
            timestamp: new Date().toISOString()
        };

        chrome.storage.local.set({ 
            quickSaveText: quickSaveData 
        }, () => {
            // 팝업을 열기 위해 확장 프로그램 아이콘 영역을 시뮬레이션
            // (Service Worker에서는 직접 팝업을 열 수 없음)
            console.log('빠른 저장 데이터 준비 완료');
        });
    }
});

// 스토리지 변경 감지
chrome.storage.onChanged.addListener((changes, namespace) => {
    console.log('스토리지 변경 감지:', namespace, Object.keys(changes));
    
    // 변경사항을 모든 열린 팝업에 알림
    chrome.runtime.sendMessage({
        action: 'storageChanged',
        changes: changes,
        namespace: namespace
    }).catch(() => {
        // 팝업이 열려있지 않으면 오류 발생하는데, 이는 정상임
    });
});

// 탭 업데이트 감지 (OAuth 콜백 처리용)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && changeInfo.url.includes('chrome-extension://')) {
        console.log('확장 프로그램 URL 감지:', changeInfo.url);
        
        // OAuth 콜백 처리를 위한 메시지 전송
        chrome.runtime.sendMessage({
            action: 'authCallback',
            url: changeInfo.url,
            tabId: tabId
        }).catch(() => {
            // 팝업이 열려있지 않으면 무시
        });
    }
});

// 오류 처리
self.addEventListener('error', (event) => {
    console.error('Service Worker 오류:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Service Worker Unhandled Promise Rejection:', event.reason);
});

console.log('한줌 메모 Service Worker 초기화 완료'); 