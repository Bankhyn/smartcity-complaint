import { env } from '../config/env.js';
import type { UnifiedMessage } from '../types/index.js';

export const facebookAdapter = {
  // Normalize Facebook event → UnifiedMessage
  normalize(event: any): UnifiedMessage | null {
    if (event.message?.text) {
      return {
        platform: 'facebook',
        platformMessageId: event.message.mid || '',
        senderId: event.sender.id,
        chatType: 'user',
        chatId: event.sender.id,
        messageType: 'text',
        text: event.message.text,
        timestamp: new Date(event.timestamp),
      };
    }

    if (event.message?.attachments) {
      const imageAttachment = event.message.attachments.find((a: any) => a.type === 'image');
      if (imageAttachment) {
        return {
          platform: 'facebook',
          platformMessageId: event.message.mid || '',
          senderId: event.sender.id,
          chatType: 'user',
          chatId: event.sender.id,
          messageType: 'image',
          imageUrl: imageAttachment.payload?.url,
          timestamp: new Date(event.timestamp),
        };
      }
    }

    if (event.postback) {
      return {
        platform: 'facebook',
        platformMessageId: '',
        senderId: event.sender.id,
        chatType: 'user',
        chatId: event.sender.id,
        messageType: 'postback',
        postbackData: event.postback.payload,
        timestamp: new Date(event.timestamp),
      };
    }

    return null;
  },

  // Send text message
  async sendText(recipientId: string, text: string) {
    await this.callSendApi({
      recipient: { id: recipientId },
      message: { text },
    });
  },

  // Send button template (for confirm/reject)
  async sendButtons(recipientId: string, text: string, buttons: { title: string; payload: string }[]) {
    await this.callSendApi({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text,
            buttons: buttons.map(b => ({
              type: 'postback',
              title: b.title,
              payload: b.payload,
            })),
          },
        },
      },
    });
  },

  // Call Facebook Send API
  async callSendApi(body: any) {
    if (!env.fbPageAccessToken) return;

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/me/messages?access_token=${env.fbPageAccessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        console.error('Facebook Send API error:', await res.text());
      }
    } catch (err) {
      console.error('Facebook Send API error:', err);
    }
  },
};
