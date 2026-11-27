-- FCT 교육관리 rev.23: 수료자 포함 교육과정 삭제
-- 관리자는 교육명 정확히 입력해야 하며, 삭제 전 화면에서 수료건수를 확인합니다.
-- 기존 교육과정은 이 파일 또는 함수 배포만으로 삭제되지 않습니다.
-- 교육과정 삭제 시 전자서명·평가·수강이력·보관메타데이터까지 연결 삭제됩니다.

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
 v_attempts integer := 0;
BEGIN
 IF public.edu_is_admin() IS DISTINCT FROM true THEN
  RAISE EXCEPTION '관리자 계정으로 로그인한 경우에만 교육과정을 삭제할 수 있습니다.' USING ERRCODE='42501';
 END IF;
 IF p_course_id IS NULL THEN
  RAISE EXCEPTION '삭제할 교육과정을 선택해 주세요.';
 END IF;
 SELECT c.title INTO v_title
 FROM public.edu_courses c WHERE c.id=p_course_id FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION '교육과정을 찾을 수 없습니다. 목록을 새로고침해 주세요.';
 END IF;
 IF p_confirm_title IS DISTINCT FROM v_title THEN
  RAISE EXCEPTION '교육명을 정확하게 입력해야 삭제할 수 있습니다.';
 END IF;

 -- Serialize any concurrent completion and assignment operations before
 -- deleting enrolled training records.
 PERFORM e.id FROM public.edu_enrollments e
 WHERE e.course_id=p_course_id ORDER BY e.id FOR UPDATE;
 SELECT count(*),
        count(*) FILTER (WHERE e.status='completed' OR e.completed_at IS NOT NULL)
 INTO v_enrollments,v_completed
 FROM public.edu_enrollments e WHERE e.course_id=p_course_id;
 SELECT count(*) INTO v_signatures
 FROM public.edu_signatures s JOIN public.edu_enrollments e
 ON e.id=s.enrollment_id WHERE e.course_id=p_course_id;
 SELECT count(*) INTO v_attempts
 FROM public.edu_attempts a JOIN public.edu_enrollments e
 ON e.id=a.enrollment_id WHERE e.course_id=p_course_id;
 SELECT count(*) INTO v_archives
 FROM public.edu_archives a WHERE a.course_id=p_course_id;

 -- Delete the archive metadata explicitly (its FK is RESTRICT). Enrollment
 -- children and course content follow their existing ON DELETE CASCADE FKs.
 DELETE FROM public.edu_archives WHERE course_id=p_course_id;
 DELETE FROM public.edu_enrollments WHERE course_id=p_course_id;
 DELETE FROM public.edu_courses WHERE id=p_course_id;

 INSERT INTO public.edu_audit(actor,operation,entity,detail)
 VALUES(auth.user_id()::text,'delete-course','edu_courses',
  jsonb_build_object('course_id',p_course_id,'title',v_title,
   'deleted_enrollments',v_enrollments,
   'deleted_completed',v_completed,
   'deleted_signatures',v_signatures,
   'deleted_attempts',v_attempts,
   'deleted_archive_metadata',v_archives));

 RETURN jsonb_build_object('deleted',true,'course_id',p_course_id,
  'deleted_enrollments',v_enrollments,'deleted_completed',v_completed,
  'deleted_signatures',v_signatures,'deleted_archive_metadata',v_archives);
END
$function$;
REVOKE ALL ON FUNCTION public.edu_delete_course(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_delete_course(uuid,text) TO authenticated;
