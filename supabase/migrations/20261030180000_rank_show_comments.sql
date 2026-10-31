-- Rank the entire visible discussion, including popular comments older than
-- the former 500-comment window. The caller's RLS policies apply to both tables.
CREATE FUNCTION public.most_liked_show_comment_ids(
  p_show_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 21
)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT comment.id
  FROM public.episode_comment comment
  LEFT JOIN public.episode_comment_like reaction ON reaction.comment_id = comment.id
  WHERE comment.show_id = p_show_id AND comment.parent_id IS NULL
  GROUP BY comment.id, comment.created_at
  ORDER BY count(reaction.user_id) DESC, comment.created_at DESC, comment.id ASC
  LIMIT least(greatest(p_limit, 1), 100)
  OFFSET greatest(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.most_liked_show_comment_ids(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.most_liked_show_comment_ids(uuid, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
