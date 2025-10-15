
-- Create the images bucket
insert into storage.buckets
  (id, name, public)
values
  ('images', 'images', true);

-- Set up permissions for the images bucket
-- Allow authenticated users to insert images
create policy "Authenticated users can upload images"
on storage.objects for insert
with check (bucket_id = 'images' and auth.role() = 'authenticated');

-- Allow all users to view images
create policy "Images are publicly readable"
on storage.objects for select
using (bucket_id = 'images');

-- Allow authenticated users to update their own images
create policy "Authenticated users can update their own images"
on storage.objects for update
using (bucket_id = 'images' and auth.uid() = owner_id::uuid);

-- Allow authenticated users to delete their own images
create policy "Authenticated users can delete their own images"
on storage.objects for delete
using (bucket_id = 'images' and auth.uid() = owner_id::uuid);

-- Down migration: Drop the images bucket
drop policy if exists "Authenticated users can upload images" on storage.objects;
drop policy if exists "Images are publicly readable" on storage.objects;
drop policy if exists "Authenticated users can update their own images" on storage.objects;
drop policy if exists "Authenticated users can delete their own images" on storage.objects;
delete from storage.buckets where id = 'images';
