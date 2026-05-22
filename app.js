// GAS Web App URL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxdrr1vZuTc4JaDco9SnPw2ZKFlF5AgXnJOABEOlLzyESqvhB2ls9Gg8Vy_de6z_AVqiQ/exec';

// SWR キャッシュ（前回データを即描画 → 裏で更新）
const CACHE_KEY = 'myhub_data_v1';
const FETCH_TIMEOUT_MS = 15000;
const FETCH_MAX_RETRIES = 3;

// Icon set (24 patterns) — icon_url に "icons/xxx.svg" を保存
const ICON_SET = [
    { id: 'work', label: '仕事' },
    { id: 'mail', label: 'メール' },
    { id: 'memo', label: 'メモ' },
    { id: 'document', label: '文書' },
    { id: 'calendar', label: 'カレンダー' },
    { id: 'chart', label: 'グラフ' },
    { id: 'chat', label: 'チャット' },
    { id: 'money', label: 'お金' },
    { id: 'shopping', label: 'ショッピング' },
    { id: 'tool', label: 'ツール' },
    { id: 'study', label: '学習' },
    { id: 'book', label: '読書' },
    { id: 'media', label: 'メディア' },
    { id: 'music', label: '音楽' },
    { id: 'video', label: '動画' },
    { id: 'photo', label: '写真' },
    { id: 'game', label: 'ゲーム' },
    { id: 'home', label: 'ホーム' },
    { id: 'cloud', label: 'クラウド' },
    { id: 'code', label: '開発' },
    { id: 'folder', label: 'フォルダ' },
    { id: 'globe', label: 'ウェブ' },
    { id: 'star', label: 'お気に入り' },
    { id: 'settings', label: '設定' }
];

const iconPath = id => `icons/${id}.svg`;

// State
let apps = [];
let genres = [];
let selectedGenre = null;
let editingAppId = null;
let expandedGenres = {}; // ジャンルの開閉状態

// Init
document.addEventListener('DOMContentLoaded', () => {
    // 1. キャッシュがあれば即描画（体感 0ms）
    const cached = readCache();
    if (cached) {
        apps = cached.apps || [];
        genres = cached.genres || [];
        render();
    }
    // 2. 裏で最新データ取得 → 差分あれば再描画
    refreshFromServer();
    setupTabs();
    setupAppForm();
    renderIconGallery();
});

// localStorage SWR キャッシュ
function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function writeCache(data) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            apps: data.apps,
            genres: data.genres,
            cached_at: new Date().toISOString()
        }));
    } catch (e) {
        // QuotaExceeded 等は無視（キャッシュは best-effort）
    }
}

// fetch with timeout & exponential backoff retry
async function fetchJsonWithRetry(url, opts = {}, maxRetries = FETCH_MAX_RETRIES) {
    let lastErr;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, { ...opts, signal: ctrl.signal });
            clearTimeout(timer);
            const text = await res.text();
            // GAS は HTTP 500 でも HTML を返すため content-type ではなく中身で判定
            if (text.startsWith('<')) throw new Error(`GAS HTML error (HTTP ${res.status})`);
            return JSON.parse(text);
        } catch (e) {
            clearTimeout(timer);
            lastErr = e;
            if (attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
            }
        }
    }
    throw lastErr;
}

// データ取得：getAll 統合エンドポイントを優先、未対応なら個別fetchへfallback
async function fetchAllData() {
    try {
        const res = await fetchJsonWithRetry(GAS_URL + '?action=getAll');
        if (res.success && Array.isArray(res.apps) && Array.isArray(res.genres)) {
            return { apps: res.apps, genres: res.genres };
        }
        // success=false かつ Unknown action ならフォールバック、そうでなければエラー
        if (res.error && !/Unknown action/i.test(res.error)) {
            throw new Error(res.error);
        }
    } catch (e) {
        console.warn('getAll failed, fallback to getApps + getGenres:', e.message);
    }
    // Fallback: 旧 Code.gs 用に個別取得（GAS 再デプロイ前でも動作）
    const [appsRes, genresRes] = await Promise.all([
        fetchJsonWithRetry(GAS_URL + '?action=getApps'),
        fetchJsonWithRetry(GAS_URL + '?action=getGenres')
    ]);
    return { apps: appsRes.data || [], genres: genresRes.data || [] };
}

