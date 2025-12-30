// ========================================
// Firebase 설정
// ========================================
const firebaseConfig = {
    apiKey: "AIzaSyCCbE9e0s1azSOiTuSRkBlbgrA3DuqAy5M",
    authDomain: "sell-b10e5.firebaseapp.com",
    projectId: "sell-b10e5",
    storageBucket: "sell-b10e5.firebasestorage.app",
    messagingSenderId: "73854097432",
    appId: "1:73854097432:web:8e8fa2f87ada9b07418b6d",
    measurementId: "G-0PFPK1HVCZ"
};

// Firebase 초기화
let db = null;
let isFirebaseEnabled = false;

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    isFirebaseEnabled = true;
    console.log('✅ Firebase 연결 성공');
    updateSyncStatus(true);
} catch (error) {
    console.error('❌ Firebase 초기화 오류:', error);
    updateSyncStatus(false);
}

// 전역 변수
let transactions = [];

// DOM 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', async function() {
    initializeTabs();
    initializeModal();
    initializeForm();
    initializeFilters();
    initializeButtons();
    loadCustomDropdownItems(); // 커스텀 드롭다운 항목 로드
    
    // Firebase 또는 로컬스토리지에서 데이터 로드 (완료될 때까지 대기)
    await loadTransactions();
    
    // 데이터 로드 후 화면 업데이트
    updateStatistics();
    displayTransactions();
});

// ========================================
// Firebase 관련 함수
// ========================================

// 동기화 상태 업데이트
function updateSyncStatus(isOnline) {
    const statusElement = document.getElementById('syncStatus');
    if (statusElement) {
        if (isOnline) {
            statusElement.textContent = '🟢 온라인 (Firebase)';
            statusElement.className = 'status-online';
        } else {
            statusElement.textContent = '⚫ 오프라인 (로컬)';
            statusElement.className = 'status-offline';
        }
    }
}

// Firebase에서 거래 내역 불러오기
async function loadFromFirebase() {
    if (!isFirebaseEnabled) return;
    
    try {
        const snapshot = await db.collection('transactions').orderBy('createdAt', 'desc').get();
        transactions = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Firebase 문서 ID를 거래 ID로 사용
            transactions.push({ 
                ...data,
                id: doc.id
            });
        });
        console.log(`✅ Firebase에서 ${transactions.length}개 거래 불러옴`);
    } catch (error) {
        console.error('❌ Firebase 불러오기 오류:', error);
        // Firebase 실패 시 로컬스토리지에서 불러오기 시도
        console.log('⚠️ 로컬스토리지에서 데이터 불러오기 시도');
        const saved = localStorage.getItem('overseasTransactions');
        if (saved) {
            transactions = JSON.parse(saved);
        }
    }
}

// Firebase에 거래 저장
async function saveToFirebase(transaction) {
    if (!isFirebaseEnabled) return null;
    
    try {
        // id 필드를 제외한 데이터 복사 (Firebase가 자동으로 문서 ID 생성)
        const { id, ...dataToSave } = transaction;
        
        const docRef = await db.collection('transactions').add({
            ...dataToSave,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Firebase 저장 성공:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('❌ Firebase 저장 오류:', error);
        throw error;
    }
}

// Firebase 거래 업데이트
async function updateToFirebase(id, transaction) {
    if (!isFirebaseEnabled) return;
    
    try {
        // id 필드를 제외한 데이터 복사
        const { id: _, ...dataToUpdate } = transaction;
        
        await db.collection('transactions').doc(id).update({
            ...dataToUpdate,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Firebase 업데이트 성공:', id);
    } catch (error) {
        console.error('❌ Firebase 업데이트 오류:', error);
        throw error;
    }
}

// Firebase에서 거래 삭제
async function deleteFromFirebase(id) {
    if (!isFirebaseEnabled) return;
    
    try {
        await db.collection('transactions').doc(id).delete();
        console.log('✅ Firebase 삭제 성공:', id);
    } catch (error) {
        console.error('❌ Firebase 삭제 오류:', error);
        throw error;
    }
}

// Firebase 전체 삭제
async function clearFirebase() {
    if (!isFirebaseEnabled) return;
    
    try {
        const snapshot = await db.collection('transactions').get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log('✅ Firebase 전체 삭제 성공');
    } catch (error) {
        console.error('❌ Firebase 전체 삭제 오류:', error);
        throw error;
    }
}

// ========================================
// 탭 및 모달 제어
// ========================================

// 탭 초기화
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // 모든 탭 버튼 비활성화
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            // 모든 탭 콘텐츠 숨기기
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // 선택한 탭 활성화
            this.classList.add('active');
            document.getElementById(targetTab + 'Tab').classList.add('active');
        });
    });
}

