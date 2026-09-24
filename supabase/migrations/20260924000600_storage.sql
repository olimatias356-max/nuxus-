-- =============================================================================
-- MbareteFans · 006 · Storage buckets and object policies.
--
--  avatars : public read, users write only inside "<their uid>/".
--  media   : PRIVATE. Read only through signed URLs, and only if the object
--            belongs to the caller or to a post/story the caller can see
--            (so blocks, removals and moderation also protect the files).
--  kyc     : PRIVATE. Users can upload into their folder but never read back;
--            only KYC reviewers can read.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('media', 'media', false, 104857600,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm']),
  ('kyc', 'kyc', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- avatars ---------------------------------------------------------------------
create policy "avatars: anyone signed in can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy "avatars: users upload to their folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: users replace their files"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: users delete their files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- media -----------------------------------------------------------------------
create policy "media: owners and viewers of visible content can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      -- the subqueries run with the caller's RLS on posts/stories
      or exists (select 1 from public.posts p where p.media_path = objects.name)
      or exists (select 1 from public.posts p where p.thumb_path = objects.name)
      or exists (select 1 from public.stories s where s.media_path = objects.name)
    )
  );

create policy "media: active users upload to their folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_active_user()
  );

create policy "media: users delete their files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- kyc -------------------------------------------------------------------------
create policy "kyc: users upload their documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "kyc: only reviewers can read documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and private.has_role('KYC'));
