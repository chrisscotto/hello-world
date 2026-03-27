'use strict';

const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Send a poll (interactive button message) asking "Are you coming?"
 * WhatsApp Cloud API interactive messages support up to 3 quick-reply buttons.
 */
async function sendPollMessage(to, poll) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const start = poll.startTime.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const body = [
    `📅 *${poll.title}*`,
    '',
    poll.description ? poll.description : '',
    poll.location ? `📍 ${poll.location}` : '',
    `🕐 ${start}`,
    '',
    'Will you attend?',
  ].filter((l) => l !== undefined).join('\n').trim();

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `YES_${poll.id}`, title: '✅ Yes' } },
          { type: 'reply', reply: { id: `NO_${poll.id}`, title: '❌ No' } },
        ],
      },
    },
  };

  const res = await axios.post(
    `${BASE_URL}/${phoneNumberId}/messages`,
    payload,
    { headers: getHeaders() }
  );
  return res.data;
}

/**
 * Send a plain text message (used after receiving a Yes vote).
 */
async function sendTextMessage(to, text) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  };

  const res = await axios.post(
    `${BASE_URL}/${phoneNumberId}/messages`,
    payload,
    { headers: getHeaders() }
  );
  return res.data;
}

/**
 * Send an ICS file as a document attachment via WhatsApp.
 * WhatsApp doesn't accept raw file uploads inline — we need to first upload
 * the media, then send it as a document message.
 */
async function sendCalendarFile(to, icsContent, filename) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // Step 1: Upload the ICS file to WhatsApp media endpoint
  const FormData = require('form-data');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'text/calendar');
  form.append('file', Buffer.from(icsContent, 'utf-8'), {
    filename,
    contentType: 'text/calendar',
  });

  const uploadRes = await axios.post(
    `${BASE_URL}/${phoneNumberId}/media`,
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      },
    }
  );

  const mediaId = uploadRes.data.id;

  // Step 2: Send document message referencing the uploaded media
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: {
      id: mediaId,
      filename,
      caption: '📅 Your calendar invite — tap to add to your calendar!',
    },
  };

  const res = await axios.post(
    `${BASE_URL}/${phoneNumberId}/messages`,
    payload,
    { headers: getHeaders() }
  );
  return res.data;
}

/**
 * Mark an incoming message as read.
 */
async function markRead(messageId) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  await axios.post(
    `${BASE_URL}/${phoneNumberId}/messages`,
    { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
    { headers: getHeaders() }
  ).catch(() => {}); // non-critical, swallow errors
}

module.exports = { sendPollMessage, sendTextMessage, sendCalendarFile, markRead };