// 모달 초기화
function initializeModal() {
    const modal = document.getElementById('transactionModal');
    const openBtn = document.getElementById('addTransactionBtn');
    const closeBtn = document.querySelector('.modal-close');
    
    // 모달 열기 (항상 새 등록 모드)
    openBtn.addEventListener('click', function() {
        // 폼 초기화
        const form = document.getElementById('transactionForm');
        form.reset();
        form.removeAttribute('data-editing-id');
        
        // 브랜드 커스텀 입력 숨기기
        document.getElementById('brandCustom').style.display = 'none';
        document.getElementById('brandCustom').value = '';
        
        // 오늘 날짜로 설정
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('purchaseDate').value = today;
        document.getElementById('quantity').value = 1;
        document.getElementById('platformFee').value = 0;
        document.getElementById('purchaseSiteCustom').disabled = true;
        
        // 계산 결과 초기화
        document.getElementById('calcTotalCost').textContent = '0원';
        document.getElementById('calcProfit').textContent = '0원';
        document.getElementById('calcMargin').textContent = '0%';
        
        // 모달 헤더 설정
        document.querySelector('.modal-header h2').textContent = '➕ 새 거래 등록';
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    // 모달 닫기
    closeBtn.addEventListener('click', closeModal);
    
    // 모달 외부 클릭 시 닫기
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // ESC 키로 모달 닫기
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

function closeModal() {
    const modal = document.getElementById('transactionModal');
    const form = document.getElementById('transactionForm');
    
    // 수정 모드 해제
    form.removeAttribute('data-editing-id');
    
    // 모달 헤더 원상복구
    document.querySelector('.modal-header h2').textContent = '➕ 새 거래 등록';
    
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// 로컬스토리지에서 거래 내역 불러오기
async function loadTransactions() {
    if (isFirebaseEnabled) {
        // Firebase 사용 시
        await loadFromFirebase();
        // Firebase에서 불러온 후 로컬스토리지에도 백업
        if (transactions.length > 0) {
            saveTransactions();
        }
    } else {
        // 로컬스토리지 사용 시
        const saved = localStorage.getItem('overseasTransactions');
        if (saved) {
            try {
                transactions = JSON.parse(saved);
                console.log(`✅ 로컬스토리지에서 ${transactions.length}개 거래 불러옴`);
            } catch (error) {
                console.error('❌ 로컬스토리지 파싱 오류:', error);
                transactions = [];
            }
        }
    }
}

// 로컬스토리지에 거래 내역 저장
function saveTransactions() {
    try {
        localStorage.setItem('overseasTransactions', JSON.stringify(transactions));
        console.log('💾 로컬스토리지 백업 완료');
    } catch (error) {
        console.error('❌ 로컬스토리지 저장 오류:', error);
    }
}

// 폼 초기화
function initializeForm() {
    const form = document.getElementById('transactionForm');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('purchaseDate').value = today;

    // 구매사이트 선택 시 커스텀 입력 활성화
    const purchaseSiteSelect = document.getElementById('purchaseSite');
    const purchaseSiteCustom = document.getElementById('purchaseSiteCustom');

    purchaseSiteSelect.addEventListener('change', function() {
        if (this.value === 'other') {
            purchaseSiteCustom.disabled = false;
            purchaseSiteCustom.required = true;
            purchaseSiteCustom.focus();
        } else {
            purchaseSiteCustom.disabled = true;
            purchaseSiteCustom.required = false;
            purchaseSiteCustom.value = '';
        }
    });

    // 플랫폼 선택 시 수수료율 자동 설정
    const platformSelect = document.getElementById('platform');
    const platformFeeInput = document.getElementById('platformFee');

    platformSelect.addEventListener('change', function() {
        const fees = {
            'coupang': 10.0,
            'naver': 5.6,
            'street11': 11.0,
            'gmarket': 12.0,
            'auction': 12.0,
            'direct': 0,
            'custom': 0
        };
        
        // 모든 플랫폼에서 수수료를 자동으로 설정하되 수정 가능
        platformFeeInput.value = fees[this.value] || 0;
        platformFeeInput.readOnly = false; // 항상 수정 가능
        
        calculateRealtime();
    });

    // 실시간 계산을 위한 이벤트 리스너
    const calcInputs = ['purchasePrice', 'currency', 'exchangeRate', 'salePrice', 
                       'platformFee', 'customsDuty', 'shippingFee', 'quantity'];
    
    calcInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', calculateRealtime);
        }
    });

    // 폼 제출
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        await addTransaction();
    });
}

// 실시간 계산
function calculateRealtime() {
    const purchasePrice = parseFloat(document.getElementById('purchasePrice').value) || 0;
    const exchangeRate = parseFloat(document.getElementById('exchangeRate').value) || 0;
    const salePrice = parseFloat(document.getElementById('salePrice').value) || 0;
    const platformFee = parseFloat(document.getElementById('platformFee').value) || 0;
    const customsDuty = parseFloat(document.getElementById('customsDuty').value) || 0;
    const shippingFee = parseFloat(document.getElementById('shippingFee').value) || 0;
    const quantity = parseInt(document.getElementById('quantity').value) || 1;

    // 구매가격 (원화 환산)
    const purchasePriceKRW = purchasePrice * exchangeRate * quantity;
    
    // 플랫폼 수수료
    const platformFeeAmount = salePrice * (platformFee / 100);
    
    // 총 비용
    const totalCost = purchasePriceKRW + platformFeeAmount + customsDuty + shippingFee;
    
    // 순이익
    const profit = salePrice - totalCost;
    
    // 마진율
    const margin = salePrice > 0 ? (profit / salePrice * 100) : 0;

    // 결과 표시
    document.getElementById('calcTotalCost').textContent = formatCurrency(totalCost);
    document.getElementById('calcProfit').textContent = formatCurrency(profit);
    document.getElementById('calcProfit').style.color = profit >= 0 ? '#667eea' : '#dc3545';
    document.getElementById('calcMargin').textContent = margin.toFixed(2) + '%';
}

