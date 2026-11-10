-- FCT 교육관리 VER3 rev.16
-- Existing administrators can register another administrator from the app.
DO $migration$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.edu_staff WHERE role='admin' AND active AND auth_user_id IS NOT NULL) THEN
  RAISE EXCEPTION '기존 관리자 계정을 확인한 후에 최초 등록을 종료할 수 있습니다.';
 END IF;
END
$migration$;

CREATE TABLE public.edu_admin_registrations (
 email text PRIMARY KEY,
 full_name text NOT NULL,
 password_hash bytea NOT NULL,
 registered_by text NOT NULL,
 expires_at timestamptz NOT NULL,
 claimed_by text,
 claimed_at timestamptz
);

ALTER TABLE public.edu_admin_registrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.edu_admin_registrations FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION public.edu_register_admin(p_email text,p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_email text:=lower(btrim(p_email));
 v_name text:=btrim(p_name);
 v_actor text:=auth.user_id()::text;
 v_password text;
BEGIN
 IF public.edu_is_admin() IS DISTINCT FROM true THEN
  RAISE EXCEPTION '관리자만 새 관리자를 등록할 수 있습니다.' USING ERRCODE='42501';
 END IF;
 IF coalesce(length(v_name),0) NOT BETWEEN 1 AND 100
  OR coalesce(length(v_email),0) NOT BETWEEN 3 AND 254
  OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  OR v_email LIKE '%@fct-education.example' THEN
  RAISE EXCEPTION '관리자 성명과 사용할 이메일을 확인해 주세요.';
 END IF;
 IF EXISTS (SELECT 1 FROM neon_auth."user" u JOIN public.edu_staff s ON s.auth_user_id=u.id::text
            WHERE lower(u.email)=v_email) THEN
  RAISE EXCEPTION '이미 교육관리 계정으로 사용 중인 이메일입니다.';
 END IF;
 v_password:='FCT-'||substr(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),1,36);
 INSERT INTO public.edu_admin_registrations(email,full_name,password_hash,registered_by,expires_at)
 VALUES(v_email,v_name,sha256(convert_to(v_password,'UTF8')),v_actor,now()+interval '24 hours')
 ON CONFLICT(email) DO UPDATE
 SET full_name=EXCLUDED.full_name,password_hash=EXCLUDED.password_hash,
  registered_by=EXCLUDED.registered_by,expires_at=EXCLUDED.expires_at
 WHERE public.edu_admin_registrations.claimed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION '이미 등록이 완료된 관리자 이메일입니다.'; END IF;
 INSERT INTO public.edu_audit(actor,operation,entity)
 VALUES(v_actor,'register-admin','edu_staff');
 RETURN v_password;
END
$function$;

CREATE OR REPLACE FUNCTION public.edu_admin_first_login(p_email text,p_password text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT coalesce(p_password ~ '^FCT-[0-9a-f]{36}$' AND EXISTS (
  SELECT 1 FROM public.edu_admin_registrations a
  JOIN public.edu_staff issuer ON issuer.auth_user_id=a.registered_by
  WHERE a.email=lower(btrim(p_email)) AND a.claimed_at IS NULL AND a.expires_at>now()
   AND issuer.role='admin' AND issuer.active
   AND a.password_hash=sha256(convert_to(p_password,'UTF8'))
 ),false)
$function$;

CREATE OR REPLACE FUNCTION public.edu_activate_registered_admin(p_password text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_uid text:=auth.user_id()::text;
 v_email text;
 v_registration public.edu_admin_registrations%ROWTYPE;
 v_staff uuid;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION '새 비밀번호로 로그인한 후 진행해 주세요.' USING ERRCODE='42501'; END IF;
 SELECT lower(email) INTO v_email FROM neon_auth."user" WHERE id::text=v_uid;
 SELECT * INTO v_registration FROM public.edu_admin_registrations WHERE email=v_email FOR UPDATE;
 IF NOT FOUND OR p_password IS NULL OR p_password !~ '^FCT-[0-9a-f]{36}$'
  OR v_registration.password_hash IS DISTINCT FROM sha256(convert_to(p_password,'UTF8')) THEN
  RAISE EXCEPTION '등록된 이메일과 임시 비밀번호를 확인해 주세요.' USING ERRCODE='42501';
 END IF;
 IF v_registration.claimed_by=v_uid THEN
  SELECT id INTO v_staff FROM public.edu_staff WHERE auth_user_id=v_uid AND role='admin' AND active;
  IF FOUND THEN RETURN v_staff; END IF;
 END IF;
 IF NOT public.edu_admin_first_login(v_email,p_password) THEN
  RAISE EXCEPTION '임시 비밀번호가 만료되었거나 이미 사용되었습니다.' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.edu_staff WHERE auth_user_id=v_uid) THEN
  RAISE EXCEPTION '이미 다른 교육관리 계정에 연결되어 있습니다.';
 END IF;
 v_staff:=gen_random_uuid();
 INSERT INTO public.edu_staff(id,employee_no,full_name,plant,department,role,auth_user_id)
 VALUES(v_staff,'ADMIN-'||v_staff::text,v_registration.full_name,'2공장','경영지원','admin',v_uid);
 UPDATE public.edu_admin_registrations SET claimed_by=v_uid,claimed_at=now() WHERE email=v_email;
 INSERT INTO public.edu_audit(actor,operation,entity)
 VALUES(v_uid,'activate-registered-admin','edu_staff');
 RETURN v_staff;
END
$function$;

REVOKE ALL ON FUNCTION public.edu_claim_admin(text,text,text),
 public.edu_register_admin(text,text),public.edu_admin_first_login(text,text),
 public.edu_activate_registered_admin(text) FROM PUBLIC, anonymous, authenticated;

GRANT EXECUTE ON FUNCTION public.edu_register_admin(text,text),
 public.edu_activate_registered_admin(text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.edu_admin_first_login(text,text) TO anonymous,authenticated;

