-- FCT 교육관리 VER3 rev.12
-- 교육영상 저장 시 관리자 인증을 서버에서 확인합니다.
-- Row Level Security 정책을 완화하지 않으며, 기존 교육과정/영상 데이터는 변경하지 않습니다.
-- Neon project: FCT-EDU-APP; database: fct_edu_app

CREATE OR REPLACE FUNCTION public.edu_add_video(p_course_id uuid, p_title text, p_youtube_id text, p_duration_seconds integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid;v_status text;
BEGIN
 IF NOT public.edu_is_admin() THEN
  RAISE EXCEPTION '관리자 권한이 확인되지 않습니다. 로그인 상태를 확인해 주세요.' USING ERRCODE='42501';
 END IF;
 IF length(trim(coalesce(p_title,'')))<1 OR length(trim(p_title))>200 THEN
  RAISE EXCEPTION '영상명은 1~200자로 입력해 주세요.';
 END IF;
 IF p_youtube_id IS NULL OR p_youtube_id !~ '^[A-Za-z0-9_-]{11}$' THEN
  RAISE EXCEPTION '올바른 YouTube 영상 ID를 입력해 주세요.';
 END IF;
 IF p_duration_seconds IS NULL OR p_duration_seconds<60 OR p_duration_seconds>86400 THEN
  RAISE EXCEPTION '영상 길이는 1분에서 24시간 이내로 입력해 주세요.';
 END IF;
 SELECT c.status INTO v_status FROM public.edu_courses c WHERE c.id=p_course_id;
 IF NOT FOUND THEN RAISE EXCEPTION '교육과정 정보를 찾을 수 없습니다.'; END IF;
 IF v_status='archived' THEN RAISE EXCEPTION '보관 완료된 교육과정에는 영상을 추가할 수 없습니다.'; END IF;
 INSERT INTO public.edu_videos(course_id,title,youtube_id,duration_seconds)
 VALUES(p_course_id,trim(p_title),p_youtube_id,p_duration_seconds) RETURNING id INTO v_id;
 RETURN v_id;
END
$function$;

REVOKE ALL ON FUNCTION public.edu_add_video(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_add_video(uuid,text,text,integer) TO authenticated;