// 거래 추가/수정
async function addTransaction() {
    const form = document.getElementById('transactionForm');
    const editingId = form.getAttribute('data-editing-id');
    const isEditing = !!editingId;

    // 브랜드 값 가져오기 (custom 선택 시 brandCustom 값 사용)
    const brandSelect = document.getElementById('brand');
    const brandValue = brandSelect.value === 'custom' ? 
        document.getElementById('brandCustom').value : 
        brandSelect.value;

    const transaction = {
        buyerName: document.getElementById('buyerName').value,
        buyerPhone: document.getElementById('buyerPhone').value,
        buyerAddress: document.getElementById('buyerAddress').value,
        brand: brandValue,
        productName: document.getElementById('productName').value,
        quantity: parseInt(document.getElementById('quantity').value),
        purchaseDate: document.getElementById('purchaseDate').value,
        purchaseSite: document.getElementById('purchaseSite').value,
        purchaseSiteCustom: document.getElementById('purchaseSiteCustom').value,
        purchasePrice: parseFloat(document.getElementById('purchasePrice').value),
        currency: document.getElementById('currency').value,
        exchangeRate: parseFloat(document.getElementById('exchangeRate').value),
        salePrice: parseFloat(document.getElementById('salePrice').value),
        platform: document.getElementById('platform').value,
        platformFee: parseFloat(document.getElementById('platformFee').value),
        customsDuty: parseFloat(document.getElementById('customsDuty').value),
        shippingFee: parseFloat(document.getElementById('shippingFee').value)
    };

    // 계산된 값 추가
    transaction.purchasePriceKRW = transaction.purchasePrice * transaction.exchangeRate * transaction.quantity;
    transaction.platformFeeAmount = transaction.salePrice * (transaction.platformFee / 100);
    transaction.totalCost = transaction.purchasePriceKRW + transaction.platformFeeAmount + transaction.customsDuty + transaction.shippingFee;
    transaction.profit = transaction.salePrice - transaction.totalCost;
    transaction.margin = transaction.salePrice > 0 ? (transaction.profit / transaction.salePrice * 100) : 0;

    if (isEditing) {
        // 수정 모드
        transaction.id = editingId;
        
        // 로컬 배열에서 기존 거래 찾아서 업데이트
        const index = transactions.findIndex(t => t.id === editingId);
        if (index !== -1) {
            transactions[index] = transaction;
        }

        // Firebase 업데이트 (활성화된 경우)
        if (isFirebaseEnabled) {
            try {
                await updateToFirebase(editingId, transaction);
                console.log('✅ Firebase 업데이트 완료:', editingId);
            } catch (error) {
                console.error('❌ Firebase 업데이트 실패:', error);
            }
        }

        saveTransactions();
        alert('거래가 성공적으로 수정되었습니다!');
    } else {
        // 추가 모드
        // Firebase에 저장 (활성화된 경우)
        if (isFirebaseEnabled) {
            try {
                const firebaseId = await saveToFirebase(transaction);
                if (firebaseId) {
                    transaction.id = firebaseId;
                    console.log('✅ Firebase 저장 완료:', firebaseId);
                }
            } catch (error) {
                console.error('❌ Firebase 저장 실패:', error);
                // Firebase 실패 시 로컬 ID 사용
                transaction.id = Date.now().toString();
            }
        } else {
            // 로컬 전용 모드
            transaction.id = Date.now().toString();
        }

        transactions.unshift(transaction); // 최신 거래를 앞에 추가
        saveTransactions(); // 로컬스토리지에도 백업
        alert('거래가 성공적으로 등록되었습니다!');
    }
    
    // 폼 초기화
    form.reset();
    form.removeAttribute('data-editing-id');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('purchaseDate').value = today;
    document.getElementById('quantity').value = 1;
    document.getElementById('platformFee').value = 0;
    document.getElementById('purchaseSiteCustom').disabled = true;
    
    // 계산 결과 초기화
    document.getElementById('calcTotalCost').textContent = '0원';
    document.getElementById('calcProfit').textContent = '0원';
    document.getElementById('calcMargin').textContent = '0%';

    // 모달 헤더 원상복구
    document.querySelector('.modal-header h2').textContent = '➕ 새 거래 등록';

    // 모달 닫기
    closeModal();

    // 화면 업데이트
    updateStatistics();
    displayTransactions();
}

// 거래 삭제
async function deleteTransaction(id) {
    if (confirm('이 거래를 삭제하시겠습니까?')) {
        // Firebase에서 삭제 (활성화된 경우)
        if (isFirebaseEnabled) {
            try {
                await deleteFromFirebase(id);
            } catch (error) {
                console.error('❌ Firebase 삭제 실패, 로컬만 삭제:', error);
            }
        }
        
        // 로컬 데이터 삭제
        transactions = transactions.filter(t => t.id !== id);
        saveTransactions();
        updateStatistics();
        displayTransactions();
    }
}

