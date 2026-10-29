import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { temporaryPostgres } from './helpers/temporary-postgres.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const recap = "md5('recap')::uuid";
const viewer = "md5('viewer')::uuid";
const owner = "md5('owner')::uuid";
const reset = `TRUNCATE public.recap_generation_job, public.recap, auth.users CASCADE;
  INSERT INTO auth.users VALUES (${owner}), (${viewer}), (md5('intruder')::uuid);
  INSERT INTO public.recap (id, show_id, season_id, locale, format_version, status, unlocked_by)
  VALUES (${recap}, md5('show')::uuid, md5('season')::uuid, 'fr', 10, 'published', ${owner});`;

test('recap rewards require server-observed slide progress in PostgreSQL', async t => {
  const db = temporaryPostgres(t);
  if (!db) return;
  db.sql(read('./fixtures/recap-key-schema.sql'));
  db.sql(read('../../supabase/migrations/20261029100000_create_recap_keys.sql'));
  db.sql(read('../../supabase/migrations/20261029120000_track_recap_view_progress.sql'));
  const start = (count = 5, index = 0) => db.sql(`SELECT start_recap_view_session(${recap}, ${viewer}, ${count}, ${index})`);
  const progressSql = (session, index, user = viewer, recapId = recap) =>
    `SELECT record_recap_view_progress('${session}', ${recapId}, ${user}, ${index === null ? 'NULL' : index})`;
  const progress = (...args) => db.sql(progressSql(...args));
  const dwell = session => db.sql(`UPDATE recap_view_session SET slide_started_at = clock_timestamp() - interval '2 seconds' WHERE id='${session}'`);
  const views = () => Number(db.sql('SELECT count(*) FROM recap_view'));

  await t.test('missing, foreign and expired sessions cannot reward a view', () => {
    db.sql(reset);
    const session = start();
    assert.throws(() => progress('00000000-0000-0000-0000-000000000000', 1), /recap_view_session_expired/);
    assert.throws(() => progress(session, 1, "md5('intruder')::uuid"), /recap_view_session_expired/);
    assert.throws(() => progress(session, 1, viewer, "md5('other-recap')::uuid"), /recap_view_session_expired/);
    db.sql(`UPDATE recap_view_session SET expires_at = clock_timestamp() - interval '1 second'`);
    assert.throws(() => progress(session, 1), /recap_view_session_expired/);
    assert.equal(views(), 0);
  });

  await t.test('rapid skips, repeated indices and an end jump do not meet the threshold', () => {
    db.sql(reset);
    const session = start();
    for (const index of [1, 2, 3, 4, 4, 0]) assert.equal(progress(session, index), 'f');
    dwell(session);
    assert.equal(progress(session, 4), 'f');
    assert.equal(progress(session, 4), 'f');
    assert.equal(db.sql('SELECT cardinality(seen_slides) FROM recap_view_session'), '1');
    assert.equal(views(), 0);
  });

  await t.test('half of the distinct slides must each have enough display time', () => {
    db.sql(reset);
    const session = start(5);
    for (const index of [0, 1]) {
      if (index) progress(session, index);
      dwell(session);
      assert.equal(progress(session, index), 'f');
    }
    progress(session, 2);
    dwell(session);
    assert.equal(progress(session, 2), 't');
    assert.equal(views(), 1);
    assert.equal(db.sql(`SELECT points FROM recap_wallet WHERE user_id=${owner}`), '1');
    assert.equal(progress(session, 2), 't');
    assert.equal(start(), ''); // Already rewarded; no new session needed.
    assert.equal(db.sql(`SELECT points FROM recap_wallet WHERE user_id=${owner}`), '1');
  });

  await t.test('single-slide recaps can qualify after their slide is displayed', () => {
    db.sql(reset);
    const session = start(1);
    assert.equal(progress(session, 0), 'f');
    dwell(session);
    assert.equal(progress(session, 0), 't');
    assert.equal(views(), 1);
  });

  await t.test('pausing discards the interval and resuming starts a new clock', () => {
    db.sql(reset);
    const session = start(1);
    dwell(session);
    assert.equal(progress(session, null), 'f');
    dwell(session);
    assert.equal(progress(session, 0), 'f');
    assert.equal(progress(session, 0), 'f');
    assert.equal(views(), 0);
    dwell(session);
    assert.equal(progress(session, 0), 't');
  });

  await t.test('out-of-range indices are rejected without changing progress', () => {
    db.sql(reset);
    const session = start(3);
    dwell(session);
    for (const index of [-1, 3, 999]) assert.throws(() => progress(session, index), /invalid_recap_slide/);
    assert.equal(db.sql('SELECT cardinality(seen_slides) FROM recap_view_session'), '0');
    assert.equal(views(), 0);
  });

  await t.test('restarting invalidates the prior session and its accumulated time', () => {
    db.sql(reset);
    const old = start(1);
    dwell(old);
    const fresh = start(1);
    assert.notEqual(old, fresh);
    assert.throws(() => progress(old, 0), /recap_view_session_expired/);
    assert.equal(progress(fresh, 0), 'f');
    assert.equal(views(), 0);
  });

  await t.test('own, unattributed and unpublished recaps do not earn points', () => {
    db.sql(reset);
    assert.equal(db.sql(`SELECT start_recap_view_session(${recap}, ${owner}, 1, 0)`), '');
    db.sql('UPDATE recap SET unlocked_by=NULL');
    assert.equal(start(1), '');
    db.sql("UPDATE recap SET status='draft'");
    assert.throws(() => start(1), /recap_not_found/);
    assert.equal(views(), 0);
  });

  await t.test('concurrent final progress requests award exactly one point', async () => {
    db.sql(reset);
    const session = start(1);
    dwell(session);
    const first = db.session();
    first.write(`BEGIN; ${progressSql(session, 0)};\n\\echo view_locked\n`);
    await first.waitFor('view_locked');
    const second = db.session();
    const secondResult = second.end(progressSql(session, 0));
    await first.end('COMMIT;');
    assert.equal(await secondResult, 't');
    assert.equal(views(), 1);
    assert.equal(db.sql(`SELECT points FROM recap_wallet WHERE user_id=${owner}`), '1');
  });

  await t.test('browser roles cannot call reward/session RPCs or write sessions directly', () => {
    for (const role of ['anon', 'authenticated']) {
      for (const signature of ['record_recap_view(uuid,uuid)', 'start_recap_view_session(uuid,uuid,integer,integer)', 'record_recap_view_progress(uuid,uuid,uuid,integer)']) {
        assert.equal(db.sql(`SELECT has_function_privilege('${role}', 'public.${signature}', 'EXECUTE')`), 'f');
      }
      assert.equal(db.sql(`SELECT has_table_privilege('${role}', 'public.recap_view_session', 'INSERT,UPDATE,SELECT')`), 'f');
    }
  });
});
