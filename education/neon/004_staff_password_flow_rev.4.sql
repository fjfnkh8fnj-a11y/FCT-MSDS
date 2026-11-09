-- FCT 교육관리 VER3 rev.4 · 직원 초기비밀번호 및 관리자 승인 흐름
-- Neon project: FCT-EDU-APP (fct_edu_app), schema: public
-- 공통 1111은 계정 발급용 임시 입력값이며 실제 Neon Auth 비밀번호로 저장하지 않는다.
-- 직원 새 비밀번호(8자 이상) 설정 후 관리자 본인확인 승인이 필요하다.
-- 기존 교육자료·직원 수료이력은 변경/삭제하지 않는다.

CREATE TABLE IF NOT EXISTS public.edu_password_resets (
 staff_id uuid PRIMARY KEY REFERENCES public.edu_staff(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz, resolved_by text,
 request_count integer NOT NULL DEFAULT 1
);
ALTER TABLE public.edu_password_resets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='edu_password_resets' AND policyname='edu_password_resets_admin_select') THEN
   CREATE POLICY edu_password_resets_admin_select ON public.edu_password_resets FOR SELECT TO authenticated USING(public.edu_is_admin());
 END IF;
END $$;
GRANT SELECT ON public.edu_password_resets TO authenticated;

CREATE TABLE IF NOT EXISTS public.edu_activation_requests (
 staff_id uuid PRIMARY KEY REFERENCES public.edu_staff(id) ON DELETE CASCADE,
 auth_user_id text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 approved_at timestamptz, approved_by text
);
ALTER TABLE public.edu_activation_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='edu_activation_requests' AND policyname='edu_activation_requests_admin_select') THEN
   CREATE POLICY edu_activation_requests_admin_select ON public.edu_activation_requests FOR SELECT TO authenticated USING(public.edu_is_admin());
 END IF;
END $$;
GRANT SELECT ON public.edu_activation_requests TO authenticated;

