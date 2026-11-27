import {db,S,$,esc,check,notice,loadData,verifyAdminSession} from './core_rev.12.js';
import {videoFields,videoFromForm} from './youtube_rev.14.js';

import {koreaToday,scheduleFields,scheduleValues} from './schedule_rev.15.js';

let lastRequest;
let draftQuestions=[];
let draftSourceKey='';
let draftOrigin='';
let generationPromise=null;
const quizEndpoints=[
 'https://br-misty-bar-azvo7ikx-fctquizv2.compute.c-3.ap-southeast-1.aws.neon.tech/',
 'https://br-misty-bar-azvo7ikx-fctquizgen.compute.c-3.ap-southeast-1.aws.neon.tech/'
];
const sourceKey=form=>JSON.stringify([String(form.elements.title?.value||'').trim(),String(form.elements.description?.value||'').trim()]);
function draftSummary(form){
 const host=$('registrationQuiz'),hint=$('registrationQuizHelp');
 if(!host||!hint)return;
 const old=draftQuestions.length>0&&sourceKey(form)!==draftSourceKey;
 host.textContent=generationPromise?'교육내용을 바탕으로 평가문제를 생성하고 있습니다…'
  :draftQuestions.length?('평가문제 '+draftQuestions.length+'개 · '+draftOrigin+(old?' · 교육내용 변경됨':''))
  :'교육 주제·내용을 입력하면 평가문제 초안을 AI가 작성합니다.';
 hint.textContent=draftQuestions.length
  ?(old?'교육내용이 변경되었습니다. 문제를 확인하고 필요하면 다시 생성해 주세요.':'질문, 선택지, 정답, 해설을 자유롭게 수정한 뒤 교육을 등록하세요.')
  :'주제만 입력해도 만들 수 있지만, 구체적인 교육내용을 입력하면 해당 내용에 더 맞는 문제가 생성됩니다.';
}
function questionCard(q,i){
 const choiceFields=q.choices.map((value,k)=>'<label>선택지 '+(k+1)+'<input data-quiz-field="choice" data-quiz-index="'+i+'" data-quiz-choice="'+k+'" value="'+esc(value)+'" required></label>').join('');
 return '<section class="quiz-edit-card" data-quiz-card="'+i+'"><div class="between"><strong>문제 '+(i+1)+'</strong>'+
  '<button type="button" class="small course-delete" data-quiz-action="remove" data-index="'+i+'">문제 삭제</button></div>'+
  '<label>질문<textarea rows="2" data-quiz-field="prompt" data-quiz-index="'+i+'" required>'+esc(q.prompt)+'</textarea></label>'+
  '<div class="quiz-choice-grid">'+choiceFields+'</div>'+
  '<div class="quiz-edit-bottom"><label>정답<select data-quiz-field="answer" data-quiz-index="'+i+'">'+
  q.choices.map((v,k)=>'<option value="'+k+'" '+(q.answer===k?'selected':'')+'>'+(k+1)+'번</option>').join('')+
  '</select></label><label>해설<textarea rows="2" data-quiz-field="explanation" data-quiz-index="'+i+'">'+esc(q.explanation)+'</textarea></label></div></section>';
}
export function renderRegistrationQuiz(){
 const form=$('createCourse'),host=$('registrationQuestionEditor');
 if(!form||!host)return;
 host.innerHTML=draftQuestions.map(questionCard).join('');
 const add=$('registrationAddQuestion');
 if(add)add.disabled=draftQuestions.length>=5;
 draftSummary(form);
}
export function editRegistrationQuizField(el){
 const i=Number(el.dataset.quizIndex),q=draftQuestions[i];
 if(!q)return;
 const field=el.dataset.quizField;
 if(field==='choice')q.choices[Number(el.dataset.quizChoice)]=el.value;
 else if(field==='answer')q.answer=Number(el.value);
 else if(['prompt','explanation'].includes(field))q[field]=el.value;
}
export function registrationQuizAction(action,index){
 if(action==='add'&&draftQuestions.length<5){
  draftQuestions.push({prompt:'',choices:['','','',''],answer:0,explanation:''});
  draftOrigin='수동 작성';
 }else if(action==='remove'&&index>=0&&index<draftQuestions.length){
  draftQuestions.splice(index,1);
 }else return;
 const form=$('createCourse');
 if(form)draftSourceKey=sourceKey(form);
 renderRegistrationQuiz();
}
async function signedAdminToken(){
 const auth=db.auth;
 // Neon Managed Auth supplies a signed JWT in session.token (not only
 // session.access_token). Always refresh the session before using it.
 const sess=await auth.getSession();
 if(sess?.error)throw Error('로그인 인증을 확인하지 못했습니다. 다시 로그인해 주세요.');
 let token=sess?.data?.session?.token||sess?.data?.session?.access_token||'';
 if(!token&&typeof auth.getJWTToken==='function'){
  const result=await auth.getJWTToken();
  token=typeof result==='string'?result:(result?.data?.token||result?.token||result?.data?.access_token||'');
 }
 if(!token&&typeof auth.token==='function'){
  const result=await auth.token();
  token=typeof result==='string'?result:(result?.data?.token||result?.token||'');
 }
 if(String(token).split('.').length!==3)
  throw Error('AI 평가문제 생성을 위한 로그인 인증을 확인할 수 없습니다. 다시 로그인해 주세요.');
 return token;
}
function validatedQuestions(){
 if(draftQuestions.length<3||draftQuestions.length>5)throw Error('평가문제는 3~5개를 준비해 주세요.');
 return draftQuestions.map((q,i)=>{
  const prompt=String(q.prompt||'').trim();
  const choices=q.choices.map(c=>String(c||'').trim());
  const answer=Number(q.answer);
  const explanation=String(q.explanation||'').trim();
  if(prompt.length<8||choices.length<2||choices.some(x=>!x)||new Set(choices).size!==choices.length||
    !Number.isInteger(answer)||answer<0||answer>=choices.length)
   throw Error((i+1)+'번 문제의 질문, 선택지, 정답을 확인해 주세요.');
  return {prompt,choices,answer,explanation};
 });
}
export async function generateRegistrationQuestions(form=$('createCourse'),{auto=false}={}){
 if(!form)return;
 if(generationPromise)return generationPromise;
 const title=String(form.elements.title?.value||'').trim();
 const content=String(form.elements.description?.value||'').trim();
 if(title.length<2){if(auto)return;throw Error('교육 주제를 2자 이상 입력해 주세요.');}
 if(auto&&(!content||content.length<15||draftQuestions.length))return;
 const now=sourceKey(form);
 const run=async()=>{
  await verifyAdminSession();
  const token=await signedAdminToken();
  const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),55000);
  let response,transportError=null;
  try{
   // The first URL is the new Neon deployment. A 404 at the function router
   // can occur before our code runs, so retry against the previous deployment.
   for(let i=0;i<quizEndpoints.length;i++){
    try{
     response=await fetch(quizEndpoints[i],{
      method:'POST',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({title,content}),signal:ctrl.signal
     });
     if(response.status===404&&i<quizEndpoints.length-1)continue;
     break;
    }catch(e){
     if(e?.name==='AbortError')throw e;
     transportError=e;
     if(i===quizEndpoints.length-1)throw Error('교육문제 생성 서버에 연결할 수 없습니다. 네트워크 또는 서버 주소를 확인해 주세요.');
    }
   }
  }finally{clearTimeout(tm);}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   if(response.status===404)
    throw Error('AI 문제 생성 서버 경로를 찾지 못했습니다(HTTP 404). 관리자에게 서버 연결 점검을 알려 주세요.');
   const stage=data.stage==='gateway-route'?'AI 연결 경로 문제: ':data.stage==='gateway-auth'?'AI 서버 권한 문제: ':data.stage==='auth'?'로그인 인증 문제: ':'';
   throw Error(stage+(data.error||'AI 평가문제를 생성하지 못했습니다 (HTTP '+response.status+').'));
  }
  if(!Array.isArray(data.questions)||data.questions.length!==5)throw Error('AI가 5개 문항을 생성하지 못했습니다.');
  // The generated content is a draft. Never silently overwrite someone else's
  // edits to the draft if the source inputs changed while the request ran.
  if(sourceKey(form)!==now)throw Error('생성 중 교육내용이 변경됐습니다. 새 내용으로 다시 생성해 주세요.');
  draftQuestions=data.questions.map(q=>({prompt:q.prompt,choices:[...q.choices],answer:Number(q.answer),explanation:q.explanation}));
  draftSourceKey=now;draftOrigin=data.source||'AI 초안';
  renderRegistrationQuiz();
  notice('교육내용 기반 평가문제 5개가 생성되었습니다. 정답과 해설을 확인하고 수정할 수 있습니다.');
 };
 generationPromise=run();
 draftSummary(form);
 try{await generationPromise;}finally{generationPromise=null;draftSummary(form);}
}
export function autoGenerateRegistration(form){
 if(generationPromise||draftQuestions.length||!form)return;
 generateRegistrationQuestions(form,{auto:true}).catch(error=>notice('AI 문제 자동 생성에 실패했습니다: '+error.message,true));
}


