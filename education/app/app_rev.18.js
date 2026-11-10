import {db,S,$,esc,check,notice,loadData,identify,stopPlayer,courseById} from './core_rev.12.js';
import {renderAdmin,adminSubmit,adminClick,syncAssignmentForm,courseTabs} from './admin_rev.17.js';
import {syncRegistrationForm} from './registration_rev.15.js';
import {syncVideoForm} from './youtube_rev.14.js';
import {renderEmployee,flushWatch,employeeAction} from './employee_rev.15.js';
import {reportAction,openArchive} from './reports_rev.17.js';

let pendingAdmin;
const temporaryAdminPassword=/^FCT-[0-9a-f]{36}$/;

function switchTab(name){
 if(name!=='admin-password')pendingAdmin=null;
 const tabs=[['tabLogin','login'],['tabForgot','forgot']];
 const forms=[['formLogin','login'],['formRegister','register'],['formForgot','forgot'],['formAdminPassword','admin-password']];
 for(const [id,key] of tabs){$(id).classList.toggle('active',key===name);$(id).setAttribute('aria-selected',String(key===name));}
 for(const [id,key] of forms)$(id).hidden=key!==name;
}
function account(){
 const a=$('accountArea');
 a.innerHTML=S.me?'<span>'+esc(S.me.full_name)+' · '+esc(S.me.plant)+'</span><button id="qrBtn" class="small">접속 QR</button><button id="logoutBtn" class="small">로그아웃</button>':'<span class="chip">NEON CLOUD</span>';
}
function renderNav(){
 const pending=(S.resetRequests||[]).length;
 const admin=S.me.role==='admin';
 const pages=admin
  ?[['dashboard','전체 현황'],['courses','교육관리'],['staff','직원관리'+(pending?' ('+pending+')':'')]]
  :[['dashboard','수강할 교육'],['history','수료한 교육']];
 const active=S.page==='editor'?'courses':S.page;
 $('nav').innerHTML=pages.map(([key,label])=>'<button data-page="'+key+'" class="'+(active===key?'active':'')+'" '+(active===key?'aria-current="page"':'')+'>'+label+'</button>').join('')+
  '<div class="nav-info">FCT 교육관리<br>Neon 공동저장 · VER3 rev.18</div>';
}
function render(){
 if(!S.me)return;
 renderNav();
 $('main').innerHTML=S.me.role==='admin'?renderAdmin(S.page):renderEmployee(S.page);
 if(S.me.role!=='admin')return;
 if(S.page==='editor'){
  syncAssignmentForm();
  const course=courseById(S.courseId);
  if(S.courseTab==='backup'&&course)openArchive(course).catch(e=>{
   const host=$('courseArchiveBody');
   if(host?.dataset.course===course.id)host.textContent='백업 상태를 불러오지 못했습니다. 백업 메뉴를 다시 선택해 주세요.';
   notice(e.message,true);
  });
 }
 if(S.page==='courses')syncRegistrationForm($('createCourse'));
}
function readRoute(){
 const [section,id,tab]=location.hash.slice(1).split('/');
 if(S.me.role==='admin'){
  if(section==='courses'&&courseById(id)){
   return {page:'editor',courseId:id,courseTab:courseTabs.some(([key])=>key===tab)?tab:'settings'};
  }
  if(['courses','editor','records','archives'].includes(section))return {page:'courses'};
  return {page:section==='staff'?'staff':'dashboard'};
 }
 if(section==='lesson'&&S.lesson?.enrollment.staff_id===S.me.id)return {page:'lesson'};
 return {page:section==='history'?'history':'dashboard'};
}
function pageHash(page,courseId=S.courseId,courseTab=S.courseTab){
 return page==='editor'?'#courses/'+courseId+'/'+(courseTab||'settings'):'#'+page;
}
function setPage(page){
 const hash=pageHash(page);
 const changed=location.hash!==hash;
 S.page=page;
 if(changed)location.hash=hash;
 render();
 if(changed&&S.me.role==='admin')window.scrollTo(0,0);
}
function showLogin(){
 // Never leave authenticated DOM in the page after sign-out or failed session validation.
 stopPlayer();
 S.me=null;S.lesson=null;S.courseId=null;S.courseTab='settings';
 S.staff=[];S.courses=[];S.enroll=[];S.attempts=[];S.resetRequests=[];S.pendingEmployeeNo=null;
 $('workspace').hidden=true;
 $('nav').replaceChildren();
 $('main').replaceChildren();
 if($('dialog').open)$('dialog').close();
 $('dialogBody').replaceChildren();
 $('authArea').hidden=false;
 switchTab('login');
 account();
}
function showApp(){
 // Visible workspace must have a successfully identified staff record and role.
 if(!S.me||!['admin','employee'].includes(S.me.role)){
  showLogin();
  throw Error('로그인 정보가 확인되지 않았습니다.');
 }
 $('authArea').hidden=true;
 $('workspace').hidden=false;
 Object.assign(S,readRoute());
 const hash=pageHash(S.page);
 if(location.hash!==hash)history.replaceState(null,'',hash);
 account();
 render();
}
async function move(page){
 await flushWatch();
 stopPlayer();setPage(page);
}
async function login(){
 const id=$('loginId').value.trim(),password=$('loginPw').value;
 if(!id||!password)throw Error('사번과 비밀번호를 입력해 주세요.');
 let email=id;
 if(id.includes('@')&&temporaryAdminPassword.test(password)){
  const p_email=id.toLowerCase();
  if(check(await db.rpc('edu_admin_first_login',{p_email,p_password:password}))){
   pendingAdmin={email:p_email,temporaryPassword:password};
   $('newAdminEmail').textContent=p_email;
   $('loginPw').value='';
   $('newAdminPw').value='';$('newAdminPwConfirm').value='';
   switchTab('admin-password');
   $('newAdminPw').focus();
   return;
  }
 }
 if(!id.includes('@')){
  if(password==='1111'){
   const available=check(await db.rpc('edu_initial_login_eligible',{p_employee_no:id}));
   if(!available)throw Error('현재 초기 비밀번호로 로그인할 수 없는 계정입니다. 비밀번호를 분실하셨다면 비밀번호 찾기를 이용해 주세요.');
   S.pendingEmployeeNo=id;
   $('registerId').value=id;
   $('registerNumber').textContent=id;
   $('registerPw').value='';
   $('registerPwConfirm').value='';
   switchTab('register');
   notice('초기 비밀번호가 확인되었습니다. 새로운 비밀번호를 설정해 주세요.');
   return;
  }
  const version=check(await db.rpc('edu_login_version',{p_employee_no:id}));
  email='fctedu+'+id+'.v'+version+'@fct-education.example';
 }
 check(await db.auth.signIn.email({email:email.toLowerCase(),password}));
 if(!await identify(4)){
  if(id.includes('@'))throw Error('등록된 관리자 계정이 아닙니다.');
  // Older first-login accounts may already have a Neon login but no linked staff row.
  check(await db.rpc('edu_request_activation',{p_employee_no:id,p_initial_pin:'1111'}));
  if(!await identify(4))throw Error('직원 계정 연결 상태를 확인해 주세요.');
 }
 showApp();notice('로그인되었습니다.');
}
async function signupOrLogin(data,confirmPassword=false){
 // A previous sign-up may have succeeded although the admin/staff claim failed.
 // Reuse the authenticated account instead of attempting another sign-up.
 const session=await db.auth.getSession();
 const currentEmail=(session?.data?.user?.email||session?.data?.session?.user?.email||'').trim().toLowerCase();
 if(session?.data?.session&&currentEmail===data.email.toLowerCase()){
  if(confirmPassword)check(await db.auth.signIn.email({email:data.email,password:data.password}));
  return;
 }
 // An existing session can belong to a previous login version after an admin reset.
 if(session?.data?.session&&currentEmail&&currentEmail!==data.email.toLowerCase()){
  const signedOut=await db.auth.signOut();
  if(signedOut?.error)throw Error('이전 로그인 종료에 실패했습니다. 로그아웃 후 다시 진행해 주세요.');
 }
 const result=await db.auth.signUp.email(data);
 if(!result?.error)return;
 const message=String(result.error.message||'');
 if(/already exists|already registered|email.*in use|user.*exists/i.test(message)){
  const existing=await db.auth.signIn.email({email:data.email,password:data.password});
  if(!existing?.error)return;
  throw Error('입력한 이메일로 이미 계정이 등록되어 있습니다. 기존 비밀번호로 로그인하거나 관리자에게 문의해 주세요.');
 }
 throw Error(message||'계정 등록 중 오류가 발생했습니다.');
}
async function registerStaff(){
 const no=$('registerId').value.trim(),password=$('registerPw').value,confirmPw=$('registerPwConfirm').value;
 if(!no||no!==S.pendingEmployeeNo)throw Error('사번을 다시 확인해 주세요.');
 if(password.length<8||password==='1111')throw Error('새 비밀번호는 8자 이상이어야 합니다.');
 if(password!==confirmPw)throw Error('새 비밀번호와 확인 입력이 일치하지 않습니다.');
 const version=check(await db.rpc('edu_login_version',{p_employee_no:no}));
 const email=('fctedu+'+no+'.v'+version+'@fct-education.example').toLowerCase();
 await signupOrLogin({email,password,name:'FCT '+no});
 check(await db.rpc('edu_request_activation',{p_employee_no:no,p_initial_pin:'1111'}));
 if(!await identify(4))throw Error('비밀번호가 설정되었지만 직원 계정 연결을 확인할 수 없습니다. 다시 로그인해 주세요.');
 $('registerPw').value='';$('registerPwConfirm').value='';
 S.pendingEmployeeNo=null;
 showApp();
 notice('새 비밀번호 설정이 완료되었습니다. 교육관리를 이용할 수 있습니다.');
}
async function requestForgot(){
 const id=$('forgotId').value.trim();
 if(id.length<2)throw Error('사번을 입력해 주세요.');
 check(await db.rpc('edu_request_password_reset',{p_employee_no:id}));
 $('forgotId').value='';
 switchTab('login');
 notice('비밀번호 초기화 요청이 관리자에게 전달되었습니다. 초기화 후 안내받은 비밀번호로 로그인하여 새 비밀번호를 설정해 주세요.');
}
async function activateAdmin(){
 const registration=pendingAdmin;
 if(!registration)throw Error('임시 비밀번호로 다시 로그인해 주세요.');
 const password=$('newAdminPw').value;
 if(password.length<8||password==='1111'||temporaryAdminPassword.test(password)){
  throw Error('임시 비밀번호와 다른 8자 이상의 비밀번호를 설정해 주세요.');
 }
 if(password!==$('newAdminPwConfirm').value)throw Error('새 비밀번호와 확인 입력이 일치하지 않습니다.');
 await signupOrLogin({email:registration.email,password,name:registration.email.split('@')[0]},true);
 for(let attempt=0;attempt<3;attempt++){
  const result=await db.rpc('edu_activate_registered_admin',{p_password:registration.temporaryPassword});
  if(!result?.error)break;
  if(attempt===2||!/새 비밀번호로 로그인한 후|bearer token|jwt/i.test(result.error.message||''))check(result);
  await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
 }
 if(!await identify(4))throw Error('등록이 완료되었습니다. 새 비밀번호로 다시 로그인해 주세요.');
 $('newAdminPw').value='';$('newAdminPwConfirm').value='';
 pendingAdmin=null;
 showApp();notice('관리자 비밀번호 설정이 완료되었습니다.');
}
async function signOut(){
 await flushWatch();
 await db.auth.signOut();
 S.page='dashboard';
 location.hash='';
 showLogin();
 notice('로그아웃되었습니다.');
}
async function handleSubmit(form){
 if(form.id==='formLogin')return login(form);
 if(form.id==='formRegister')return registerStaff();
 if(form.id==='formForgot')return requestForgot();
 if(form.id==='formAdminPassword')return activateAdmin();
 if(S.me?.role!=='admin')return;
 const page=await adminSubmit(form);
 if(page)setPage(page);
}
async function handleClick(target){
 // Never process protected menu/actions before a verified login.
 const nav=target.closest('[data-page]');
 if(!S.me&&target.closest('[data-page],[data-admin],[data-employee],[data-report]'))return;
 if(nav){if(S.me?.role==='admin'&&['staff','dashboard'].includes(nav.dataset.page))await loadData();await move(nav.dataset.page);return;}
 const a=target.closest('[data-admin]');
 if(a){
  if(S.me?.role!=='admin')return;
  if(['progress','backup'].includes(a.dataset.tab)){await loadData();if(!a.isConnected)return;}
  let page=await adminClick(a);
  if(page)setPage(page);
  return;
 }
 const report=target.closest('[data-report]');
 if(report){if(S.me?.role!=='admin')return;const page=await reportAction(report);if(page)setPage(page);return;}
 const emp=target.closest('[data-employee]');
 if(emp){const page=await employeeAction(emp);if(page)setPage(page);return;}
 if(target.id==='logoutBtn')return signOut();
 if(target.id==='qrBtn'){
  const url=location.origin+location.pathname;
  let qr='https://api.qrserver.com/v1/create-qr-code/?size=260x260&data='+encodeURIComponent(url);
  $('dialogBody').innerHTML='<h2>FCT 교육관리 QR</h2><div style="text-align:center"><img src="'+qr+'" alt="접속 QR" width="260" height="260"><p><a href="'+url+'" target="_blank">'+esc(url)+'</a></p></div>';
  $('dialog').showModal();
 }
}
$('tabLogin').onclick=()=>switchTab('login');
$('tabForgot').onclick=()=>switchTab('forgot');
$('cancelAdminPassword').onclick=()=>switchTab('login');
$('dialog').addEventListener('close',()=>{
 if($('issuedAdminPassword'))$('dialogBody').replaceChildren();
});
$('cancelActivation').onclick=()=>switchTab('login');
document.addEventListener('submit',async event=>{
 const form=event.target;
 if(form.method==='dialog')return;
 event.preventDefault();
 const btn=event.submitter;
 if(form.dataset.saving==='true')return;
 form.dataset.saving='true';
 if(btn)btn.disabled=true;
 try{await handleSubmit(form);}
 catch(e){notice(e.message||String(e),true);}
 finally{delete form.dataset.saving;if(btn?.isConnected)btn.disabled=false;}
});
document.addEventListener('click',async event=>{
 const hit=event.target.closest('[data-page],[data-admin],[data-employee],[data-report],#logoutBtn,#qrBtn');
 if(!hit||hit.disabled)return;
 hit.disabled=true;
 try{await handleClick(hit);}
 catch(e){notice(e.message||String(e),true);}
 finally{if(hit.isConnected)hit.disabled=false;}
});
document.addEventListener('input',event=>{
 const form=event.target.form;
 if(['createCourse','addVideo'].includes(form?.id)&&['video_url','video_minutes','video_seconds'].includes(event.target.name))syncVideoForm(form,event.target.name);
 if(form?.id==='createCourse'&&['title','description'].includes(event.target.name))syncRegistrationForm(form);
 if(event.target.id==='staffFilter'){
  const term=event.target.value.trim().toLowerCase();
  document.querySelectorAll('[data-staff-row]').forEach(row=>{row.hidden=!!term&&!row.dataset.key.includes(term);});
 }
});
document.addEventListener('change',event=>{
 const el=event.target;
 if(el.form?.id==='createCourse')syncRegistrationForm(el.form);
 if(el.id==='courseSwitcher'&&S.me?.role==='admin'&&courseById(el.value)){
  S.courseId=el.value;setPage('editor');
 }
 if(el.id==='assignScope'||el.id==='assignPlant'||el.name==='departments'){
  syncAssignmentForm();
 }
 if(el.name?.startsWith('q_'))S.answers[el.name.slice(2)]=Number(el.value);
});
window.addEventListener('hashchange',async()=>{
 if(!S.me)return;
 const route=readRoute();
 const hash=pageHash(route.page,route.courseId,route.courseTab);
 if(location.hash!==hash)history.replaceState(null,'',hash);
 if(route.page===S.page&&(route.page!=='editor'||(route.courseId===S.courseId&&route.courseTab===S.courseTab)))return;
 await flushWatch();
 stopPlayer();Object.assign(S,route);render();
 if(S.me.role==='admin')window.scrollTo(0,0);
});
async function init(){
 // Start from a locked screen, even when restoring a browser session.
 $('workspace').hidden=true;
 $('authArea').hidden=true;
 $('loading').hidden=false;
 try{
  if(await identify())showApp();
  else{
   const session=await db.auth.getSession();
   // If a session cookie is present, give the Data API time to attach its JWT
   // before treating an existing account as unavailable.
   if(session?.data?.session&&await identify(3)){
    showApp();return;
   }
   const email=(session?.data?.user?.email||session?.data?.session?.user?.email||'').toLowerCase();
   const match=/^fctedu\+(.+)\.v[0-9]+@fct-education\.example$/.exec(email);
   if(session?.data?.session&&match){
    const linked=await db.rpc('edu_request_activation',{p_employee_no:match[1],p_initial_pin:'1111'});
    if(!linked?.error&&await identify()){S.page='dashboard';showApp();return;}
   }
   showLogin();
  }
 }catch(e){
  showLogin();
  notice('서버 연결을 확인해 주세요: '+e.message,true);
 }finally{$('loading').hidden=true;}
}
window.addEventListener('pageshow',event=>{
 // Safari/Chrome back-forward cache can restore a previously visible dashboard.
 if(event.persisted)init();
});
init();
