# WhatsApp Poll → Calendar Invites

Automatically send `.ics` calendar invites to everyone who votes **Yes** on a WhatsApp poll.

```
Organizer creates poll
       │
       ▼
  App sends interactive Yes/No message to each recipient via WhatsApp
       │
       ▼
 Recipient taps ✅ Yes
       │
       ▼
  App generates a personalised .ics calendar invite
       │
       ▼
  App sends the .ics file back to the recipient via WhatsApp
```

---

## Quick start

### 1. Prerequisites

| Requirement | Notes |
|---|---|
| Node.js ≥ 18 | For built-in `fetch` |
| Meta Developer account | [developers.facebook.com](https://developers.facebook.com) |
| WhatsApp Business App | Connected to a phone number |
| Public HTTPS URL | Needed for the Meta webhook (use ngrok locally) |

### 2. Install

```bash
npm install
cp .env.example .env
# Fill in your credentials in .env
```

### 3. Configure WhatsApp Cloud API

1. Go to Meta for Developers → Your App → WhatsApp → API Setup.
2. Copy your **Access Token** and **Phone Number ID** into `.env`.
3. Set `WHATSAPP_VERIFY_TOKEN` to any secret string you choose.
4. Start the server: `npm start`
5. Expose it publicly: `ngrok http 3000`
6. In the Meta dashboard, add a webhook:
   - URL: `https://<your-ngrok-url>/webhook`
   - Verify token: the value you set in `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to: **messages**

### 4. Create and send a poll

```bash
# Create a poll interactively
npm run cli create-poll

# Send the poll to recipients (E.164 format with +)
npm run cli send-poll <pollId> +15551234567 +447911123456

# Check who said Yes
npm run cli list-polls
```

When a recipient taps **Yes**, they automatically receive a `.ics` calendar file in WhatsApp that opens in Google Calendar, Apple Calendar, Outlook, etc.

---

## API reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/polls` | Create a new event poll |
| `GET` | `/polls` | List all polls with attendee counts |
| `GET` | `/polls/:id` | Get a single poll |
| `POST` | `/polls/:id/send` | Send poll message to recipients |
| `GET` | `/webhook` | Meta webhook verification |
| `POST` | `/webhook` | Receive incoming WhatsApp events |
| `GET` | `/health` | Health check |

### Create poll body

```json
{
  "title": "Team BBQ",
  "description": "End-of-quarter celebration",
  "location": "Rooftop, 123 Main St",
  "startTime": "2025-07-04T17:00:00",
  "endTime": "2025-07-04T20:00:00",
  "organizerName": "Chris",
  "organizerEmail": "chris@example.com"
}
```

### Send poll body

```json
{
  "recipients": ["+15551234567", "+447911123456"]
}
```

---

## How Yes-vote detection works

The app handles three response patterns:

1. **Interactive button reply** (primary) — the app sends a WhatsApp interactive message with `Yes` / `No` quick-reply buttons. Button IDs are `YES_<pollId>` so the app always knows which event to invite the voter to.

2. **Native WhatsApp poll votes** — listens for `nfm_reply` interactive messages and checks the selected option text against a yes-sentiment regex.

3. **Plain-text fallback** — recognises "yes", "yep", "I'm in", "count me in", etc., and sends the invite.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `WHATSAPP_TOKEN` | Yes | WhatsApp Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | WhatsApp Business phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Secret token for webhook verification |
| `PORT` | No | Server port (default: `3000`) |
| `SMTP_HOST` | No | SMTP host for optional email fallback |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password / app password |
| `SMTP_FROM` | No | From address for calendar invite emails |
