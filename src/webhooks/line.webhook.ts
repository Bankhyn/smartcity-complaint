import { Router } from 'express';
import { middleware, WebhookEvent } from '@line/bot-sdk';
import express from 'express';
import { env } from '../config/env.js';
import { lineAdapter } from '../adapters/line.adapter.js';
import { handleCitizenMessage } from '../chatbot/conversation.js';
import { handleGroupPostback, handleGroupCommand } from './line-group.handler.js';

export const lineWebhook = Router();

// LINE middleware only if channel secret is configured
if (env.lineChannelSecret) {
  const lineMiddleware = middleware({ channelSecret: env.lineChannelSecret });
  lineWebhook.post('/webhook/line', lineMiddleware, lineHandler);
} else {
  console.warn('  ⚠️  LINE_CHANNEL_SECRET not set — LINE webhook uses raw JSON (dev mode)');
  lineWebhook.post('/webhook/line', express.json(), lineHandler);
}

async function lineHandler(req: any, res: any) {
  const events: WebhookEvent[] = req.body.events || [];
  try {
    for (const event of events) {
      await handleLineEvent(event);
    }
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('LINE webhook error:', err);
    res.status(500).end();
  }
}

async function handleLineEvent(event: WebhookEvent) {
  const msg = lineAdapter.normalize(event);
  if (!msg) return;

  if (msg.chatType === 'group') {
    if (msg.messageType === 'postback' && msg.postbackData) {
      await handleGroupPostback(msg);
      return;
    }
    if (msg.messageType === 'text' && msg.text?.startsWith('/')) {
      await handleGroupCommand(msg);
      return;
    }
    return;
  }

  if (msg.chatType === 'user') {
    const responses = await handleCitizenMessage(msg);
    if (responses.length > 0 && msg.replyToken) {
      const messages = responses.map(text => ({ type: 'text' as const, text }));
      await lineAdapter.replyMessages(msg.replyToken, messages);
    }
  }
}
