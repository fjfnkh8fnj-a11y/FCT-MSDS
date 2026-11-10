import {db,S,$,esc,check,notice,loadData,verifyAdminSession} from './core_rev.12.js';
import {basicAssessment} from './assessment_rev.13.js';
import {videoFields,videoFromForm} from './youtube_rev.14.js';

import {koreaToday,scheduleFields,scheduleValues} from './schedule_rev.15.js';

let lastRequest;

export function registrationForm(){
 const month=koreaToday().slice(0,7);
 return `<form id="createCourse" class="formgrid">
  <label class="wide">교육명<input name="title" maxlength="200" required placeholder="예: 화학물질 취급 및 MSDS 교육"></label>
  <label class="wide">교육내용<textarea name="description" rows="3" placeholder="평가에 반영할 교육 주제를 입력해 주세요."></textarea></label>
  <label>대상 사업장<select name="plant" required><option value="">사업장 선택</option><option>1공장</option><option>2공장</option><option value="전체">1·2공장 전체</option></select></label>
  <label>배정 범위<select name="target"><option value="all">선택 사업장 전체 직원</option><option value="departments">부서 선택 (복수 가능)</option></select></label>
  <div class="wide" id="registrationDepartments" hidden>
   <div id="registrationDepartmentList" class="assign-departments" role="group" aria-label="수강 대상 부서"></div>
  </div>
  <p class="note wide" id="registrationCount" aria-live="polite"></p>
  <label>교육월<input type="month" name="education_month" required value="${month}"></label>
  ${scheduleFields()}
  <label>교육 구분<select name="course_type"><option>정기안전보건교육</option><option>채용 시 교육</option><option>특별안전보건교육</option><option>관리감독자교육</option><option>법정교육</option><option>자체교육</option></select></label>
  ${videoFields(true)}
  <label>영상별 필수 시청 비율 (%)<input name="required_watch_percent" type="number" min="0" max="100" value="80" required></label>
  <p class="note">영상이 여러 개면 각 영상에 적용됩니다. 0%는 시청 기준을 적용하지 않습니다.</p>
  <details class="wide"><summary>교육시간·평가 기준 등 추가 설정</summary>
   <div class="formgrid">
    <label>교육실시일<input type="date" name="course_date"></label>
    <label>교육시간(분)<input name="duration_minutes" type="number" min="0" max="10000" value="60" required></label>
    <label>평가 합격점수<input name="passing_score" type="number" min="0" max="100" value="80" required></label>
    <label>평가 응시횟수<input name="attempt_limit" type="number" min="1" max="20" value="3" required></label>
    <label class="wide row"><input name="continuous" type="checkbox"> 같은 사업장·부서의 신규 직원도 자동 배정하는 상시교육</label>
   </div>
  </details>
  <div class="wide notice">
   <b id="registrationQuiz"></b>
   <p class="note">공개 안전 지침을 바탕으로 만든 기본 문항입니다. 영상 분석이나 법령 검토는 수행하지 않습니다. 등록 후 필요할 때 문항을 직접 추가할 수 있습니다.</p>
   <details><summary>기본 문항 미리보기</summary><ol id="registrationQuestions"></ol></details>
  </div>
  <div class="wide actions"><button class="primary">교육 등록</button></div>
  <p class="note wide">등록하면 선택한 직원에게 교육이 배정되고 평가가 바로 공개됩니다.</p>
 </form>`;
}

export function syncRegistrationForm(form){
 const fields=form.elements;
 const plant=fields.plant.value;
 const staff=S.staff.filter(s=>s.active&&s.role==='employee'&&plant&&(plant==='전체'||s.plant===plant));
 const list=$('registrationDepartmentList');
 const departmentMode=fields.target.value==='departments';
 $('registrationDepartments').hidden=!departmentMode;
 if(list.dataset.plant!==plant){
  const names=[...new Set(staff.map(s=>s.department).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  list.innerHTML=names.map(name=>'<label class="assign-department-item"><input type="checkbox" name="target_departments" value="'+esc(name)+'"><span>'+esc(name)+'</span></label>').join('')
   ||'<p class="note">선택할 수 있는 부서가 없습니다.</p>';
  list.dataset.plant=plant;
 }
 const selected=new Set(new FormData(form).getAll('target_departments'));
 const count=departmentMode?staff.filter(s=>selected.has(s.department)).length:staff.length;
 $('registrationCount').textContent=plant?'배정 예정 '+count+'명':'수강 대상 사업장을 선택해 주세요.';
 const assessment=basicAssessment(fields.title.value,fields.description.value);
 $('registrationQuiz').textContent=assessment.fallback?'주제에 맞는 기본 문항을 찾지 못해 현장 안전 공통 문항 5개를 사용합니다.':assessment.label+' 기본 평가 5문항';
 $('registrationQuestions').innerHTML=assessment.questions.map(q=>'<li>'+esc(q.prompt)+'</li>').join('');
}

export async function registerCourse(form){
 const fd=new FormData(form),v=key=>String(fd.get(key)??'').trim();
 const course={
  title:v('title'),description:v('description'),course_type:v('course_type'),plant:v('plant'),
  ...scheduleValues(fd),education_month:v('education_month'),course_date:v('course_date')||null,
  duration_minutes:Number(v('duration_minutes')),required_watch_percent:Number(v('required_watch_percent')),
  passing_score:Number(v('passing_score')),attempt_limit:Number(v('attempt_limit')),continuous:fd.has('continuous')
 };
 if(!course.title)throw Error('교육명을 입력해 주세요.');
 const departments=v('target')==='departments'?fd.getAll('target_departments'):null;
 if(departments?.length===0)throw Error('배정할 부서를 하나 이상 선택해 주세요.');
 const video=videoFromForm(form,'교육영상');
 const assessment=basicAssessment(course.title,course.description);
 const args={p_course:course,p_departments:departments,p_video:video,p_questions:assessment.questions};
 const key=JSON.stringify(args);
 if(lastRequest?.key!==key)lastRequest={key,id:crypto.randomUUID()};
 const requestId=lastRequest.id;
 await verifyAdminSession();
 const result=check(await db.rpc('edu_register_course',{...args,p_request_id:requestId}));
 S.courseId=result.id;
 try{await loadData();}
 catch{throw Error('교육은 등록되었습니다. 목록을 불러오지 못했습니다. 같은 내용으로 다시 눌러 결과를 확인해 주세요.');}
 notice('교육 공개 및 '+result.assigned+'명 배정이 완료되었습니다. '+assessment.label+' 평가 5문항이 등록되었습니다.');
 return 'editor';
}

