export class AuthManager {
  constructor() {
    this.ACCOUNTS_KEY = 'qm_accounts';
    this.DEFAULT_KEY = 'qm_default_account';
    this.CLIENT_ID = '965715808424-14g0sqld2prmc6fr434vhv8ajhkl6i6t.apps.googleusercontent.com';
    this.tokenClient = null;
    this._resolveAuth = null;
    this._rejectAuth = null;
  }

  init() {
    if (typeof google !== 'undefined' && google.accounts) {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.CLIENT_ID,
        scope: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email'
        ].join(' '),
        callback: (response) => this._handleTokenResponse(response),
        error_callback: (error) => this._handleTokenError(error)
      });
    }
  }

  isReady() {
    return this.tokenClient !== null;
  }

  async addAccount() {
    if (!this.tokenClient) {
      throw new Error('Google Identity Services not loaded');
    }

    return new Promise((resolve, reject) => {
      this._resolveAuth = resolve;
      this._rejectAuth = reject;
      this.tokenClient.requestAccessToken({ prompt: 'select_account' });
    });
  }

  async _handleTokenResponse(response) {
    if (response.error) {
      if (this._rejectAuth) this._rejectAuth(new Error(response.error));
      return;
    }

    const accessToken = response.access_token;
    const expiresIn = parseInt(response.expires_in, 10);

    try {
      const userInfo = await this._fetchUserInfo(accessToken);

      const account = {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        token: accessToken,
        expiresAt: Date.now() + (expiresIn * 1000)
      };

      this._saveAccount(account);

      const accounts = this.getAccounts();
      if (accounts.length === 1) {
        this.setDefaultAccount(account.id);
      }

      if (this._resolveAuth) this._resolveAuth(account);
    } catch (e) {
      if (this._rejectAuth) this._rejectAuth(e);
    }
  }

  _handleTokenError(error) {
    if (this._rejectAuth) {
      this._rejectAuth(new Error(error.message || error.type || 'Auth failed'));
    }
  }

  getAccounts() {
    return JSON.parse(localStorage.getItem(this.ACCOUNTS_KEY) || '[]');
  }

  getAccount(accountId) {
    const accounts = this.getAccounts();
    return accounts.find(a => a.id === accountId) || null;
  }

  getToken(accountId) {
    const account = this.getAccount(accountId);
    if (!account) return null;

    if (Date.now() >= account.expiresAt - 60000) {
      return null;
    }

    return account.token;
  }

  async refreshToken(accountId) {
    if (!this.tokenClient) throw new Error('GIS not loaded');

    const account = this.getAccount(accountId);
    if (!account) throw new Error('Account not found');

    return new Promise((resolve, reject) => {
      this._resolveAuth = resolve;
      this._rejectAuth = reject;
      this.tokenClient.requestAccessToken({
        login_hint: account.email,
        prompt: ''
      });
    });
  }

  removeAccount(accountId) {
    const accounts = this.getAccounts();
    const filtered = accounts.filter(a => a.id !== accountId);
    localStorage.setItem(this.ACCOUNTS_KEY, JSON.stringify(filtered));

    const defaultId = this.getDefaultAccountId();
    if (defaultId === accountId) {
      if (filtered.length > 0) {
        this.setDefaultAccount(filtered[0].id);
      } else {
        localStorage.removeItem(this.DEFAULT_KEY);
      }
    }
  }

  setDefaultAccount(accountId) {
    localStorage.setItem(this.DEFAULT_KEY, accountId);
  }

  getDefaultAccountId() {
    return localStorage.getItem(this.DEFAULT_KEY) || null;
  }

  getDefaultAccount() {
    const id = this.getDefaultAccountId();
    if (!id) return null;
    return this.getAccount(id);
  }

  _saveAccount(account) {
    const accounts = this.getAccounts();
    const index = accounts.findIndex(a => a.id === account.id);
    if (index >= 0) {
      accounts[index] = account;
    } else {
      accounts.push(account);
    }
    localStorage.setItem(this.ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  async _fetchUserInfo(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch user info');
    return res.json();
  }
}
