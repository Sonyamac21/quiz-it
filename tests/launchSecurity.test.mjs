import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const quiz = '00000000-0000-4000-8000-000000000003';
const session = '00000000-0000-4000-8000-000000000004';
const sql = file => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');

async function fixture() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema extensions;
    create extension pgcrypto with schema extensions;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth,extensions to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${owner}');
    create table public.quizzes(id uuid primary key,owner_id uuid);
    insert into public.quizzes values('${quiz}','${owner}');
    grant select on public.quizzes to authenticated;
    create table public.sessions(id uuid primary key,pin text unique,quiz_id uuid,status text,phase text,
      round_number integer,current_question_index integer,current_question jsonb,
      timer_started_at timestamptz,timer_duration integer,hot_seat_team text,hot_seat_status text,
      hot_seat_answer_started_at timestamptz,hot_seat_answer_duration integer,pursuit_status text,pursuit_data jsonb,
      spin_offered boolean,spin_choice text,fastest_team text,allow_power_cards boolean,
      hard_deck_team text,hard_deck_status text,hard_deck_steal_guesses jsonb,hard_deck_steal_winners jsonb,
      block_pending boolean default false,block_team text,block_until timestamptz,updated_at timestamptz);
    insert into public.sessions(id,pin,quiz_id,status,phase,round_number,current_question_index,allow_power_cards,current_question,pursuit_data)
      values('${session}','1234','${quiz}','active','question',1,0,true,
      '{"question_text":"Which planet?","question_type":"text_answer","correct_answer":"Earth","explanation":"Our home","owner_id":"private"}',
      '{"questions":[{"correct_answer":"Secret future answer"}],"race":{"Blue":{"status":"active"}}}');
    create table public.teams(id uuid default gen_random_uuid() primary key,session_pin text,team_name text,name text,victory_song text,
      photo_url text,photo_approved boolean default false,created_at timestamptz default now(),last_seen_at timestamptz,player_token_hash text,
      unique(session_pin,team_name));
    insert into public.teams(session_pin,team_name,player_token_hash) values('1234','Blue',encode(extensions.digest('blue-token','sha256'),'hex'));
    insert into public.teams(session_pin,team_name,player_token_hash) values('1234','Red',encode(extensions.digest('red-token','sha256'),'hex'));
    create table public.answers(id uuid default gen_random_uuid(),session_pin text,team_name text,round_number integer,
      question_index integer,answer_text text,submitted_at timestamptz default now(),unique(session_pin,team_name,round_number,question_index));
    create table public.scores(session_pin text,team_name text,total_points integer default 0,round_points integer default 0,
      updated_at timestamptz,unique(session_pin,team_name));
    create table public.uno_cards(team_name text,card_type text,used boolean,played_at timestamptz,session_pin text,round_number integer,
      unique(session_pin,team_name,card_type));
    create table public.question_bank(id integer,correct_answer text);
    create table public.rounds(id integer,questions jsonb);
    create table public.questions(id bigint,question_text text,correct_answer text);
    insert into public.question_bank values(1,'Secret');
    insert into public.questions values(1,'Private question','Private answer');
    create table public.media_assets(id integer);
    create table public.session_rounds(id uuid primary key,session_id uuid,questions jsonb,danger_zone_enabled boolean);
    create table public.session_photos(id uuid default gen_random_uuid(),session_id uuid,session_pin text,team_name text,photo_url text,approved boolean default false);
    create table public.victory_songs(id integer,is_active boolean);
    create function public.check_question_memory(p_text text,p_type text default null,p_threshold real default 0.6) returns bigint
      language sql stable as $$ select id from public.questions where question_text=p_text limit 1 $$;
    grant all on all tables in schema public to anon,authenticated;
    grant select(correct_answer) on public.questions to anon;
    grant select(player_token_hash) on public.teams to anon;
    alter table public.question_bank enable row level security;
    create policy legacy_open on public.question_bank for all using(true) with check(true);
  `);
  await db.exec(sql('202608270001_atomic_score_functions.sql'));
  await db.exec(sql('202609090001_team_performance_counters.sql'));
  await db.exec(sql('202608030001_hot_seat_round.sql'));
  return db;
}

test('security migration executes in PostgreSQL and enforces host/handset boundaries', async t => {
  const db = await fixture();
  try {
    await db.exec(sql('202610130001_launch_security.sql'));
    await db.exec(`insert into auth.users values('${other}')`);
    async function as(role, uid, token, query) {
      await db.exec(`set role ${role};`);
      await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.headers',$2,false)`, [uid || '',JSON.stringify({ 'x-quiz-player-token': token || '' })]);
      try { return await db.query(query); } finally { await db.exec('reset role'); }
    }
    await t.test('anonymous clients cannot read saved answers or raw sessions', async () => {
      for (const table of ['questions','rounds','question_bank','sessions','score_events']) {
        await assert.rejects(as('anon',null,null,`select * from public.${table}`), /permission denied/);
      }
      await assert.rejects(as('anon',null,null,'select player_token_hash from public.teams'), /permission denied/);
      await assert.rejects(as('anon',null,null,'select photo_url from public.teams'), /permission denied/);
      await assert.rejects(as('anon',null,null,'select questions from public.session_rounds'), /permission denied/);
    });
    await t.test('another host cannot read or change the owner library or session', async () => {
      assert.equal((await as('authenticated',other,null,'select * from question_bank')).rows.length,0);
      assert.equal((await as('authenticated',other,null,'select * from sessions')).rows.length,0);
      assert.equal((await as('authenticated',owner,null,'select * from question_bank')).rows.length,1);
      await assert.rejects(as('authenticated',other,null,`select * from apply_score_delta('1234','Blue',100,null,'attack',false,false)`), /Only the session owner/);
    });
    await t.test('owner scoring remains atomic and idempotent', async () => {
      const first = await as('authenticated',owner,null,`select * from apply_score_delta('1234','Blue',10,null,'event-1',true,true)`);
      assert.equal(first.rows[0].total_points,10);
      const retry = await as('authenticated',owner,null,`select * from apply_score_delta('1234','Blue',10,null,'event-1',true,true)`);
      assert.equal(retry.rows[0].applied,false);
      assert.equal(retry.rows[0].total_points,10);
      await assert.rejects(as('anon',null,null,`select * from set_score_absolute('1234','Blue',999,null)`), /permission denied/);
    });
    await t.test('player feed excludes present/future answers until host reveal', async () => {
      const live = (await as('anon',null,null,`select payload from player_sessions where pin='1234'`)).rows[0].payload;
      assert.equal(live.current_question.correct_answer,'');
      assert.equal(live.current_question.explanation,undefined);
      assert.equal(live.current_question.owner_id,undefined);
      assert.equal(live.pursuit_data.questions,undefined);
      await db.exec(`update sessions set phase='answer' where pin='1234'`);
      const revealed = (await as('anon',null,null,`select payload from player_sessions where pin='1234'`)).rows[0].payload;
      assert.equal(revealed.current_question.correct_answer,'Earth');
      await db.exec(`update sessions set phase='question' where pin='1234'`);
    });
    await t.test('answers require the correct token and server-side open question', async () => {
      await assert.rejects(as('anon',null,'red-token',`insert into answers(session_pin,team_name,round_number,question_index,answer_text) values('1234','Blue',1,0,'Earth')`), /row-level security/);
      await as('anon',null,'blue-token',`insert into answers(session_pin,team_name,round_number,question_index,answer_text) values('1234','Blue',1,0,'Earth')`);
      assert.equal((await as('anon',null,'red-token','select * from answers')).rows.length,0);
      assert.equal((await as('anon',null,'blue-token','select * from answers')).rows.length,1);
      await db.exec(`update sessions set timer_started_at=now()-interval '1 minute',timer_duration=10 where pin='1234'`);
      await assert.rejects(as('anon',null,'red-token',`insert into answers(session_pin,team_name,round_number,question_index,answer_text) values('1234','Red',1,0,'Earth')`), /deadline/);
    });
    await t.test('anonymous writes cannot control the session or award points', async () => {
      await assert.rejects(as('anon',null,'blue-token',`update sessions set phase='answer' where pin='1234'`), /permission denied/);
      await assert.rejects(as('anon',null,'blue-token',`update scores set total_points=999 where session_pin='1234'`), /permission denied/);
      await assert.rejects(as('anon',null,'blue-token',`update teams set player_token_hash='stolen' where team_name='Red'`), /permission denied/);
      await as('anon',null,'blue-token',`select player_heartbeat('1234','Blue')`);
      await assert.rejects(as('anon',null,'red-token',`select player_heartbeat('1234','Blue')`), /original handset/);
    });
    await t.test('photos require the team token and cannot bypass host moderation', async () => {
      await as('anon',null,'blue-token',`insert into session_photos(session_id,session_pin,team_name,photo_url) values('${session}','1234','Blue','https://example.test/photo.jpg')`);
      await assert.rejects(as('anon',null,'red-token',`insert into session_photos(session_id,session_pin,team_name,photo_url) values('${session}','1234','Blue','https://example.test/forged.jpg')`), /row-level security/);
      await assert.rejects(as('anon',null,'blue-token','update session_photos set approved=true'), /permission denied/);
      await db.exec(`update teams set photo_url='https://example.test/unreviewed.jpg' where team_name='Blue'`);
      assert.equal((await as('anon',null,'blue-token',`select * from get_player_team_photo('1234','Blue')`)).rows[0].photo_url,null);
      assert.equal((await as('anon',null,'red-token',`select * from get_player_team_photo('1234','Blue')`)).rows.length,0);
      await db.exec(`update teams set photo_approved=true where team_name='Blue'`);
      assert.equal((await as('anon',null,'blue-token',`select * from get_player_team_photo('1234','Blue')`)).rows[0].photo_url,'https://example.test/unreviewed.jpg');
    });
    await t.test('sequence options are shuffled on the server and remain stable across timer updates', async () => {
      await db.exec(`update sessions set current_question='{"question_type":"sequence","question_text":"Order from smallest to largest","option_a":"One","option_b":"Two","option_c":"Three","option_d":"Four","correct_answer":"a,b,c,d"}',phase='question' where pin='1234'`);
      const before = (await as('anon',null,null,`select payload from player_sessions where pin='1234'`)).rows[0].payload.current_question;
      assert.equal(before.correct_answer,'');
      await db.exec(`update sessions set timer_started_at=now() where pin='1234'`);
      const after = (await as('anon',null,null,`select payload from player_sessions where pin='1234'`)).rows[0].payload.current_question;
      assert.deepEqual(after,before);
      await db.exec(`update sessions set phase='answer' where pin='1234'`);
      const reveal = (await as('anon',null,null,`select payload from player_sessions where pin='1234'`)).rows[0].payload.current_question;
      assert.deepEqual(reveal.correct_answer.split(',').map(key=>reveal[`option_${key}`]),['One','Two','Three','Four']);
    });
    await t.test('join, cards and choices use a private token and correct live team', async () => {
      await as('anon',null,null,`select join_player_team('1234','Green',null,null,'00000000-0000-4000-8000-000000000005')`);
      assert.equal((await as('anon',null,null,`select team_name from player_teams where team_name='Green'`)).rows.length,1);
      await assert.rejects(as('anon',null,'green-token',`insert into teams(session_pin,team_name,player_token_hash) values('1234','Stolen',encode(extensions.digest('other-token','sha256'),'hex'))`), /permission denied/);
      await assert.rejects(as('anon',null,null,`select join_player_team('9876','Intruder',null,null,'00000000-0000-4000-8000-000000000005')`), /live PIN/);
      await db.exec(`update sessions set spin_offered=true,fastest_team='Blue',phase='spin_to_win' where pin='1234'`);
      await assert.rejects(as('anon',null,null,`select player_session_choice('1234','Blue','red-token','spin')`), /handset/);
      await assert.rejects(as('anon',null,null,`select player_session_choice('1234','Red','red-token','spin')`), /not available/);
      await as('anon',null,null,`select player_session_choice('1234','Blue','blue-token','spin')`);
      await db.exec(`update sessions set phase='question' where pin='1234'`);
      await as('anon',null,null,`select consume_player_card('1234','Blue','blue-token','block',1)`);
      await assert.rejects(as('anon',null,null,`select consume_player_card('1234','Red','red-token','block',1)`), /Time-Out/);
    });
  } finally { await db.close(); }
});

test('ambiguous legacy ownership aborts the entire migration instead of guessing', async () => {
  const db = await fixture();
  try {
    await db.exec(`insert into auth.users values('${other}')`);
    await assert.rejects(db.exec(sql('202610130001_launch_security.sql')), /null/);
    await db.exec('rollback');
    assert.equal((await db.query(`select to_regclass('public.player_sessions') as table_name`)).rows[0].table_name,null);
    assert.equal((await db.query('select count(*)::integer as count from question_bank')).rows[0].count,1);
  } finally { await db.close(); }
});
