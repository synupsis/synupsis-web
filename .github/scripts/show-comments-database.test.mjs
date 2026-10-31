import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { temporaryPostgres } from './helpers/temporary-postgres.mjs';

const read = file => readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8');
const viewer = '00000000-0000-0000-0000-000000000001';
const author = '00000000-0000-0000-0000-000000000002';
const show = '00000000-0000-0000-0000-000000000010';
const oldPopular = '00000000-0000-0000-0000-000000000100';
const unseen = '00000000-0000-0000-0000-000000000101';
const reply = '00000000-0000-0000-0000-000000000102';

test('popular show comments are globally ranked under viewer row security', async t => {
  const db = temporaryPostgres(t);
  if (!db) return;
  db.sql(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE TABLE public.show (id uuid PRIMARY KEY);
    CREATE TABLE public.library_entry (user_id uuid, show_id uuid, season integer, episode integer);
    ALTER TABLE public.library_entry ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_library ON public.library_entry FOR SELECT TO authenticated USING (user_id = auth.uid());
    GRANT SELECT ON public.library_entry TO authenticated, service_role;
    INSERT INTO auth.users VALUES ('${viewer}'), ('${author}');
    INSERT INTO public.show VALUES ('${show}');
    INSERT INTO public.library_entry VALUES ('${viewer}', '${show}', 1, 2);
  `);
  db.sql(read('20261028150000_create_episode_comment.sql'));
  db.sql(read('20261028190000_add_episode_comment_replies_and_likes.sql'));
  db.sql(read('20261030180000_rank_show_comments.sql'));
  db.sql(`
    INSERT INTO public.episode_comment (id, show_id, season, episode, user_id, body, created_at)
    SELECT md5('comment-' || n)::uuid, '${show}', 1, 1, '${author}', 'A comment',
      '2026-10-01'::timestamptz + n * interval '1 minute' FROM generate_series(1, 501) n;
    INSERT INTO public.episode_comment (id, show_id, season, episode, user_id, body, created_at) VALUES
      ('${oldPopular}', '${show}', 1, 1, '${author}', 'An older popular comment', '2020-01-01'),
      ('${unseen}', '${show}', 2, 1, '${author}', 'An unseen spoiler', '2026-10-30');
    INSERT INTO public.episode_comment (id, show_id, season, episode, user_id, body, parent_id)
      VALUES ('${reply}', '${show}', 1, 1, '${author}', 'A reply', '${oldPopular}');
    INSERT INTO public.episode_comment_like (comment_id, user_id) VALUES
      ('${oldPopular}', '${viewer}'), ('${unseen}', '${viewer}'), ('${unseen}', '${author}'), ('${reply}', '${viewer}');
  `);
  function page(offset = 0, limit = 21, user = viewer) {
    return JSON.parse(db.sql(`SET ROLE authenticated; SET request.jwt.claim.sub = '${user}';
      SELECT coalesce(json_agg(id), '[]') FROM public.most_liked_show_comment_ids('${show}', ${offset}, ${limit});`));
  }

  await t.test('includes a popular comment older than the latest 500', () => {
    const ids = page();
    assert.equal(ids.length, 21);
    assert.equal(ids[0], oldPopular);
  });
  await t.test('excludes unreadable spoilers and replies before pagination', () => {
    const ids = Array.from({ length: 6 }, (_, index) => page(index * 100, 100)).flat();
    assert.equal(ids.length, 502);
    assert.equal(new Set(ids).size, 502);
    assert.ok(!ids.includes(unseen));
    assert.ok(!ids.includes(reply));
    assert.deepEqual(page(0, 21, '00000000-0000-0000-0000-000000000003'), []);
  });
  await t.test('orders ties by date and ID, keeping pages stable', () => {
    db.sql(`UPDATE public.episode_comment SET created_at = '2026-10-29' WHERE id IN (md5('comment-1')::uuid, md5('comment-2')::uuid)`);
    const tied = db.sql("SELECT id FROM episode_comment WHERE id IN (md5('comment-1')::uuid, md5('comment-2')::uuid) ORDER BY id").split('\n');
    assert.deepEqual(page(0, 3), [oldPopular, ...tied]);
    assert.deepEqual([...page(0, 20), ...page(20, 20)], page(0, 40));
    assert.deepEqual(page(502), []);
  });
  await t.test('limits reads and does not grant anonymous access', () => {
    assert.equal(page(0, 1000).length, 100);
    assert.equal(db.sql("SELECT has_function_privilege('anon', 'public.most_liked_show_comment_ids(uuid,integer,integer)', 'EXECUTE')"), 'f');
    assert.equal(db.sql("SELECT prosecdef FROM pg_proc WHERE oid = 'public.most_liked_show_comment_ids(uuid,integer,integer)'::regprocedure"), 'f');
  });
});
