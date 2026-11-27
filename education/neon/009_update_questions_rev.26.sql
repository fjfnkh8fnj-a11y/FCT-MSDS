-- FCT 교육관리 rev.26 기존 평가문제 수정 RPC
-- 질문·선택지와 정답·해설을 같은 트랜잭션에서 변경합니다.
-- 관리자 JWT만 실행할 수 있으며, 이 마이그레이션은 기존 데이터를 변경하지 않습니다.

CREATE OR REPLACE FUNCTION public.edu_update_question(p_question_id uuid, p_prompt text, p_choices jsonb, p_answer_index integer, p_explanation text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_course uuid;
BEGIN
 IF public.edu_is_admin() IS DISTINCT FROM true THEN
  RAISE EXCEPTION '관리자 권한이 확인되지 않습니다.' USING ERRCODE='42501';
 END IF;
 IF p_question_id IS NULL OR char_length(btrim(coalesce(p_prompt,''))) NOT BETWEEN 8 AND 500 THEN
  RAISE EXCEPTION '평가문제는 8~500자로 입력해 주세요.';
 END IF;
 IF jsonb_typeof(p_choices)<>'array' OR jsonb_array_length(p_choices) NOT BETWEEN 2 AND 6
  OR p_answer_index IS NULL OR p_answer_index<0 OR p_answer_index>=jsonb_array_length(p_choices)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_choices) AS i(v)
    WHERE jsonb_typeof(i.v)<>'string' OR length(btrim(i.v#>>'{}'))=0) THEN
   RAISE EXCEPTION '선택지와 정답 번호를 확인해 주세요.';
 END IF;
 SELECT q.course_id INTO v_course FROM public.edu_questions q WHERE q.id=p_question_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '수정할 평가문제를 찾을 수 없습니다.'; END IF;
 UPDATE public.edu_questions SET prompt=btrim(p_prompt),choices=p_choices WHERE id=p_question_id;
 UPDATE public.edu_answers SET correct_index=p_answer_index,explanation=coalesce(p_explanation,'')
 WHERE question_id=p_question_id;
 IF NOT FOUND THEN RAISE EXCEPTION '정답 정보가 없어 문제를 수정할 수 없습니다.'; END IF;
 INSERT INTO public.edu_audit(actor,operation,entity,detail)
 VALUES(auth.user_id()::text,'update-question','edu_questions',
 jsonb_build_object('question_id',p_question_id,'course_id',v_course));
 RETURN p_question_id;
END
$function$;
REVOKE ALL ON FUNCTION public.edu_update_question(uuid,text,jsonb,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_update_question(uuid,text,jsonb,integer,text) TO authenticated;
