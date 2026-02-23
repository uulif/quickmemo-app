export class StorageManager {
  constructor() {
    this.SETTINGS_KEY = 'qm_settings';
    this.DRAFT_KEY = 'qm_draft';
    this.FAVORITES_KEY = 'qm_favorites';
    this.ARCHIVE_EXPIRY_KEY = 'qm_archive_expiries';
  }

  getSettings() {
    const data = JSON.parse(localStorage.getItem(this.SETTINGS_KEY) || '{}');
    return {
      language: 'ja',
      defaultFolderId: null,
      defaultFolderName: null,
      memoFolderName: 'メモ',
      archiveFolderName: 'QuickMemo アーカイブ',
      geminiApiKey: '',
      ...data
    };
  }

  updateSettings(updates) {
    const current = this.getSettings();
    const merged = { ...current, ...updates };
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(merged));
    return merged;
  }

  saveDraft(draft) {
    localStorage.setItem(this.DRAFT_KEY, JSON.stringify({
      content: draft.content || '',
      title: draft.title || '',
      savedAt: Date.now()
    }));
  }

  getDraft() {
    const data = localStorage.getItem(this.DRAFT_KEY);
    return data ? JSON.parse(data) : null;
  }

  clearDraft() {
    localStorage.removeItem(this.DRAFT_KEY);
  }

  getFavorites(accountId) {
    const data = JSON.parse(localStorage.getItem(this.FAVORITES_KEY) || '{}');
    return data[accountId] || [];
  }

  addFavorite(accountId, folder) {
    const data = JSON.parse(localStorage.getItem(this.FAVORITES_KEY) || '{}');
    const accountFavs = data[accountId] || [];
    if (accountFavs.some(f => f.id === folder.id)) return;
    accountFavs.push({
      id: folder.id,
      name: folder.name,
      path: folder.path || folder.name
    });
    data[accountId] = accountFavs;
    localStorage.setItem(this.FAVORITES_KEY, JSON.stringify(data));
  }

  removeFavorite(accountId, folderId) {
    const data = JSON.parse(localStorage.getItem(this.FAVORITES_KEY) || '{}');
    const accountFavs = data[accountId] || [];
    data[accountId] = accountFavs.filter(f => f.id !== folderId);
    localStorage.setItem(this.FAVORITES_KEY, JSON.stringify(data));
  }

  addArchiveExpiry(fileId, expiresAt, accountId) {
    const expiries = JSON.parse(localStorage.getItem(this.ARCHIVE_EXPIRY_KEY) || '[]');
    expiries.push({ fileId, expiresAt, accountId });
    localStorage.setItem(this.ARCHIVE_EXPIRY_KEY, JSON.stringify(expiries));
  }

  removeArchiveExpiry(fileId) {
    const expiries = JSON.parse(localStorage.getItem(this.ARCHIVE_EXPIRY_KEY) || '[]');
    const filtered = expiries.filter(e => e.fileId !== fileId);
    localStorage.setItem(this.ARCHIVE_EXPIRY_KEY, JSON.stringify(filtered));
  }

  getArchiveExpiries() {
    return JSON.parse(localStorage.getItem(this.ARCHIVE_EXPIRY_KEY) || '[]');
  }

  getDefaultFolder(accountId) {
    const key = `qm_default_folder_${accountId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  setDefaultFolder(accountId, folder) {
    const key = `qm_default_folder_${accountId}`;
    localStorage.setItem(key, JSON.stringify({
      id: folder.id,
      name: folder.name,
      path: folder.path || folder.name
    }));
  }
}
