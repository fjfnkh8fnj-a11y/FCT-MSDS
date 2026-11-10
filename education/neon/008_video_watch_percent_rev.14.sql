-- FCT 교육관리 VER3 rev.14
-- NULL retains existing minute-based completion rules.
ALTER TABLE public.edu_courses
 ADD COLUMN IF NOT EXISTS required_watch_percent integer CHECK (required_watch_percent BETWEEN 0 AND 100);

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
 SELECT c.status INTO v_status FROM public.edu_courses c WHERE c.id=p_course_id;
 IF NOT FOUND THEN RAISE EXCEPTION '교육과정 정보를 찾을 수 없습니다.'; END IF;
 IF v_status='archived' THEN RAISE EXCEPTION '보관 완료된 교육과정에는 영상을 추가할 수 없습니다.'; END IF;
 INSERT INTO public.edu_videos(course_id,title,youtube_id,duration_seconds)
 VALUES(p_course_id,trim(p_title),p_youtube_id,p_duration_seconds) RETURNING id INTO v_id;
 RETURN v_id;
END
$function$;

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
  passing_score,attempt_limit,continuous,description,target_departments,status
 ) VALUES (
  p_request_id,v_title,p_course->>'course_type',v_plant,v_month,(p_course->>'course_date')::date,
  (p_course->>'duration_minutes')::integer,v_watch,v_percent,(p_course->>'passing_score')::integer,
  (p_course->>'attempt_limit')::integer,v_continuous,coalesce(p_course->>'description',''),v_departments,'published'
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

CREATE OR REPLACE FUNCTION public.edu_complete_course(p_course_id uuid, p_signature_data text, p_request_id uuid)
 RETURNS TABLE(completed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 DECLARE v_e uuid;v_required integer;v_percent integer;v_watched integer;v_pass bool;
 BEGIN
 SELECT e.id,c.required_watch_minutes,c.required_watch_percent INTO v_e,v_required,v_percent FROM public.edu_enrollments e
 JOIN public.edu_staff s ON s.id=e.staff_id JOIN public.edu_courses c ON c.id=e.course_id
 WHERE e.course_id=p_course_id AND s.auth_user_id=auth.user_id()::text AND s.active=true AND c.status='published' FOR UPDATE OF e;
 IF v_e IS NULL THEN RAISE EXCEPTION '수강 대상이 아닙니다'; END IF;
 SELECT e.completed_at INTO completed_at FROM public.edu_enrollments e WHERE e.id=v_e;
 IF completed_at IS NOT NULL THEN RETURN NEXT;RETURN;END IF;
 IF p_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' OR length(p_signature_data)>245000 OR length(p_signature_data)<500 THEN
 RAISE EXCEPTION '서명 형식 또는 크기를 확인해 주세요';END IF;
 SELECT COALESCE(bool_or(passed),false) INTO v_pass FROM public.edu_attempts WHERE enrollment_id=v_e;
 IF NOT v_pass AND EXISTS(SELECT 1 FROM public.edu_questions WHERE course_id=p_course_id) THEN RAISE EXCEPTION '평가 합격 후 수료할 수 있습니다';END IF;
 IF v_percent IS NULL THEN
  -- Preserve minute-based requirements on existing courses.
  SELECT COALESCE(sum(p.seconds_watched),0) INTO v_watched FROM public.edu_progress p WHERE p.enrollment_id=v_e;
  IF v_watched < v_required*60 THEN RAISE EXCEPTION '필수 시청시간이 부족합니다.'; END IF;
 ELSIF v_percent>0 AND EXISTS (
  SELECT 1 FROM public.edu_videos v
  LEFT JOIN public.edu_progress p ON p.video_id=v.id AND p.enrollment_id=v_e
  WHERE v.course_id=p_course_id
   AND (v.duration_seconds<1 OR coalesce(p.seconds_watched,0)*100::bigint < v.duration_seconds*v_percent::bigint)
 ) THEN
  RAISE EXCEPTION '모든 교육영상을 각각 % 이상 시청해 주세요.',v_percent::text||'%';
 END IF;
 INSERT INTO public.edu_signatures(enrollment_id,signature_data_uri,request_id) VALUES(v_e,p_signature_data,p_request_id);
 UPDATE public.edu_enrollments SET completed_at=now(),status='completed' WHERE id=v_e RETURNING edu_enrollments.completed_at INTO completed_at;
 INSERT INTO public.edu_audit(actor,operation,entity,detail) VALUES(auth.user_id()::text,'complete-education','edu_enrollments',jsonb_build_object('enrollment_id',v_e));
 RETURN NEXT;
 END $function$;

