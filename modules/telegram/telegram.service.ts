import { TelegramRepository } from './telegram.repository.js';
import { TelegramClient } from '../../integrations/telegram/telegram.client.js';
import { config } from '../../config/index.js';

export class TelegramService {
  constructor(
    private telegramRepository: TelegramRepository,
    private telegramClient: TelegramClient
  ) {}

  async generateCode(userId: string) {
    const code = await this.telegramRepository.generateLinkCode(userId);
    return {
      code,
      botLink: `https://t.me/NoiteBot?start=${code}`,
    };
  }

  async getStatus(userId: string) {
    const integration = await this.telegramRepository.getIntegration(userId);
    if (!integration) return { connected: false };
    return {
      connected: true,
      telegramChatId: integration.telegram_chat_id,
      telegramUsername: integration.telegram_username,
      connectedAt: integration.connected_at,
    };
  }

  async disconnect(userId: string) {
    await this.telegramRepository.deleteIntegration(userId);
  }

  async handleWebhook(message: any) {
    if (!message?.text?.startsWith('/start ')) return { ok: true };

    const code = message.text.replace('/start ', '').trim();
    const chatId = message.chat.id;
    const username = message.chat.username || message.chat.first_name || '';

    if (!code) {
      await this.telegramClient.sendMessage(chatId, '❌ Неверный код.');
      return { ok: true };
    }

    const codeResult = await this.telegramRepository.findLinkCode(code);
    if (!codeResult) {
      await this.telegramClient.sendMessage(chatId, '❌ Код недействителен или истёк.');
      return { ok: true };
    }

    const noiteUserId = codeResult.user_id;
    await this.telegramRepository.upsertIntegration(noiteUserId, chatId, username);
    await this.telegramRepository.deleteLinkCode(code);
    await this.telegramClient.sendMessage(chatId, '✅ Аккаунт Noite успешно привязан!');

    return { ok: true, userId: noiteUserId, connected: true };
  }
}