async function refreshFromServer() {
    try {
        const fresh = await fetchAllData();
        const changed = JSON.stringify({ apps, genres }) !== JSON.stringify(fresh);
        apps = fresh.apps;
        genres = fresh.genres;
        writeCache(fresh);
        if (changed || !readCache()) render();
    } catch (e) {
        console.error('Refresh failed (using cache):', e);
        // キャッシュも無く全失敗の場合のみエラー表示
        if (!apps.length && !genres.length) {
            const content = document.getElementById('content');
            if (content) content.innerHTML = '<p class="loading">読み込みに失敗しました。接続を確認して再読み込みしてください。</p>';
        }
    }
}

// 後方互換用エイリアス（既存コードから呼ばれる）
async function loadData() {
    return refreshFromServer();
}

// Render all
function render() {
    renderSidebar();
    renderContent();
    renderGenreSelect();
}

// Render sidebar
function renderSidebar() {
    const nav = document.getElementById('sidebarNav');
    let html = `<button class="nav-btn ${!selectedGenre ? 'active' : ''}" onclick="selectGenre(null)"><span>📁</span><span>すべて</span></button>`;

    genres.forEach(g => {
        html += `<button class="nav-btn ${selectedGenre === g.slug ? 'active' : ''}" onclick="selectGenre('${g.slug}')"><span>${g.icon}</span><span>${g.name}</span></button>`;
    });

    nav.innerHTML = html;
}

// Render content
function renderContent() {
    const content = document.getElementById('content');
    const search = document.getElementById('searchInput').value.toLowerCase();

    let filtered = apps;

    if (selectedGenre) {
        const genre = genres.find(g => g.slug === selectedGenre);
        if (genre) filtered = apps.filter(a => a.genre_id === genre.id);
    }

    if (search) {
        filtered = filtered.filter(a =>
            (a.title || '').toLowerCase().includes(search) ||
            (a.description || '').toLowerCase().includes(search)
        );
    }

    // Update title
    const title = selectedGenre ? genres.find(g => g.slug === selectedGenre)?.name || 'すべて' : 'すべて';
    document.getElementById('pageTitle').innerHTML = `${title} <span id="appCount">(${filtered.length})</span>`;

    if (filtered.length === 0) {
        content.innerHTML = '<p class="loading">アプリがありません</p>';
        return;
    }

    if (!selectedGenre) {
        // Group by genre with expand/collapse
        let html = '';
        genres.forEach(g => {
            const genreApps = filtered.filter(a => a.genre_id === g.id);
            if (genreApps.length === 0) return;

            const isExpanded = expandedGenres[g.id] || false;

            html += `
                <div class="genre-section">
                    <div class="genre-title" onclick="toggleGenre(${g.id})">
                        <span class="icon">${g.icon}</span>
                        <span>${g.name}</span>
                        <span class="count">${genreApps.length}</span>
                        <span class="arrow">${isExpanded ? '▼' : '▶'}</span>
                    </div>
                    <div class="app-grid ${isExpanded ? '' : 'collapsed'}">
                        ${genreApps.map(renderAppCard).join('')}
                    </div>
                </div>
            `;
        });

        // Uncategorized
        const uncategorized = filtered.filter(a => !genres.find(g => g.id === a.genre_id));
        if (uncategorized.length > 0) {
            const isExpanded = expandedGenres['uncategorized'] || false;
            html += `
                <div class="genre-section">
                    <div class="genre-title" onclick="toggleGenre('uncategorized')">
                        <span class="icon">📦</span>
                        <span>未分類</span>
                        <span class="count">${uncategorized.length}</span>
                        <span class="arrow">${isExpanded ? '▼' : '▶'}</span>
                    </div>
                    <div class="app-grid ${isExpanded ? '' : 'collapsed'}">
                        ${uncategorized.map(renderAppCard).join('')}
                    </div>
                </div>
            `;
        }

        content.innerHTML = html || '<p class="loading">アプリがありません</p>';
    } else {
        content.innerHTML = `<div class="app-grid">${filtered.map(renderAppCard).join('')}</div>`;
    }
}

// Toggle genre expand/collapse (accordion behavior - only one open at a time)
function toggleGenre(genreId) {
    // If clicking the same one, just toggle it
    if (expandedGenres[genreId]) {
        expandedGenres[genreId] = false;
    } else {
        // Close all others and open this one
        expandedGenres = {};
        expandedGenres[genreId] = true;
    }
    renderContent();
}

