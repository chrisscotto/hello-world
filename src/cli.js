#!/usr/bin/env node
'use strict';

/**
 * CLI tool for managing WhatsApp poll → calendar invite campaigns.
 *
 * Usage:
 *   node src/cli.js create-poll
 *   node src/cli.js send-poll <pollId> +15551234567 +447911123456
 *   node src/cli.js list-polls
 */

require('dotenv').config();

const readline = require('readline');

const BASE = `http://localhost:${process.env.PORT || 3000}`;

async function apiFetch(path, method = 'GET', body) {
  const { default: fetch } = await import('node-fetch').catch(() => {
    // fallback to built-in fetch (Node 18+)
    return { default: globalThis.fetch };
  });

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function createPoll() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n📅 Create a new event poll\n');

  const title = await prompt(rl, 'Event title: ');
  const description = await prompt(rl, 'Description (optional): ');
  const location = await prompt(rl, 'Location (optional): ');
  const startTime = await prompt(rl, 'Start time (e.g. 2025-06-15T18:00:00): ');
  const endTime = await prompt(rl, 'End time   (e.g. 2025-06-15T20:00:00): ');
  const organizerName = await prompt(rl, 'Your name: ');
  const organizerEmail = await prompt(rl, 'Your email (for calendar invite): ');

  rl.close();

  const poll = await apiFetch('/polls', 'POST', {
    title, description, location, startTime, endTime, organizerName, organizerEmail,
  });

  if (poll.error) {
    console.error('\n❌ Error:', poll.error);
    process.exit(1);
  }

  console.log(`\n✅ Poll created!`);
  console.log(`   ID:    ${poll.id}`);
  console.log(`   Title: ${poll.title}`);
  console.log(`   Start: ${new Date(poll.startTime).toLocaleString()}`);
  console.log(`\nNext step: send the poll with:`);
  console.log(`  node src/cli.js send-poll ${poll.id} +1234567890 +0987654321\n`);
}

async function sendPoll(pollId, phones) {
  if (!pollId || phones.length === 0) {
    console.error('Usage: node src/cli.js send-poll <pollId> <phone1> [phone2 ...]');
    process.exit(1);
  }

  console.log(`\n📤 Sending poll ${pollId} to ${phones.length} recipient(s)...\n`);

  const result = await apiFetch(`/polls/${pollId}/send`, 'POST', { recipients: phones });

  if (result.error) {
    console.error('❌ Error:', result.error);
    process.exit(1);
  }

  for (const r of result.results) {
    const icon = r.status === 'sent' ? '✅' : '❌';
    const extra = r.error ? ` — ${r.error}` : '';
    console.log(`  ${icon} ${r.phone}: ${r.status}${extra}`);
  }
  console.log();
}

async function listPolls() {
  const polls = await apiFetch('/polls');

  if (!Array.isArray(polls) || polls.length === 0) {
    console.log('\nNo polls found.\n');
    return;
  }

  console.log(`\n📋 Active polls (${polls.length})\n`);
  for (const p of polls) {
    console.log(`  [${p.id.slice(0, 8)}...]  ${p.title}`);
    console.log(`     Start: ${new Date(p.startTime).toLocaleString()}`);
    console.log(`     Yes votes: ${p.yesCount}`);
    if (p.yesVoters.length > 0) {
      console.log(`     Attendees: ${p.yesVoters.map((v) => v.name).join(', ')}`);
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const [,, command, ...args] = process.argv;

(async () => {
  switch (command) {
    case 'create-poll':
      await createPoll();
      break;
    case 'send-poll':
      await sendPoll(args[0], args.slice(1));
      break;
    case 'list-polls':
      await listPolls();
      break;
    default:
      console.log(`
WhatsApp Poll → Calendar Invites CLI

Commands:
  create-poll                        Interactively create a new event poll
  send-poll <pollId> <phones...>     Send poll to WhatsApp numbers
  list-polls                         Show all polls and their yes-voters
      `);
  }
})().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
