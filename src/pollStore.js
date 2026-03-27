'use strict';

/**
 * In-memory poll store.
 * Production usage: swap this out for a database.
 *
 * Schema:
 *   polls[pollId] = {
 *     id, title, description, location,
 *     startTime, endTime,   // JS Date objects
 *     organizerName, organizerEmail,
 *     yesVoters: [{ phone, name }]
 *   }
 *
 *   phoneToPoll[phone] = pollId   // tracks which poll a phone number was sent
 */

const polls = {};
const phoneToPoll = {};

function createPoll(event) {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  polls[id] = {
    id,
    title: event.title,
    description: event.description || '',
    location: event.location || '',
    startTime: new Date(event.startTime),
    endTime: new Date(event.endTime),
    organizerName: event.organizerName || 'Organizer',
    organizerEmail: event.organizerEmail || '',
    yesVoters: [],
  };
  return polls[id];
}

function getPoll(pollId) {
  return polls[pollId] || null;
}

function getAllPolls() {
  return Object.values(polls);
}

// Associate a phone number with a poll so we know which event
// to send the invite for when they vote Yes.
function registerRecipient(phone, pollId) {
  phoneToPoll[phone] = pollId;
}

function getPollForPhone(phone) {
  const pollId = phoneToPoll[phone];
  return pollId ? getPoll(pollId) : null;
}

function recordYesVote(phone, name) {
  const poll = getPollForPhone(phone);
  if (!poll) return null;

  const already = poll.yesVoters.some((v) => v.phone === phone);
  if (!already) {
    poll.yesVoters.push({ phone, name: name || phone });
  }
  return poll;
}

module.exports = { createPoll, getPoll, getAllPolls, registerRecipient, getPollForPhone, recordYesVote };
