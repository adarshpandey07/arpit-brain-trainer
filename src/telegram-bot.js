/**
 * Telegram Bot Interface — Command handler for brain control
 */

import TelegramBotApi from 'node-telegram-bot-api';
import { log, logError } from './logger.js';
import 'dotenv/config';

export class TelegramBot {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.bot = null;
    this.commands = new Map();
    this.freeTextHandler = null;
  }

  async start() {
    if (!this.token) {
      log('[Telegram] No bot token — running without Telegram');
      return;
    }

    this.bot = new TelegramBotApi(this.token, { polling: true });

    this.bot.on('message', async (msg) => {
      if (this.chatId && String(msg.chat.id) !== String(this.chatId)) {
        log(`[Telegram] Ignored message from unauthorized chat: ${msg.chat.id}`);
        return;
      }

      const text = msg.text?.trim();
      if (!text) return;

      // Command
      if (text.startsWith('/')) {
        const parts = text.split(/\s+/);
        const cmd = parts[0].slice(1).split('@')[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        const handler = this.commands.get(cmd);
        if (handler) {
          try {
            const response = await handler(msg, args);
            if (response) await this.send(response);
          } catch (err) {
            logError(`[Telegram] Command /${cmd} error: ${err.message}`);
            await this.send(`❌ Error: ${err.message}`);
          }
        } else {
          await this.send(`❓ Unknown command. Send /help for available commands.`);
        }
        return;
      }

      // Free text
      if (this.freeTextHandler) {
        try {
          const response = await this.freeTextHandler(text);
          if (response) await this.send(response);
        } catch (err) {
          logError(`[Telegram] Free-text error: ${err.message}`);
          await this.send(`❌ Error processing message: ${err.message}`);
        }
      }
    });

    this.bot.on('polling_error', (err) => {
      logError(`[Telegram] Polling error: ${err.message}`);
    });

    log('[Telegram] Bot started (polling mode)');
  }

  onCommand(name, handler) {
    this.commands.set(name.toLowerCase(), handler);
  }

  onFreeText(handler) {
    this.freeTextHandler = handler;
  }

  async send(text) {
    if (!this.bot || !this.chatId) {
      log(`[Telegram] (no bot) ${text.slice(0, 100)}`);
      return;
    }

    try {
      // Split long messages
      const MAX_LEN = 4000;
      if (text.length > MAX_LEN) {
        const chunks = [];
        for (let i = 0; i < text.length; i += MAX_LEN) {
          chunks.push(text.slice(i, i + MAX_LEN));
        }
        for (const chunk of chunks) {
          await this.bot.sendMessage(this.chatId, chunk, { parse_mode: 'Markdown' });
        }
      } else {
        await this.bot.sendMessage(this.chatId, text, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      // Try without markdown if parsing fails
      try {
        await this.bot.sendMessage(this.chatId, text.replace(/[*_`]/g, ''));
      } catch (e) {
        logError(`[Telegram] Send failed: ${e.message}`);
      }
    }
  }
}
