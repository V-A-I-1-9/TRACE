-- supabase/migrations/0006_phase4a_chat_persistence.sql

-- 1. Create conversations table
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- 2. Create messages table
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  structured_response jsonb, -- Null for user messages, populated for assistant messages
  created_at timestamp with time zone default now() not null
);

-- 3. Enable Row Level Security
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- 4. RLS Policies for conversations
create policy "Users can insert their own conversations"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view their own conversations"
  on public.conversations for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can update their own conversations"
  on public.conversations for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own conversations"
  on public.conversations for delete
  to authenticated
  using (auth.uid() = user_id);

-- 5. RLS Policies for messages
create policy "Users can insert their own messages"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view their own messages"
  on public.messages for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can update their own messages"
  on public.messages for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own messages"
  on public.messages for delete
  to authenticated
  using (auth.uid() = user_id);
