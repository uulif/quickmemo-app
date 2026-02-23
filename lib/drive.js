export class DriveAPI {
  constructor(authManager) {
    this.auth = authManager;
    this.BASE_URL = 'https://www.googleapis.com/drive/v3';
    this.UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
  }

  async _getToken(accountId) {
    let token = this.auth.getToken(accountId);
    if (!token) {
      try {
        const account = await this.auth.refreshToken(accountId);
        token = account.token;
      } catch (e) {
        throw new Error('認証が必要です。再ログインしてください。');
      }
    }
    return token;
  }

  async listFolders(parentId, accountId) {
    const token = await this._getToken(accountId);
    const query = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,mimeType)',
      orderBy: 'name',
      pageSize: '1000'
    });

    const res = await fetch(`${this.BASE_URL}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw Object.assign(new Error(err.error?.message || 'Failed to list folders'), { status: res.status });
    }

    const data = await res.json();
    return data.files || [];
  }

  async createFolder(name, parentId, accountId) {
    const token = await this._getToken(accountId);

    const res = await fetch(`${this.BASE_URL}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw Object.assign(new Error(err.error?.message || 'Failed to create folder'), { status: res.status });
    }

    return res.json();
  }

  async getOrCreateSubFolder(parentId, folderName, accountId) {
    const token = await this._getToken(accountId);
    const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name)'
    });

    const res = await fetch(`${this.BASE_URL}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw Object.assign(new Error('Failed to search folder'), { status: res.status });
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    const folder = await this.createFolder(folderName, parentId, accountId);
    return folder.id;
  }

  async getOrCreateArchiveFolder(folderName, accountId) {
    return this.getOrCreateSubFolder('root', folderName, accountId);
  }

  async createFile(title, content, mimeType, folderId, accountId, attachments) {
    const token = await this._getToken(accountId);

    if (mimeType === 'application/vnd.google-apps.document') {
      return this._createGoogleDoc(title, content, folderId, token, attachments);
    } else {
      return this._createTextFile(title, content, folderId, token, attachments);
    }
  }

  async _createGoogleDoc(title, content, folderId, token, attachments) {
    const metadata = {
      name: title,
      mimeType: 'application/vnd.google-apps.document',
      parents: [folderId]
    };

    const boundary = 'quickmemo_boundary_' + Date.now();
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      content,
      `--${boundary}--`
    ].join('\r\n');

    const res = await fetch(`${this.UPLOAD_URL}/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });

    if (!res.ok) {
      const err = await res.json();
      throw Object.assign(new Error(err.error?.message || 'Failed to create doc'), { status: res.status });
    }

    const file = await res.json();

    if (attachments && attachments.length > 0) {
      await this._uploadAttachments(attachments, folderId, token);
    }

    return file.id;
  }

  async _createTextFile(title, content, folderId, token, attachments) {
    const fileName = title.endsWith('.txt') ? title : `${title}.txt`;
    const metadata = {
      name: fileName,
      mimeType: 'text/plain',
      parents: [folderId]
    };

    const boundary = 'quickmemo_boundary_' + Date.now();
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      content,
      `--${boundary}--`
    ].join('\r\n');

    const res = await fetch(`${this.UPLOAD_URL}/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });

    if (!res.ok) {
      const err = await res.json();
      throw Object.assign(new Error(err.error?.message || 'Failed to create file'), { status: res.status });
    }

    const file = await res.json();

    if (attachments && attachments.length > 0) {
      await this._uploadAttachments(attachments, folderId, token);
    }

    return file.id;
  }

  async _uploadAttachments(attachments, folderId, token) {
    for (const attachment of attachments) {
      const metadata = {
        name: attachment.name,
        parents: [folderId]
      };

      const boundary = 'quickmemo_attachment_' + Date.now() + Math.random();
      const metaPart = JSON.stringify(metadata);

      const metaBytes = new TextEncoder().encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n--${boundary}\r\nContent-Type: ${attachment.type}\r\n\r\n`
      );
      const endBytes = new TextEncoder().encode(`\r\n--${boundary}--`);

      const fileData = attachment.data instanceof ArrayBuffer
        ? new Uint8Array(attachment.data)
        : new TextEncoder().encode(attachment.data);

      const body = new Uint8Array(metaBytes.length + fileData.length + endBytes.length);
      body.set(metaBytes, 0);
      body.set(fileData, metaBytes.length);
      body.set(endBytes, metaBytes.length + fileData.length);

      const res = await fetch(`${this.UPLOAD_URL}/files?uploadType=multipart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: body.buffer
      });

      if (!res.ok) {
        console.error('Failed to upload attachment:', attachment.name);
      }
    }
  }

  async deleteFile(fileId, accountId) {
    const token = await this._getToken(accountId);

    const res = await fetch(`${this.BASE_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok && res.status !== 404) {
      throw Object.assign(new Error('Failed to delete file'), { status: res.status });
    }
  }
}
