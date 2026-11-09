-- FCT 교육관리 Neon PostgreSQL 초기 스키마 rev.1
-- 전제: Neon Managed Auth + Data API 활성화 후 테스트 브랜치에서 적용.
-- 실제 사용자 정보/비밀번호/Connection string을 GitHub에 올리지 않는다.
-- 공개 클라이언트의 학습 기록/평가/서명 쓰기는 차단하고 검증된 서버 함수에서만 처리한다.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.edu_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id text UNIQUE,
  employee_no text NOT NULL UNIQUE,
  full_name text NOT NULL,
  department text NOT NULL,
  plant text NOT NULL DEFAULT '2공장',
  job_role text NOT NULL DEFAULT 'employee' CHECK(job_role IN ('employee','admin')),
  employment_status text NOT NULL DEFAULT 'active' CHECK(employment_status IN ('active','inactive')),
  hired_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edu_staff_department ON public.edu_staff (plant,department);

CREATE TABLE IF NOT EXISTS public.edu_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  course_type text NOT NULL,
  education_month text NOT NULL CHECK(education_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  plant text NOT NULL DEFAULT '2공장',
  duration_minutes integer NOT NULL DEFAULT 0 CHECK(duration_minutes>=0),
  required_watch_minutes integer NOT NULL DEFAULT 0 CHECK(required_watch_minutes>=0),
  passing_score integer NOT NULL DEFAULT 80 CHECK(passing_score BETWEEN 0 AND 100),
  continuous boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.edu_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.edu_courses(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.edu_staff(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completion_status text NOT NULL DEFAULT 'assigned'
    CHECK(completion_status IN ('assigned','started','completed')),
  UNIQUE(course_id,staff_id)
);
CREATE INDEX IF NOT EXISTS idx_edu_enrollments_staff ON public.edu_enrollments(staff_id,completion_status);
CREATE INDEX IF NOT EXISTS idx_edu_enrollments_course ON public.edu_enrollments(course_id,completion_status);

CREATE TABLE IF NOT EXISTS public.edu_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.edu_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  youtube_video_id text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK(duration_seconds>=0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id,youtube_video_id)
);
CREATE INDEX IF NOT EXISTS idx_edu_videos_course ON public.edu_videos(course_id,sort_order);

CREATE TABLE IF NOT EXISTS public.edu_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.edu_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  material_type text NOT NULL CHECK(material_type IN ('note','file','link')),
  body_text text,
  object_key text,
  external_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edu_materials_course ON public.edu_materials(course_id,sort_order);

CREATE TABLE IF NOT EXISTS public.edu_video_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.edu_enrollments(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.edu_videos(id) ON DELETE CASCADE,
  watched_seconds integer NOT NULL DEFAULT 0 CHECK(watched_seconds>=0),
  last_position_seconds integer NOT NULL DEFAULT 0 CHECK(last_position_seconds>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id,video_id)
);
CREATE INDEX IF NOT EXISTS idx_edu_progress_enrollment ON public.edu_video_progress(enrollment_id);

CREATE TABLE IF NOT EXISTS public.edu_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.edu_courses(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  question_type text NOT NULL CHECK(question_type IN ('multiple','ox')),
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edu_questions_course ON public.edu_quiz_questions(course_id,sort_order);

-- 정답은 직원에게 조회 가능한 문제 테이블과 별도 분리
CREATE TABLE IF NOT EXISTS public.edu_quiz_answer_keys (
  question_id uuid PRIMARY KEY REFERENCES public.edu_quiz_questions(id) ON DELETE CASCADE,
  correct_answer jsonb NOT NULL,
  explanation text
);

CREATE TABLE IF NOT EXISTS public.edu_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.edu_enrollments(id) ON DELETE CASCADE,
  submitted_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer NOT NULL CHECK(score BETWEEN 0 AND 100),
  passed boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_edu_attempts_enrollment ON public.edu_quiz_attempts(enrollment_id,submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.edu_signatures (
  enrollment_id uuid PRIMARY KEY REFERENCES public.edu_enrollments(id) ON DELETE CASCADE,
  storage_object_key text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.edu_audit_events (
  id bigserial PRIMARY KEY,
  actor_auth_user_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edu_audit_events_time ON public.edu_audit_events(created_at DESC);

-- Neon Auth 사용자 ID를 검증한 데이터베이스 권한 판정 함수
CREATE OR REPLACE FUNCTION public.edu_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS(
   SELECT 1 FROM public.edu_staff s
   WHERE s.auth_user_id=auth.user_id()::text
     AND s.job_role='admin' AND s.employment_status='active'
 )
$$;

CREATE OR REPLACE FUNCTION public.edu_is_self(target_staff_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS(
   SELECT 1 FROM public.edu_staff s
   WHERE s.id=target_staff_id AND s.auth_user_id=auth.user_id()::text
     AND s.employment_status='active'
 )
$$;

CREATE OR REPLACE FUNCTION public.edu_has_enrollment(target_course_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS(
   SELECT 1 FROM public.edu_enrollments e
   JOIN public.edu_staff s ON s.id=e.staff_id
   WHERE e.course_id=target_course_id AND s.auth_user_id=auth.user_id()::text
     AND s.employment_status='active'
 )
$$;

-- 클라이언트가 직접 RLS를 우회하는 API / DB 역할을 사용하지 않도록 운영 구성에서 검증
ALTER TABLE public.edu_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_video_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_quiz_answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_audit_events ENABLE ROW LEVEL SECURITY;

-- 읽기 권한: 관리자 전체, 직원 본인 배정 과정만
DROP POLICY IF EXISTS edu_staff_read ON public.edu_staff;
CREATE POLICY edu_staff_read ON public.edu_staff FOR SELECT TO authenticated
 USING (public.edu_is_admin() OR public.edu_is_self(id));

DROP POLICY IF EXISTS edu_courses_read ON public.edu_courses;
CREATE POLICY edu_courses_read ON public.edu_courses FOR SELECT TO authenticated
 USING (public.edu_is_admin() OR (status='published' AND public.edu_has_enrollment(id)));

DROP POLICY IF EXISTS edu_enrollments_read ON public.edu_enrollments;
CREATE POLICY edu_enrollments_read ON public.edu_enrollments FOR SELECT TO authenticated
 USING (public.edu_is_admin() OR public.edu_is_self(staff_id));

DROP POLICY IF EXISTS edu_videos_read ON public.edu_videos;
CREATE POLICY edu_videos_read ON public.edu_videos FOR SELECT TO authenticated
 USING (public.edu_is_admin() OR public.edu_has_enrollment(course_id));

DROP POLICY IF EXISTS edu_materials_read ON public.edu_materials;
CREATE POLICY edu_materials_read ON public.edu_materials FOR SELECT TO authenticated
 USING (public.edu_is_admin() OR public.edu_has_enrollment(course_id));

DROP POLICY IF EXISTS edu_progress_read ON public.edu_video_progress;
CREATE POLICY edu_progress_read ON public.edu_video_progress FOR SELECT TO authenticated
 USING (public.edu_is_admin() OR EXISTS(
   SELECT 1 FROM public.edu_enrollments e
   WHERE e.id=enrollment_id AND public.edu_is_self(e.staff_id)
 ));

DROP POLICY IF EXISTS edu_questions_read ON public.edu_quiz_questions;
CREATE POLICY edu_questions_read ON public.edu_quiz_questions FOR SELECT TO authenticated
 USING (public.edu_is_admin() OR public.edu_has_enrollment(course_id));

DROP POLICY IF EXISTS edu_keys_read ON public.edu_quiz_answer_keys;
CREATE POLICY edu_keys_read ON public.edu_quiz_answer_keys FOR SELECT TO authenticated
 USING (public.edu_is_admin());

DROP POLICY IF EXISTS edu_attempts_read ON public.edu_quiz_attempts;
CREATE POLICY edu_attempts_read ON public.edu_quiz_attempts FOR SELECT TO authenticated
 USING (public.edu_is_admin() OR EXISTS(
   SELECT 1 FROM public.edu_enrollments e
   WHERE e.id=enrollment_id AND public.edu_is_self(e.staff_id)
 ));

DROP POLICY IF EXISTS edu_signatures_read ON public.edu_signatures;
CREATE POLICY edu_signatures_read ON public.edu_signatures FOR SELECT TO authenticated
 USING (public.edu_is_admin() OR EXISTS(
   SELECT 1 FROM public.edu_enrollments e
   WHERE e.id=enrollment_id AND public.edu_is_self(e.staff_id)
 ));

DROP POLICY IF EXISTS edu_audit_read ON public.edu_audit_events;
CREATE POLICY edu_audit_read ON public.edu_audit_events FOR SELECT TO authenticated
 USING (public.edu_is_admin());

-- 강제 변경 권한은 관리자에게만 허용. 직원의 진도·평가·서명 쓰기는 신뢰된 함수에서 검증 후 반영
DROP POLICY IF EXISTS edu_staff_admin_write ON public.edu_staff;
CREATE POLICY edu_staff_admin_write ON public.edu_staff FOR ALL TO authenticated
 USING (public.edu_is_admin()) WITH CHECK(public.edu_is_admin());

DROP POLICY IF EXISTS edu_courses_admin_write ON public.edu_courses;
CREATE POLICY edu_courses_admin_write ON public.edu_courses FOR ALL TO authenticated
 USING (public.edu_is_admin()) WITH CHECK(public.edu_is_admin());

DROP POLICY IF EXISTS edu_enrollments_admin_write ON public.edu_enrollments;
CREATE POLICY edu_enrollments_admin_write ON public.edu_enrollments FOR ALL TO authenticated
 USING (public.edu_is_admin()) WITH CHECK(public.edu_is_admin());

DROP POLICY IF EXISTS edu_videos_admin_write ON public.edu_videos;
CREATE POLICY edu_videos_admin_write ON public.edu_videos FOR ALL TO authenticated
 USING (public.edu_is_admin()) WITH CHECK(public.edu_is_admin());

DROP POLICY IF EXISTS edu_materials_admin_write ON public.edu_materials;
CREATE POLICY edu_materials_admin_write ON public.edu_materials FOR ALL TO authenticated
 USING (public.edu_is_admin()) WITH CHECK(public.edu_is_admin());

DROP POLICY IF EXISTS edu_questions_admin_write ON public.edu_quiz_questions;
CREATE POLICY edu_questions_admin_write ON public.edu_quiz_questions FOR ALL TO authenticated
 USING (public.edu_is_admin()) WITH CHECK(public.edu_is_admin());

DROP POLICY IF EXISTS edu_keys_admin_write ON public.edu_quiz_answer_keys;
CREATE POLICY edu_keys_admin_write ON public.edu_quiz_answer_keys FOR ALL TO authenticated
 USING (public.edu_is_admin()) WITH CHECK(public.edu_is_admin());

-- 주의: GRANT/REVOKE는 Neon Data API 역할 매핑을 확인한 뒤 별도 적용한다.
-- 서명 이미지가 저장될 Object Storage 버킷은 private으로 생성한다.