// 거래 수정
function editTransaction(id) {
    // 수정할 거래 찾기
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) {
        alert('거래를 찾을 수 없습니다.');
        return;
    }

    // 폼에 기존 데이터 채우기
    document.getElementById('buyerName').value = transaction.buyerName;
    document.getElementById('buyerPhone').value = transaction.buyerPhone;
    document.getElementById('buyerAddress').value = transaction.buyerAddress || '';
    
    // 브랜드 처리
    const brandSelect = document.getElementById('brand');
    const brandCustomInput = document.getElementById('brandCustom');
    const brandOptions = Array.from(brandSelect.options).map(opt => opt.value);
    
    if (brandOptions.includes(transaction.brand)) {
        // 드롭다운에 있는 브랜드
        brandSelect.value = transaction.brand;
        brandCustomInput.style.display = 'none';
    } else {
        // 드롭다운에 없는 브랜드 (직접 입력)
        brandSelect.value = 'custom';
        brandCustomInput.style.display = 'block';
        brandCustomInput.value = transaction.brand;
    }
    
    document.getElementById('productName').value = transaction.productName;
    document.getElementById('quantity').value = transaction.quantity;
    document.getElementById('purchaseDate').value = transaction.purchaseDate;
    document.getElementById('purchaseSite').value = transaction.purchaseSite;
    document.getElementById('purchaseSiteCustom').value = transaction.purchaseSiteCustom || '';
    document.getElementById('purchasePrice').value = transaction.purchasePrice;
    document.getElementById('currency').value = transaction.currency;
    document.getElementById('exchangeRate').value = transaction.exchangeRate;
    document.getElementById('salePrice').value = transaction.salePrice;
    document.getElementById('platform').value = transaction.platform;
    document.getElementById('platformFee').value = transaction.platformFee;
    document.getElementById('customsDuty').value = transaction.customsDuty;
    document.getElementById('shippingFee').value = transaction.shippingFee;

    // 구매사이트 커스텀 필드 활성화/비활성화
    if (transaction.purchaseSite === 'other') {
        document.getElementById('purchaseSiteCustom').disabled = false;
    }

    // 실시간 계산 업데이트
    calculateRealtime();

    // 모달 열기
    const modal = document.getElementById('transactionModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 폼의 data 속성에 수정 중인 ID 저장
    document.getElementById('transactionForm').setAttribute('data-editing-id', id);
    
    // 모달 헤더 변경
    document.querySelector('.modal-header h2').textContent = '✏️ 거래 수정';
}

// 거래 내역 표시
function displayTransactions() {
    const listContainer = document.getElementById('transactionsList');
    const filteredTransactions = getFilteredTransactions();

    // 필터 결과 카운트 업데이트
    const filterCountElement = document.getElementById('filterResultCount');
    if (filterCountElement) {
        filterCountElement.textContent = `전체 ${filteredTransactions.length}건`;
    }

    if (filteredTransactions.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">표시할 거래 내역이 없습니다.</p>';
        return;
    }

    listContainer.innerHTML = filteredTransactions.map(t => `
        <div class="transaction-card">
            <div class="transaction-header">
                <div class="transaction-title">
                    <h3>${t.brand} - ${t.productName}</h3>
                    <p class="buyer-info">👤 ${t.buyerName} | 📞 ${t.buyerPhone}</p>
                    ${t.buyerAddress ? `<p class="buyer-address">📍 ${t.buyerAddress}</p>` : ''}
                </div>
                <div class="transaction-date">${formatDate(t.purchaseDate)}</div>
            </div>
            
            <div class="transaction-details">
                <div class="detail-item">
                    <span class="detail-label">수량</span>
                    <span class="detail-value">${t.quantity}개</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">구매사이트</span>
                    <span class="detail-value">${getPurchaseSiteName(t.purchaseSite, t.purchaseSiteCustom)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">구매가격(배송비포함)</span>
                    <span class="detail-value">${t.purchasePrice.toFixed(2)} ${t.currency}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">환율</span>
                    <span class="detail-value">${formatCurrency(t.exchangeRate)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">판매가격</span>
                    <span class="detail-value">${formatCurrency(t.salePrice)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">판매 플랫폼</span>
                    <span class="detail-value">${getPlatformName(t.platform)} (${t.platformFee}%)</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">관부과세</span>
                    <span class="detail-value">${formatCurrency(t.customsDuty)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">국내배송비</span>
                    <span class="detail-value">${formatCurrency(t.shippingFee)}</span>
                </div>
            </div>
            
            <div class="transaction-summary">
                <div class="summary-item">
                    <span class="summary-label">총 비용</span>
                    <span class="summary-value">${formatCurrency(t.totalCost)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">순이익</span>
                    <span class="summary-value ${t.profit >= 0 ? 'profit' : 'loss'}">
                        ${formatCurrency(t.profit)}
                    </span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">마진률</span>
                    <span class="summary-value">${t.margin.toFixed(2)}%</span>
                </div>
                <div class="summary-item">
                    <button class="btn-edit" onclick="editTransaction('${t.id}')">수정</button>
                    <button class="btn-delete" onclick="deleteTransaction('${t.id}')">삭제</button>
                </div>
            </div>
        </div>
    `).join('');
}

