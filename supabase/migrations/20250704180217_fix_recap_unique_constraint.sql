ALTER TABLE public.recap
ADD CONSTRAINT recap_show_id_season_id_user_id_key UNIQUE (show_id, season_id, user_id);