export function registrationForm(){
 const month=koreaToday().slice(0,7);
 return `<form id="createCourse" class="formgrid">
  <label class="wide">교육명<input name="title" maxlength="200" required placeholder="예: 화학물질 취급 및 MSDS 교육"></label>
  <label class="wide">교육내용<textarea name="description" rows="5" placeholder="예: 위험성평가의 목적, 유해위험요인 파악방법, 5×5 추정, 감소대책 수립, 근로자 의견수렴 등 교육에서 다루는 핵심 내용을 입력해 주세요."></textarea></label>
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
  <section class="wide quiz-editor-panel">
   <div class="between quiz-editor-top">
    <div><h3>평가문제 자동 생성 · 수정</h3><p class="note" id="registrationQuiz" aria-live="polite"></p></div>
    <button type="button" class="outline" data-quiz-action="generate" id="generateQuestions">AI 문제 생성 / 재생성</button>
   </div>
   <p class="note" id="registrationQuizHelp"></p>
   <div id="registrationQuestionEditor"></div>
   <button type="button" class="outline" data-quiz-action="add" id="registrationAddQuestion">+ 문제 직접 추가</button>
   <p class="note">교육내용을 기반으로 만든 AI 초안입니다. 영상 자체는 분석하지 않으며 정답 및 법령·기준은 교육 담당자가 확인해 주세요.</p>
  </section>
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
 renderRegistrationQuiz();
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
 if(generationPromise)await generationPromise;
 if(!draftQuestions.length)await generateRegistrationQuestions(form);
 const questions=validatedQuestions();
 const args={p_course:course,p_departments:departments,p_video:video,p_questions:questions};
 const key=JSON.stringify(args);
 if(lastRequest?.key!==key)lastRequest={key,id:crypto.randomUUID()};
 const requestId=lastRequest.id;
 await verifyAdminSession();
 const result=check(await db.rpc('edu_register_course',{...args,p_request_id:requestId}));
 S.courseId=result.id;
 try{await loadData();}
 catch{throw Error('교육은 등록되었습니다. 목록을 불러오지 못했습니다. 같은 내용으로 다시 눌러 결과를 확인해 주세요.');}
 notice('교육 공개 및 '+result.assigned+'명 배정이 완료되었습니다. 평가문제 '+questions.length+'개가 등록되었습니다.');
 draftQuestions=[];draftSourceKey='';draftOrigin='';generationPromise=null;
 return 'editor';
}

