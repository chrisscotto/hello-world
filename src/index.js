'use strict';

require('dotenv').config();

const express = require('express');
const { registerRecipient, recordYesVote, getPollForPhone, getPoll, getAllPolls, createPoll } = require('./pollStore');
const { sendPollMessage, sendTextMessage, sendCalendarFile, markRead } = require('./whatsapp');
const { generateICS } = require('./calendar');

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Webhook verification (GET) — required by Meta to activate the webhook
// ---------------------------------------------------------------------------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[webhook] Verification successful');
    return res.status(200).send(challenge);
  }
  console.warn('[webhook] Verification failed');
  res.sendStatus(403);
});

// ---------------------------------------------------------------------------
// Incoming messages (POST) — Meta sends all WhatsApp events here
// ---------------------------------------------------------------------------
app.post('/webhook', async (req, res) => {
  // Acknowledge immediately so Meta doesn't retry
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value;

      for (const message of value.messages || []) {
        await handleMessage(message, value.contacts || []);
      }
    }
  }
});

async function handleMessage(message, contacts) {
  const from = message.from; // sender's phone number (E.164 without +)
  const messageId = message.id;
  const contact = contacts.find((c) => c.wa_id === from);
  const senderName = contact?.profile?.name || from;

  await markRead(messageId);

  // ── Handle button replies (Yes / No from our poll messages) ──────────────
  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    const buttonId = message.interactive.button_reply.id; // e.g. "YES_<pollId>"

    if (buttonId.startsWith('YES_')) {
      const pollId = buttonId.slice(4);
      const poll = getPoll(pollId);
      if (!poll) {
        console.warn(`[handler] Received YES for unknown poll ${pollId}`);
        return;
      }

      const voter = { phone: from, name: senderName };
      const already = poll.yesVoters.some((v) => v.phone === from);
      if (!already) poll.yesVoters.push(voter);

      console.log(`[handler] ${senderName} (${from}) said YES to "${poll.title}"`);

      // Notify organizer (optional — just log for now)
      console.log(`[handler] Yes voters so far: ${poll.yesVoters.map((v) => v.name).join(', ')}`);

      await sendCalendarInvite(from, poll, voter);

    } else if (buttonId.startsWith('NO_')) {
      await sendTextMessage(from, `No problem! We hope to see you next time. 👋`);
    }

    return;
  }

  // ── Handle native WhatsApp poll votes ────────────────────────────────────
  // WhatsApp native polls send an "interactive" message with type "nfm_reply"
  // or the vote event is under message.type === "interactive" with
  // interactive.type === "nfm_reply" containing the selected options.
  if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
    const responseJson = message.interactive.nfm_reply?.response_json;
    if (responseJson) {
      try {
        const parsed = JSON.parse(responseJson);
        // Native poll responses come as { flow_token, ...selectedOptions }
        // We look for any selected option that maps to a Yes sentiment
        const selectedOptions = parsed.selectedOptions || [];
        const isYes = selectedOptions.some((opt) =>
          /yes|going|attend|yep|sure|absolutely/i.test(opt.title || opt.id || '')
        );
        if (isYes) {
          const poll = getPollForPhone(from);
          if (poll) {
            const voter = { phone: from, name: senderName };
            await sendCalendarInvite(from, poll, voter);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
    return;
  }

  // ── Handle plain-text "yes" replies as a fallback ────────────────────────
  if (message.type === 'text') {
    const text = (message.text?.body || '').trim().toLowerCase();
    if (/^(yes|yep|yeah|sure|absolutely|going|attending|i'?m in|count me in)$/.test(text)) {
      const poll = getPollForPhone(from);
      if (poll) {
        const voter = { phone: from, name: senderName };
        const already = poll.yesVoters.some((v) => v.phone === from);
        if (!already) poll.yesVoters.push(voter);
        await sendCalendarInvite(from, poll, voter);
        return;
      }
    }

    // Unknown message — send a friendly hint
    await sendTextMessage(from, `Hi! 👋 To respond to a poll, please use the Yes/No buttons in the event message.`);
  }
}

async function sendCalendarInvite(phone, poll, voter) {
  try {
    const icsContent = generateICS(poll, voter);
    const safeName = poll.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${safeName}_invite.ics`;

    await sendTextMessage(phone, `🎉 Great, you're in for *${poll.title}*! Sending your calendar invite now...`);
    await sendCalendarFile(phone, icsContent, filename);
    console.log(`[invite] Sent calendar invite for "${poll.title}" to ${phone}`);
  } catch (err) {
    console.error(`[invite] Failed to send invite to ${phone}:`, err.message);
    // Fallback: at least confirm attendance with a text message
    await sendTextMessage(phone, `✅ You're confirmed for *${poll.title}*! Add it to your calendar and we'll see you there.`);
  }
}

// ---------------------------------------------------------------------------
// REST API — Create & manage polls
// ---------------------------------------------------------------------------

/**
 * POST /polls
 * Create a new event poll.
 * Body: { title, description, location, startTime, endTime, organizerName, organizerEmail }
 */
app.post('/polls', (req, res) => {
  const { title, startTime, endTime } = req.body;
  if (!title || !startTime || !endTime) {
    return res.status(400).json({ error: 'title, startTime, and endTime are required' });
  }
  const poll = createPoll(req.body);
  console.log(`[api] Created poll "${poll.title}" (id: ${poll.id})`);
  res.status(201).json(poll);
});

/**
 * GET /polls
 * List all polls with their yes-voter counts.
 */
app.get('/polls', (req, res) => {
  const polls = getAllPolls().map((p) => ({
    id: p.id,
    title: p.title,
    startTime: p.startTime,
    endTime: p.endTime,
    location: p.location,
    yesCount: p.yesVoters.length,
    yesVoters: p.yesVoters,
  }));
  res.json(polls);
});

/**
 * GET /polls/:id
 * Get a single poll.
 */
app.get('/polls/:id', (req, res) => {
  const poll = getPoll(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  res.json(poll);
});

/**
 * POST /polls/:id/send
 * Send the poll message to one or more WhatsApp numbers.
 * Body: { recipients: ["+15551234567", ...] }
 */
app.post('/polls/:id/send', async (req, res) => {
  const poll = getPoll(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  const { recipients } = req.body;
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recipients array is required' });
  }

  const results = [];
  for (const rawPhone of recipients) {
    // Normalize: strip +, spaces, dashes
    const phone = rawPhone.replace(/[+\s-]/g, '');
    try {
      await sendPollMessage(phone, poll);
      registerRecipient(phone, poll.id);
      results.push({ phone, status: 'sent' });
      console.log(`[api] Poll sent to ${phone}`);
    } catch (err) {
      console.error(`[api] Failed to send to ${phone}:`, err.response?.data || err.message);
      results.push({ phone, status: 'failed', error: err.response?.data?.error?.message || err.message });
    }
  }

  res.json({ pollId: poll.id, results });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 WhatsApp Poll → Calendar Invites server running on port ${PORT}`);
  console.log(`   Webhook URL:  http://<your-host>:${PORT}/webhook`);
  console.log(`   Health check: http://<your-host>:${PORT}/health\n`);
});
