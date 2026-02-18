import { messagingApi, WebhookEvent } from '@line/bot-sdk';
import { env } from '../config/env.js';
import type { UnifiedMessage } from '../types/index.js';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: env.lineChannelAccessToken,
});

export const lineAdapter = {
  client,

  // Normalize LINE event → UnifiedMessage
  normalize(event: WebhookEvent): UnifiedMessage | null {
    if (event.type === 'message' && event.message.type === 'text') {
      return {
        platform: 'line',
        platformMessageId: event.message.id,
        senderId: event.source.userId || '',
        chatType: event.source.type === 'group' ? 'group' : 'user',
        chatId: event.source.type === 'group' ? event.source.groupId! : event.source.userId || '',
        messageType: 'text',
        text: event.message.text,
        timestamp: new Date(event.timestamp),
        replyToken: event.replyToken,
      };
    }

    if (event.type === 'message' && event.message.type === 'image') {
      return {
        platform: 'line',
        platformMessageId: event.message.id,
        senderId: event.source.userId || '',
        chatType: event.source.type === 'group' ? 'group' : 'user',
        chatId: event.source.type === 'group' ? event.source.groupId! : event.source.userId || '',
        messageType: 'image',
        imageUrl: `https://api-data.line.me/v2/bot/message/${event.message.id}/content`,
        timestamp: new Date(event.timestamp),
        replyToken: event.replyToken,
      };
    }

    if (event.type === 'message' && event.message.type === 'location') {
      return {
        platform: 'line',
        platformMessageId: event.message.id,
        senderId: event.source.userId || '',
        chatType: event.source.type === 'group' ? 'group' : 'user',
        chatId: event.source.type === 'group' ? event.source.groupId! : event.source.userId || '',
        messageType: 'location',
        text: event.message.address || '',
        latitude: event.message.latitude,
        longitude: event.message.longitude,
        timestamp: new Date(event.timestamp),
        replyToken: event.replyToken,
      };
    }

    if (event.type === 'postback') {
      return {
        platform: 'line',
        platformMessageId: '',
        senderId: event.source.userId || '',
        chatType: event.source.type === 'group' ? 'group' : 'user',
        chatId: event.source.type === 'group' ? event.source.groupId! : event.source.userId || '',
        messageType: 'postback',
        postbackData: event.postback.data,
        timestamp: new Date(event.timestamp),
        replyToken: event.replyToken,
      };
    }

    return null;
  },

  // Reply text
  async replyText(replyToken: string, text: string) {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }],
    });
  },

  // Reply with multiple messages
  async replyMessages(replyToken: string, messages: any[]) {
    await client.replyMessage({ replyToken, messages });
  },

  // Push text to user or group
  async pushText(to: string, text: string) {
    try {
      await client.pushMessage({ to, messages: [{ type: 'text', text }] });
    } catch (e: any) {
      console.error(`[LINE push] Failed to send text to ${to}:`, e?.message || e);
      throw e;
    }
  },

  // Push Flex Message
  async pushFlexMessage(to: string, flexMsg: any) {
    try {
      await client.pushMessage({ to, messages: [flexMsg] });
    } catch (e: any) {
      console.error(`[LINE push] Failed to send flex to ${to}:`, e?.message || e);
      throw e;
    }
  },

  // Get user profile
  async getUserProfile(userId: string) {
    try {
      return await client.getProfile(userId);
    } catch {
      return null;
    }
  },

  // Get group member profile
  async getGroupMemberProfile(groupId: string, userId: string) {
    try {
      return await client.getGroupMemberProfile(groupId, userId);
    } catch {
      return null;
    }
  },
};