// Render app card
function renderAppCard(app) {
    const hasHtml = app.html_code && !app.url;
    return `
        <div class="app-card" data-app-id="${app.id}" onclick="openApp(${app.id})">
            <button class="app-action app-action-delete" title="削除" onclick="event.stopPropagation(); deleteApp(${app.id})">🗑️</button>
            <div class="app-icon">
                ${app.icon_url ? `<img src="${app.icon_url}" onerror="this.parentElement.innerHTML='📦'">` : (hasHtml ? '📄' : '📦')}
            </div>
            <div class="app-title">${app.title || '無題'}</div>
            <button class="app-action app-action-edit" title="編集" onclick="event.stopPropagation(); editApp(${app.id})">✏️</button>
        </div>
    `;
}

// Render icon gallery
function renderIconGallery() {
    const gallery = document.getElementById('iconGallery');
    if (!gallery) return;

    const current = document.getElementById('appIcon').value;
    let html = `<div class="icon-cell icon-cell-none ${!current ? 'selected' : ''}" data-icon="" title="なし">×</div>`;
    html += ICON_SET.map(ic => {
        const path = iconPath(ic.id);
        const sel = current === path ? 'selected' : '';
        return `<div class="icon-cell ${sel}" data-icon="${path}" title="${ic.label}"><img src="${path}" alt="${ic.label}"></div>`;
    }).join('');

    gallery.innerHTML = html;

    gallery.querySelectorAll('.icon-cell').forEach(cell => {
        cell.addEventListener('click', () => selectIcon(cell.dataset.icon));
    });
}

// Select icon
function selectIcon(path) {
    document.getElementById('appIcon').value = path || '';
    document.querySelectorAll('#iconGallery .icon-cell').forEach(c => {
        c.classList.toggle('selected', c.dataset.icon === (path || ''));
    });
}

