import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { temporaryPostgres } from './helpers/temporary-postgres.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const owner = "md5('owner')::uuid";
const jobId = "md5('job')::uuid";
const call = `SELECT status FROM public.finalize_recap_generation(${jobId}, '{"cover":{},"beats":[]}', '{}', '[{"order":1,"canvas":{}}]');`;
const reset = `
  TRUNCATE public.recap_generation_job, public.recap, auth.users CASCADE;
  INSERT INTO auth.users VALUES (${owner});
  INSERT INTO public.recap_generation_job (id, requested_by, requester_name, show_id, season_id, locale, status)
  VALUES (${jobId}, ${owner}, 'Owner', md5('show')::uuid, md5('season')::uuid, 'fr', 'rendering');
  SELECT reserve_recap_key(${jobId});
`;
const state = `SELECT j.status || ':' || j.key_state || ':' || w.keys || ':' || (SELECT count(*) FROM public.recap)
  FROM public.recap_generation_job j JOIN public.recap_wallet w ON w.user_id=j.requested_by;`;

test('recap publication and key accounting are atomic in PostgreSQL', async t => {
  const db = temporaryPostgres(t);
  if (!db) return;
  db.sql(read('./fixtures/recap-key-schema.sql'));
  const publisherMigration = read('../../supabase/migrations/20260722210000_add_recap_event_graph.sql');
  db.sql(publisherMigration.slice(publisherMigration.indexOf('CREATE OR REPLACE FUNCTION public.publish_generated_recap(')));
  db.sql(read('../../supabase/migrations/20261029100000_create_recap_keys.sql'));
  db.sql(read('../../supabase/migrations/20261029110000_finalize_recap_keys_atomically.sql'));

  await t.test('successful publication attributes and spends once, including a retry', () => {
    db.sql(reset);
    assert.equal(db.sql(`SET ROLE service_role; ${call}`), 'completed');
    assert.equal(db.sql(call), 'completed');
    assert.equal(db.sql(state), 'completed:spent:2:1');
    assert.equal(db.sql(`SELECT unlocked_by = ${owner} AND unlocked_by_name = 'Owner' FROM public.recap`), 't');
    assert.equal(db.sql('SELECT count(*) FROM public.slide'), '1');
  });

  for (const failure of ['attribution', 'completion']) {
    await t.test(`${failure} failure rolls back publication and leaves the key refundable`, () => {
      db.sql(reset);
      const target = failure === 'attribution' ? 'public.recap' : 'public.recap_generation_job';
      const condition = failure === 'attribution' ? 'NEW.unlocked_by IS NOT NULL' : "NEW.status = 'completed'";
      db.sql(`CREATE FUNCTION public.reject_test_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected ${failure} error'; END $$;
        CREATE TRIGGER injected_failure BEFORE UPDATE ON ${target} FOR EACH ROW WHEN (${condition}) EXECUTE FUNCTION public.reject_test_write();`);
      try {
        assert.throws(() => db.sql(call), new RegExp(`injected ${failure} error`));
        assert.equal(db.sql(state), 'rendering:reserved:2:0');
        assert.equal(db.sql('SELECT count(*) FROM public.slide'), '0');
        db.sql(`UPDATE public.recap_generation_job SET status='failed' WHERE id=${jobId};`);
        assert.equal(db.sql(state), 'failed:refunded:3:0');
      } finally {
        db.sql(`DROP TRIGGER injected_failure ON ${target}; DROP FUNCTION public.reject_test_write();`);
      }
    });
  }

  await t.test('an expired job cannot publish when its finalizer arrives late', () => {
    db.sql(reset);
    db.sql(`UPDATE public.recap_generation_job SET status='failed' WHERE id=${jobId};`);
    assert.equal(db.sql(call), 'failed');
    assert.equal(db.sql(state), 'failed:refunded:3:0');
  });

  await t.test('the finalizer is inaccessible to authenticated clients', () => {
    db.sql(reset);
    assert.throws(() => db.sql(`SET ROLE authenticated; ${call}`), /permission denied/);
    assert.equal(db.sql(state), 'rendering:reserved:2:0');
  });

  await t.test('concurrent expiry waits for committed publication and does not refund', async () => {
    db.sql(reset);
    const finalizer = db.session();
    finalizer.write(`BEGIN; ${call}\n\\echo publication_locked\n`);
    await finalizer.waitFor('publication_locked');
    const expiry = db.session();
    const expired = expiry.end(`UPDATE public.recap_generation_job SET status='failed'
      WHERE id=${jobId} AND status IN ('queued','gathering','generating','validating','rendering');`);
    await finalizer.end('COMMIT;');
    await expired;
    assert.equal(db.sql(state), 'completed:spent:2:1');
  });

  await t.test('a concurrent expiration that wins prevents all publication', async () => {
    db.sql(reset);
    const expiry = db.session();
    expiry.write(`BEGIN; UPDATE public.recap_generation_job SET status='failed' WHERE id=${jobId};\n\\echo refund_locked\n`);
    await expiry.waitFor('refund_locked');
    const finalizer = db.session();
    const result = finalizer.end(call);
    await expiry.end('COMMIT;');
    assert.equal(await result, 'failed');
    assert.equal(db.sql(state), 'failed:refunded:3:0');
  });

  await t.test('refreshing an existing recap preserves its original unlocker', () => {
    db.sql(reset);
    db.sql(call);
    db.sql(`INSERT INTO auth.users VALUES (md5('second-user')::uuid);
      INSERT INTO public.recap_generation_job (id, requested_by, requester_name, show_id, season_id, locale, status)
      SELECT md5('second-job')::uuid, md5('second-user')::uuid, 'Second', show_id, season_id, locale, 'rendering'
      FROM public.recap_generation_job WHERE id=${jobId};`);
    db.sql(call.replace(jobId, "md5('second-job')::uuid"));
    assert.equal(db.sql(`SELECT unlocked_by = ${owner} AND unlocked_by_name = 'Owner' FROM public.recap`), 't');
    assert.equal(db.sql('SELECT count(*) FROM public.recap'), '1');
  });

  await t.test('two concurrent requests cannot both reserve the last key', async () => {
    db.sql(reset);
    db.sql(`UPDATE public.recap_wallet SET keys=1;
      INSERT INTO public.recap_generation_job (id, requested_by, show_id, season_id, locale, status)
      SELECT md5(v)::uuid, requested_by, show_id, md5(v)::uuid, locale, 'gathering'
      FROM public.recap_generation_job CROSS JOIN (VALUES ('race-a'), ('race-b')) names(v) WHERE id=${jobId};`);
    const first = db.session();
    first.write("BEGIN; SELECT reserve_recap_key(md5('race-a')::uuid);\n\\echo reserved_locked\n");
    await first.waitFor('reserved_locked');
    const second = db.session();
    const result = second.end("SELECT reserve_recap_key(md5('race-b')::uuid);");
    // Attach the rejection handler before releasing the first transaction.
    const rejected = assert.rejects(result, /no_recap_keys/);
    await first.end('COMMIT;');
    await rejected;
    assert.equal(db.sql('SELECT keys FROM public.recap_wallet'), '0');
    assert.equal(db.sql("SELECT count(*) FROM public.recap_generation_job WHERE id IN (md5('race-a')::uuid,md5('race-b')::uuid) AND key_state='reserved'"), '1');
  });
});
