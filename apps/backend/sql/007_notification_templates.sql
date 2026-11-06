-- 007_notification_templates.sql
-- Run by hand in the Supabase SQL editor, after 006_money_spec.sql.
--
-- Nudge copy lives here so a psychologist can edit it with no deploy:
-- Supabase dashboard > Table editor > notification_templates. Edit title/body,
-- untick `active` to retire a row, and untick `is_placeholder` once the copy is final.
--   archetype  an archetype slug, or `default` (used when an archetype has no row for a kind)
--   kind       pattern | pre_spend | spike | weekly
--   body       may use {label}, {count}, {total} only; any other {...} makes the row skipped
-- Weekly totals are week-to-date, so weekly copy should say "so far".
-- Re-running this file never overwrites edits: seed rows are inserted only for
-- an archetype+kind that has no rows yet.

begin;

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  archetype text not null,
  kind text not null check (kind in ('pattern', 'pre_spend', 'spike', 'weekly')),
  title text not null check (btrim(title) <> ''),
  body text not null check (btrim(body) <> ''),
  is_placeholder boolean not null default true,
  active boolean not null default true
);

alter table public.notification_templates enable row level security;
revoke all on table public.notification_templates from anon, authenticated;

insert into public.notification_templates (archetype, kind, title, body)
select v.archetype, v.kind, v.title, v.body
from (values
  ('dreamer', 'pattern', '[PLACEHOLDER] Your dream fund noticed', '{count} spends on {label} this week, {total}. Park that toward the goal you picture.'),
  ('dreamer', 'pattern', '[PLACEHOLDER] Small buys, big dream', '{total} on {label} in 7 days. Move some of it to your dream fund.'),
  ('dreamer', 'pattern', '[PLACEHOLDER] Dream fund reminder', '{count} spends on {label} this week, {total}. Each skip brings your goal closer.'),
  ('dreamer', 'pre_spend', '[PLACEHOLDER] Time for {label} soon', 'Your usual time for {label} is near. Skip it once and feed your dream fund.'),
  ('dreamer', 'pre_spend', '[PLACEHOLDER] Before the habit kicks in', 'Your future self is watching. Save this spend on {label} for the goal.'),
  ('dreamer', 'pre_spend', '[PLACEHOLDER] Your goal is watching', 'Near your usual time for {label}. Skip it and add that money to your dream.'),
  ('dreamer', 'spike', '[PLACEHOLDER] Spending jumped', '{total} over {count} spends in 7 days, well above usual. Pull back toward your dream.'),
  ('dreamer', 'spike', '[PLACEHOLDER] Big week for {label}', 'Your {label} is up sharply: {total} in 7 days. Your dream fund could use that.'),
  ('dreamer', 'weekly', '[PLACEHOLDER] Your week so far', '{count} spends, {total} so far {label}. Whatever is left can go to your dream.'),
  ('dreamer', 'weekly', '[PLACEHOLDER] Sunday dream check', 'So far {label}: {total} across {count} spends. Move some to the goal tonight.'),
  ('comfort_spender', 'pattern', '[PLACEHOLDER] Be kind to yourself', '{count} spends on {label} this week, {total}. A gentler comfort could save you some.'),
  ('comfort_spender', 'pattern', '[PLACEHOLDER] A gentle check-in', '{total} on {label} lately. What would really help right now? Maybe it is free.'),
  ('comfort_spender', 'pattern', '[PLACEHOLDER] Treat yourself, gently', '{count} spends on {label}, {total} this week. Try one comfort that costs nothing.'),
  ('comfort_spender', 'pre_spend', '[PLACEHOLDER] A soft pause', 'Your usual time for {label} is near. Breathe first; the urge may pass and save you.'),
  ('comfort_spender', 'pre_spend', '[PLACEHOLDER] Care without the cost', 'You often spend on {label} around now. Try a free comfort and keep the money.'),
  ('comfort_spender', 'pre_spend', '[PLACEHOLDER] Be gentle first', 'Near your usual time for {label}. Take a breath and see if you still want it.'),
  ('comfort_spender', 'spike', '[PLACEHOLDER] A heavier week', '{total} over {count} spends in 7 days. No guilt; just ease off a little.'),
  ('comfort_spender', 'spike', '[PLACEHOLDER] Spending is up', 'Your {label} rose to {total} in 7 days. Be kind to yourself and slow down.'),
  ('comfort_spender', 'weekly', '[PLACEHOLDER] Your week so far', '{count} spends, {total} so far {label}. Rest well and keep the rest for yourself.'),
  ('comfort_spender', 'weekly', '[PLACEHOLDER] Gentle Sunday check', 'So far {label}: {total} across {count} spends. Small and steady is enough.'),
  ('social_spender', 'pattern', '[PLACEHOLDER] Your crew, your wallet', '{count} spends on {label}, {total}. Pick a cheaper plan with friends this time.'),
  ('social_spender', 'pattern', '[PLACEHOLDER] Friends, spend less', '{total} on {label} this week. Suggest a low-cost hangout and save.'),
  ('social_spender', 'pattern', '[PLACEHOLDER] Plans without the price', '{count} spends on {label}, {total} this week. Try a potluck or a walk instead.'),
  ('social_spender', 'pre_spend', '[PLACEHOLDER] Plans around {label}?', 'Your usual time for {label} is near. Invite people to something free and save.'),
  ('social_spender', 'pre_spend', '[PLACEHOLDER] Friends will get it', 'Friends will get it if you skip {label} once. Keep the money.'),
  ('social_spender', 'pre_spend', '[PLACEHOLDER] Friends can wait', 'Near your usual time for {label}. Suggest a free plan instead.'),
  ('social_spender', 'spike', '[PLACEHOLDER] Busy social week?', '{total} over {count} spends in 7 days. Pick the plans that matter most.'),
  ('social_spender', 'spike', '[PLACEHOLDER] Spending is up', 'Your {label} hit {total} in 7 days. Split the next plan or make it free.'),
  ('social_spender', 'weekly', '[PLACEHOLDER] Your week so far', '{count} spends, {total} so far {label}. Keep next week''s plans lighter.'),
  ('social_spender', 'weekly', '[PLACEHOLDER] Sunday squad check', 'So far {label}: {total} across {count} spends. Plan one free hangout.'),
  ('thrill_chaser', 'pattern', '[PLACEHOLDER] Challenge accepted?', '{count} spends on {label} in 7 days, {total}. Beat your record: skip the next one.'),
  ('thrill_chaser', 'pattern', '[PLACEHOLDER] New game: save it', '{total} on {label} lately. Make saving the thrill and win this round.'),
  ('thrill_chaser', 'pattern', '[PLACEHOLDER] Beat your own record', '{count} spends on {label}, {total} this week. Skip the next for a streak.'),
  ('thrill_chaser', 'pre_spend', '[PLACEHOLDER] Dare to skip {label}', 'Your usual time for {label} is near. Skip it and bank the win.'),
  ('thrill_chaser', 'pre_spend', '[PLACEHOLDER] Level up your savings', 'It is nearly time for {label}. Keep the money for a bigger prize.'),
  ('thrill_chaser', 'pre_spend', '[PLACEHOLDER] Plot twist: skip it', 'Near your usual time for {label}. Skipping is the bold move today.'),
  ('thrill_chaser', 'spike', '[PLACEHOLDER] Spending spiked', '{total} over {count} spends in 7 days. Win it back with a no-spend day.'),
  ('thrill_chaser', 'spike', '[PLACEHOLDER] Big week, big dare', 'Your {label} jumped to {total} in 7 days. Dare yourself to cool it.'),
  ('thrill_chaser', 'weekly', '[PLACEHOLDER] Scoreboard so far', '{count} spends, {total} so far {label}. Finish the week with a win.'),
  ('thrill_chaser', 'weekly', '[PLACEHOLDER] Sunday score check', 'So far {label}: {total} across {count} spends. Can you beat it next week?'),
  ('prepared_one', 'pattern', '[PLACEHOLDER] Spotted a pattern', '{count} spends on {label} this week, {total}. Check it against your plan.'),
  ('prepared_one', 'pattern', '[PLACEHOLDER] Budget check', '{total} on {label} in 7 days. Is it in the plan? Adjust and save.'),
  ('prepared_one', 'pattern', '[PLACEHOLDER] Plan vs reality', '{count} spends on {label}, {total} this week. Compare it with your budget.'),
  ('prepared_one', 'pre_spend', '[PLACEHOLDER] Planned or impulse?', 'Your usual time for {label} is near. If unplanned, skip it and save.'),
  ('prepared_one', 'pre_spend', '[PLACEHOLDER] A quick plan check', 'It is nearly time for {label}. Stick to the budget and keep the money.'),
  ('prepared_one', 'pre_spend', '[PLACEHOLDER] Stay on plan', 'Near your usual time for {label}. Check the budget before you spend.'),
  ('prepared_one', 'spike', '[PLACEHOLDER] Over your usual pace', '{total} over {count} spends in 7 days. Review and adjust the plan.'),
  ('prepared_one', 'spike', '[PLACEHOLDER] Budget alert', 'Your {label} reached {total} in 7 days. Rebalance before the month runs out.'),
  ('prepared_one', 'weekly', '[PLACEHOLDER] Your week so far', '{count} spends, {total} so far {label}. Does it match your plan?'),
  ('prepared_one', 'weekly', '[PLACEHOLDER] Sunday budget review', 'So far {label}: {total} across {count} spends. Set next week''s limits.'),
  ('optimizer', 'pattern', '[PLACEHOLDER] The numbers on {label}', '{count} spends, {total} in 7 days. Cut one a week to save more.'),
  ('optimizer', 'pattern', '[PLACEHOLDER] Efficiency alert', '{total} went on {label} this week across {count} spends. Trim and save.'),
  ('optimizer', 'pattern', '[PLACEHOLDER] Optimise {label}', '{count} spends, {total} in 7 days. Batching them could cut the cost.'),
  ('optimizer', 'pre_spend', '[PLACEHOLDER] Habit in 15 minutes', 'Your usual time for {label} is close. Skipping once is a free, instant return.'),
  ('optimizer', 'pre_spend', '[PLACEHOLDER] Run the numbers', 'Your usual spend on {label} is near. Is it the best use of this money?'),
  ('optimizer', 'pre_spend', '[PLACEHOLDER] Cost check ahead', 'Near your usual time for {label}. Is this the best use of the money?'),
  ('optimizer', 'spike', '[PLACEHOLDER] Outlier detected', '{total} over {count} spends in 7 days, above your norm. Find what drove it.'),
  ('optimizer', 'spike', '[PLACEHOLDER] Spend rate is up', 'Your {label} hit {total} in 7 days. Trim the lowest value item first.'),
  ('optimizer', 'weekly', '[PLACEHOLDER] Week to date', '{count} spends, {total} so far {label}. Look for one thing to cut.'),
  ('optimizer', 'weekly', '[PLACEHOLDER] Sunday numbers', 'So far {label}: {total} across {count} spends. Set a target for next week.'),
  ('outrunner', 'pattern', '[PLACEHOLDER] Quick look, no stress', '{count} spends on {label} this week, {total}. One small cut starts a saving habit.'),
  ('outrunner', 'pattern', '[PLACEHOLDER] Just a peek', '{total} on {label} in 7 days. Skip one and you are already saving.'),
  ('outrunner', 'pattern', '[PLACEHOLDER] No pressure, just a nudge', '{count} spends on {label}, {total} this week. One skip is a good start.'),
  ('outrunner', 'pre_spend', '[PLACEHOLDER] Tiny step, big relief', 'Your usual time for {label} is near. Skip it once and keep the money.'),
  ('outrunner', 'pre_spend', '[PLACEHOLDER] Easy win ahead', 'It is nearly time for {label}. Not spending is the simplest way to save.'),
  ('outrunner', 'pre_spend', '[PLACEHOLDER] Small pause, small win', 'Near your usual time for {label}. Skipping once is enough for today.'),
  ('outrunner', 'spike', '[PLACEHOLDER] Spending went up', '{total} over {count} spends in 7 days. One small cut next week helps.'),
  ('outrunner', 'spike', '[PLACEHOLDER] A quick heads up', 'Your {label} hit {total} in 7 days. No stress; just a gentle look.'),
  ('outrunner', 'weekly', '[PLACEHOLDER] Your week so far', '{count} spends, {total} so far {label}. Easy does it from here.'),
  ('outrunner', 'weekly', '[PLACEHOLDER] Sunday peek', 'So far {label}: {total} across {count} spends. Nothing to fix, just a look.'),
  ('curator', 'pattern', '[PLACEHOLDER] Choose what counts', '{count} spends on {label}, {total} this week. Keep the best, skip the rest.'),
  ('curator', 'pattern', '[PLACEHOLDER] Quality over quantity', '{total} on {label} in 7 days. Pick the one you love and save.'),
  ('curator', 'pattern', '[PLACEHOLDER] Edit your spending', '{count} spends on {label}, {total} this week. Keep only the favourites.'),
  ('curator', 'pre_spend', '[PLACEHOLDER] Is it worth it?', 'Your usual time for {label} is near. Only buy what you will truly love.'),
  ('curator', 'pre_spend', '[PLACEHOLDER] Be picky today', 'It is nearly time for {label}. Wait a day on it and save if it fades.'),
  ('curator', 'pre_spend', '[PLACEHOLDER] Worth the wait?', 'Near your usual time for {label}. Only say yes to something you love.'),
  ('curator', 'spike', '[PLACEHOLDER] Too much, too fast', '{total} over {count} spends in 7 days. Which ones truly earned it?'),
  ('curator', 'spike', '[PLACEHOLDER] Time to curate', 'Your {label} hit {total} in 7 days. Keep the best, drop the rest.'),
  ('curator', 'weekly', '[PLACEHOLDER] Your week so far', '{count} spends, {total} so far {label}. Which ones were worth it?'),
  ('curator', 'weekly', '[PLACEHOLDER] Sunday edit', 'So far {label}: {total} across {count} spends. Pick next week''s favourites.'),
  ('autopilot', 'pattern', '[PLACEHOLDER] Noticed a habit', '{count} spends on {label} in 7 days, {total}. Pause once and decide on purpose.'),
  ('autopilot', 'pattern', '[PLACEHOLDER] Wake the autopilot', '{total} on {label} this week. Choose it, or skip it and save.'),
  ('autopilot', 'pattern', '[PLACEHOLDER] Is this a habit?', '{count} spends on {label}, {total} this week. Choose it on purpose or skip.'),
  ('autopilot', 'pre_spend', '[PLACEHOLDER] Habit hour ahead', 'You usually spend on {label} about now. Decide first, then tap.'),
  ('autopilot', 'pre_spend', '[PLACEHOLDER] Pause before {label}', 'Make this one a choice, not a habit. Skipping saves money.'),
  ('autopilot', 'pre_spend', '[PLACEHOLDER] Autopilot alert', 'Near your usual time for {label}. Take over the controls for a moment.'),
  ('autopilot', 'spike', '[PLACEHOLDER] Autopilot overspent', '{total} over {count} spends in 7 days. Take manual control this week.'),
  ('autopilot', 'spike', '[PLACEHOLDER] Spending is up', 'Your {label} hit {total} in 7 days. Pause and choose on purpose.'),
  ('autopilot', 'weekly', '[PLACEHOLDER] Your week so far', '{count} spends, {total} so far {label}. Anything you did not choose?'),
  ('autopilot', 'weekly', '[PLACEHOLDER] Sunday reset', 'So far {label}: {total} across {count} spends. Reset the autopilot.'),
  ('survival_saver', 'pattern', '[PLACEHOLDER] Every rupee counts', '{count} spends on {label}, {total} this week. Cutting one protects your cushion.'),
  ('survival_saver', 'pattern', '[PLACEHOLDER] Protect your cushion', '{total} on {label} in 7 days. A skip now adds to your safety net.'),
  ('survival_saver', 'pattern', '[PLACEHOLDER] Guard your cushion', '{count} spends on {label}, {total} this week. Every skip protects your buffer.'),
  ('survival_saver', 'pre_spend', '[PLACEHOLDER] Safety net check', 'Your usual time for {label} is near. Skipping once strengthens your cushion.'),
  ('survival_saver', 'pre_spend', '[PLACEHOLDER] Hold on to it', 'It is nearly time for {label}. Keep this money in your safety net.'),
  ('survival_saver', 'pre_spend', '[PLACEHOLDER] Hold the line', 'Near your usual time for {label}. Keep this money for the essentials.'),
  ('survival_saver', 'spike', '[PLACEHOLDER] Cushion under strain', '{total} over {count} spends in 7 days. Cut back to protect your buffer.'),
  ('survival_saver', 'spike', '[PLACEHOLDER] Spending is up', 'Your {label} hit {total} in 7 days. Tighten up before it dents your safety net.'),
  ('survival_saver', 'weekly', '[PLACEHOLDER] Your week so far', '{count} spends, {total} so far {label}. Keep the rest safe.'),
  ('survival_saver', 'weekly', '[PLACEHOLDER] Sunday safety check', 'So far {label}: {total} across {count} spends. Protect the buffer next week.'),
  ('default', 'pattern', '[PLACEHOLDER] Spending pattern spotted', '{count} spends on {label} this week, {total}. Skip the next one and save.'),
  ('default', 'pattern', '[PLACEHOLDER] Quick money check', '{total} on {label} in 7 days. Cutting back a little adds up.'),
  ('default', 'pattern', '[PLACEHOLDER] Pattern alert', '{count} spends on {label}, {total} this week. Skipping one helps.'),
  ('default', 'pre_spend', '[PLACEHOLDER] Heads up on {label}', 'Your usual time for {label} is near. Skip it once and save.'),
  ('default', 'pre_spend', '[PLACEHOLDER] Save a little today', 'It is nearly time for {label}. Keeping this money helps your savings.'),
  ('default', 'pre_spend', '[PLACEHOLDER] Quick pause', 'Near your usual time for {label}. Skip it once and save.'),
  ('default', 'spike', '[PLACEHOLDER] Spending went up', '{total} over {count} spends in 7 days. Ease off a little this week.'),
  ('default', 'spike', '[PLACEHOLDER] Heads up on spending', 'Your {label} hit {total} in 7 days, above your usual. Trim where you can.'),
  ('default', 'weekly', '[PLACEHOLDER] Your week so far', '{count} spends, {total} so far {label}. Keep the rest for later.'),
  ('default', 'weekly', '[PLACEHOLDER] Sunday check-in', 'So far {label}: {total} across {count} spends. Plan a lighter week.')
) as v(archetype, kind, title, body)
where not exists (
  select 1 from public.notification_templates t
  where t.archetype = v.archetype and t.kind = v.kind
);

commit;