// 통계 업데이트
function updateStatistics() {
    const filteredTransactions = getFilteredTransactions();
    
    if (filteredTransactions.length === 0) {
        document.getElementById('totalRevenue').textContent = '0원';
        document.getElementById('totalCost').textContent = '0원';
        document.getElementById('totalProfit').textContent = '0원';
        document.getElementById('avgMargin').textContent = '0%';
        updateCharts([]); // 빈 데이터로 차트 업데이트
        return;
    }

    const totalRevenue = filteredTransactions.reduce((sum, t) => sum + t.salePrice, 0);
    const totalCost = filteredTransactions.reduce((sum, t) => sum + t.totalCost, 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = filteredTransactions.reduce((sum, t) => sum + t.margin, 0) / filteredTransactions.length;

    document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('totalCost').textContent = formatCurrency(totalCost);
    document.getElementById('totalProfit').textContent = formatCurrency(totalProfit);
    document.getElementById('totalProfit').style.color = totalProfit >= 0 ? '#ffd700' : '#ff6b6b';
    document.getElementById('avgMargin').textContent = avgMargin.toFixed(2) + '%';

    // 그래프 업데이트
    updateCharts(filteredTransactions);
}

// 필터 초기화
function initializeFilters() {
    const periodFilter = document.getElementById('periodFilter');
    const customDateRange = document.getElementById('customDateRange');
    const applyCustomDate = document.getElementById('applyCustomDate');

    periodFilter.addEventListener('change', function() {
        if (this.value === 'custom') {
            customDateRange.style.display = 'flex';
        } else {
            customDateRange.style.display = 'none';
            updateStatistics();
            displayTransactions();
        }
    });

    applyCustomDate.addEventListener('click', function() {
        updateStatistics();
        displayTransactions();
    });
}

// ========================================
// 동적 드롭다운 관리
// ========================================

// 커스텀 드롭다운 항목 로드
function loadCustomDropdownItems() {
    // 브랜드 로드
    const customBrands = JSON.parse(localStorage.getItem('customBrands') || '[]');
    const brandSelect = document.getElementById('brand');
    const customOption = brandSelect.querySelector('option[value="custom"]');
    
    customBrands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        brandSelect.insertBefore(option, customOption);
    });

    // 브랜드 필터에도 추가
    const filterBrandSelect = document.getElementById('filterBrand');
    customBrands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        filterBrandSelect.appendChild(option);
    });

    // 구매사이트 로드
    const customSites = JSON.parse(localStorage.getItem('customSites') || '[]');
    const siteSelect = document.getElementById('purchaseSite');
    const otherOption = siteSelect.querySelector('option[value="other"]');
    
    customSites.forEach(site => {
        const option = document.createElement('option');
        option.value = site;
        option.textContent = site;
        siteSelect.insertBefore(option, otherOption);
    });

    // 필터 드롭다운에도 추가 (기타 항목 이전에 삽입)
    const filterSiteSelect = document.getElementById('filterPurchaseSite');
    const filterOtherOption = filterSiteSelect.querySelector('option[value="other"]');
    
    customSites.forEach(site => {
        const option = document.createElement('option');
        option.value = site;
        option.textContent = site;
        if (filterOtherOption) {
            filterSiteSelect.insertBefore(option, filterOtherOption);
        } else {
            filterSiteSelect.appendChild(option);
        }
    });

    // 브랜드 추가 버튼 이벤트
    document.getElementById('addBrandBtn').addEventListener('click', function() {
        const newBrand = prompt('새 브랜드 이름을 입력하세요:');
        if (newBrand && newBrand.trim()) {
            const brandName = newBrand.trim();
            addCustomBrand(brandName);
        }
    });

    // 브랜드 삭제 버튼 이벤트
    document.getElementById('removeBrandBtn').addEventListener('click', function() {
        const brandSelect = document.getElementById('brand');
        const selectedBrand = brandSelect.value;
        
        if (!selectedBrand || selectedBrand === '' || selectedBrand === 'custom') {
            alert('삭제할 브랜드를 선택하세요.');
            return;
        }
        
        // 기본 제공 브랜드는 삭제 불가
        const defaultBrands = ['Nike', 'Adidas', 'Apple', 'Samsung', 'Sony'];
        if (defaultBrands.includes(selectedBrand)) {
            alert('기본 제공 브랜드는 삭제할 수 없습니다.');
            return;
        }
        
        removeCustomBrand(selectedBrand);
    });

    // 구매사이트 추가 버튼 이벤트
    document.getElementById('addSiteBtn').addEventListener('click', function() {
        const newSite = prompt('새 구매사이트 이름을 입력하세요:');
        if (newSite && newSite.trim()) {
            const siteName = newSite.trim();
            addCustomSite(siteName);
        }
    });

    // 구매사이트 삭제 버튼 이벤트
    document.getElementById('removeSiteBtn').addEventListener('click', function() {
        const siteSelect = document.getElementById('purchaseSite');
        const selectedSite = siteSelect.value;
        
        if (!selectedSite || selectedSite === 'other') {
            alert('삭제할 구매사이트를 선택하세요.');
            return;
        }
        
        // 기본 제공 사이트는 삭제 불가
        const defaultSites = ['amazon', 'ebay', 'aliexpress', 'rakuten', 'iherb', 'costco'];
        if (defaultSites.includes(selectedSite)) {
            alert('기본 제공 구매사이트는 삭제할 수 없습니다.');
            return;
        }
        
        removeCustomSite(selectedSite);
    });

    // 브랜드 선택 이벤트
    brandSelect.addEventListener('change', function() {
        const customInput = document.getElementById('brandCustom');
        if (this.value === 'custom') {
            customInput.style.display = 'block';
            customInput.required = true;
        } else {
            customInput.style.display = 'none';
            customInput.required = false;
            customInput.value = '';
        }
    });
}

