-- FCT 교육관리 VER3 rev.8
-- 최초 로그인 직원은 비밀번호를 새로 설정한 즉시 직원 계정에 연결되며 관리자 승인 과정은 없다.
-- 관리자에게 표시되는 유일한 요청은 비밀번호 찾기/초기화 요청이다.
-- 기존 직원·교육·평가·서명 데이터는 삭제하거나 초기화하지 않는다.

CREATE OR REPLACE FUNCTION public.edu_request_activation(p_employee_no text, p_initial_pin text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid text:=auth.user_id()::text; v_email text; v_staff public.edu_staff%ROWTYPE;
BEGIN
 IF v_uid IS NULL OR length(v_uid)<8 THEN RAISE EXCEPTION '새 비밀번호로 로그인한 후 이용해 주세요'; END IF;
 IF p_initial_pin IS DISTINCT FROM '1111' THEN RAISE EXCEPTION '초기 비밀번호가 다릅니다'; END IF;
 SELECT lower(u.email) INTO v_email FROM neon_auth."user" u WHERE u.id::text=v_uid;
 SELECT * INTO v_staff FROM public.edu_staff
  WHERE employee_no=trim(p_employee_no) AND role='employee' AND active=true FOR UPDATE;
 IF v_staff.id IS NULL THEN RAISE EXCEPTION '등록된 직원 사번이 아닙니다'; END IF;
 IF v_email IS DISTINCT FROM lower('fctedu+'||v_staff.employee_no||'.v'||v_staff.login_version||'@fct-education.example')
 THEN RAISE EXCEPTION '사번과 로그인 계정이 일치하지 않습니다'; END IF;
 IF v_staff.auth_user_id IS NOT NULL AND v_staff.auth_user_id<>v_uid THEN
  RAISE EXCEPTION '이미 사용 중인 직원 계정입니다. 비밀번호 찾기를 이용해 주세요';
 END IF;
 IF v_staff.auth_user_id IS NULL THEN
  UPDATE public.edu_staff SET auth_user_id=v_uid, invite_hash=NULL, updated_at=now()
   WHERE id=v_staff.id;
  INSERT INTO public.edu_audit(actor,operation,entity,detail)
   VALUES(v_uid,'employee-first-password-set','edu_staff',
          jsonb_build_object('employee_no',v_staff.employee_no,'version',v_staff.login_version));
 END IF;
 INSERT INTO public.edu_activation_requests(staff_id,auth_user_id,status,requested_at,approved_at,approved_by)
 VALUES(v_staff.id,v_uid,'approved',now(),now(),NULL)
 ON CONFLICT(staff_id) DO UPDATE SET
  auth_user_id=EXCLUDED.auth_user_id,status='approved',
  approved_at=now(),approved_by=NULL
 WHERE public.edu_activation_requests.auth_user_id=EXCLUDED.auth_user_id
       OR public.edu_activation_requests.status='approved';
 IF NOT FOUND THEN RAISE EXCEPTION '이전에 접수된 다른 계정의 요청이 있습니다. 비밀번호 찾기를 이용해 주세요'; END IF;
 RETURN 'active';
END
$function$;
