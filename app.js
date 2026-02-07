// GAS Web App URL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxdrr1vZuTc4JaDco9SnPw2ZKFlF5AgXnJOABEOlLzyESqvhB2ls9Gg8Vy_de6z_AVqiQ/exec';

// State
let apps = [];
let genres = [];
let selectedGenre = null;
let editingAppId = null;
let expandedGenres = {}; // ジャンルの開閉状態

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupTabs();
    setupAppForm();
});

// Load data from GAS
async function loadData() {
    try {
        const [appsRes, genresRes] = await Promise.all([
            fetch(GAS_URL + '?action=getApps').then(r => r.json()),
            fetch(GAS_URL + '?action=getGenres').then(r => r.json())
        ]);

        apps = appsRes.data || [];
        genres = genresRes.data || [];

        console.log('Loaded:', { apps, genres });
    } catch (e) {
        console.error('Load error:', e);
    }

    render();
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

// Long press state
let longPressTimer = null;
let isLongPress = false;

// Render app card
function renderAppCard(app) {
    const hasHtml = app.html_code && !app.url;
    return `
        <div class="app-card" 
             data-app-id="${app.id}"
             onmousedown="startLongPress(event, ${app.id})"
             onmouseup="endLongPress(event, ${app.id})"
             onmouseleave="cancelLongPress()"
             ontouchstart="startLongPress(event, ${app.id})"
             ontouchend="endLongPress(event, ${app.id})"
             ontouchcancel="cancelLongPress()">
            <div class="app-icon">
                ${app.icon_url ? `<img src="${app.icon_url}" onerror="this.parentElement.innerHTML='📦'">` : (hasHtml ? '📄' : '📦')}
            </div>
            <div class="app-title">${app.title || '無題'}</div>
            <div class="app-actions">
                <button onclick="event.stopPropagation(); editApp(${app.id})">✏️</button>
                <button onclick="event.stopPropagation(); deleteApp(${app.id})">🗑️</button>
            </div>
        </div>
    `;
}

// Start long press timer (500ms)
function startLongPress(event, appId) {
    // Don't trigger on action buttons
    if (event.target.closest('.app-actions')) return;

    isLongPress = false;
    const card = event.currentTarget;

    longPressTimer = setTimeout(() => {
        isLongPress = true;

        // Hide all other action buttons first
        document.querySelectorAll('.app-card.show-actions').forEach(c => {
            c.classList.remove('show-actions');
        });

        // Show actions for this card
        card.classList.add('show-actions');

        // Vibrate on mobile if supported
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }, 500);
}

// End long press - open app if it was a short click
function endLongPress(event, appId) {
    // Don't trigger on action buttons
    if (event.target.closest('.app-actions')) return;

    clearTimeout(longPressTimer);

    const card = event.currentTarget;

    // If it was a long press, don't open the app
    if (isLongPress) {
        isLongPress = false;
        return;
    }

    // If actions are showing, hide them
    if (card.classList.contains('show-actions')) {
        card.classList.remove('show-actions');
        return;
    }

    // Short click - open the app
    openApp(appId);
}

// Cancel long press
function cancelLongPress() {
    clearTimeout(longPressTimer);
    isLongPress = false;
}

// Hide actions when clicking outside
document.addEventListener('click', (event) => {
    if (!event.target.closest('.app-card')) {
        document.querySelectorAll('.app-card.show-actions').forEach(card => {
            card.classList.remove('show-actions');
        });
    }
});

// Render genre select
function renderGenreSelect() {
    const select = document.getElementById('appGenre');
    if (!select) return;
    select.innerHTML = genres.map(g => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('');
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
}

function closeModal(e) {
    if (e && e.target !== e.currentTarget) return;

    document.getElementById('modal').classList.remove('active');

    // Reset form
    editingAppId = null;
    document.getElementById('appUrl').value = '';
    document.getElementById('appTitle').value = '';
    document.getElementById('appDesc').value = '';
    document.getElementById('appIcon').value = '';
    document.getElementById('appHtml').value = '';
    document.querySelector('.tabs .tab[data-tab="app"]').textContent = 'アプリ追加';
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
