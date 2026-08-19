-- supabase/migrations/0007_phase4b_events_reminders.sql

-- 1. Create events table
create table public.events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  memory_id uuid references public.memories(id) on delete cascade not null,
  title text not null,
  event_type text not null,
  event_date timestamp with time zone,
  due_date timestamp with time zone,
  status text default 'PENDING',
  priority text default 'MEDIUM',
  metadata jsonb,
  created_at timestamp with time zone default now() not null
);

-- 2. Create reminders table
create table public.reminders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  event_id uuid references public.events(id) on delete cascade not null,
  title text not null,
  reminder_date timestamp with time zone not null,
  status text default 'PENDING' check (status in ('PENDING', 'COMPLETED')),
  metadata jsonb,
  created_at timestamp with time zone default now() not null
);

-- 3. Enable RLS
alter table public.events enable row level security;
alter table public.reminders enable row level security;

-- 4. RLS Policies for events
create policy "Users can insert their own events" on public.events for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can view their own events" on public.events for select to authenticated using (auth.uid() = user_id);
create policy "Users can update their own events" on public.events for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own events" on public.events for delete to authenticated using (auth.uid() = user_id);

-- 5. RLS Policies for reminders
create policy "Users can insert their own reminders" on public.reminders for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can view their own reminders" on public.reminders for select to authenticated using (auth.uid() = user_id);
create policy "Users can update their own reminders" on public.reminders for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own reminders" on public.reminders for delete to authenticated using (auth.uid() = user_id);
