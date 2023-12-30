create table "public"."season" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "tv_maze_id" bigint not null,
    "number" bigint not null,
    "name" character varying,
    "show_id" uuid not null
);


alter table "public"."season" enable row level security;

alter table "public"."show" drop column "slug";

CREATE UNIQUE INDEX season_pkey ON public.season USING btree (id);

CREATE UNIQUE INDEX season_tv_maze_id_key ON public.season USING btree (tv_maze_id);

alter table "public"."season" add constraint "season_pkey" PRIMARY KEY using index "season_pkey";

alter table "public"."season" add constraint "season_show_id_fkey" FOREIGN KEY (show_id) REFERENCES show(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."season" validate constraint "season_show_id_fkey";

alter table "public"."season" add constraint "season_tv_maze_id_key" UNIQUE using index "season_tv_maze_id_key";

create policy "Enable insert access for all users"
on "public"."season"
as permissive
for insert
to public
with check (true);


create policy "Enable read access for all users"
on "public"."season"
as permissive
for select
to public
using (true);


create policy "Enable insert access for all users"
on "public"."show"
as permissive
for insert
to public
with check (true);