-- edu_approve_activation
CREATE OR REPLACE FUNCTION public.edu_approve_activation(p_staff_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_req public.edu_activation_requests%ROWTYPE;v_staff public.edu_staff%ROWTYPE; v_email text;
BEGIN
 IF NOT public.edu_is_admin() THEN RAISE EXCEPTION '관리자 권한이 필요합니다'; END IF;
 SELECT * INTO v_staff FROM public.edu_staff WHERE id=p_staff_id AND role='employee' AND active=true FOR UPDATE;
 SELECT * INTO v_req FROM public.edu_activation_requests WHERE staff_id=p_staff_id AND status='pending' FOR UPDATE;
 IF v_staff.id IS NULL OR v_req.staff_id IS NULL OR v_staff.auth_user_id IS NOT NULL THEN RAISE EXCEPTION '승인할 신규 직원 요청이 없습니다'; END IF;
 SELECT lower(u.email) INTO v_email FROM neon_auth."user" u WHERE u.id::text=v_req.auth_user_id;
 IF v_email IS DISTINCT FROM lower('fctedu+'||v_staff.employee_no||'.v'||v_staff.login_version||'@fct-education.example')
 THEN RAISE EXCEPTION '사번과 인증 정보가 일치하지 않습니다'; END IF;
 UPDATE public.edu_staff SET auth_user_id=v_req.auth_user_id,invite_hash=NULL,updated_at=now() WHERE id=p_staff_id;
 UPDATE public.edu_activation_requests SET status='approved',approved_at=now(),approved_by=auth.user_id()::text WHERE staff_id=p_staff_id;
 INSERT INTO public.edu_audit(actor,operation,entity,detail)
 VALUES(auth.user_id()::text,'approve-employee-activation','edu_staff',jsonb_build_object('employee_no',v_staff.employee_no));
 RETURN v_staff.employee_no;
END $function$;

-- edu_create_staff
CREATE OR REPLACE FUNCTION public.edu_create_staff(p_employee_no text, p_name text, p_plant text, p_department text, p_hired_on date DEFAULT NULL::date)
 RETURNS TABLE(staff_id uuid, invite_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT public.edu_is_admin() THEN RAISE EXCEPTION '관리자만 등록 가능합니다'; END IF;
 IF length(trim(p_employee_no))<2 OR length(trim(p_name))<2 THEN RAISE EXCEPTION '사번 및 성명을 입력하세요'; END IF;
 IF p_plant NOT IN ('1공장','2공장') THEN RAISE EXCEPTION '공장 구분 오류'; END IF;
 INSERT INTO public.edu_staff(employee_no,full_name,plant,department,hired_on,invite_hash)
 VALUES(trim(p_employee_no),trim(p_name),p_plant,trim(p_department),p_hired_on,NULL)
 RETURNING id INTO staff_id;
 invite_code:='1111';
 INSERT INTO public.edu_audit(actor,operation,entity,detail)
 VALUES(auth.user_id()::text,'create-staff','edu_staff',jsonb_build_object('employee_no',trim(p_employee_no)));
 RETURN NEXT;
END $function$;

-- edu_initial_login_eligible
CREATE OR REPLACE FUNCTION public.edu_initial_login_eligible(p_employee_no text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT EXISTS(SELECT 1 FROM public.edu_staff s WHERE s.employee_no=trim(p_employee_no) AND s.role='employee' AND s.active=true AND s.auth_user_id IS NULL) $function$;

-- edu_my_activation_status
CREATE OR REPLACE FUNCTION public.edu_my_activation_status()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT coalesce((SELECT a.status FROM public.edu_activation_requests a WHERE a.auth_user_id=auth.user_id()::text ORDER BY a.requested_at DESC LIMIT 1),'none') $function$;

-- edu_request_activation
CREATE OR REPLACE FUNCTION public.edu_request_activation(p_employee_no text, p_initial_pin text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid text:=auth.user_id()::text; v_email text; v_staff public.edu_staff%ROWTYPE;
BEGIN
 IF v_uid IS NULL OR length(v_uid)<8 THEN RAISE EXCEPTION '새 비밀번호로 계정을 생성한 뒤 진행해 주세요'; END IF;
 IF p_initial_pin IS DISTINCT FROM '1111' THEN RAISE EXCEPTION '초기 비밀번호가 다릅니다'; END IF;
 SELECT lower(u.email) INTO v_email FROM neon_auth."user" u WHERE u.id::text=v_uid;
 SELECT * INTO v_staff FROM public.edu_staff
 WHERE employee_no=trim(p_employee_no) AND role='employee' AND active=true FOR UPDATE;
 IF v_staff.id IS NULL THEN RAISE EXCEPTION '직원명부에 등록된 사번이 아닙니다'; END IF;
 IF v_staff.auth_user_id IS NOT NULL THEN RAISE EXCEPTION '이미 사용 중인 계정입니다. 비밀번호 찾기를 이용해 주세요'; END IF;
 IF v_email IS DISTINCT FROM lower('fctedu+'||v_staff.employee_no||'.v'||v_staff.login_version||'@fct-education.example')
 THEN RAISE EXCEPTION '사번과 로그인 계정이 일치하지 않습니다'; END IF;
 INSERT INTO public.edu_activation_requests(staff_id,auth_user_id,status,requested_at,approved_at,approved_by)
 VALUES(v_staff.id,v_uid,'pending',now(),NULL,NULL)
 ON CONFLICT(staff_id) DO UPDATE SET auth_user_id=EXCLUDED.auth_user_id,status='pending',requested_at=now(),approved_at=NULL,approved_by=NULL
 WHERE public.edu_activation_requests.auth_user_id=EXCLUDED.auth_user_id OR public.edu_activation_requests.status='approved';
 IF NOT FOUND THEN RAISE EXCEPTION '다른 기기에서 등록 요청이 접수되어 있습니다. 관리자에게 확인해 주세요'; END IF;
 RETURN 'pending';
END $function$;

-- edu_request_password_reset
CREATE OR REPLACE FUNCTION public.edu_request_password_reset(p_employee_no text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_staff uuid;
BEGIN
 IF length(trim(p_employee_no)) BETWEEN 2 AND 48 THEN
  SELECT s.id INTO v_staff FROM public.edu_staff s WHERE s.employee_no=trim(p_employee_no) AND s.role='employee' AND s.active=true;
  IF v_staff IS NOT NULL THEN
   INSERT INTO public.edu_password_resets(staff_id,status,requested_at,resolved_at,resolved_by)
   VALUES(v_staff,'pending',now(),NULL,NULL)
   ON CONFLICT(staff_id) DO UPDATE SET
     status='pending',
     requested_at=CASE WHEN public.edu_password_resets.status='pending'
                              AND public.edu_password_resets.requested_at > now()-interval '10 minutes'
                       THEN public.edu_password_resets.requested_at ELSE now() END,
     resolved_at=NULL,resolved_by=NULL,
     request_count=CASE WHEN public.edu_password_resets.status='pending'
                              AND public.edu_password_resets.requested_at > now()-interval '10 minutes'
                       THEN public.edu_password_resets.request_count ELSE public.edu_password_resets.request_count+1 END;
  END IF;
 END IF;
 RETURN true;
END $function$;

-- edu_resolve_password_request
CREATE OR REPLACE FUNCTION public.edu_resolve_password_request(p_staff_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT public.edu_is_admin() THEN RAISE EXCEPTION '관리자 권한이 필요합니다'; END IF;
 UPDATE public.edu_password_resets SET status='resolved',resolved_at=now(),resolved_by=auth.user_id()::text
 WHERE staff_id=p_staff_id AND status='pending';
 RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.edu_request_password_reset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_request_password_reset(text) TO anonymous, authenticated;
REVOKE ALL ON FUNCTION public.edu_initial_login_eligible(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_initial_login_eligible(text) TO anonymous, authenticated;
REVOKE ALL ON FUNCTION public.edu_my_activation_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_my_activation_status() TO authenticated;
REVOKE ALL ON FUNCTION public.edu_request_activation(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_request_activation(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.edu_approve_activation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_approve_activation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.edu_resolve_password_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_resolve_password_request(uuid) TO authenticated;