// Render genre select（再描画時に現在の選択値を保持する：裏更新でジャンルがリセットされるバグ対策）
function renderGenreSelect() {
    const select = document.getElementById('appGenre');
    if (!select) return;
    const prev = select.value;
    select.innerHTML = genres.map(g => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('');
    if (prev && [...select.options].some(o => o.value === prev)) {
        select.value = prev;
    }
}

// Render genre list
function renderGenreList() {
    const list = document.getElementById('genreList');
    list.innerHTML = genres.map(g => `
        <div class="genre-item" id="genre-item-${g.id}">
            <span class="genre-display">${g.icon} ${g.name}</span>
            <div class="genre-actions">
                <button onclick="startEditGenre(${g.id})">✏️</button>
                <button onclick="deleteGenre(${g.id})">✕</button>
            </div>
        </div>
    `).join('');
}

// Start editing genre
function startEditGenre(id) {
    const genre = genres.find(g => g.id === id);
    if (!genre) return;

    const item = document.getElementById('genre-item-' + id);
    item.innerHTML = `
        <input type="text" class="edit-icon-input" id="edit-icon-${id}" value="${genre.icon}" style="width:40px;text-align:center;">
        <input type="text" class="edit-name-input" id="edit-name-${id}" value="${genre.name}" style="flex:1;">
        <button onclick="saveEditGenre(${id})">💾</button>
        <button onclick="renderGenreList()">✕</button>
    `;
}

// Save edited genre
async function saveEditGenre(id) {
    const icon = document.getElementById('edit-icon-' + id).value.trim() || '📁';
    const name = document.getElementById('edit-name-' + id).value.trim();

    if (!name) {
        alert('ジャンル名を入力してください');
        return;
    }

    try {
        await postToGAS({ action: 'updateGenre', id, genre: { name, icon } });
        await loadData();
        renderGenreList();
    } catch (e) {
        alert('更新に失敗しました: ' + e.message);
        console.error(e);
    }
}

// Select genre
function selectGenre(slug) {
    selectedGenre = slug;
    render();
}

// Open app
function openApp(id) {
    const app = apps.find(a => a.id === id);
    if (!app) return;

    if (app.html_code && !app.url) {
        const blob = new Blob([app.html_code], { type: 'text/html' });
        window.open(URL.createObjectURL(blob), '_blank');
    } else if (app.url) {
        window.open(app.url, '_blank');
    }
}

// Edit app
function editApp(id) {
    const app = apps.find(a => a.id === id);
    if (!app) return;

    editingAppId = id;
    document.querySelector('.tabs .tab[data-tab="app"]').textContent = 'アプリ編集';
    openModal();

    // Set form values AFTER openModal (which re-renders the genre select)
    document.getElementById('appUrl').value = app.url || '';
    document.getElementById('appTitle').value = app.title || '';
    document.getElementById('appDesc').value = app.description || '';
    document.getElementById('appGenre').value = app.genre_id || '';
    document.getElementById('appIcon').value = app.icon_url || '';
    document.getElementById('appHtml').value = app.html_code || '';
    renderIconGallery();
}

// Delete app
async function deleteApp(id) {
    if (!confirm('削除しますか？')) return;

    try {
        await postToGAS({ action: 'deleteApp', id });
        apps = apps.filter(a => a.id !== id);
        render();
    } catch (e) {
        alert('削除に失敗しました');
        console.error(e);
    }
}

// Save app
async function saveAppData() {
    const data = {
        url: document.getElementById('appUrl').value,
        title: document.getElementById('appTitle').value,
        description: document.getElementById('appDesc').value,
        genre_id: parseInt(document.getElementById('appGenre').value) || null,
        icon_url: document.getElementById('appIcon').value,
        html_code: document.getElementById('appHtml').value
    };

    if (!data.title) {
        alert('タイトルを入力してください');
        return;
    }

    if (!data.url && !data.html_code) {
        alert('URLまたはHTMLコードを入力してください');
        return;
    }

    try {
        if (editingAppId) {
            await postToGAS({ action: 'updateApp', id: editingAppId, app: data });
        } else {
            await postToGAS({ action: 'createApp', app: data });
        }

        closeModal();
        await loadData();
    } catch (e) {
        alert('保存に失敗しました: ' + e.message);
        console.error(e);
    }
}

// Save genre
async function saveGenre() {
    const name = document.getElementById('genreName').value.trim();
    const icon = document.getElementById('genreIcon').value.trim() || '📁';

    if (!name) {
        alert('ジャンル名を入力してください');
        return;
    }

    try {
        await postToGAS({ action: 'createGenre', genre: { name, icon } });
        document.getElementById('genreName').value = '';
        await loadData();
        renderGenreList();
        // モーダルを閉じる
        closeModal();
    } catch (e) {
        alert('保存に失敗しました: ' + e.message);
        console.error(e);
    }
}

// Delete genre
async function deleteGenre(id) {
    if (!confirm('削除しますか？')) return;

    try {
        await postToGAS({ action: 'deleteGenre', id });
        await loadData();
        renderGenreList();
    } catch (e) {
        alert('削除に失敗しました');
        console.error(e);
    }
}

// POST to GAS
async function postToGAS(data) {
    console.log('POST:', data);

    const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(data)
    });

    const text = await res.text();
    console.log('Response:', text);

    try {
        const json = JSON.parse(text);
        if (!json.success && json.error) {
            throw new Error(json.error);
        }
        return json;
    } catch (e) {
        if (text.includes('<!DOCTYPE')) {
            throw new Error('GASエラー: 権限を確認してください');
        }
        throw e;
    }
}

// Modal
function openModal() {
    document.getElementById('modal').classList.add('active');
    renderGenreList();
    renderGenreSelect();
    renderIconGallery();
}

function closeModal(e) {
    if (e && e.target !== e.currentTarget) return;

    document.getElementById('modal').classList.remove('active');

    // Reset form
    editingAppId = null;
    document.getElementById('appUrl').value = '';
    document.getElementById('appTitle').value = '';
    document.getElementById('appDesc').value = '';
    document.getElementById('appGenre').value = '';
    document.getElementById('appIcon').value = '';
    document.getElementById('appHtml').value = '';
    document.querySelector('.tabs .tab[data-tab="app"]').textContent = 'アプリ追加';
    renderIconGallery();
}

// Tab switching
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(target + 'Form').classList.add('active');

            if (target === 'genre') renderGenreList();
        });
    });
}

// App form setup
function setupAppForm() {
    document.getElementById('appForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveAppData();
    });
}
