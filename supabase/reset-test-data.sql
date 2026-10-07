-- ==========================================================================
-- Taste of Recovery 2027: clear test data
-- --------------------------------------------------------------------------
-- Run in Supabase -> SQL Editor before the gala (and after any test run).
-- Deletes every guest, bid, vote, photo record, payment record and feedback
-- answer, sets bidding/voting/reveal/feedback back to "not open yet", and
-- restarts paddle numbers at 101. Staff logins and the lots are kept.
--
-- Uploaded photo files stay in Storage -> gala-media; delete them there
-- (select all -> Delete) if you want those gone too.
-- NEVER run this after the gala has started.
-- ==========================================================================

delete from public.feedback;
delete from public.media;
delete from public.vote_code_tries;
delete from public.votes;
delete from public.lots_paid;
delete from public.bids;
delete from public.guests;

-- Guest sign-ins (everyone who isn't staff).
delete from auth.users where id not in (select user_id from public.staff);

update public.event_state
   set auction = 'upcoming', auction_closes_at = null, voting = 'upcoming',
       reveal_course = null, reveal_at = null, feedback_open = false, updated_at = now()
 where id = 1;

update public.vote_code set code = '', updated_at = now() where id = 1;

alter sequence public.paddle_seq restart with 101;

select 'Test data cleared' as done;
