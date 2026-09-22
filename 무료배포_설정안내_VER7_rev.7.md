# FCT MSDS VER7_rev.7 무료 배포 설정

## 완성 구조

- 직원: 로그인 없이 QR 또는 주소로 MSDS 검색·열람·다운로드
- 관리자: 공통 비밀번호 `1004` 입력 후 PDF·엑셀·구조 수정
- PC·모바일 모드를 화면 상단에서 직접 변경
- 전체 → 공장 → 부서 → 설비 → 공정 순서로 MSDS 확인
- 1공장과 2공장 PDF 및 사용처를 완전히 분리하여 저장
- 아이폰 PDF 전체화면 열기 지원
- PDF는 공장별로 저장하고 같은 공장 안의 여러 사용처에 연결

## 1. 먼저 데모 확인

현재 `config.js`의 `DEMO_MODE`가 `false`로 설정되어 있으며 Supabase 공용 저장소가 연결되어 있습니다.

- 관리자 비밀번호: `1004`

등록한 자료는 Supabase 공용 저장소에 저장되어 다른 기기에서도 동일하게 표시됩니다.

## 2. 무료 저장소 만들기

1. Supabase에서 무료 프로젝트를 만듭니다.
2. SQL Editor를 열고 `supabase_setup_VER7_rev.7.sql` 전체를 실행합니다.
3. 별도의 관리자 이메일 계정은 만들지 않습니다.
4. Project Settings의 API 메뉴에서 Project URL과 anon public key를 확인합니다.

## 3. 홈페이지 연결

`config.js`를 다음과 같이 수정합니다.

```javascript
window.FCT_CONFIG = {
  VERSION: 'VER7_rev.7',
  DEMO_MODE: false,
  SUPABASE_URL: '프로젝트 URL',
  SUPABASE_ANON_KEY: 'anon public key',
  STORAGE_BUCKET: 'msds',
  ADMIN_PASSWORD: '1004'
};
```

`anon public key`는 공개 웹페이지에서 사용하는 키입니다. `service_role key`는 절대로 HTML이나 config.js에 입력하지 않습니다.

## 4. GitHub Pages에 배포

1. 기존 `FCTC-MSDS` 저장소를 엽니다.
2. `Add file` → `Upload files`를 선택합니다.
3. 이 폴더 안의 파일과 하위 폴더 전체를 저장소 최상단에 올립니다.
4. `Commit changes`를 선택합니다.
5. 기존 주소 `https://fjfnkh8fnj-a11y.github.io/FCTC-MSDS/`에서 확인합니다.
6. 주소가 같으므로 기존 QR은 그대로 사용할 수 있습니다.

## 5. 운영 전 확인

- PC와 아이폰에서 공장·부서·설비·공정 필터가 동작하는지 확인합니다.
- 비밀번호 `1004`로 관리자 모드가 열리는지 확인합니다.
- 일반 화면에서는 등록·수정·삭제 메뉴가 표시되지 않는지 확인합니다.
- PDF 등록 후 다른 기기에서도 같은 파일이 보이는지 확인합니다.
- PDF 보기와 다운로드가 정상 동작하는지 확인합니다.

## 공개 범위 주의

직원 열람 화면과 PDF 저장소는 공개 방식입니다. 주소를 아는 외부 사용자도 열람할 수 있으므로 외부 공개가 곤란한 문서는 등록하지 않습니다.

## 간편 비밀번호 방식 주의

GitHub Pages의 HTML·JavaScript는 누구나 소스를 확인할 수 있어 `1004`는 강한 보안 수단이 아닙니다. 일반 사용자의 실수로 인한 수정을 막는 간편 잠금 용도로 사용합니다. 외부 공격까지 차단하려면 추후 관리자 계정 로그인 방식으로 변경해야 합니다.
