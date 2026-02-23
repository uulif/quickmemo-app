export class GeminiAPI {
  constructor() {
    this.API_KEY_STORAGE = 'qm_gemini_api_key';
  }

  async generateTitle(text, language = 'ja') {
    const apiKey = this._getApiKey();
    if (!apiKey) {
      return this._fallbackTitle();
    }

    const trimmedText = text.substring(0, 1000);

    const prompt = language === 'ja'
      ? `以下のメモの内容を15文字以内で要約してタイトルをつけてください。タイトルのみを返してください。余計な説明や記号は不要です。\n\nメモ:\n${trimmedText}`
      : `Create a concise title (max 10 words) for the following memo. Return only the title, no explanation or extra characters.\n\nMemo:\n${trimmedText}`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 50
            }
          })
        }
      );

      if (!res.ok) {
        console.error('Gemini API error:', res.status);
        return this._fallbackTitle();
      }

      const data = await res.json();
      const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!title) return this._fallbackTitle();

      return title.replace(/^["'「」『』]|["'「」『』]$/g, '').trim();
    } catch (e) {
      console.error('Gemini API failed:', e);
      return this._fallbackTitle();
    }
  }

  _fallbackTitle() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  }

  setApiKey(key) {
    localStorage.setItem(this.API_KEY_STORAGE, key);
  }

  _getApiKey() {
    return localStorage.getItem(this.API_KEY_STORAGE) || null;
  }
}
