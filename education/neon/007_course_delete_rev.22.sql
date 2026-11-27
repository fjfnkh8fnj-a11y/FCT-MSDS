-- FCT 교육관리 rev.22
-- 교육과정 삭제: 관리자 검증, 교육명 확인, 수료/전자서명/백업 보호.
-- 미수료 수강배정과 연결된 영상·교육자료·평가문제·시청기록은 기존 FK CASCADE 규칙에 따라 정리.
-- 배포 시 기존 운영 데이터 자체를 삭제하지 않음.

CREATE OR REPLACE FUNCTION public.edu_delete_course(p_course_id uuid, p_confirm_title text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_title text;
 v_enrollments integer := 0;
 v_completed integer := 0;
 v_signatures integer := 0;
 v_archives integer := 0;
BEGIN
 IF public.edu_is_admin() IS DISTINCT FROM true THEN
  RAISE EXCEPTION '관리자 계정으로 로그인한 경우에만 교육과정을 삭제할 수 있습니다.' USING ERRCODE='42501';
 END IF;
 IF p_course_id IS NULL THEN
  RAISE EXCEPTION '삭제할 교육과정을 선택해 주세요.';
 END IF;
 -- Lock the parent course first: new assignment FKs then wait for this
 -- transaction. Lock enrolled rows as well to serialize completion writes.
 SELECT c.title INTO v_title
 FROM public.edu_courses c WHERE c.id=p_course_id FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION '교육과정을 찾을 수 없습니다. 목록을 새로고침해 주세요.';
 END IF;
 IF p_confirm_title IS DISTINCT FROM v_title THEN
  RAISE EXCEPTION '교육명을 정확하게 입력해야 삭제할 수 있습니다.';
 END IF;
 PERFORM e.id FROM public.edu_enrollments e
 WHERE e.course_id=p_course_id ORDER BY e.id FOR UPDATE;

 SELECT count(*),count(*) FILTER(
  WHERE e.status='completed' OR e.completed_at IS NOT NULL)
 INTO v_enrollments,v_completed
 FROM public.edu_enrollments e WHERE e.course_id=p_course_id;

 SELECT count(*) INTO v_signatures
 FROM public.edu_signatures s JOIN public.edu_enrollments e
 ON e.id=s.enrollment_id WHERE e.course_id=p_course_id;

 SELECT count(*) INTO v_archives
 FROM public.edu_archives a WHERE a.course_id=p_course_id;

 IF v_completed>0 OR v_signatures>0 OR v_archives>0 THEN
  RAISE EXCEPTION '수료이력, 전자서명 또는 백업 기록이 있는 교육은 삭제할 수 없습니다. 이력 보호를 위해 해당 교육을 유지해 주세요.';
 END IF;

 -- Enrollment children (attempts, progress, progress_event, signatures)
 -- are deleted by their declared ON DELETE CASCADE constraints. Videos,
 -- materials, questions and answers follow edu_courses cascades.
 DELETE FROM public.edu_enrollments WHERE course_id=p_course_id;
 DELETE FROM public.edu_courses WHERE id=p_course_id;

 INSERT INTO public.edu_audit(actor,operation,entity,detail)
 VALUES(auth.user_id()::text,'delete-course','edu_courses',
  jsonb_build_object('course_id',p_course_id,'title',v_title,
   'deleted_enrollments',v_enrollments,'completed_count',v_completed));

 RETURN jsonb_build_object('deleted',true,'course_id',p_course_id,
  'deleted_enrollments',v_enrollments);
END
$function$;

REVOKE ALL ON FUNCTION public.edu_delete_course(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_delete_course(uuid,text) TO authenticated;
