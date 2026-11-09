-- FCT 교육관리 VER3 rev.2
-- 백업을 생성한 후 대상 인원/수료/전자서명 건수가 변하면 상세기록 삭제를 차단한다.
-- 실제 반영: Neon FCT-EDU-APP / fct_edu_app
-- 이 변경은 기존 운영 데이터와 테이블 구조를 삭제하거나 초기화하지 않는다.

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
 DELETE FROM public.edu_signatures s USING public.edu_enrollments e WHERE s.enrollment_id=e.id AND e.course_id=p_course_id;
 DELETE FROM public.edu_answers k USING public.edu_questions q WHERE k.question_id=q.id AND q.course_id=p_course_id;
 DELETE FROM public.edu_questions WHERE course_id=p_course_id;
 DELETE FROM public.edu_materials WHERE course_id=p_course_id;
 DELETE FROM public.edu_videos WHERE course_id=p_course_id;
 UPDATE public.edu_courses SET status='archived',updated_at=now() WHERE id=p_course_id;
 UPDATE public.edu_archives SET status='purged',purged_at=now() WHERE course_id=p_course_id;
 RETURN 'purged';
END
$function$
;
