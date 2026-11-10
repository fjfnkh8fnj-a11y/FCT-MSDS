-- FCT education rev.19: allow the first 20-second playback checkpoint.
CREATE OR REPLACE FUNCTION public.edu_watch_tick_position(p_video_id uuid, p_seconds integer, p_request_id uuid, p_resume_seconds integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 DECLARE v_e uuid;v_course uuid;v_duration integer;v_old int;v_last timestamptz;v_allow integer;v_sort integer;v_percent integer;
 BEGIN
 IF p_request_id IS NULL OR p_seconds IS NULL OR p_seconds<1 OR p_seconds>30 THEN RAISE EXCEPTION '재생시간 범위 오류'; END IF;
 SELECT v.course_id,v.duration_seconds,v.sort_order INTO v_course,v_duration,v_sort FROM public.edu_videos v WHERE v.id=p_video_id;
 IF v_course IS NULL THEN RAISE EXCEPTION '영상이 없습니다'; END IF;
 SELECT e.id,c.required_watch_percent INTO v_e,v_percent FROM public.edu_enrollments e JOIN public.edu_staff s ON s.id=e.staff_id JOIN public.edu_courses c ON c.id=e.course_id
 WHERE e.course_id=v_course AND s.auth_user_id=auth.user_id()::text AND s.active=true AND c.status='published' AND e.status<>'completed'
 AND (c.starts_on IS NULL OR c.starts_on <= (now() AT TIME ZONE 'Asia/Seoul')::date) FOR UPDATE OF e;
 IF v_e IS NULL THEN RAISE EXCEPTION '수강 대상이 아닙니다'; END IF;
 IF v_percent>0 AND EXISTS (
  SELECT 1 FROM public.edu_videos v
  LEFT JOIN public.edu_progress p ON p.enrollment_id=v_e AND p.video_id=v.id
  WHERE v.course_id=v_course AND (v.sort_order,v.id)<(v_sort,p_video_id)
   AND NOT public.edu_video_watch_met(v.duration_seconds,p.seconds_watched,v_percent)
 ) THEN RAISE EXCEPTION '이전 교육영상을 먼저 완료해 주세요.'; END IF;
 IF EXISTS(SELECT 1 FROM public.edu_progress_event WHERE request_id=p_request_id) THEN
  SELECT seconds_watched INTO v_old FROM public.edu_progress WHERE enrollment_id=v_e AND video_id=p_video_id;RETURN COALESCE(v_old,0);
 END IF;
 SELECT seconds_watched,last_ping INTO v_old,v_last FROM public.edu_progress WHERE enrollment_id=v_e AND video_id=p_video_id;
 IF v_last IS NULL THEN v_allow:=LEAST(p_seconds,20);
 ELSE v_allow:=GREATEST(0,LEAST(p_seconds,(extract(epoch FROM clock_timestamp()-v_last)::integer)+2));END IF;
 IF v_allow<1 THEN RETURN COALESCE(v_old,0);END IF;
 INSERT INTO public.edu_progress(enrollment_id,video_id,seconds_watched,last_ping,resume_seconds)
 VALUES(v_e,p_video_id,LEAST(v_allow,v_duration),clock_timestamp(),CASE WHEN p_resume_seconds IS NOT NULL THEN greatest(0,least(p_resume_seconds,v_duration)) END)
 ON CONFLICT(enrollment_id,video_id) DO UPDATE SET seconds_watched=LEAST(public.edu_progress.seconds_watched+EXCLUDED.seconds_watched,v_duration),last_ping=clock_timestamp(),
 resume_seconds=coalesce(EXCLUDED.resume_seconds,public.edu_progress.resume_seconds);
 INSERT INTO public.edu_progress_event(request_id,enrollment_id,video_id,delta) VALUES(p_request_id,v_e,p_video_id,v_allow);
 UPDATE public.edu_enrollments SET status='started' WHERE id=v_e AND status='assigned';
 SELECT seconds_watched INTO v_old FROM public.edu_progress WHERE enrollment_id=v_e AND video_id=p_video_id;
 RETURN v_old;
 END $function$;
