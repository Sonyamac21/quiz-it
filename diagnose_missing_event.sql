-- Run in Supabase SQL Editor to find the "Home" event scheduled for the 7th
-- that isn't showing on the calendar. Shows the last 20 events created,
-- regardless of date/status/venue, so we can see what actually landed.
select id, event_name, event_date, start_time, venue_record_id, host_name,
       status, created_at
from public.events
order by created_at desc
limit 20;
