-- FCT 교육관리 VER3 rev.13
-- Existing courses keep a NULL department filter (all departments in their plant).
ALTER TABLE public.edu_courses ADD COLUMN IF NOT EXISTS target_departments text[];

CREATE OR REPLACE FUNCTION public.edu_register_course(
 p_request_id uuid, p_course jsonb, p_departments text[], p_video jsonb, p_questions jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_title text := btrim(p_course->>'title');
 v_month text := p_course->>'education_month';
 v_plant text := p_course->>'plant';
 v_watch integer;
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
 IF v_watch>0 AND (p_video IS NULL OR coalesce((p_video->>'duration_seconds')::integer,0)<v_watch*60) THEN
  RAISE EXCEPTION '필수 시청시간 이상의 영상 길이를 입력해 주세요.';
 END IF;
 v_continuous := coalesce((p_course->>'continuous')::boolean,false);
 IF v_continuous THEN
  -- Coordinate with a concurrent new-employee insert.
  PERFORM pg_advisory_xact_lock(hashtextextended('edu-continuous-assignment',0));
 END IF;
 INSERT INTO public.edu_courses(
  id,title,course_type,plant,education_month,course_date,duration_minutes,required_watch_minutes,
  passing_score,attempt_limit,continuous,description,target_departments,status
 ) VALUES (
  p_request_id,v_title,p_course->>'course_type',v_plant,v_month,(p_course->>'course_date')::date,
  (p_course->>'duration_minutes')::integer,v_watch,(p_course->>'passing_score')::integer,
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

REVOKE ALL ON FUNCTION public.edu_register_course(uuid,jsonb,text[],jsonb,jsonb) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.edu_register_course(uuid,jsonb,text[],jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.edu_assign_continuous()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
 IF NEW.role='employee' AND NEW.active THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('edu-continuous-assignment',0));
  INSERT INTO public.edu_enrollments(course_id,staff_id)
  SELECT c.id,NEW.id FROM public.edu_courses c
  WHERE c.continuous AND c.status='published'
   AND (c.plant='전체' OR c.plant=NEW.plant)
   AND (c.target_departments IS NULL OR NEW.department=ANY(c.target_departments))
  ON CONFLICT (course_id,staff_id) DO NOTHING;
 END IF;
 RETURN NEW;
END
$function$;

