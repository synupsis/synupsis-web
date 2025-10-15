
-- Create the images bucket if it does not already exist
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- Set up permissions for the images bucket
-- Allow authenticated users to insert images
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload images'
  ) then
    create policy "Authenticated users can upload images"
    on storage.objects for insert
    with check (bucket_id = 'images' and auth.role() = 'authenticated');
  end if;
end
$$;

-- Allow all users to view images
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Images are publicly readable'
  ) then
    create policy "Images are publicly readable"
    on storage.objects for select
    using (bucket_id = 'images');
  end if;
end
$$;

-- Allow authenticated users to update their own images
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update their own images'
  ) then
    create policy "Authenticated users can update their own images"
    on storage.objects for update
    using (bucket_id = 'images' and auth.uid() = owner_id::uuid);
  end if;
end
$$;

-- Allow authenticated users to delete their own images
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can delete their own images'
  ) then
    create policy "Authenticated users can delete their own images"
    on storage.objects for delete
    using (bucket_id = 'images' and auth.uid() = owner_id::uuid);
  end if;
end
$$;
