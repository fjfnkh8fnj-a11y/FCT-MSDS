import {db,S,$,esc,check,notice,loadData,verifyAdminSession} from './core_rev.12.js';
import {topicQuestionDraft} from './topic_questions_rev.29.js';
import {videoFields,videoFromForm} from './youtube_rev.14.js';

import {koreaToday,scheduleFields,scheduleValues} from './schedule_rev.15.js';

let lastRequest;
let draftQuestions=[];
let draftSourceKey='';
let draftOrigin='';
let generationPromise=null;
let draftEdited=false;
const quizEndpoints=[
 'https://br-misty-bar-azvo7ikx-fctquizv2.compute.c-3.ap-southeast-1.aws.neon.tech/',
 'https://br-misty-bar-azvo7ikx-fctquizgen.compute.c-3.ap-southeast-1.aws.neon.tech/'
];
const sourceKey=form=>JSON.stringify([String(form.elements.title?.value||'').trim(),String(form.elements.description?.value||'').trim()]);
function draftSummary(form){
 const host=$('registrationQuiz'),hint=$('registrationQuizHelp');
 if(!host||!hint)return;
 const old=draftQuestions.length>0&&sourceKey(form)!==draftSourceKey;
 host.textContent=generationPromise?'교육 주제에 맞는 문제를 준비하고 있습니다…'
  :draftQuestions.length?('평가문제 '+draftQuestions.length+'개 · '+draftOrigin+(old?' · 교육내용 변경됨':''))
   :'교육명만 입력하면 해당 주제에 맞는 기본 평가문제 5개를 구성합니다.';
 hint.textContent=draftQuestions.length
  ?(old?'교육 주제가 변경되었습니다. 필요한 경우 문제를 다시 생성해 주세요.':'질문·선택지·정답·해설을 수정한 뒤 교육을 등록할 수 있습니다.')
  :'교육명(예: 위험성평가, 폭염, MSDS)만 입력하세요. 교육내용은 선택사항이며 AI 사용료나 별도 입력이 필요하지 않습니다.';
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
 draftEdited=true;
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
 draftEdited=true;
 renderRegistrationQuiz();
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
 const title=String(form.elements.title?.value||'').trim();
 const content=String(form.elements.description?.value||'').trim();
 if(!title){if(auto)return;throw Error('교육 주제를 입력해 주세요.');}
 if(auto&&draftQuestions.length&&(draftEdited||sourceKey(form)===draftSourceKey))return;
 const current=sourceKey(form);
 const assessment=topicQuestionDraft(title,content);
 draftQuestions=assessment.questions.map(q=>({
  prompt:q.prompt,choices:[...q.choices],answer:Number(q.answer),explanation:q.explanation
 }));
 draftSourceKey=current;
 draftOrigin=assessment.label;
 draftEdited=false;
 renderRegistrationQuiz();
 if(!auto){
  notice(assessment.topicMatched?'교육 주제에 맞는 기본 평가문제 5개가 준비됐습니다. 필요한 문제만 수정해 주세요.'
   :'해당 주제의 전용 문항은 아직 없어 일반 현장 안전문항을 넣었습니다. 주제별 전문문항은 검토 후 사용해 주세요.');
 }
}
export function autoGenerateRegistration(form){
 if(!form||!String(form.elements.title?.value||'').trim())return;
 generateRegistrationQuestions(form,{auto:true}).catch(error=>notice('평가문제 생성 오류: '+error.message,true));
}

export function registrationForm(){
 const month=koreaToday().slice(0,7);
 return `<form id="createCourse" class="formgrid">
  <label class="wide">교육명<input name="title" maxlength="200" required placeholder="예: 화학물질 취급 및 MSDS 교육"></label>
  <label class="wide">교육내용 (선택)<textarea name="description" rows="3" placeholder="입력하지 않아도 됩니다. 교육명만으로 평가문제 5개를 준비합니다."></textarea></label>
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
    <button type="button" class="outline" data-quiz-action="generate" id="generateQuestions">주제별 문제 생성 / 재생성</button>
   </div>
   <p class="note" id="registrationQuizHelp"></p>
   <div id="registrationQuestionEditor"></div>
   <button type="button" class="outline" data-quiz-action="add" id="registrationAddQuestion">+ 문제 직접 추가</button>
   <p class="note">교육 주제별 기본 문제은행에서 5문항을 준비합니다. AI 모델을 호출하지 않으며, 등록 전에 질문·정답·해설을 수정할 수 있습니다. 실제 영상은 분석하지 않으므로 교육 내용과 일치하는지 확인해 주세요.</p>
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
 draftQuestions=[];draftSourceKey='';draftOrigin='';draftEdited=false;generationPromise=null;
 return 'editor';
}

