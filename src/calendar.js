'use strict';

const ical = require('ical-generator');

/**
 * Generate an ICS calendar invite buffer for a poll event.
 * @param {object} poll  - poll object from pollStore
 * @param {object} voter - { phone, name }
 * @returns {string}     - ICS file contents as a string
 */
function generateICS(poll, voter) {
  const calendar = ical.default({
    name: poll.title,
    prodId: { company: 'WhatsApp Poll Inviter', product: 'Calendar', language: 'EN' },
  });

  calendar.createEvent({
    id: `${poll.id}-${voter.phone}`,
    start: poll.startTime,
    end: poll.endTime,
    summary: poll.title,
    description: poll.description,
    location: poll.location,
    organizer: {
      name: poll.organizerName,
      email: poll.organizerEmail || 'noreply@example.com',
    },
    attendees: [
      {
        name: voter.name || voter.phone,
        email: `${voter.phone}@whatsapp.placeholder`,
        rsvp: true,
        partstat: 'ACCEPTED',
        role: 'REQ-PARTICIPANT',
      },
    ],
    status: 'CONFIRMED',
    method: 'REQUEST',
  });

  return calendar.toString();
}

module.exports = { generateICS };
