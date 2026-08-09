const test = require('node:test');
const assert = require('node:assert/strict');

const { buildEventEmbed, eventAnnouncement, discordTimestamp, safeUrl, eventWhere, communityUrl } =
  require('./eventPost');

const APP = 'https://0nefor.one';

function row(over = {}) {
  return {
    event_id: 1,
    title: 'Friday Night Locals',
    description: 'Weekly tournament, 20 CHF entry',
    starts_at: '2026-09-12T17:30:00.000Z',
    ends_at: null,
    is_online: false,
    location: 'Rue de Berne 12',
    url: null,
    cover_url: null,
    community_name: 'Subarashii Manga Cafe',
    community_slug: 'subarashii-manga-cafe',
    community_avatar_url: null,
    city: 'Genève',
    country: 'Switzerland',
    ...over,
  };
}

test('discordTimestamp renders seconds, not milliseconds', () => {
  assert.equal(discordTimestamp('2026-09-12T17:30:00.000Z'), '<t:1789234200:F>');
  assert.equal(discordTimestamp('2026-09-12T17:30:00.000Z', 'R'), '<t:1789234200:R>');
});

test('discordTimestamp returns null for a date it cannot read', () => {
  assert.equal(discordTimestamp('soon'), null);
  assert.equal(discordTimestamp(null), null);
  assert.equal(discordTimestamp(undefined), null);
});

test('safeUrl keeps http and https and drops everything else', () => {
  assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x');
  assert.equal(safeUrl('  http://example.com  '), 'http://example.com/');
  // The field is filled in by whoever created the event; an embed link is a
  // link a reader trusts because of where it sits.
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,<script>'), null);
  assert.equal(safeUrl('example.com'), null);
  assert.equal(safeUrl(''), null);
  assert.equal(safeUrl(null), null);
});

test('eventWhere prefers the event address, then the community town', () => {
  assert.equal(eventWhere(row()), 'Rue de Berne 12');
  assert.equal(eventWhere(row({ location: '   ' })), 'Genève, Switzerland');
  assert.equal(eventWhere(row({ location: null, city: null, country: null })), '');
});

test('eventWhere says Online rather than an address for an online event', () => {
  assert.equal(eventWhere(row({ is_online: true, location: 'Rue de Berne 12' })), 'Online');
});

test('communityUrl falls back to the site when a row has no slug', () => {
  assert.equal(communityUrl(row(), APP), `${APP}/en/community/subarashii-manga-cafe`);
  assert.equal(communityUrl(row({ community_slug: null }), APP), APP);
});

test('the embed links its title to the community page by default', () => {
  const e = buildEventEmbed(row(), APP).toJSON();
  assert.equal(e.title, 'Friday Night Locals');
  assert.equal(e.url, `${APP}/en/community/subarashii-manga-cafe`);
  assert.equal(e.author.name, 'Subarashii Manga Cafe');
});

test('the embed prefers the event own link, because that is the sign-up', () => {
  const e = buildEventEmbed(row({ url: 'https://tournaments.example/reg' }), APP).toJSON();
  assert.equal(e.url, 'https://tournaments.example/reg');
});

test('a hostile event link never reaches the embed', () => {
  const e = buildEventEmbed(row({ url: 'javascript:alert(1)' }), APP).toJSON();
  assert.equal(e.url, `${APP}/en/community/subarashii-manga-cafe`);
});

test('markdown in a description is escaped, since descriptions render it', () => {
  const e = buildEventEmbed(row({ description: 'Bring **your** deck ~~or not~~' }), APP).toJSON();
  assert.ok(!e.description.includes('**your**'));
  assert.ok(e.description.includes('\\*\\*your\\*\\*'));
});

test('When carries both the absolute time and the relative one', () => {
  const e = buildEventEmbed(row(), APP).toJSON();
  const when = e.fields.find((f) => f.name === 'When');
  assert.ok(when.value.includes('<t:1789234200:F>'));
  assert.ok(when.value.includes('<t:1789234200:R>'));
});

test('an end time appears only when the event has one', () => {
  const without = buildEventEmbed(row(), APP).toJSON();
  assert.ok(!without.fields.find((f) => f.name === 'When').value.includes('→'));

  const with_ = buildEventEmbed(row({ ends_at: '2026-09-12T21:00:00.000Z' }), APP).toJSON();
  assert.ok(with_.fields.find((f) => f.name === 'When').value.includes('→ <t:1789246800:t>'));
});

test('Where is omitted rather than rendered empty', () => {
  const e = buildEventEmbed(row({ location: null, city: null, country: null }), APP).toJSON();
  assert.equal(e.fields.find((f) => f.name === 'Where'), undefined);
});

test('a cover image is used only when it is a real link', () => {
  assert.equal(buildEventEmbed(row(), APP).toJSON().image, undefined);
  assert.equal(
    buildEventEmbed(row({ cover_url: 'https://cdn.example/c.jpg' }), APP).toJSON().image.url,
    'https://cdn.example/c.jpg',
  );
  assert.equal(buildEventEmbed(row({ cover_url: 'javascript:x' }), APP).toJSON().image, undefined);
});

test('an event with no description still builds', () => {
  const e = buildEventEmbed(row({ description: '   ' }), APP).toJSON();
  assert.equal(e.description, undefined);
  assert.equal(e.title, 'Friday Night Locals');
});

test('the announcement line escapes the community name', () => {
  assert.equal(
    eventAnnouncement(row({ community_name: 'Red *Line*' })),
    '📅 New event from **Red \\*Line\\***',
  );
});
