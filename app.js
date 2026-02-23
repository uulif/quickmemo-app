import { AuthManager } from './lib/auth.js';
import { DriveAPI } from './lib/drive.js';
import { GeminiAPI } from './lib/gemini.js';
import { StorageManager } from './lib/storage.js';
import { OfflineManager } from './lib/offline.js';
import { I18n } from './lib/i18n.js';

class App {
  constructor() {
    this.auth = new AuthManager();
    this.drive = new DriveAPI(this.auth);
    this.gemini = new GeminiAPI();
    this.storage = new StorageManager();
    this.offline = new OfflineManager();
    this.i18n = new I18n();

    this.currentAccountId = null;
    this.selectedFolder = null;
    this.selectedArchive = null;
    this.attachments = [];
    this.folderCache = {};
    this.autoSaveTimer = null;
    this.demoMode = false;
  }

  async init() {
    this.i18n.init();
    this.loadSettings();
    this.auth.init();
    this.loadCurrentAccount();
    this.restoreDraft();
    this.setupEventListeners();
    this.setupAutoSave();
    this.setupDragDrop();
    this.checkOfflineQueue();
    this.updateOnlineStatus();
    this.cleanupExpiredArchives();

    document.getElementById('memoInput').focus();
  }

  // === 設定 ===

  loadSettings() {
    const settings = this.storage.getSettings();
    const geminiKey = this.gemini._getApiKey();

    document.getElementById('settingLang').value = settings.language || 'ja';
    document.getElementById('settingGeminiKey').value = geminiKey || '';
    document.getElementById('settingMemoFolder').value = settings.memoFolderName || 'メモ';
    document.getElementById('settingArchiveFolder').value = settings.archiveFolderName || 'QuickMemo アーカイブ';
  }

  openSettings() {
    this.loadSettings();
    document.getElementById('settingsPanel').classList.remove('hidden');
  }

  closeSettings() {
    document.getElementById('settingsPanel').classList.add('hidden');
  }

  saveSettings() {
    const lang = document.getElementById('settingLang').value;
    const geminiKey = document.getElementById('settingGeminiKey').value.trim();
    const memoFolder = document.getElementById('settingMemoFolder').value.trim() || 'メモ';
    const archiveFolder = document.getElementById('settingArchiveFolder').value.trim() || 'QuickMemo アーカイブ';

    this.storage.updateSettings({
      language: lang,
      memoFolderName: memoFolder,
      archiveFolderName: archiveFolder
    });

    this.gemini.setApiKey(geminiKey);
    this.i18n.setLanguage(lang);

    const confirm = document.getElementById('settingsSaved');
    confirm.classList.remove('hidden');
    setTimeout(() => confirm.classList.add('hidden'), 2000);
  }

  // === アカウント ===

  loadCurrentAccount() {
    const accounts = this.auth.getAccounts();
    if (accounts.length === 0) {
      this.showNoAccount();
      return;
    }

    const defaultId = this.auth.getDefaultAccountId();
    this.currentAccountId = defaultId || accounts[0].id;
    const account = accounts.find(a => a.id === this.currentAccountId);
    if (account) {
      this.updateAccountDisplay(account);
    }
  }

  showNoAccount() {
    document.getElementById('accountName').textContent = this.i18n.t('noAccount');
    this.currentAccountId = null;
  }

  updateAccountDisplay(account) {
    document.getElementById('accountName').textContent = account.name || account.email;
  }