// 커스텀 브랜드 추가
function addCustomBrand(brandName) {
    const customBrands = JSON.parse(localStorage.getItem('customBrands') || '[]');
    
    // 중복 체크
    if (customBrands.includes(brandName)) {
        alert('이미 존재하는 브랜드입니다.');
        return;
    }

    customBrands.push(brandName);
    localStorage.setItem('customBrands', JSON.stringify(customBrands));

    // 폼 드롭다운에 추가 (직접 입력 앞에)
    const brandSelect = document.getElementById('brand');
    const customOption = brandSelect.querySelector('option[value="custom"]');
    const newOption = document.createElement('option');
    newOption.value = brandName;
    newOption.textContent = brandName;
    brandSelect.insertBefore(newOption, customOption);

    // 필터 드롭다운에도 추가 (맨 뒤에)
    const filterBrandSelect = document.getElementById('filterBrand');
    const filterOption = document.createElement('option');
    filterOption.value = brandName;
    filterOption.textContent = brandName;
    filterBrandSelect.appendChild(filterOption);

    // 방금 추가한 항목 선택
    brandSelect.value = brandName;
    
    alert(`"${brandName}" 브랜드가 추가되었습니다!`);
}

// 커스텀 구매사이트 추가
function addCustomSite(siteName) {
    const customSites = JSON.parse(localStorage.getItem('customSites') || '[]');
    
    // 중복 체크
    if (customSites.includes(siteName)) {
        alert('이미 존재하는 구매사이트입니다.');
        return;
    }

    customSites.push(siteName);
    localStorage.setItem('customSites', JSON.stringify(customSites));

    // 폼 드롭다운에 추가 (기타 앞에)
    const siteSelect = document.getElementById('purchaseSite');
    const otherOption = siteSelect.querySelector('option[value="other"]');
    const newOption = document.createElement('option');
    newOption.value = siteName;
    newOption.textContent = siteName;
    siteSelect.insertBefore(newOption, otherOption);

    // 필터 드롭다운에도 추가 (맨 뒤에)
    const filterSiteSelect = document.getElementById('filterPurchaseSite');
    const filterOption = document.createElement('option');
    filterOption.value = siteName;
    filterOption.textContent = siteName;
    filterSiteSelect.appendChild(filterOption);

    // 방금 추가한 항목 선택
    siteSelect.value = siteName;
    
    alert(`"${siteName}" 구매사이트가 추가되었습니다!`);
}

// 커스텀 브랜드 삭제
function removeCustomBrand(brandName) {
    if (!confirm(`"${brandName}" 브랜드를 삭제하시겠습니까?`)) {
        return;
    }

    // 로컬스토리지에서 제거
    let customBrands = JSON.parse(localStorage.getItem('customBrands') || '[]');
    customBrands = customBrands.filter(brand => brand !== brandName);
    localStorage.setItem('customBrands', JSON.stringify(customBrands));

    // 폼 드롭다운에서 제거
    const brandSelect = document.getElementById('brand');
    const optionToRemove = Array.from(brandSelect.options).find(opt => opt.value === brandName);
    if (optionToRemove) {
        brandSelect.removeChild(optionToRemove);
    }

    // 필터 드롭다운에서도 제거
    const filterBrandSelect = document.getElementById('filterBrand');
    const filterOptionToRemove = Array.from(filterBrandSelect.options).find(opt => opt.value === brandName);
    if (filterOptionToRemove) {
        filterBrandSelect.removeChild(filterOptionToRemove);
    }

    // 첫 번째 항목 선택
    brandSelect.selectedIndex = 0;
    
    alert(`"${brandName}" 브랜드가 삭제되었습니다.`);
}

// 커스텀 구매사이트 삭제
function removeCustomSite(siteName) {
    if (!confirm(`"${siteName}" 구매사이트를 삭제하시겠습니까?`)) {
        return;
    }

    // 로컬스토리지에서 제거
    let customSites = JSON.parse(localStorage.getItem('customSites') || '[]');
    customSites = customSites.filter(site => site !== siteName);
    localStorage.setItem('customSites', JSON.stringify(customSites));

    // 폼 드롭다운에서 제거
    const siteSelect = document.getElementById('purchaseSite');
    const optionToRemove = Array.from(siteSelect.options).find(opt => opt.value === siteName);
    if (optionToRemove) {
        siteSelect.removeChild(optionToRemove);
    }

    // 필터 드롭다운에서도 제거
    const filterSiteSelect = document.getElementById('filterPurchaseSite');
    const filterOptionToRemove = Array.from(filterSiteSelect.options).find(opt => opt.value === siteName);
    if (filterOptionToRemove) {
        filterSiteSelect.removeChild(filterOptionToRemove);
    }

    // 첫 번째 항목 선택
    siteSelect.selectedIndex = 0;
    
    alert(`"${siteName}" 구매사이트가 삭제되었습니다.`);
}

