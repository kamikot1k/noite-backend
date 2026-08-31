import { config } from '../../config/index.js';

export class TelegramClient {
  private apiKey: string | undefined;
  private publicId: string | undefined;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.telegram.botGateApiKey;
    this.publicId = config.telegram.botPublicId;
    this.baseUrl = config.telegram.botGateApiUrl;
  }

  async callTelegramAPI(method: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.publicId) throw new Error('BOT_PUBLIC_ID не установлен');
    const url = `${this.baseUrl}/${this.publicId}/${method}`;
    const isFormData = params instanceof FormData;
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(60000),
    };
    if (isFormData) {
      fetchOptions.body = params as FormData;
    } else if (Object.keys(params).length > 0) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'Content-Type': 'application/json',
      };
      fetchOptions.body = JSON.stringify(params);
    }
    const response = await fetch(url, fetchOptions);
    if (!response.ok) throw new Error(`Telegram API error: ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.description || 'Unknown error');
    return data;
  }

  async sendMessage(chatId: number, text: string, opts: { parse_mode?: string } = {}): Promise<any> {
    return this.callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: opts.parse_mode || 'HTML',
    });
  }
}