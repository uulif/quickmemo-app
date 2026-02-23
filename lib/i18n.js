const translations = {
  ja: {
    appName: 'QuickMemo',
    addAccount: 'Googleアカウントを追加',
    switchAccount: 'アカウント切替',
    setDefault: 'デフォルトに設定',
    removeAccount: 'アカウントを削除',
    save: '保存',
    saving: '保存中...',
    saved: '保存しました',
    savedOffline: 'オフライン保存（ネット復帰後に自動アップロード）',
    cancel: 'キャンセル',
    titlePlaceholder: 'タイトル（空欄ならAIが自動生成）',
    memoPlaceholder: 'メモを入力...',
    saveLocation: '保存先',
    defaultFolder: 'デフォルト',
    favorites: 'お気に入り',
    browse: 'フォルダを選択',
    addFavorite: 'お気に入りに追加',
    removeFavorite: 'お気に入りから削除',
    archive: 'アーカイブに保存',
    archive1Day: '1日',
    archive3Days: '3日',
    archive1Week: '1週間',
    archive1Month: '1ヶ月',
    archiveCustom: '期間指定',
    archiveNoExpiry: '期限なし',
    archiveCustomDays: '日数を入力',
    fileFormat: 'ファイル形式',
    googleDoc: 'Googleドキュメント',
    textFile: 'テキストファイル (.txt)',
    attachFiles: 'ファイルを添付',
    dropFilesHere: 'ここにファイルをドロップ',
    settings: '設定',
    language: '言語',
    memoFolderName: 'メモフォルダ名',
    archiveFolderName: 'アーカイブフォルダ名',
    geminiApiKey: 'Gemini APIキー',
    noAccount: 'アカウント未登録',
    selectFolder: 'フォルダを選択してください',
    loading: '読み込み中...',
    error: 'エラー',
    retry: '再試行',
    offlinePending: '件のメモがアップロード待ち',
    confirmDelete: '本当に削除しますか？',
    setAsDefault: 'デフォルトに設定',
    currentDefault: '（デフォルト）',
    noFavorites: 'お気に入りフォルダがありません',
    folderTree: 'マイドライブ',
    customDaysPlaceholder: '日数',
    titleGenerating: 'タイトル生成中...',
    draftRestored: '下書きを復元しました',
    offline: 'オフライン',
    settingsSaved: '保存しました',
    authRequired: '再ログインが必要です',
    newFolder: '新しいフォルダを作成'
  },
  en: {
    appName: 'QuickMemo',
    addAccount: 'Add Google Account',
    switchAccount: 'Switch Account',
    setDefault: 'Set as Default',
    removeAccount: 'Remove Account',
    save: 'Save',
    saving: 'Saving...',
    saved: 'Saved successfully',
    savedOffline: 'Saved offline (will upload when online)',
    cancel: 'Cancel',
    titlePlaceholder: 'Title (AI auto-generates if empty)',
    memoPlaceholder: 'Type your memo...',
    saveLocation: 'Save Location',
    defaultFolder: 'Default',
    favorites: 'Favorites',
    browse: 'Browse Folders',
    addFavorite: 'Add to Favorites',
    removeFavorite: 'Remove from Favorites',
    archive: 'Save to Archive',
    archive1Day: '1 Day',
    archive3Days: '3 Days',
    archive1Week: '1 Week',
    archive1Month: '1 Month',
    archiveCustom: 'Custom',
    archiveNoExpiry: 'No Expiry',
    archiveCustomDays: 'Enter days',
    fileFormat: 'File Format',
    googleDoc: 'Google Document',
    textFile: 'Text File (.txt)',
    attachFiles: 'Attach Files',
    dropFilesHere: 'Drop files here',
    settings: 'Settings',
    language: 'Language',
    memoFolderName: 'Memo Folder Name',
    archiveFolderName: 'Archive Folder Name',
    geminiApiKey: 'Gemini API Key',
    noAccount: 'No account registered',
    selectFolder: 'Please select a folder',
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry',
    offlinePending: 'memo(s) pending upload',
    confirmDelete: 'Are you sure you want to delete?',
    setAsDefault: 'Set as Default',
    currentDefault: '(Default)',
    noFavorites: 'No favorite folders',
    folderTree: 'My Drive',
    customDaysPlaceholder: 'Days',
    titleGenerating: 'Generating title...',
    draftRestored: 'Draft restored',
    offline: 'Offline',
    settingsSaved: 'Saved',
    authRequired: 'Please sign in again',
    newFolder: 'Create new folder'
  }
};

export class I18n {
  constructor() {
    this.lang = 'ja';
    this.LANG_KEY = 'qm_language';
  }

  init() {
    this.lang = localStorage.getItem(this.LANG_KEY) || 'ja';
  }

  t(key) {
    return translations[this.lang]?.[key] || translations['ja']?.[key] || key;
  }

  setLanguage(lang) {
    this.lang = lang;
    localStorage.setItem(this.LANG_KEY, lang);
  }

  getLanguage() {
    return this.lang;
  }
}
