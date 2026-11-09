import {db,S,$,esc,check,notice,modal,date,badge,filename,csv,parseCSV,download,all,loadData,pageHeader,panel,courseById,enrollFor,verifyAdminSession,pause} from './core_rev.12.js';
const kpi=(label,value)=>'<div class="kpi"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>';
export function renderAdmin(page){
 if(page==='staff')return staffView();
 if(page==='courses')return coursesView();
 if(page==='editor')return editorView();
 if(page==='records')return recordsView();
 if(page==='archives')return archiveView();
 let active=S.staff.filter(x=>x.role==='employee'&&x.active);
 let d=pageHeader('FCT 교육관리 현황','1공장·2공장 통합 교육 현황');
 const waiting=(S.resetRequests||[]).length;
 if(waiting)d+=panel('관리자 확인 요청','<div class="between"><b>비밀번호 초기화 요청 '+waiting+'건</b><button class="primary" data-admin="go-staff">직원관리에서 처리</button></div>');
 d+='<div class="grid">'+kpi('전체 직원',active.length+'명')+kpi('진행 교육',S.courses.filter(c=>c.status==='published').length+'건')+kpi('교육 배정',S.enroll.length+'건')+kpi('수료 완료',S.enroll.filter(e=>e.status==='completed').length+'건')+'</div>';
 d+=panel('사업장별 직원','<div class="grid">'+kpi('1공장',active.filter(x=>x.plant==='1공장').length+'명')+kpi('2공장',active.filter(x=>x.plant==='2공장').length+'명')+kpi('미수료',S.enroll.filter(e=>e.status!=='completed').length+'건')+kpi('전체 과정',S.courses.length+'건')+'</div>');
 d+=panel('교육과정',S.courses.length?S.courses.map(c=>'<div class="course-card between"><div><b>'+esc(c.title)+'</b><p>'+esc(c.education_month)+' · '+esc(c.plant)+' · 수료 '+enrollFor(c.id).filter(e=>e.status==='completed').length+'/'+enrollFor(c.id).length+'명</p></div><button class="small outline" data-admin="open" data-id="'+c.id+'">관리</button></div>').join(''):'<p>등록된 교육과정이 없습니다. 새 교육과정을 등록해 주세요.</p>');
 return d;
}
function staffView(){
 let people=S.staff.filter(s=>s.role==='employee');
 let d=pageHeader('직원관리','직원 등록 초기 비밀번호 1111 · 비밀번호 찾기 요청만 관리자 처리');
 const look=new Map(people.map(x=>[x.id,x]));
 const waiting=(S.resetRequests||[]).map(r=>{
  const e=look.get(r.staff_id);
  return e?'<div class="course-card between"><div><b>비밀번호 초기화 요청 · '+esc(e.full_name)+'</b><p>'+esc(e.employee_no)+' · '+esc(e.plant)+' · '+date(r.requested_at)+'</p></div><button class="small danger" data-admin="staff-reset" data-id="'+esc(e.id)+'">1111로 초기화</button></div>':'';
 }).join('');
 if(waiting)d+=panel('비밀번호 찾기 요청',waiting+'<p class="note">비밀번호 분실 요청한 직원만 확인한 뒤 1111로 초기화해 주세요.</p>');

 d+=panel('직원 등록','<form id="addStaff" class="formgrid"><label>사번<input name="employee_no" required></label><label>성명<input name="full_name" required></label><label>공장<select name="plant"><option>1공장</option><option>2공장</option></select></label><label>부서<input name="department" required placeholder="경영지원 / 품질 / 전반 / 박막 / 가공 / 소성"></label><label>입사일<input name="hired_on" type="date"></label><div class="actions"><button class="primary">직원 등록</button></div></form><p class="note" style="margin-top:10px">초기 비밀번호 : <b>1111</b></p><hr class="separator"><h3>엑셀 일괄 등록</h3><div class="actions"><button class="outline" data-admin="staff-template">등록 양식 다운로드</button><button class="outline" data-admin="staff-export">직원명부 다운로드</button></div><div class="actions" style="margin-top:12px"><input type="file" id="staffCSV" accept=".csv,text/csv"><button data-admin="staff-import">CSV 파일 일괄 등록</button></div><p class="note">Excel에서 CSV UTF-8 형식으로 저장한 직원명부를 업로드할 수 있습니다.</p>');
 let table='<label class="wide">직원 검색 (사번·성명·부서)<input id="staffFilter" type="search" placeholder="사번 또는 이름으로 검색"></label><div class="table-scroll"><table><thead><tr><th>사번</th><th>성명</th><th>사업장</th><th>부서</th><th>계정</th><th>관리</th></tr></thead><tbody>'+people.map(s=>'<tr data-staff-row data-key="'+esc([s.employee_no,s.full_name,s.department].join(' ').toLowerCase())+'"><td>'+esc(s.employee_no)+'</td><td>'+esc(s.full_name)+'</td><td>'+esc(s.plant)+'</td><td>'+esc(s.department)+'</td><td>'+esc(s.active?'재직':'비활성')+'</td><td><div class="actions"><button class="small outline" data-admin="staff-edit" data-id="'+s.id+'">수정</button><button class="small '+((S.resetRequests||[]).some(r=>r.staff_id===s.id)?'danger':s.auth_user_id?'reset-subtle':'outline')+'" data-admin="staff-reset" data-id="'+s.id+'">1111로 초기화</button></div></td></tr>').join('')+'</tbody></table></div>';
 return d+panel('직원명부 ('+people.length+'명)',table);
}
function coursesView(){
 let form='<form id="createCourse" class="formgrid"><label class="wide">교육명<input name="title" required placeholder="2026년 하반기 정기안전보건교육"></label><label>교육 구분<select name="course_type"><option>정기안전보건교육</option><option>채용 시 교육</option><option>특별안전보건교육</option><option>관리감독자교육</option><option>법정교육</option><option>자체교육</option></select></label><label>사업장<select name="plant"><option>전체</option><option>1공장</option><option>2공장</option></select></label><label>교육월<input type="month" name="education_month" required value="'+new Date().toISOString().slice(0,7)+'"></label><label>교육실시일<input type="date" name="course_date"></label><label>교육시간(분)<input type="number" name="duration_minutes" value="60" min="0"></label><label>필수 영상시간(분)<input type="number" name="required_watch_minutes" value="0" min="0"></label><label>평가 합격점수<input type="number" name="passing_score" value="80" min="0" max="100"></label><label>평가 응시횟수<input type="number" name="attempt_limit" value="3" min="1" max="20"></label><label class="wide">교육내용<textarea name="description" rows="3"></textarea></label><label class="wide row"><input type="checkbox" name="continuous"> 신규 직원에게 자동 배정하는 상시교육</label><div class="wide actions"><button class="primary">교육과정 생성</button></div></form>';
 let table='<div class="table-scroll"><table><thead><tr><th>교육명</th><th>교육월</th><th>공장</th><th>대상</th><th>수료</th><th>상태</th><th>관리</th></tr></thead><tbody>'+S.courses.map(c=>{let e=enrollFor(c.id);return '<tr><td>'+esc(c.title)+'</td><td>'+esc(c.education_month)+'</td><td>'+esc(c.plant)+'</td><td>'+e.length+'</td><td>'+e.filter(x=>x.status==='completed').length+'</td><td>'+badge(c.status)+'</td><td><button class="small primary" data-admin="open" data-id="'+c.id+'">설정</button></td></tr>'}).join('')+'</tbody></table></div>';
 return pageHeader('교육과정','교육 등록·교육자료·유튜브·평가·배정')+panel('새 교육 등록',form)+panel('교육과정 목록',table);
}
function editorView(){
 let c=courseById(S.courseId);if(!c)return pageHeader('교육 상세','교육과정을 선택해 주세요.');
 let assigned=enrollFor(c.id),complete=assigned.filter(e=>e.status==='completed').length;
 let d=pageHeader('교육 상세 관리',c.title);
 d+=panel('교육정보','<div class="between"><h3>'+esc(c.title)+'</h3>'+badge(c.status)+'</div><p>'+esc(c.description)+'</p><p class="small">교육월 '+esc(c.education_month)+' · 교육시간 '+c.duration_minutes+'분 · 필수 시청시간 '+c.required_watch_minutes+'분 · 수료 '+complete+'/'+assigned.length+'명</p><div class="actions"><button class="outline" data-admin="edit-course">기본정보 수정</button>'+(c.status==='draft'?'<button class="primary" data-admin="publish">교육 공개</button>':'')+'</div>');
 const site=c.plant==='2공장'?'2공장':'1공장';
 const scopeDefault=site;
 d+=panel('수강 대상자 배정','<form id="assignCourse" class="formgrid">'+
   '<label>배정 대상<select name="scope" id="assignScope">'+
   '<option value="1공장" '+(scopeDefault==='1공장'?'selected':'')+' '+(c.plant==='2공장'?'disabled':'')+'>1공장 전체</option>'+
   '<option value="2공장" '+(scopeDefault==='2공장'?'selected':'')+' '+(c.plant==='1공장'?'disabled':'')+'>2공장 전체</option>'+
   '<option value="department">부서별 선택 (여러 부서)</option></select></label>'+
   '<div id="assignDepartmentArea" class="wide formgrid" hidden>'+
     '<label>공장<select name="deptPlant" id="assignPlant">'+
       '<option value="1공장" '+(site==='1공장'?'selected':'')+' '+(c.plant==='2공장'?'disabled':'')+'>1공장</option>'+
       '<option value="2공장" '+(site==='2공장'?'selected':'')+' '+(c.plant==='1공장'?'disabled':'')+'>2공장</option></select></label>'+
     '<div class="wide"><p class="note">배정할 부서를 여러 개 선택해 주세요.</p>'+
     '<div class="assign-departments" id="assignDepartmentList" role="group" aria-label="부서 복수 선택"></div></div>'+
   '</div>'+
   '<p class="note wide" id="assignPreview">대상 인원을 확인해 주세요.</p>'+
   '<div class="wide actions"><button class="primary" id="assignSubmit">선택한 대상 배정</button></div></form>'+
   '<p class="note">1공장 전체, 2공장 전체 또는 한 공장의 여러 부서를 동시에 선택할 수 있습니다. 이미 배정된 직원은 중복 처리하지 않습니다.</p>');
 d+=panel('YouTube 교육영상','<form id="addVideo" class="formgrid"><label>영상명<input name="title" required></label><label>유튜브 주소<input name="url" required placeholder="https://youtu.be/..."></label><label>영상 길이(분)<input name="minutes" type="number" value="60" min="1"></label><div class="actions"><button>영상 추가</button></div></form><div id="editorVideos"></div>');
 d+=panel('교육자료','<form id="addMaterial" class="formgrid"><label>자료명<input name="title" required></label><label>유형<select name="kind"><option value="note">텍스트 자료</option><option value="link">외부 링크</option><option value="file">첨부파일(900KB 이하)</option></select></label><label class="wide">자료 내용 / URL<textarea name="body"></textarea></label><label class="wide">파일<input name="file" type="file"></label><div class="wide actions"><button>자료 추가</button></div></form><div id="editorMaterials"></div>');
 d+=panel('평가문제 등록','<form id="addQuestion" class="formgrid"><label class="wide">평가문제<input name="prompt" required></label><label class="wide">선택지 (줄바꿈으로 2~6개)<textarea name="choices" placeholder="첫 번째 선택지&#10;두 번째 선택지" required></textarea></label><label>정답 번호(1부터)<input name="answer" type="number" min="1" max="6" value="1"></label><label>문제 해설<input name="explanation"></label><div class="wide actions"><button>평가문제 추가</button></div></form><div id="editorQuestions"></div>');
 setTimeout(()=>{loadEditor().catch(e=>notice('과정 상세 조회 실패: '+e.message,true));},0);return d;
}
export function assignmentCandidates(course,scope,plant,departments){
 if(!course)return [];
 let staff=S.staff.filter(s=>s.role==='employee'&&s.active);
 if(scope==='1공장'||scope==='2공장')staff=staff.filter(s=>s.plant===scope);
 else if(scope==='department'){
  if(!['1공장','2공장'].includes(plant)||!Array.isArray(departments)||!departments.length)return [];
  const selected=new Set(departments);
  staff=staff.filter(s=>s.plant===plant&&selected.has(s.department));
 }else return [];
 if(course.plant!=='전체')staff=staff.filter(s=>s.plant===course.plant);
 return staff;
}
export function syncAssignmentForm(){
 const f=$('assignCourse'),course=courseById(S.courseId);
 if(!f||!course)return;
 const scope=f.elements.namedItem('scope')?.value||'';
 const plant=f.elements.namedItem('deptPlant')?.value||'';
 const deptArea=$('assignDepartmentArea'),list=$('assignDepartmentList');
 if(!deptArea||!list)return;
 deptArea.hidden=scope!=='department';
 // Rebuild the choices only when the course or plant changes, not on checkbox clicks.
 if(list.dataset.plant!==plant||list.dataset.course!==course.id){
  const options=[...new Set(S.staff.filter(s=>s.role==='employee'&&s.active&&s.plant===plant&&
   (course.plant==='전체'||s.plant===course.plant)).map(s=>s.department).filter(Boolean))]
   .sort((a,b)=>a.localeCompare(b,'ko'));
  list.innerHTML=options.map(name=>'<label class="assign-department-item"><input type="checkbox" name="departments" value="'+esc(name)+'"><span>'+esc(name)+'</span></label>').join('')
    ||'<p class="note">선택 가능한 부서가 없습니다.</p>';
  list.dataset.plant=plant;
  list.dataset.course=course.id;
 }
 const selected=[...f.querySelectorAll('input[name="departments"]:checked')].map(el=>el.value);
 const matches=assignmentCandidates(course,scope,plant,selected);
 const assigned=new Set(S.enroll.filter(e=>e.course_id===course.id).map(e=>e.staff_id));
 const count=matches.filter(s=>!assigned.has(s.id)).length;
 const preview=$('assignPreview'),btn=$('assignSubmit');
 if(preview)preview.textContent=(scope==='department'?'선택한 부서 '+selected.length+'개 · ':'')
   +'대상 '+matches.length+'명 / 신규 배정 '+count+'명';
 if(btn)btn.disabled=count===0;
}
export async function loadEditor(){
 let id=S.courseId;if(!id)return;
 let [videos,materials,questions,answers]=await Promise.all([all('edu_videos','*',q=>q.eq('course_id',id)),all('edu_materials','*',q=>q.eq('course_id',id)),all('edu_questions','*',q=>q.eq('course_id',id).order('sort_order')),all('edu_answers')]);
 let v=$('editorVideos'),m=$('editorMaterials'),q=$('editorQuestions');if(!v||S.courseId!==id)return;
 v.innerHTML=videos.map(s=>'<div class="material between"><b>'+esc(s.title)+'</b><button class="small danger" data-admin="delete-video" data-id="'+s.id+'">삭제</button></div>').join('');
 m.innerHTML=materials.map(s=>'<div class="material between"><b>'+esc(s.title)+'</b><button class="small danger" data-admin="delete-material" data-id="'+s.id+'">삭제</button></div>').join('');
 q.innerHTML=questions.map(s=>'<div class="material between"><b>'+esc(s.prompt)+'</b><span class="small">정답 '+((answers.find(a=>a.question_id===s.id)?.correct_index??0)+1)+'번</span><button class="small danger" data-admin="delete-question" data-id="'+s.id+'">삭제</button></div>').join('');
}
function recordsView(){
 const c=courseById(S.courseId)||S.courses[0],staff=new Map(S.staff.map(s=>[s.id,s]));
 let controls='<div class="filter"><select id="reportCourse"><option value="">교육 선택</option>'+S.courses.map(x=>'<option value="'+x.id+'" '+(x.id===c?.id?'selected':'')+'>'+esc(x.title)+'</option>').join('')+'</select><button class="outline" data-admin="records-csv">엑셀 다운로드</button><button class="primary" data-admin="records-html">교육일지 다운로드</button><button class="outline" data-admin="records-print">PDF 인쇄</button></div>';
 if(c){
  let en=enrollFor(c.id),rows=en.map(e=>{let s=staff.get(e.staff_id),score=S.attempts.filter(x=>x.enrollment_id===e.id).sort((a,b)=>b.submitted_at.localeCompare(a.submitted_at))[0];return '<tr><td>'+esc(s?.employee_no)+'</td><td>'+esc(s?.full_name)+'</td><td>'+esc(s?.plant)+'</td><td>'+esc(s?.department)+'</td><td>'+badge(e.status)+'</td><td>'+(score?.score??'-')+'</td><td>'+date(e.completed_at)+'</td></tr>'}).join('');
  controls+='<p>배정 '+en.length+'명 · 수료 '+en.filter(x=>x.status==='completed').length+'명</p><div class="table-scroll"><table><thead><tr><th>사번</th><th>성명</th><th>공장</th><th>부서</th><th>상태</th><th>평가점수</th><th>수료일</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
 }
 return pageHeader('이수현황 · 교육일지','평가·서명·교육수료 기록 조회와 다운로드')+panel('교육별 현황',controls);
}
function archiveView(){
 let d=pageHeader('교육별 백업 · 정리','전원 수료 → ZIP 보관 → 파일 검증 → 상세기록 정리');
 d+='<div class="notice">백업파일을 내려받아도 원본 데이터는 삭제되지 않습니다. ZIP 파일을 다시 선택하여 검증한 뒤 외부 보관 여부를 확인하고 상세 기록을 정리할 수 있습니다.</div>';
 let items=S.courses.map(c=>{let en=enrollFor(c.id),done=en.filter(e=>e.status==='completed').length;return '<div class="course-card between"><div><b>'+esc(c.title)+'</b><p>수료 '+done+'/'+en.length+'명</p></div><button class="outline" data-admin="archive" data-id="'+c.id+'" '+(en.length===0||done!==en.length?'disabled':'')+'>백업·정리</button></div>'}).join('');
 return d+panel('교육별 백업 목록',items||'<p>등록된 교육과정이 없습니다.</p>');
}
export async function adminSubmit(form){
 let fd=new FormData(form),v=k=>String(fd.get(k)||'').trim();
 if(form.id==='addStaff'){
  check(await db.rpc('edu_create_staff',{p_employee_no:v('employee_no'),p_name:v('full_name'),p_plant:v('plant'),p_department:v('department'),p_hired_on:v('hired_on')||null}));
  await loadData();notice('직원 등록이 완료되었습니다.');return 'staff';
 }
 if(form.id==='createCourse'){
  let d={title:v('title'),course_type:v('course_type'),plant:v('plant'),education_month:v('education_month'),course_date:v('course_date')||null,duration_minutes:+v('duration_minutes')||0,required_watch_minutes:+v('required_watch_minutes')||0,passing_score:+v('passing_score')||80,attempt_limit:+v('attempt_limit')||3,description:v('description'),continuous:fd.has('continuous'),status:'draft'};
  let row=check(await db.from('edu_courses').insert(d).select('id').single());S.courseId=row.id;await loadData();notice('교육과정이 생성되었습니다.');return 'editor';
 }
 if(form.id==='assignCourse'){
  const c=courseById(S.courseId);
  if(!c)throw Error('교육과정이 선택되지 않았습니다.');
  const scope=v('scope'),plant=v('deptPlant');
  const departments=fd.getAll('departments').map(x=>String(x).trim()).filter(Boolean);
  if(scope==='department'&&!departments.length)throw Error('배정할 부서를 하나 이상 선택해 주세요.');
  const all=assignmentCandidates(c,scope,plant,departments);
  const assigned=new Set(S.enroll.filter(e=>e.course_id===c.id).map(e=>e.staff_id));
  const fresh=all.filter(person=>!assigned.has(person.id));
  if(!fresh.length)throw Error('새로 배정할 직원이 없습니다. 공장과 부서를 확인해 주세요.');
  const target=scope==='department'?plant+' '+departments.join('·'):scope+' 전체';
  if(!confirm(target+' 직원 '+fresh.length+'명에게 교육을 배정하시겠습니까?'))return null;
  const n=check(await db.rpc('edu_assign_course',{p_course_id:c.id,p_staff_ids:fresh.map(x=>x.id)}));
  await loadData();
  notice('교육 배정이 완료되었습니다. 신규 '+n+'명');
  return 'editor';
 }
 if(form.id==='addVideo'){
  const m=v('url').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  const id=m?.[1]||(/^[A-Za-z0-9_-]{11}$/.test(v('url'))?v('url'):null);
  if(!id)throw Error('YouTube 주소를 확인해 주세요.');
  await verifyAdminSession();
  // Server-side RPC checks the administrator JWT before inserting, rather
  // than sending an unchecked direct INSERT that may hit RLS on session sync.
  const args={p_course_id:S.courseId,p_title:v('title'),p_youtube_id:id,p_duration_seconds:+v('minutes')*60};
  let result=await db.rpc('edu_add_video',args);
  // Only retry a confirmed authorization rejection (the insert did not run).
  // Never retry an ambiguous network failure, which could duplicate records.
  if(result?.error&&/관리자 권한이 확인되지|row.level security|permission denied/i.test(result.error.message||'')){
   await pause(350);
   await verifyAdminSession();
   result=await db.rpc('edu_add_video',args);
  }
  check(result);
  form.reset();
  await loadEditor();
  notice('교육영상이 추가되었습니다.');
  return null;
 }
 if(form.id==='addMaterial'){
  let kind=v('kind'),body=v('body'),data={course_id:S.courseId,title:v('title'),kind,body_text:kind==='note'?body:'',external_url:kind==='link'?body:null};
  if(kind==='link'&&!/^https?:\/\//.test(body))throw Error('자료 링크는 https:// 형식으로 입력해 주세요.');
  if(kind==='file'){
   let file=fd.get('file');if(!(file instanceof File)||file.size<1||file.size>900000)throw Error('900KB 이하의 파일을 선택해 주세요.');
   data.body_text=file.name;data.file_data_uri=await new Promise((resolve,reject)=>{let r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
  }
  check(await db.from('edu_materials').insert(data));form.reset();await loadEditor();notice('교육자료가 추가되었습니다.');return null;
 }
 if(form.id==='addQuestion'){
  let choices=v('choices').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),answer=+v('answer')-1;
  check(await db.rpc('edu_add_question',{p_course_id:S.courseId,p_prompt:v('prompt'),p_choices:choices,p_answer_index:answer,p_explanation:v('explanation')}));form.reset();await loadEditor();notice('평가문제가 등록되었습니다.');return null;
 }
 if(form.id==='staffEdit'){
  check(await db.from('edu_staff').update({full_name:v('full_name'),plant:v('plant'),department:v('department'),active:v('active')==='true'}).eq('id',form.dataset.id));$('dialog').close();await loadData();notice('직원정보가 수정되었습니다.');return 'staff';
 }
 if(form.id==='courseEdit'){
  check(await db.from('edu_courses').update({title:v('title'),description:v('description'),duration_minutes:+v('duration_minutes'),required_watch_minutes:+v('required_watch_minutes')}).eq('id',S.courseId));$('dialog').close();await loadData();notice('교육정보가 수정되었습니다.');return 'editor';
 }
 return null;
}
export async function adminClick(btn){
 const action=btn.dataset.admin,id=btn.dataset.id;
 if(action==='go-staff')return 'staff';
 if(action==='open'){S.courseId=id;return 'editor';}
 if(action==='staff-template'){download('FCT_직원등록양식_rev.11.csv',csv([['employee_no','full_name','plant','department','hired_on'],['F001','예시직원','2공장','전반','2026-11-09']]),'text/csv;charset=utf-8');return null;}
 if(action==='staff-export'){download('FCT_직원명부_rev.11.csv',csv([['사번','성명','공장','부서','입사일','상태'],...S.staff.filter(s=>s.role==='employee').map(s=>[s.employee_no,s.full_name,s.plant,s.department,s.hired_on||'',s.active?'재직':'비활성'])]),'text/csv;charset=utf-8');return null;}
 if(action==='staff-import'){
  let f=$('staffCSV')?.files?.[0];if(!f)throw Error('CSV 파일을 선택해 주세요.');
  let rows=parseCSV(await f.text()),headers=(rows.shift()||[]).map(x=>x.trim()),ix=k=>headers.indexOf(k),out=[['사번','성명','공장','부서','초기비밀번호','처리']];
  if(['employee_no','full_name','plant','department'].some(k=>ix(k)<0))throw Error('직원등록 양식과 열 이름을 확인해 주세요.');
  for(let row of rows.slice(0,500)){
   const val=k=>row[ix(k)]?.trim()||'';
   try{let p={p_employee_no:val('employee_no'),p_name:val('full_name'),p_plant:val('plant'),p_department:val('department'),p_hired_on:val('hired_on')||null};check(await db.rpc('edu_create_staff',p));out.push([p.p_employee_no,p.p_name,p.p_plant,p.p_department,'1111','완료']);}
   catch(e){out.push([val('employee_no'),val('full_name'),val('plant'),val('department'),'','실패: '+e.message]);}
  }
  download('FCT_직원등록결과_rev.11.csv',csv(out),'text/csv;charset=utf-8');await loadData();notice('직원 등록이 완료되었습니다. 초기 비밀번호는 1111입니다.');return 'staff';
 }
 if(action==='staff-reset'){
  let s=S.staff.find(x=>x.id===id);if(!s||!confirm(s.full_name+' 직원의 기존 로그인을 해제하고 초기 비밀번호로 재설정하시겠습니까?'))return null;
  check(await db.rpc('edu_reset_staff',{p_staff_id:id}));
  check(await db.rpc('edu_resolve_password_request',{p_staff_id:id}));
  await loadData();notice('초기 비밀번호로 재설정되었습니다.');return 'staff';
 }
 if(action==='staff-edit'){
  let s=S.staff.find(x=>x.id===id);modal('직원정보 수정','<form id="staffEdit" class="stack" data-id="'+s.id+'"><label>성명<input name="full_name" value="'+esc(s.full_name)+'"></label><label>사업장<select name="plant"><option '+(s.plant==='1공장'?'selected':'')+'>1공장</option><option '+(s.plant==='2공장'?'selected':'')+'>2공장</option></select></label><label>부서<input name="department" value="'+esc(s.department)+'"></label><label>상태<select name="active"><option value="true" '+(s.active?'selected':'')+'>재직</option><option value="false" '+(!s.active?'selected':'')+'>비활성</option></select></label><button class="primary">저장</button></form>');return null;
 }
 if(action==='publish'){if(!confirm('이 교육과정을 공개하시겠습니까?'))return null;check(await db.from('edu_courses').update({status:'published'}).eq('id',S.courseId));await loadData();notice('교육과정이 공개되었습니다.');return 'editor';}
 if(action==='edit-course'){
  let c=courseById(S.courseId);modal('교육정보 수정','<form class="stack" id="courseEdit"><label>교육명<input name="title" value="'+esc(c.title)+'"></label><label>교육내용<textarea name="description">'+esc(c.description)+'</textarea></label><label>교육시간<input name="duration_minutes" type="number" min="0" value="'+c.duration_minutes+'"></label><label>필수 시청시간<input name="required_watch_minutes" type="number" min="0" value="'+c.required_watch_minutes+'"></label><button class="primary">저장</button></form>');return null;
 }
 if(action.startsWith('delete-')){
  let table={'delete-video':'edu_videos','delete-material':'edu_materials','delete-question':'edu_questions'}[action];if(!confirm('선택한 항목을 삭제하시겠습니까?'))return null;
  check(await db.from(table).delete().eq('id',id));await loadEditor();notice('항목이 삭제되었습니다.');return null;
 }
 return null;
}
