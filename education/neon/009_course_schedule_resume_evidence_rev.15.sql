-- FCT 교육관리 VER3 rev.15
-- A deadline is advisory. A future start date blocks new study actions.
ALTER TABLE public.edu_courses
 ADD COLUMN starts_on date,
 ADD COLUMN due_on date,
 ADD CONSTRAINT edu_course_period_order CHECK (starts_on IS NULL OR due_on IS NULL OR starts_on <= due_on);

ALTER TABLE public.edu_progress ADD COLUMN resume_seconds integer CHECK (resume_seconds >= 0);

ALTER TABLE public.edu_enrollments ADD COLUMN completion_score integer CHECK (completion_score BETWEEN 0 AND 100);

WITH final_scores AS (
 SELECT DISTINCT ON (a.enrollment_id) a.enrollment_id,a.score
 FROM public.edu_attempts a JOIN public.edu_enrollments e ON e.id=a.enrollment_id
 WHERE e.status='completed' AND a.submitted_at<=e.completed_at
 ORDER BY a.enrollment_id,a.passed DESC,a.submitted_at DESC,a.id DESC
)
UPDATE public.edu_enrollments e SET completion_score=f.score FROM final_scores f WHERE e.id=f.enrollment_id;

CREATE OR REPLACE FUNCTION public.edu_register_course(p_request_id uuid, p_course jsonb, p_departments text[], p_video jsonb, p_questions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_title text := btrim(p_course->>'title');
 v_month text := p_course->>'education_month';
 v_plant text := p_course->>'plant';
 v_watch integer;
 v_percent integer := (p_course->>'required_watch_percent')::integer;
 v_continuous boolean;
 v_departments text[];
 v_existing public.edu_courses%ROWTYPE;
 v_question jsonb;
 v_count integer;
BEGIN
 IF public.edu_is_admin() IS DISTINCT FROM true THEN
  RAISE EXCEPTION '관리자 권한이 확인되지 않습니다. 다시 로그인해 주세요.' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR coalesce(length(v_title),0) NOT BETWEEN 1 AND 200
  OR v_month IS NULL OR v_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
  OR v_plant IS NULL OR v_plant NOT IN ('전체','1공장','2공장') THEN
  RAISE EXCEPTION '교육명, 교육월, 대상 사업장을 확인해 주세요.';
 END IF;
 IF p_departments IS NOT NULL THEN
  SELECT array_agg(DISTINCT btrim(dept) ORDER BY btrim(dept)) INTO v_departments
  FROM unnest(p_departments) AS d(dept) WHERE btrim(dept)<>'';
  IF v_departments IS NULL THEN RAISE EXCEPTION '배정할 부서를 하나 이상 선택해 주세요.'; END IF;
 END IF;

 -- Serialize registrations with the same title and month across overlapping plant scopes.
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('edu-register',lower(v_title),v_month)::text,0));
 SELECT * INTO v_existing FROM public.edu_courses WHERE id=p_request_id;
 IF FOUND THEN
  IF lower(btrim(v_existing.title)) IS DISTINCT FROM lower(v_title)
   OR v_existing.education_month IS DISTINCT FROM v_month
   OR v_existing.plant IS DISTINCT FROM v_plant
   OR v_existing.target_departments IS DISTINCT FROM v_departments THEN
   RAISE EXCEPTION '이미 사용된 등록 요청입니다. 교육과정 목록을 확인해 주세요.';
  END IF;
  SELECT count(*) INTO v_count FROM public.edu_enrollments WHERE course_id=p_request_id;
  RETURN jsonb_build_object('id',p_request_id,'assigned',v_count);
 END IF;
 IF EXISTS (SELECT FROM public.edu_courses
  WHERE lower(btrim(title))=lower(v_title) AND education_month=v_month
   AND (plant=v_plant OR plant='전체' OR v_plant='전체')
   AND (target_departments IS NULL OR v_departments IS NULL OR target_departments && v_departments)) THEN
  RAISE EXCEPTION '같은 교육월에 교육명과 대상이 겹치는 과정이 이미 등록되어 있습니다. 교육과정 목록을 확인해 주세요.' USING ERRCODE='23505';
 END IF;

 IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION '평가문항을 확인해 주세요.';
 END IF;
 IF jsonb_array_length(p_questions) NOT BETWEEN 3 AND 5 THEN
  RAISE EXCEPTION '평가문항은 3~5개가 필요합니다.';
 END IF;
 v_watch := coalesce((p_course->>'required_watch_minutes')::integer,0);
 IF v_percent IS NULL AND v_watch>0 AND (p_video IS NULL OR coalesce((p_video->>'duration_seconds')::integer,0)<v_watch*60) THEN
  RAISE EXCEPTION '필수 시청시간 이상의 영상 길이를 입력해 주세요.';
 END IF;
 v_continuous := coalesce((p_course->>'continuous')::boolean,false);
 IF v_continuous THEN
  -- Coordinate with a concurrent new-employee insert.
  PERFORM pg_advisory_xact_lock(hashtextextended('edu-continuous-assignment',0));
 END IF;
 INSERT INTO public.edu_courses(
  id,title,course_type,plant,education_month,course_date,duration_minutes,required_watch_minutes,required_watch_percent,
  passing_score,attempt_limit,continuous,description,target_departments,starts_on,due_on,status
 ) VALUES (
  p_request_id,v_title,p_course->>'course_type',v_plant,v_month,(p_course->>'course_date')::date,
  (p_course->>'duration_minutes')::integer,v_watch,v_percent,(p_course->>'passing_score')::integer,
  (p_course->>'attempt_limit')::integer,v_continuous,coalesce(p_course->>'description',''),v_departments,(p_course->>'starts_on')::date,(p_course->>'due_on')::date,'published'
 );
 IF p_video IS NOT NULL THEN
  PERFORM public.edu_add_video(p_request_id,p_video->>'title',p_video->>'youtube_id',(p_video->>'duration_seconds')::integer);
 END IF;
 FOR v_question IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  IF coalesce(length(btrim(v_question->>'prompt')),0)=0
   OR jsonb_typeof(v_question->'choices') IS DISTINCT FROM 'array'
   OR v_question->>'answer' IS NULL THEN
   RAISE EXCEPTION '문항의 질문, 선택지 및 정답을 확인해 주세요.';
  END IF;
  IF EXISTS (SELECT FROM jsonb_array_elements(v_question->'choices') AS c(choice)
             WHERE jsonb_typeof(choice)<>'string' OR btrim(choice #>> '{}')='') THEN
   RAISE EXCEPTION '문항의 선택지를 확인해 주세요.';
  END IF;
  PERFORM public.edu_add_question(p_request_id,v_question->>'prompt',v_question->'choices',
    (v_question->>'answer')::integer,v_question->>'explanation');
 END LOOP;

 INSERT INTO public.edu_enrollments(course_id,staff_id)
 SELECT p_request_id,s.id FROM public.edu_staff s
 WHERE s.active AND s.role='employee' AND (v_plant='전체' OR s.plant=v_plant)
  AND (v_departments IS NULL OR s.department=ANY(v_departments))
 ON CONFLICT (course_id,staff_id) DO NOTHING;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count=0 THEN
  RAISE EXCEPTION '선택한 대상에 재직 중인 직원이 없습니다. 공장과 부서를 확인해 주세요.';
 END IF;
 RETURN jsonb_build_object('id',p_request_id,'assigned',v_count);
END
$function$;

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
 IF p_duration_seconds IS NULL OR p_duration_seconds<1 OR p_duration_seconds>86400 THEN
  RAISE EXCEPTION '영상 길이는 1초에서 24시간 이내로 입력해 주세요.';
 END IF;
 SELECT c.status INTO v_status FROM public.edu_courses c WHERE c.id=p_course_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '교육과정 정보를 찾을 수 없습니다.'; END IF;
 IF v_status='archived' THEN RAISE EXCEPTION '보관 완료된 교육과정에는 영상을 추가할 수 없습니다.'; END IF;
 INSERT INTO public.edu_videos(course_id,title,youtube_id,duration_seconds,sort_order)
 VALUES(p_course_id,trim(p_title),p_youtube_id,p_duration_seconds,
  (SELECT coalesce(max(v.sort_order),0)+1 FROM public.edu_videos v WHERE v.course_id=p_course_id)) RETURNING id INTO v_id;
 RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.edu_video_watch_met(p_duration integer,p_watched integer,p_percent integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
 SELECT p_percent=0 OR (p_duration>0 AND coalesce(p_watched,0)*100::bigint>=p_duration*p_percent::bigint)
$function$;

CREATE OR REPLACE FUNCTION public.edu_course_watch_met(p_course_id uuid,p_enrollment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO ''
AS $function$
 SELECT CASE WHEN c.required_watch_percent IS NULL THEN
   (SELECT coalesce(sum(seconds_watched),0) FROM public.edu_progress WHERE enrollment_id=p_enrollment_id)>=c.required_watch_minutes*60
  ELSE NOT EXISTS (
   SELECT 1 FROM public.edu_videos v
   LEFT JOIN public.edu_progress p ON p.enrollment_id=p_enrollment_id AND p.video_id=v.id
   WHERE v.course_id=c.id AND NOT public.edu_video_watch_met(v.duration_seconds,p.seconds_watched,c.required_watch_percent)
  ) END
 FROM public.edu_courses c WHERE c.id=p_course_id
$function$;

REVOKE ALL ON FUNCTION public.edu_video_watch_met(integer,integer,integer),public.edu_course_watch_met(uuid,uuid) FROM PUBLIC, anonymous, authenticated;

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
 IF v_last IS NULL THEN v_allow:=LEAST(p_seconds,15);
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

REVOKE ALL ON FUNCTION public.edu_watch_tick_position(uuid,integer,uuid,integer) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.edu_watch_tick_position(uuid,integer,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.edu_watch_tick(p_video_id uuid, p_seconds integer, p_request_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT public.edu_watch_tick_position(p_video_id,p_seconds,p_request_id,NULL)
$function$;

CREATE OR REPLACE FUNCTION public.edu_submit_quiz(p_course_id uuid, p_answers jsonb, p_request_id uuid)
 RETURNS TABLE(score integer, passed boolean, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 DECLARE v_enroll uuid;v_score integer;v_count int;v_total int;v_correct int;v_pass int;v_limit int;v_old public.edu_attempts%ROWTYPE;
 BEGIN
 SELECT e.id INTO v_enroll FROM public.edu_enrollments e JOIN public.edu_staff s ON s.id=e.staff_id
 JOIN public.edu_courses c ON c.id=e.course_id
 WHERE e.course_id=p_course_id AND s.auth_user_id=auth.user_id()::text AND s.active=true AND c.status='published' AND e.status<>'completed'
 AND (c.starts_on IS NULL OR c.starts_on <= (now() AT TIME ZONE 'Asia/Seoul')::date)
 FOR UPDATE OF e;
 IF v_enroll IS NULL THEN RAISE EXCEPTION '수강 대상이 아닙니다'; END IF;
 SELECT * INTO v_old FROM public.edu_attempts WHERE request_id=p_request_id AND enrollment_id=v_enroll;
 IF FOUND THEN SELECT count(*) INTO v_count FROM public.edu_attempts WHERE enrollment_id=v_enroll;score:=v_old.score;passed:=v_old.passed;attempts:=v_count;RETURN NEXT;RETURN;END IF;
 IF public.edu_course_watch_met(p_course_id,v_enroll) IS DISTINCT FROM true THEN
  RAISE EXCEPTION '필수 영상 시청을 완료한 후 평가를 진행해 주세요.';
 END IF;
 SELECT c.passing_score,c.attempt_limit INTO v_pass,v_limit FROM public.edu_courses c WHERE c.id=p_course_id;
 SELECT count(*) INTO v_count FROM public.edu_attempts WHERE enrollment_id=v_enroll;
 IF v_count>=v_limit THEN RAISE EXCEPTION '최대 평가 응시 횟수를 초과했습니다'; END IF;
 SELECT count(*),count(*) FILTER(WHERE p_answers->>q.id::text = a.correct_index::text) INTO v_total,v_correct
 FROM public.edu_questions q JOIN public.edu_answers a ON a.question_id=q.id WHERE q.course_id=p_course_id;
 IF v_total=0 THEN RAISE EXCEPTION '등록된 평가문제가 없습니다'; END IF;
 v_score:=round((v_correct*100.0)/v_total);
 INSERT INTO public.edu_attempts(enrollment_id,answers,score,passed,request_id)
 VALUES(v_enroll,p_answers,v_score,v_score>=v_pass,p_request_id);
 UPDATE public.edu_enrollments SET status='started' WHERE id=v_enroll AND status='assigned';
 score:=v_score;passed:=v_score>=v_pass;attempts:=v_count+1;RETURN NEXT;
 END $function$;

CREATE OR REPLACE FUNCTION public.edu_complete_course(p_course_id uuid, p_signature_data text, p_request_id uuid)
 RETURNS TABLE(completed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 DECLARE v_e uuid;v_score integer;
 BEGIN
 SELECT e.id INTO v_e FROM public.edu_enrollments e
 JOIN public.edu_staff s ON s.id=e.staff_id JOIN public.edu_courses c ON c.id=e.course_id
 WHERE e.course_id=p_course_id AND s.auth_user_id=auth.user_id()::text AND s.active=true AND c.status='published'
 AND (c.starts_on IS NULL OR c.starts_on <= (now() AT TIME ZONE 'Asia/Seoul')::date) FOR UPDATE OF e;
 IF v_e IS NULL THEN RAISE EXCEPTION '수강 대상이 아닙니다'; END IF;
 SELECT e.completed_at INTO completed_at FROM public.edu_enrollments e WHERE e.id=v_e;
 IF completed_at IS NOT NULL THEN RETURN NEXT;RETURN;END IF;
 IF p_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' OR length(p_signature_data)>245000 OR length(p_signature_data)<500 THEN
 RAISE EXCEPTION '서명 형식 또는 크기를 확인해 주세요';END IF;
 SELECT a.score INTO v_score FROM public.edu_attempts a WHERE a.enrollment_id=v_e AND a.passed
 ORDER BY a.submitted_at DESC,a.id DESC LIMIT 1;
 IF v_score IS NULL AND EXISTS(SELECT 1 FROM public.edu_questions WHERE course_id=p_course_id) THEN RAISE EXCEPTION '평가 합격 후 수료할 수 있습니다';END IF;
 IF public.edu_course_watch_met(p_course_id,v_e) IS DISTINCT FROM true THEN
  RAISE EXCEPTION '필수 영상 시청을 완료해 주세요.';
 END IF;
 INSERT INTO public.edu_signatures(enrollment_id,signature_data_uri,request_id) VALUES(v_e,p_signature_data,p_request_id);
 UPDATE public.edu_enrollments SET completed_at=now(),status='completed',completion_score=v_score WHERE id=v_e RETURNING edu_enrollments.completed_at INTO completed_at;
 INSERT INTO public.edu_audit(actor,operation,entity,detail) VALUES(auth.user_id()::text,'complete-education','edu_enrollments',jsonb_build_object('enrollment_id',v_e));
 RETURN NEXT;
 END $function$;

CREATE OR REPLACE FUNCTION public.edu_archive_purge(p_course_id uuid, p_confirm text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_title text;v_archive public.edu_archives%ROWTYPE;
        v_total integer;v_completed integer;v_signatures integer;
BEGIN
 IF NOT public.edu_is_admin() THEN RAISE EXCEPTION '관리자 권한이 필요합니다';END IF;
 SELECT title INTO v_title FROM public.edu_courses WHERE id=p_course_id FOR UPDATE;
 SELECT * INTO v_archive FROM public.edu_archives WHERE course_id=p_course_id FOR UPDATE;
 IF v_archive.id IS NULL OR v_archive.status<>'verified' OR v_archive.verified_at IS NULL THEN
   RAISE EXCEPTION '검증된 백업파일이 있어야 정리할 수 있습니다';
 END IF;
 IF p_confirm IS DISTINCT FROM v_title THEN RAISE EXCEPTION '교육명을 정확히 입력해 주세요';END IF;
 SELECT count(*),count(*) FILTER (WHERE e.status='completed')
   INTO v_total,v_completed FROM public.edu_enrollments e WHERE e.course_id=p_course_id;
 SELECT count(*) INTO v_signatures FROM public.edu_signatures s
   JOIN public.edu_enrollments e ON e.id=s.enrollment_id WHERE e.course_id=p_course_id;
 IF v_total=0 OR v_completed<>v_total OR v_total<>v_archive.record_count
  OR v_signatures<>v_total OR v_signatures<>v_archive.signature_count THEN
   RAISE EXCEPTION '백업 생성 이후 대상자/수료/서명 수량이 달라졌습니다. 백업을 새로 생성하고 검증해 주세요';
 END IF;
 INSERT INTO public.edu_audit(actor,operation,entity,detail)
 VALUES(auth.user_id()::text,'archive-purge','edu_courses',jsonb_build_object('course_id',p_course_id,'archive_sha256',v_archive.checksum_sha256,'record_count',v_total));
 DELETE FROM public.edu_attempts a USING public.edu_enrollments e WHERE a.enrollment_id=e.id AND e.course_id=p_course_id;
 DELETE FROM public.edu_progress_event v USING public.edu_enrollments e WHERE v.enrollment_id=e.id AND e.course_id=p_course_id;
 DELETE FROM public.edu_progress v USING public.edu_enrollments e WHERE v.enrollment_id=e.id AND e.course_id=p_course_id;
 -- Keep signature and completion score available for later printing.
 DELETE FROM public.edu_answers k USING public.edu_questions q WHERE k.question_id=q.id AND q.course_id=p_course_id;
 DELETE FROM public.edu_questions WHERE course_id=p_course_id;
 DELETE FROM public.edu_materials WHERE course_id=p_course_id;
 DELETE FROM public.edu_videos WHERE course_id=p_course_id;
 UPDATE public.edu_courses SET status='archived',updated_at=now() WHERE id=p_course_id;
 UPDATE public.edu_archives SET status='purged',purged_at=now() WHERE course_id=p_course_id;
 RETURN 'purged';
END
$function$;