// 필터링된 거래 가져오기
function getFilteredTransactions() {
    const periodFilter = document.getElementById('periodFilter').value;
    const now = new Date();
    
    // 추가 필터 값 가져오기
    const filterBuyerName = document.getElementById('filterBuyerName')?.value.toLowerCase().trim() || '';
    const filterBrand = document.getElementById('filterBrand')?.value || '';
    const filterProduct = document.getElementById('filterProduct')?.value.toLowerCase().trim() || '';
    const filterPurchaseSite = document.getElementById('filterPurchaseSite')?.value || '';
    const filterPlatform = document.getElementById('filterPlatform')?.value || '';
    const filterCurrency = document.getElementById('filterCurrency')?.value || '';
    
    return transactions.filter(t => {
        const transactionDate = new Date(t.purchaseDate);
        
        // 기간 필터
        let periodMatch = true;
        switch(periodFilter) {
            case 'today':
                periodMatch = isSameDay(transactionDate, now);
                break;
            case 'week':
                const weekAgo = new Date(now);
                weekAgo.setDate(now.getDate() - 7);
                periodMatch = transactionDate >= weekAgo;
                break;
            case 'month':
                periodMatch = transactionDate.getMonth() === now.getMonth() && 
                       transactionDate.getFullYear() === now.getFullYear();
                break;
            case 'year':
                periodMatch = transactionDate.getFullYear() === now.getFullYear();
                break;
            case 'custom':
                const startDate = new Date(document.getElementById('startDate').value);
                const endDate = new Date(document.getElementById('endDate').value);
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                    periodMatch = true;
                } else {
                    periodMatch = transactionDate >= startDate && transactionDate <= endDate;
                }
                break;
            case 'all':
            default:
                periodMatch = true;
        }
        
        // 추가 필터 적용
        const buyerNameMatch = !filterBuyerName || t.buyerName.toLowerCase().includes(filterBuyerName);
        const brandMatch = !filterBrand || t.brand === filterBrand; // 드롭다운이므로 정확히 일치
        const productMatch = !filterProduct || t.productName.toLowerCase().includes(filterProduct);
        const purchaseSiteMatch = !filterPurchaseSite || t.purchaseSite === filterPurchaseSite;
        const platformMatch = !filterPlatform || t.platform === filterPlatform;
        const currencyMatch = !filterCurrency || t.currency === filterCurrency;
        
        return periodMatch && buyerNameMatch && brandMatch && productMatch && 
               purchaseSiteMatch && platformMatch && currencyMatch;
    });
}

// 버튼 초기화
function initializeButtons() {
    document.getElementById('exportBtn').addEventListener('click', exportToExcel);
    document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
    
    // 필터 입력 필드에 이벤트 리스너 추가
    const filterInputs = ['filterBuyerName', 'filterBrand', 'filterProduct', 
                         'filterPurchaseSite', 'filterPlatform', 'filterCurrency'];
    
    filterInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', applyFilters);
            element.addEventListener('change', applyFilters);
        }
    });
}