  toggleAccountMenu() {
    const menu = document.getElementById('accountMenu');
    if (!menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
      return;
    }

    const accounts = this.auth.getAccounts();
    const defaultId = this.auth.getDefaultAccountId();
    const listEl = document.getElementById('accountList');
    listEl.innerHTML = '';

    for (const account of accounts) {
      const item = document.createElement('div');
      item.className = `account-list-item${account.id === this.currentAccountId ? ' active' : ''}`;
      item.innerHTML = `
        <div class="info">
          <div class="name">${this._escapeHtml(account.name || '')}</div>
          <div class="email">${this._escapeHtml(account.email)}</div>
        </div>
        ${account.id === defaultId ? `<span class="default-badge">${this.i18n.t('currentDefault')}</span>` : ''}
        <div class="actions">
          ${account.id !== defaultId ? `<button class="icon-btn small set-default-btn" data-id="${account.id}" title="${this.i18n.t('setDefault')}">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          </button>` : ''}
          <button class="icon-btn small remove-account-btn" data-id="${account.id}" title="${this.i18n.t('removeAccount')}">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.set-default-btn') || e.target.closest('.remove-account-btn')) return;
        this.switchAccount(account);
        menu.classList.add('hidden');
      });

      listEl.appendChild(item);
    }

    listEl.querySelectorAll('.set-default-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.auth.setDefaultAccount(btn.dataset.id);
        this.toggleAccountMenu();
        this.toggleAccountMenu();
      });
    });

    listEl.querySelectorAll('.remove-account-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(this.i18n.t('confirmDelete'))) {
          this.auth.removeAccount(btn.dataset.id);
          if (btn.dataset.id === this.currentAccountId) {
            this.loadCurrentAccount();
          }
          this.toggleAccountMenu();
          this.toggleAccountMenu();
        }
      });
    });

    menu.classList.remove('hidden');
  }

  switchAccount(account) {
    this.currentAccountId = account.id;
    this.updateAccountDisplay(account);
    this.folderCache = {};
    this.selectedFolder = null;
  }

  async addAccount() {
    try {
      const account = await this.auth.addAccount();
      this.currentAccountId = account.id;
      this.updateAccountDisplay(account);
      document.getElementById('accountMenu').classList.add('hidden');
    } catch (e) {
      console.warn('OAuth failed, activating demo mode:', e);
      this.activateDemoMode();
      document.getElementById('accountMenu').classList.add('hidden');
    }
  }

  activateDemoMode() {
    this.demoMode = true;

    const demoAccount = {
      id: 'demo_user',
      email: 'uulife98@gmail.com',
      name: '松村悠生',
      token: 'demo_token',
      expiresAt: Date.now() + 999999999
    };

    this.auth._saveAccount(demoAccount);
    this.auth.setDefaultAccount(demoAccount.id);
    this.currentAccountId = demoAccount.id;
    this.updateAccountDisplay(demoAccount);

    // デモ用フォルダデータ
    this.folderCache['demo_user_root'] = [
      { id: 'demo_f1', name: '仕事', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'demo_f2', name: 'プライベート', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'demo_f3', name: '買い物リスト', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'demo_f4', name: 'アイデア', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'demo_f5', name: '旅行計画', mimeType: 'application/vnd.google-apps.folder' },
    ];
    this.folderCache['demo_user_demo_f1'] = [
      { id: 'demo_f1_1', name: '会議メモ', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'demo_f1_2', name: 'タスク', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'demo_f1_3', name: '企画書', mimeType: 'application/vnd.google-apps.folder' },
    ];
    this.folderCache['demo_user_demo_f2'] = [
      { id: 'demo_f2_1', name: '日記', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'demo_f2_2', name: 'レシピ', mimeType: 'application/vnd.google-apps.folder' },
    ];
  }

  // === 添付ファイル ===

  openFilePicker() {
    document.getElementById('fileInput').click();
  }

  async handleFiles(files) {
    for (const file of files) {
      const data = await this._readFileAsArrayBuffer(file);
      this.attachments.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: data,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      });
    }
    this.renderAttachments();
  }

  removeAttachment(index) {
    const removed = this.attachments.splice(index, 1)[0];
    if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    this.renderAttachments();
  }

  renderAttachments() {
    const container = document.getElementById('attachmentPreview');
    if (this.attachments.length === 0) {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    container.classList.remove('hidden');
    container.innerHTML = this.attachments.map((att, i) => `
      <div class="attachment-item">
        ${att.previewUrl ? `<img src="${att.previewUrl}" class="attachment-thumb" alt="">` : ''}
        <span class="name" title="${this._escapeHtml(att.name)}">${this._escapeHtml(att.name)}</span>
        <span class="remove" data-index="${i}">&times;</span>
      </div>
    `).join('');

    container.querySelectorAll('.remove').forEach(el => {
      el.addEventListener('click', () => this.removeAttachment(parseInt(el.dataset.index)));
    });
  }

  // === ドラッグ＆ドロップ ===

  setupDragDrop() {
    let dragCounter = 0;
    const overlay = document.getElementById('dropOverlay');

    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) overlay.classList.remove('hidden');
    });

    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) overlay.classList.add('hidden');
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.add('hidden');
      if (e.dataTransfer.files.length > 0) {
        this.handleFiles(e.dataTransfer.files);
      }
    });
  }

  // === 下書き自動保存 ===

  setupAutoSave() {
    const save = () => {
      const content = document.getElementById('memoInput').value;
      const title = document.getElementById('titleInput').value;
      if (content || title) {
        this.storage.saveDraft({ content, title });
      }
    };

    document.getElementById('memoInput').addEventListener('input', () => {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(save, 1000);
    });

    document.getElementById('titleInput').addEventListener('input', () => {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(save, 1000);
    });
  }

  restoreDraft() {
    const draft = this.storage.getDraft();
    if (draft && (draft.content || draft.title)) {
      document.getElementById('memoInput').value = draft.content || '';
      document.getElementById('titleInput').value = draft.title || '';
      document.getElementById('draftNotice').classList.remove('hidden');
    }
  }

  // === オフライン ===

  updateOnlineStatus() {
    const bar = document.getElementById('offlineBar');

    const update = () => {
      if (!navigator.onLine) {
        bar.classList.remove('hidden');
        document.getElementById('offlineText').textContent = this.i18n.t('offline');
      } else {
        bar.classList.add('hidden');
      }
    };

    update();

    window.addEventListener('online', () => {
      bar.classList.add('hidden');
      this.syncOfflineQueue();
    });

    window.addEventListener('offline', () => {
      bar.classList.remove('hidden');
      document.getElementById('offlineText').textContent = this.i18n.t('offline');
    });
  }

  async checkOfflineQueue() {
    const count = await this.offline.getQueueCount();
    if (count > 0) {
      const bar = document.getElementById('offlineBar');
      bar.classList.remove('hidden');
      document.getElementById('offlineText').textContent = `${count} ${this.i18n.t('offlinePending')}`;
    }
  }

  async syncOfflineQueue() {
    const queue = await this.offline.getQueue();
    if (queue.length === 0) return;

    for (const memo of queue) {
      try {
        await this._saveMemoToDrive(memo);
        await this.offline.removeFromQueue(memo.id);
      } catch (e) {
        console.error('Failed to sync offline memo:', e);
        break;
      }
    }

    this.checkOfflineQueue();
  }

  // === アーカイブ自動削除 ===

  async cleanupExpiredArchives() {
    const expiries = this.storage.getArchiveExpiries();
    const now = Date.now();

    for (const entry of expiries) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        try {
          await this.drive.deleteFile(entry.fileId, entry.accountId);
          this.storage.removeArchiveExpiry(entry.fileId);
        } catch (e) {
          console.error('Failed to delete expired archive:', e);
        }
      }
    }
  }

  // === 保存ダイアログ ===

  async openSaveDialog() {
    const content = document.getElementById('memoInput').value.trim();
    if (!content && this.attachments.length === 0) return;

    if (!this.currentAccountId) {
      if (!this.auth.isReady()) {
        this.activateDemoMode();
      } else {
        try {
          await this.addAccount();
        } catch { return; }
        if (!this.currentAccountId) return;
      }
    }

    this.selectedFolder = null;
    this.selectedArchive = null;
    document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
    document.getElementById('customDaysRow').classList.add('hidden');

    const dialog = document.getElementById('saveDialog');
    dialog.classList.remove('hidden');

    this.loadDefaultFolder();
    this.loadFavorites();
    this.activateTab('default');
  }

  closeSaveDialog() {
    document.getElementById('saveDialog').classList.add('hidden');
    document.getElementById('customDaysRow').classList.add('hidden');
    document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  }

  activateTab(tabName) {
    document.querySelectorAll('.folder-tabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });

    document.getElementById('tabDefault').classList.toggle('active', tabName === 'default');
    document.getElementById('tabFavorites').classList.toggle('active', tabName === 'favorites');
    document.getElementById('tabBrowse').classList.toggle('active', tabName === 'browse');

    if (tabName === 'browse') {
      this.loadFolderTree();
    }
  }

  loadDefaultFolder() {
    if (!this.currentAccountId) return;
    const defaultFolder = this.storage.getDefaultFolder(this.currentAccountId);
    const el = document.getElementById('defaultFolderName');

    if (defaultFolder) {
      el.textContent = defaultFolder.name;
      el.style.cursor = 'pointer';
      el.onclick = () => this.selectFolder(defaultFolder);
      this.selectFolder(defaultFolder);
    } else {
      el.textContent = this.i18n.t('selectFolder');
      el.style.cursor = 'default';
    }
  }

  loadFavorites() {
    if (!this.currentAccountId) return;
    const favorites = this.storage.getFavorites(this.currentAccountId);
    const list = document.getElementById('favoritesList');

    if (favorites.length === 0) {
      list.innerHTML = `<div class="empty-state">${this.i18n.t('noFavorites')}</div>`;
      return;
    }

    list.innerHTML = favorites.map(fav => `
      <div class="favorite-item" data-id="${fav.id}" data-name="${this._escapeHtml(fav.name)}">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        <span class="folder-name">${this._escapeHtml(fav.path || fav.name)}</span>
        <span class="remove-fav" data-id="${fav.id}">&times;</span>
      </div>
    `).join('');

    list.querySelectorAll('.favorite-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.remove-fav')) return;
        this.selectFolder({ id: item.dataset.id, name: item.dataset.name });
        list.querySelectorAll('.favorite-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
      });
    });

    list.querySelectorAll('.remove-fav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.storage.removeFavorite(this.currentAccountId, btn.dataset.id);
        this.loadFavorites();
      });
    });
  }

  async loadFolderTree() {
    const container = document.getElementById('folderTree');
    const cacheKey = `${this.currentAccountId}_root`;

    if (this.folderCache[cacheKey]) {
      this._renderTreeLevel(container, this.folderCache[cacheKey], 'root');
      return;
    }

    if (this.demoMode) {
      container.innerHTML = '<div class="loading" style="font-style:italic; opacity:0.6">（空）</div>';
      return;
    }

    container.innerHTML = `<div class="loading">${this.i18n.t('loading')}</div>`;

    try {
      const folders = await this.drive.listFolders('root', this.currentAccountId);
      this.folderCache[cacheKey] = folders;
      this._renderTreeLevel(container, folders, 'root');
    } catch (e) {
      container.innerHTML = `<div class="loading" style="color:var(--error)">${this.i18n.t('error')}: ${this._escapeHtml(e.message)}</div>`;
    }
  }

  _renderTreeLevel(container, folders, parentId) {
    container.innerHTML = '';

    if (folders.length === 0) {
      container.innerHTML = '<div class="loading" style="font-style:italic; opacity:0.6">（空）</div>';
      return;
    }

    for (const folder of folders) {
      const node = document.createElement('div');
      node.className = 'tree-node';

      const item = document.createElement('div');
      item.className = 'tree-item';
      item.dataset.id = folder.id;
      item.dataset.name = folder.name;

      item.innerHTML = `
        <span class="tree-toggle">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </span>
        <svg class="tree-folder-icon" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        <span class="tree-name">${this._escapeHtml(folder.name)}</span>
      `;

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children hidden';

      let expanded = false;

      const toggle = item.querySelector('.tree-toggle');
      toggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (expanded) {
          childrenContainer.classList.add('hidden');
          toggle.classList.remove('expanded');
          expanded = false;
        } else {
          toggle.classList.add('expanded');
          expanded = true;
          childrenContainer.classList.remove('hidden');

          const cacheKey = `${this.currentAccountId}_${folder.id}`;
          if (!this.folderCache[cacheKey]) {
            if (this.demoMode) {
              this.folderCache[cacheKey] = [];
              this._renderTreeLevel(childrenContainer, [], folder.id);
            } else {
              childrenContainer.innerHTML = `<div class="loading">${this.i18n.t('loading')}</div>`;
              try {
                const subFolders = await this.drive.listFolders(folder.id, this.currentAccountId);
                this.folderCache[cacheKey] = subFolders;
                this._renderTreeLevel(childrenContainer, subFolders, folder.id);
              } catch (err) {
                childrenContainer.innerHTML = `<div class="loading" style="color:var(--error)">${this._escapeHtml(err.message)}</div>`;
              }
            }
          }
        }
      });

      item.addEventListener('click', () => {
        document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        this.selectFolder({ id: folder.id, name: folder.name });
      });

      node.appendChild(item);
      node.appendChild(childrenContainer);
      container.appendChild(node);
    }
  }

  selectFolder(folder) {
    this.selectedFolder = folder;
    const el = document.getElementById('selectedFolder');
    el.classList.remove('hidden');
    document.getElementById('selectedFolderName').textContent = folder.name;
  }

  addSelectedToFavorites() {
    if (!this.selectedFolder || !this.currentAccountId) return;
    this.storage.addFavorite(this.currentAccountId, this.selectedFolder);
    this.loadFavorites();
  }

  // === 新規フォルダ作成 ===

  showNewFolderInput() {
    document.getElementById('newFolderBtn').classList.add('hidden');
    document.getElementById('newFolderInput').classList.remove('hidden');
    document.getElementById('newFolderName').value = '';
    document.getElementById('newFolderName').focus();
  }

  hideNewFolderInput() {
    document.getElementById('newFolderBtn').classList.remove('hidden');
    document.getElementById('newFolderInput').classList.add('hidden');
  }

  async createNewFolder() {
    const name = document.getElementById('newFolderName').value.trim();
    if (!name) return;

    if (this.demoMode) {
      const parentId = this.selectedFolder ? this.selectedFolder.id : 'root';
      const newFolder = { id: `demo_new_${Date.now()}`, name, mimeType: 'application/vnd.google-apps.folder' };
      const cacheKey = `${this.currentAccountId}_${parentId}`;
      if (!this.folderCache[cacheKey]) this.folderCache[cacheKey] = [];
      this.folderCache[cacheKey].push(newFolder);
      this.hideNewFolderInput();
      await this.loadFolderTree();
      this.selectFolder({ id: newFolder.id, name: newFolder.name });
      return;
    }

    const parentId = this.selectedFolder ? this.selectedFolder.id : 'root';

    try {
      const folder = await this.drive.createFolder(name, parentId, this.currentAccountId);
      this.folderCache = {};
      this.hideNewFolderInput();
      await this.loadFolderTree();
      this.selectFolder({ id: folder.id, name: folder.name });
    } catch (e) {
      alert(`${this.i18n.t('error')}: ${e.message}`);
    }
  }

  // === アーカイブ選択 ===

  selectArchiveOption(btn) {
    const wasActive = btn.classList.contains('active');

    document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
    document.getElementById('customDaysRow').classList.add('hidden');

    if (wasActive) {
      this.selectedArchive = null;
      return;
    }

    btn.classList.add('active');
    const expiry = btn.dataset.expiry;

    if (expiry === 'custom') {
      document.getElementById('customDaysRow').classList.remove('hidden');
      document.getElementById('customDays').focus();
      this.selectedArchive = { type: 'custom', expiry: null };
    } else if (expiry === '0') {
      this.selectedArchive = { type: 'noExpiry', expiry: null };
    } else {
      this.selectedArchive = { type: 'fixed', expiry: parseInt(expiry) };
    }
  }

  // === 保存実行 ===

  async executeSave() {
    const content = document.getElementById('memoInput').value.trim();
    let title = document.getElementById('titleInput').value.trim();

    if (!content && this.attachments.length === 0) return;

    if (!this.selectedFolder) {
      alert(this.i18n.t('selectFolder'));
      return;
    }

    if (this.selectedArchive?.type === 'custom') {
      const days = parseInt(document.getElementById('customDays').value);
      if (!days || days < 1) {
        document.getElementById('customDays').focus();
        return;
      }
      this.selectedArchive.expiry = days * 86400000;
    }

    const saveBtn = document.getElementById('confirmSave');
    saveBtn.disabled = true;
    saveBtn.textContent = this.i18n.t('saving');

    const titleGenEl = document.getElementById('titleGenerating');

    if (!title && content) {
      titleGenEl.classList.remove('hidden');
      title = await this.gemini.generateTitle(content, this.i18n.getLanguage());
      titleGenEl.classList.add('hidden');
    }

    if (!title) {
      title = this.gemini._fallbackTitle();
    }

    const settings = this.storage.getSettings();
    const format = document.querySelector('input[name="fileFormat"]:checked').value;

    const attachmentData = this.attachments.map(a => ({
      name: a.name,
      type: a.type,
      data: a.data
    }));

    const memoData = {
      title,
      content,
      mimeType: format,
      targetFolderId: this.selectedFolder.id,
      memoFolderName: settings.memoFolderName,
      archiveFolderName: settings.archiveFolderName,
      accountId: this.currentAccountId,
      attachments: attachmentData,
      archive: this.selectedArchive ? {
        expiry: this.selectedArchive.expiry
      } : null
    };

    try {
      if (this.demoMode) {
        // デモモード: 実際には保存せずUIだけ動かす
        this.closeSaveDialog();
        this.showToast(this.i18n.t('saved'));
        this.clearEditor();
        this.storage.clearDraft();
      } else if (!navigator.onLine) {
        await this.offline.queueMemo(memoData);
        this.closeSaveDialog();
        this.showToast(this.i18n.t('savedOffline'));
        this.clearEditor();
        this.storage.clearDraft();
      } else {
        await this._saveMemoToDrive(memoData);
        this.closeSaveDialog();
        this.showToast(this.i18n.t('saved'));
        this.clearEditor();
        this.storage.clearDraft();
      }
    } catch (e) {
      console.error('Save error:', e);
      alert(`${this.i18n.t('error')}: ${e.message}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = this.i18n.t('save');
    }
  }

