-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Memories Table
create table public.memories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  summary text,
  category text,
  source_type text not null,
  source_path text,
  event_date timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  last_verified timestamp with time zone
);

-- Entities Table
create table public.entities (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text not null,
  created_at timestamp with time zone default now() not null
);

-- Memory Entities Join Table
create table public.memory_entities (
  memory_id uuid references public.memories(id) on delete cascade not null,
  entity_id uuid references public.entities(id) on delete cascade not null,
  relationship text,
  primary key (memory_id, entity_id)
);

-- Claims Table
create table public.claims (
  id uuid default uuid_generate_v4() primary key,
  memory_id uuid references public.memories(id) on delete cascade not null,
  claim_text text not null,
  provenance_status text not null,
  source_reference text,
  created_at timestamp with time zone default now() not null
);

alter table public.claims
add constraint claims_provenance_status_check
check (
  provenance_status in ('OBSERVED', 'INFERRED', 'UNKNOWN')
);

-- Interactions Table
create table public.interactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  query text not null,
  response text not null,
  created_at timestamp with time zone default now() not null
);

-- Setup RLS
alter table public.memories enable row level security;
alter table public.entities enable row level security;
alter table public.memory_entities enable row level security;
alter table public.claims enable row level security;
alter table public.interactions enable row level security;

-- Policies for memories
create policy "Users can only view their own memories" on public.memories
  for select using (auth.uid() = user_id);
create policy "Users can only insert their own memories" on public.memories
  for insert with check (auth.uid() = user_id);
create policy "Users can only update their own memories" on public.memories
  for update using (auth.uid() = user_id);
create policy "Users can only delete their own memories" on public.memories
  for delete using (auth.uid() = user_id);

-- Policies for entities
create policy "Users can only view their own entities" on public.entities
  for select using (auth.uid() = user_id);
create policy "Users can only insert their own entities" on public.entities
  for insert with check (auth.uid() = user_id);
create policy "Users can only update their own entities" on public.entities
  for update using (auth.uid() = user_id);
create policy "Users can only delete their own entities" on public.entities
  for delete using (auth.uid() = user_id);

-- Policies for memory_entities
create policy "Users can only view their own memory_entities" on public.memory_entities
  for select using (
    exists (select 1 from public.memories where id = memory_entities.memory_id and user_id = auth.uid())
  );
create policy "Users can only insert their own memory_entities" on public.memory_entities
  for insert with check (
    exists (select 1 from public.memories where id = memory_entities.memory_id and user_id = auth.uid())
    and
    exists (select 1 from public.entities where id = memory_entities.entity_id and user_id = auth.uid())
  );
create policy "Users can only update their own memory_entities" on public.memory_entities
  for update using (
    exists (select 1 from public.memories where id = memory_entities.memory_id and user_id = auth.uid())
    and
    exists (select 1 from public.entities where id = memory_entities.entity_id and user_id = auth.uid())
  );
create policy "Users can only delete their own memory_entities" on public.memory_entities
  for delete using (
    exists (select 1 from public.memories where id = memory_entities.memory_id and user_id = auth.uid())
    and
    exists (select 1 from public.entities where id = memory_entities.entity_id and user_id = auth.uid())
  );

-- Policies for claims
create policy "Users can only view their own claims" on public.claims
  for select using (
    exists (select 1 from public.memories where id = claims.memory_id and user_id = auth.uid())
  );
create policy "Users can only insert their own claims" on public.claims
  for insert with check (
    exists (select 1 from public.memories where id = claims.memory_id and user_id = auth.uid())
  );
create policy "Users can only update their own claims" on public.claims
  for update using (
    exists (select 1 from public.memories where id = claims.memory_id and user_id = auth.uid())
  );
create policy "Users can only delete their own claims" on public.claims
  for delete using (
    exists (select 1 from public.memories where id = claims.memory_id and user_id = auth.uid())
  );

-- Policies for interactions
create policy "Users can only view their own interactions" on public.interactions
  for select using (auth.uid() = user_id);
create policy "Users can only insert their own interactions" on public.interactions
  for insert with check (auth.uid() = user_id);

-- Setup Storage
insert into storage.buckets (id, name, public) values ('trace-sources', 'trace-sources', false);

-- Storage Policies
create policy "Users can only view their own trace-sources" on storage.objects
  for select to authenticated using (bucket_id = 'trace-sources' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can only insert their own trace-sources" on storage.objects
  for insert to authenticated with check (bucket_id = 'trace-sources' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can only update their own trace-sources" on storage.objects
  for update to authenticated using (bucket_id = 'trace-sources' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can only delete their own trace-sources" on storage.objects
  for delete to authenticated using (bucket_id = 'trace-sources' and auth.uid()::text = (storage.foldername(name))[1]);

-- Create function to update updated_at column automatically
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_memories_updated_at
  before update on public.memories
  for each row execute function public.handle_updated_at();