// 엑셀 다운로드
function exportToExcel() {
    const filteredTransactions = getFilteredTransactions();
    
    if (filteredTransactions.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
    }

    let csv = '\ufeff'; // UTF-8 BOM
    csv += '구매일자,구매자명,연락처,배송지주소,브랜드,품명,수량,구매사이트,구매가격(배송비포함),통화,환율,구매가격(원),판매가격,판매플랫폼,수수료율(%),수수료(원),관부과세,국내배송비,총비용,순이익,마진률(%)\n';
    
    filteredTransactions.forEach(t => {
        csv += [
            t.purchaseDate,
            t.buyerName,
            t.buyerPhone,
            t.buyerAddress || '',
            t.brand,
            t.productName,
            t.quantity,
            getPurchaseSiteName(t.purchaseSite, t.purchaseSiteCustom),
            t.purchasePrice.toFixed(2),
            t.currency,
            t.exchangeRate.toFixed(2),
            t.purchasePriceKRW.toFixed(0),
            t.salePrice.toFixed(0),
            getPlatformName(t.platform),
            t.platformFee.toFixed(1),
            t.platformFeeAmount.toFixed(0),
            t.customsDuty.toFixed(0),
            t.shippingFee.toFixed(0),
            t.totalCost.toFixed(0),
            t.profit.toFixed(0),
            t.margin.toFixed(2)
        ].join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const periodFilter = document.getElementById('periodFilter').value;
    const filename = `해외직구거래내역_${periodFilter}_${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 전체 삭제
async function clearAllTransactions() {
    if (transactions.length === 0) {
        alert('삭제할 데이터가 없습니다.');
        return;
    }

    if (confirm('모든 거래 내역을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
        if (confirm('정말로 삭제하시겠습니까?')) {
            // Firebase 전체 삭제 (활성화된 경우)
            if (isFirebaseEnabled) {
                try {
                    await clearFirebase();
                    console.log('✅ Firebase 전체 삭제 완료');
                } catch (error) {
                    console.error('❌ Firebase 전체 삭제 실패, 로컬만 삭제:', error);
                }
            }
            
            // 로컬 데이터 삭제
            transactions = [];
            saveTransactions();
            updateStatistics();
            displayTransactions();
            alert('모든 거래 내역이 삭제되었습니다.');
        }
    }
}

// 유틸리티 함수들
function formatCurrency(amount) {
    return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW'
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

function isSameDay(date1, date2) {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
}

function getPlatformName(platform) {
    const names = {
        'coupang': '쿠팡',
        'naver': '네이버 쇼핑',
        'street11': '11번가',
        'gmarket': 'G마켓',
        'auction': '옥션',
        'direct': '직거래',
        'custom': '기타'
    };
    return names[platform] || platform;
}

function getPurchaseSiteName(site, customName) {
    const names = {
        'amazon': 'Amazon',
        'ebay': 'eBay',
        'aliexpress': 'AliExpress',
        'rakuten': '楽天',
        'iherb': 'iHerb',
        'costco': 'Costco',
        'other': customName || '기타'
    };
    return names[site] || site;
}

// 필터 적용
function applyFilters() {
    updateStatistics();
    displayTransactions();
}

// 필터 초기화
function resetFilters() {
    document.getElementById('filterBuyerName').value = '';
    document.getElementById('filterBrand').value = '';
    document.getElementById('filterProduct').value = '';
    document.getElementById('filterPurchaseSite').value = '';
    document.getElementById('filterPlatform').value = '';
    document.getElementById('filterCurrency').value = '';
    
    applyFilters();
}

// ========================================
// 그래프 관련 함수
// ========================================

let charts = {
    monthly: null,
    purchaseSite: null,
    platform: null,
    currency: null,
    brand: null
};

// 모든 차트 업데이트
function updateCharts(transactions) {
    updateMonthlyChart(transactions);
    updatePurchaseSiteChart(transactions);
    updatePlatformChart(transactions);
    updateCurrencyChart(transactions);
    updateBrandChart(transactions);
}

// 월별 매출/비용/이익 추이 차트
function updateMonthlyChart(transactions) {
    const ctx = document.getElementById('monthlyChart');
    if (!ctx) return;

    // 월별 데이터 집계
    const monthlyData = {};
    transactions.forEach(t => {
        const date = new Date(t.purchaseDate);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { revenue: 0, cost: 0, profit: 0 };
        }
        
        monthlyData[monthKey].revenue += t.salePrice;
        monthlyData[monthKey].cost += t.totalCost;
        monthlyData[monthKey].profit += t.profit;
    });

    // 최근 12개월 데이터만 표시
    const sortedMonths = Object.keys(monthlyData).sort().slice(-12);
    const labels = sortedMonths.map(m => {
        const [year, month] = m.split('-');
        return `${year}년 ${month}월`;
    });
    
    const revenueData = sortedMonths.map(m => Math.round(monthlyData[m].revenue));
    const costData = sortedMonths.map(m => Math.round(monthlyData[m].cost));
    const profitData = sortedMonths.map(m => Math.round(monthlyData[m].profit));

    if (charts.monthly) {
        charts.monthly.destroy();
    }

    charts.monthly = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '매출',
                    data: revenueData,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4
                },
                {
                    label: '비용',
                    data: costData,
                    borderColor: '#f093fb',
                    backgroundColor: 'rgba(240, 147, 251, 0.1)',
                    tension: 0.4
                },
                {
                    label: '순이익',
                    data: profitData,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return (value / 1000000).toFixed(1) + 'M';
                        }
                    }
                }
            }
        }
    });
}

// 구매사이트별 거래 비율 차트
function updatePurchaseSiteChart(transactions) {
    const ctx = document.getElementById('purchaseSiteChart');
    if (!ctx) return;

    const siteCount = {};
    transactions.forEach(t => {
        const siteName = getPurchaseSiteName(t.purchaseSite, t.purchaseSiteCustom);
        siteCount[siteName] = (siteCount[siteName] || 0) + 1;
    });

    const labels = Object.keys(siteCount);
    const data = Object.values(siteCount);
    const colors = [
        '#667eea', '#764ba2', '#f093fb', '#4facfe',
        '#43e97b', '#fa709a', '#fee140', '#30cfd0'
    ];

    if (charts.purchaseSite) {
        charts.purchaseSite.destroy();
    }

    charts.purchaseSite = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// 판매 플랫폼별 매출 차트
function updatePlatformChart(transactions) {
    const ctx = document.getElementById('platformChart');
    if (!ctx) return;

    const platformRevenue = {};
    transactions.forEach(t => {
        const platformName = getPlatformName(t.platform);
        platformRevenue[platformName] = (platformRevenue[platformName] || 0) + t.salePrice;
    });

    const labels = Object.keys(platformRevenue);
    const data = Object.values(platformRevenue).map(v => Math.round(v));

    if (charts.platform) {
        charts.platform.destroy();
    }

    charts.platform = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '매출액',
                data: data,
                backgroundColor: '#667eea'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '매출: ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return (value / 1000000).toFixed(1) + 'M';
                        }
                    }
                }
            }
        }
    });
}

// 통화별 거래 건수 차트
function updateCurrencyChart(transactions) {
    const ctx = document.getElementById('currencyChart');
    if (!ctx) return;

    const currencyCount = {};
    transactions.forEach(t => {
        currencyCount[t.currency] = (currencyCount[t.currency] || 0) + 1;
    });

    const labels = Object.keys(currencyCount);
    const data = Object.values(currencyCount);

    if (charts.currency) {
        charts.currency.destroy();
    }

    charts.currency = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '거래 건수',
                data: data,
                backgroundColor: '#764ba2'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// 브랜드별 Top 10 매출 차트
function updateBrandChart(transactions) {
    const ctx = document.getElementById('brandChart');
    if (!ctx) return;

    const brandRevenue = {};
    transactions.forEach(t => {
        brandRevenue[t.brand] = (brandRevenue[t.brand] || 0) + t.salePrice;
    });

    // 매출 순으로 정렬하고 Top 10만 선택
    const sortedBrands = Object.entries(brandRevenue)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const labels = sortedBrands.map(b => b[0]);
    const data = sortedBrands.map(b => Math.round(b[1]));

    if (charts.brand) {
        charts.brand.destroy();
    }

    charts.brand = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '매출액',
                data: data,
                backgroundColor: '#f093fb'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y', // 수평 바 차트
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '매출: ' + formatCurrency(context.parsed.x);
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return (value / 1000000).toFixed(1) + 'M';
                        }
                    }
                }
            }
        }
    });
}