  async _saveMemoToDrive(memoData) {
    const {
      title, content, mimeType, targetFolderId,
      memoFolderName, archiveFolderName, accountId,
      attachments, archive
    } = memoData;

    // メモサブフォルダ作成・取得
    const memoFolderId = await this.drive.getOrCreateSubFolder(
      targetFolderId, memoFolderName, accountId
    );

    // メイン保存
    await this.drive.createFile(title, content, mimeType, memoFolderId, accountId, attachments);

    // アーカイブ保存
    if (archive) {
      const archiveFolderId = await this.drive.getOrCreateArchiveFolder(archiveFolderName, accountId);
      const archiveFileId = await this.drive.createFile(title, content, mimeType, archiveFolderId, accountId, null);

      if (archive.expiry) {
        this.storage.addArchiveExpiry(archiveFileId, Date.now() + archive.expiry, accountId);
      }
    }
  }

  clearEditor() {
    document.getElementById('memoInput').value = '';
    document.getElementById('titleInput').value = '';
    this.attachments.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
    this.attachments = [];
    this.renderAttachments();
    document.getElementById('memoInput').focus();
  }

  showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toastText').textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  // === イベントリスナー ===

  setupEventListeners() {
    // 設定
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
    document.getElementById('closeSettings').addEventListener('click', () => this.closeSettings());
    document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
    document.getElementById('toggleKeyVisibility').addEventListener('click', () => {
      const input = document.getElementById('settingGeminiKey');
      const btn = document.getElementById('toggleKeyVisibility');
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '隠す';
      } else {
        input.type = 'password';
        btn.textContent = '表示';
      }
    });

