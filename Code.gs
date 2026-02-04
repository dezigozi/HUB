/**
 * My Hub - Google Apps Script Backend（コンテナバインドスクリプト版）
 * 
 * ★★★ セットアップ ★★★
 * 1. スプレッドシート（My_Hub）を開く
 * 2. 拡張機能 → Apps Script をクリック
 * 3. このコードを貼り付け
 * 4. testGetApps を実行して権限を承認
 * 5. デプロイ → 新しいデプロイ → ウェブアプリ → 全員 → デプロイ
 */

const APPS_SHEET = '保存シート';
const GENRES_SHEET = 'ジャンルマスタ';

// カラムマッピング
const COL = { ID: 0, GENRE_ID: 1, TITLE: 2, URL: 3, ICON: 4, DESC: 5, ORDER: 6, CREATED: 7, UPDATED: 8, HTML: 9 };
const GCOL = { ID: 0, NAME: 1, SLUG: 2, ICON: 3, ORDER: 4, CREATED: 5 };

function doGet(e) {
  const action = e.parameter.action || 'getApps';
  let result;
  
  try {
    if (action === 'getApps') result = getApps();
    else if (action === 'getGenres') result = getGenres();
    else result = { success: false, error: 'Unknown action' };
  } catch (err) {
    result = { success: false, error: err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result;
  
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'createApp') result = createApp(data.app);
    else if (action === 'updateApp') result = updateApp(data.id, data.app);
    else if (action === 'deleteApp') result = deleteApp(data.id);
    else if (action === 'createGenre') result = createGenre(data.genre);
    else if (action === 'updateGenre') result = updateGenre(data.id, data.genre);
    else if (action === 'deleteGenre') result = deleteGenre(data.id);
    else result = { success: false, error: 'Unknown action' };
  } catch (err) {
    result = { success: false, error: err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// === アプリ機能 ===

function getApps() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(APPS_SHEET);
  if (!sheet) return { success: false, error: 'シートが見つかりません' };
  
  const data = sheet.getDataRange().getValues();
  const apps = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[COL.ID]) continue;
    
    apps.push({
      id: row[COL.ID],
      genre_id: row[COL.GENRE_ID],
      title: row[COL.TITLE] || '',
      url: row[COL.URL] || '',
      icon_url: row[COL.ICON] || null,
      description: row[COL.DESC] || null,
      sort_order: row[COL.ORDER] || 0,
      created_at: formatDate(row[COL.CREATED]),
      updated_at: formatDate(row[COL.UPDATED]),
      html_code: row[COL.HTML] || null
    });
  }
  
  apps.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return { success: true, data: apps };
}

function createApp(app) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(APPS_SHEET);
  
  const data = sheet.getDataRange().getValues();
  let maxId = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][COL.ID] > maxId) maxId = data[i][COL.ID];
  }
  
  const newId = maxId + 1;
  const now = new Date();
  
  sheet.appendRow([
    newId,
    app.genre_id || null,
    app.title || '',
    app.url || '',
    app.icon_url || '',
    app.description || '',
    0,
    now,
    now,
    app.html_code || ''
  ]);
  
  return { success: true, data: { id: newId } };
}

function updateApp(id, app) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(APPS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][COL.ID] == id) {
      const row = i + 1;
      const now = new Date();
      
      sheet.getRange(row, COL.GENRE_ID + 1).setValue(app.genre_id);
      sheet.getRange(row, COL.TITLE + 1).setValue(app.title);
      sheet.getRange(row, COL.URL + 1).setValue(app.url || '');
      sheet.getRange(row, COL.ICON + 1).setValue(app.icon_url || '');
      sheet.getRange(row, COL.DESC + 1).setValue(app.description || '');
      sheet.getRange(row, COL.HTML + 1).setValue(app.html_code || '');
      sheet.getRange(row, COL.UPDATED + 1).setValue(now);
      
      return { success: true };
    }
  }
  return { success: false, error: 'Not found' };
}

function deleteApp(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(APPS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][COL.ID] == id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'Not found' };
}

// === ジャンル機能 ===

function getGenres() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GENRES_SHEET);
  
  if (!sheet) {
    sheet = ss.insertSheet(GENRES_SHEET);
    sheet.appendRow(['ID', '名前', 'スラッグ', 'アイコン', '並び順', '作成日']);
    sheet.appendRow([1, 'ビジネス', 'business', '💼', 0, new Date()]);
    sheet.appendRow([2, 'ゲーム', 'games', '🎮', 1, new Date()]);
    sheet.appendRow([3, 'その他', 'others', '📁', 2, new Date()]);
  }
  
  const data = sheet.getDataRange().getValues();
  const genres = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[GCOL.ID]) continue;
    
    genres.push({
      id: row[GCOL.ID],
      name: row[GCOL.NAME],
      slug: row[GCOL.SLUG],
      icon: row[GCOL.ICON] || '📁',
      sort_order: row[GCOL.ORDER] || 0,
      created_at: formatDate(row[GCOL.CREATED])
    });
  }
  
  genres.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return { success: true, data: genres };
}

function createGenre(genre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GENRES_SHEET);
  
  if (!sheet) {
    sheet = ss.insertSheet(GENRES_SHEET);
    sheet.appendRow(['ID', '名前', 'スラッグ', 'アイコン', '並び順', '作成日']);
  }
  
  const data = sheet.getDataRange().getValues();
  let maxId = 0, maxOrder = 0;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][GCOL.ID] > maxId) maxId = data[i][GCOL.ID];
    if (data[i][GCOL.ORDER] > maxOrder) maxOrder = data[i][GCOL.ORDER];
  }
  
  const newId = maxId + 1;
  // 日本語対応: IDベースのスラッグを使用
  const slug = 'genre-' + newId;
  
  sheet.appendRow([newId, genre.name, slug, genre.icon || '📁', maxOrder + 1, new Date()]);
  
  return { success: true, data: { id: newId } };
}

function updateGenre(id, genre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GENRES_SHEET);
  if (!sheet) return { success: false, error: 'Sheet not found' };
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][GCOL.ID] == id) {
      const row = i + 1;
      sheet.getRange(row, GCOL.NAME + 1).setValue(genre.name);
      sheet.getRange(row, GCOL.ICON + 1).setValue(genre.icon || '📁');
      return { success: true };
    }
  }
  return { success: false, error: 'Not found' };
}

function deleteGenre(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GENRES_SHEET);
  if (!sheet) return { success: false, error: 'Sheet not found' };
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][GCOL.ID] == id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'Not found' };
}

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

// テスト用（権限承認に使用）
function testGetApps() {
  const result = getApps();
  Logger.log(JSON.stringify(result, null, 2));
}

function testGetGenres() {
  const result = getGenres();
  Logger.log(JSON.stringify(result, null, 2));
}
