import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { temporaryPostgres } from './helpers/temporary-postgres.mjs';

const migration = readFileSync(new URL('../../supabase/migrations/20261102120000_create_public_profile.sql', import.meta.url), 'utf8');
const older = '00000000-0000-0000-0000-000000000001';
const newer = '00000000-0000-0000-0000-000000000002';
const anonymous = '00000000-0000-0000-0000-000000000003';
const late = '00000000-0000-0000-0000-000000000004';

test('public profiles follow the account and only show named viewers', async t => {
  const db = temporaryPostgres(t);
  if (!db) return;
  db.sql(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, raw_user_meta_data jsonb, created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE public.recap_slide_suggestion (created_by uuid, created_at timestamptz);
    INSERT INTO auth.users (id, raw_user_meta_data, created_at) VALUES
      ('${newer}', '{"username": "Léa Martin"}', '2026-02-01'),
      ('${older}', '{"username": "lea  martin!", "avatar_url": "https://example.test/a.png"}', '2026-01-01'),
      ('${anonymous}', '{}', '2026-03-01');
  `);
  db.sql(migration);
  const profile = id => JSON.parse(db.sql(`SELECT row_to_json(p) FROM public.public_profile p WHERE user_id = '${id}'`) || 'null');
  const as = (role, sql, user = '') => db.sql(`SET ROLE ${role}; SET request.jwt.claim.sub = '${user}'; ${sql}`);

  await t.test('gives existing accounts an address, oldest first', () => {
    assert.equal(profile(older).handle, 'lea-martin');
    assert.equal(profile(older).avatar_url, 'https://example.test/a.png');
    assert.match(profile(older).created_at, /^2026-01-01/);
    assert.equal(profile(newer).handle, 'lea-martin-2');
    assert.equal(profile(newer).display_name, 'Léa Martin');
    assert.equal(profile(anonymous).handle, null);
  });

  await t.test('creates the page on sign-up and keeps the address when the name changes', () => {
    db.sql(`INSERT INTO auth.users (id, raw_user_meta_data) VALUES ('${late}', '{"username": "Zoé_42"}')`);
    assert.equal(profile(late).handle, 'zoe_42');
    db.sql(`UPDATE auth.users SET raw_user_meta_data = '{"username": "Zoé", "avatar_url": "https://example.test/z.png"}' WHERE id = '${late}'`);
    assert.equal(profile(late).handle, 'zoe_42');
    assert.equal(profile(late).display_name, 'Zoé');
    assert.equal(profile(late).avatar_url, 'https://example.test/z.png');
  });

  await t.test('gives an address with the first username', () => {
    db.sql(`UPDATE auth.users SET raw_user_meta_data = '{"username": "?!"}' WHERE id = '${anonymous}'`);
    assert.equal(profile(anonymous).handle, 'viewer');
  });

  await t.test('hides accounts without a username from other viewers', () => {
    db.sql(`UPDATE auth.users SET raw_user_meta_data = '{}' WHERE id = '${anonymous}'`);
    assert.equal(as('anon', `SELECT count(*) FROM public.public_profile WHERE user_id = '${anonymous}'`), '0');
    assert.equal(as('authenticated', `SELECT count(*) FROM public.public_profile WHERE user_id = '${anonymous}'`, older), '0');
    assert.equal(as('authenticated', `SELECT count(*) FROM public.public_profile WHERE user_id = '${anonymous}'`, anonymous), '1');
    assert.equal(as('anon', 'SELECT count(*) FROM public.public_profile'), '3');
  });

  await t.test('lets owners edit their bio while keeping the address fixed', () => {
    as('authenticated', `UPDATE public.public_profile SET bio = 'Séries policières.' WHERE user_id = '${older}'`, older);
    assert.equal(profile(older).handle, 'lea-martin');
    assert.equal(profile(older).bio, 'Séries policières.');
    as('authenticated', `UPDATE public.public_profile SET bio = 'Not mine' WHERE user_id = '${newer}'`, older);
    assert.equal(profile(newer).bio, null);
    assert.throws(() => as('authenticated', `UPDATE public.public_profile SET display_name = 'Admin' WHERE user_id = '${older}'`, older), /permission denied/);
    assert.throws(() => as('authenticated', `UPDATE public.public_profile SET handle = 'another-address' WHERE user_id = '${older}'`, older), /permission denied/);
    assert.throws(() => as('authenticated', `UPDATE public.public_profile SET handle = NULL WHERE user_id = '${older}'`, older), /permission denied/);
    assert.equal(profile(older).handle, 'lea-martin');
    assert.throws(() => as('anon', `UPDATE public.public_profile SET bio = 'x'`), /permission denied/);
  });
});