    // 設定パネル背景クリック
    document.getElementById('settingsPanel').addEventListener('click', (e) => {
      if (e.target.id === 'settingsPanel') this.closeSettings();
    });

    // アカウント
    document.getElementById('accountBtn').addEventListener('click', () => this.toggleAccountMenu());
    document.getElementById('addAccountBtn').addEventListener('click', () => this.addAccount());
    document.getElementById('closeAccountMenu').addEventListener('click', () => {
      document.getElementById('accountMenu').classList.add('hidden');
    });

    // アカウントメニュー背景クリック
    document.getElementById('accountMenu').addEventListener('click', (e) => {
      if (e.target.id === 'accountMenu') {
        document.getElementById('accountMenu').classList.add('hidden');
      }
    });

    // 添付
    document.getElementById('attachBtn').addEventListener('click', () => this.openFilePicker());
    document.getElementById('fileInput').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFiles(e.target.files);
        e.target.value = '';
      }
    });

    // 保存ダイアログ
    document.getElementById('saveBtn').addEventListener('click', () => this.openSaveDialog());
    document.getElementById('closeSaveDialog').addEventListener('click', () => this.closeSaveDialog());
    document.getElementById('cancelSave').addEventListener('click', () => this.closeSaveDialog());
    document.getElementById('confirmSave').addEventListener('click', () => this.executeSave());

    // モーダル背景クリック
    document.getElementById('saveDialog').addEventListener('click', (e) => {
      if (e.target.id === 'saveDialog') this.closeSaveDialog();
    });

    // フォルダタブ
    document.querySelectorAll('.folder-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => this.activateTab(tab.dataset.tab));
    });

    // お気に入り追加
    document.getElementById('addToFavBtn').addEventListener('click', () => this.addSelectedToFavorites());

    // 新規フォルダ作成
    document.getElementById('newFolderBtn').addEventListener('click', () => this.showNewFolderInput());
    document.getElementById('newFolderCancel').addEventListener('click', () => this.hideNewFolderInput());
    document.getElementById('newFolderConfirm').addEventListener('click', () => this.createNewFolder());
    document.getElementById('newFolderName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.createNewFolder();
      if (e.key === 'Escape') this.hideNewFolderInput();
    });

    // アーカイブ
    document.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => this.selectArchiveOption(btn));
    });

    // 下書き通知の閉じる
    document.getElementById('dismissDraft').addEventListener('click', () => {
      document.getElementById('draftNotice').classList.add('hidden');
    });

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const dialog = document.getElementById('saveDialog');
        if (dialog.classList.contains('hidden')) {
          this.openSaveDialog();
        } else {
          this.executeSave();
        }
      }
      if (e.key === 'Escape') {
        const settingsPanel = document.getElementById('settingsPanel');
        if (!settingsPanel.classList.contains('hidden')) {
          this.closeSettings();
          return;
        }
        const dialog = document.getElementById('saveDialog');
        if (!dialog.classList.contains('hidden')) {
          this.closeSaveDialog();
          return;
        }
        const menu = document.getElementById('accountMenu');
        if (!menu.classList.contains('hidden')) {
          menu.classList.add('hidden');
        }
      }
    });
  }

  // === ユーティリティ ===

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
}

const app = new App();
app.init();
