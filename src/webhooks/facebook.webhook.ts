import { Router } from 'express';
import { env } from '../config/env.js';
import { facebookAdapter } from '../adapters/facebook.adapter.js';
import { handleCitizenMessage } from '../chatbot/conversation.js';

export const facebookWebhook = Router();

// Facebook webhook verification
facebookWebhook.get('/webhook/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.fbVerifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Facebook webhook events
facebookWebhook.post('/webhook/facebook', async (req, res) => {
  if (req.body.object !== 'page') {
    return res.sendStatus(404);
  }

  try {
    for (const entry of req.body.entry) {
      for (const event of entry.messaging || []) {
        const msg = facebookAdapter.normalize(event);
        if (!msg) continue;

        const responses = await handleCitizenMessage(msg);
        for (const text of responses) {
          await facebookAdapter.sendText(msg.senderId, text);
        }
      }
    }
  } catch (err) {
    console.error('Facebook webhook error:', err);
  }

  // Always 200 for Facebook
  res.status(200).send('EVENT_RECEIVED');
});
