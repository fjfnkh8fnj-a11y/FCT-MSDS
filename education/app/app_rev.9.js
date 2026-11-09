import {db,S,$,esc,check,notice,loadData,identify,stopPlayer} from './core_rev.8.js';
import {renderAdmin,adminSubmit,adminClick,syncAssignmentForm} from './admin_rev.9.js';
import {renderEmployee,openLesson,employeeAction} from './employee_rev.8.js';
import {reportAction} from './reports_rev.8.js';

function switchTab(name){
 const tabs=[['tabLogin','login'],['tabForgot','forgot'],['tabAdmin','admin']];
 const forms=[['formLogin','login'],['formRegister','register'],['formForgot','forgot'],['formAdmin','admin']];
 for(const [id,key] of tabs){$(id).classList.toggle('active',key===name);$(id).setAttribute('aria-selected',String(key===name));}
 for(const [id,key] of forms)$(id).hidden=key!==name;
}
function account(){
 const a=$('accountArea');
 a.innerHTML=S.me?'<span>'+esc(S.me.full_name)+' · '+esc(S.me.plant)+'</span><button id="qrBtn" class="small">접속 QR</button><button id="logoutBtn" class="small">로그아웃</button>':'<span class="chip">NEON CLOUD</span>';
}
function renderNav(){
 const pending=(S.resetRequests||[]).length;
 let pages=S.me.role==='admin'?[['dashboard','교육현황'],['staff','직원관리'+(pending?' ('+pending+')':'')],['courses','교육과정'],['editor','과정 상세'],['records','이수현황'],['archives','교육별 백업']]:[['dashboard','내 교육'],['history','수료이력']];
 $('nav').innerHTML=pages.map(([key,label])=>'<button data-page="'+key+'" class="'+(S.page===key?'active':'')+'">'+label+'</button>').join('')+'<div class="nav-info">FCT 교육관리<br>Neon 공동저장 · VER3 rev.9</div>';
}
function render(){
 if(!S.me)return;
 renderNav();
 $('main').innerHTML=S.me.role==='admin'?renderAdmin(S.page):renderEmployee(S.page);
 if(S.me.role==='admin'&&S.page==='editor')syncAssignmentForm();
}
function showLogin(){
 // Never leave authenticated DOM in the page after sign-out or failed session validation.
 stopPlayer();
 S.me=null;S.lesson=null;S.courseId=null;
 S.staff=[];S.courses=[];S.enroll=[];S.attempts=[];S.resetRequests=[];S.pendingEmployeeNo=null;
 $('workspace').hidden=true;
 $('nav').replaceChildren();
 $('main').replaceChildren();
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
 account();
 render();
}
function move(page){
 stopPlayer();S.page=page;location.hash=page;render();
}
async function login(){
 const id=$('loginId').value.trim(),password=$('loginPw').value;
 if(!id||!password)throw Error('사번과 비밀번호를 입력해 줘.');
 let email=id;
 if(!id.includes('@')){
  if(password==='1111'){
   const available=check(await db.rpc('edu_initial_login_eligible',{p_employee_no:id}));
   if(!available)throw Error('초기 비밀번호로 로그인할 수 없는 사번이야. 비밀번호를 잊었으면 비밀번호 찾기를 이용해 줘.');
   S.pendingEmployeeNo=id;
   $('registerId').value=id;
   $('registerNumber').textContent=id;
   $('registerPw').value='';
   $('registerPwConfirm').value='';
   switchTab('register');
   notice('초기 비밀번호 확인. 본인이 사용할 새 비밀번호를 설정해 줘.');
   return;
  }
  const version=check(await db.rpc('edu_login_version',{p_employee_no:id}));
  email='fctedu+'+id+'.v'+version+'@fct-education.example';
 }
 check(await db.auth.signIn.email({email:email.toLowerCase(),password}));
 if(!await identify()){
  if(id.includes('@'))throw Error('등록된 관리자 계정이 아니야.');
  // Older first-login accounts may already have a Neon login but no linked staff row.
  check(await db.rpc('edu_request_activation',{p_employee_no:id,p_initial_pin:'1111'}));
  if(!await identify())throw Error('직원 계정 연결을 확인해 줘.');
 }
 showApp();notice('로그인 완료.');
}
async function signupOrLogin(data){
 // A previous sign-up may have succeeded although the admin/staff claim failed.
 // Reuse the authenticated account instead of attempting another sign-up.
 const session=await db.auth.getSession();
 const currentEmail=(session?.data?.user?.email||session?.data?.session?.user?.email||'').trim().toLowerCase();
 if(session?.data?.session&&currentEmail===data.email.toLowerCase())return;
 // An existing session can belong to a previous login version after an admin reset.
 if(session?.data?.session&&currentEmail&&currentEmail!==data.email.toLowerCase()){
  const signedOut=await db.auth.signOut();
  if(signedOut?.error)throw Error('이전 로그인 종료에 실패했어. 로그아웃 후 다시 진행해 줘.');
 }
 const result=await db.auth.signUp.email(data);
 if(!result?.error)return;
 const message=String(result.error.message||'');
 if(/already exists|already registered|email.*in use|user.*exists/i.test(message)){
  const existing=await db.auth.signIn.email({email:data.email,password:data.password});
  if(!existing?.error)return;
  throw Error('입력한 이메일은 이미 계정이 만들어져 있어. 새로운 이메일을 만들 필요는 없어. 처음 등록했을 때 사용한 비밀번호를 입력해서 다시 진행해 줘.');
 }
 throw Error(message||'계정 등록 중 오류가 발생했어.');
}
async function registerStaff(){
 const no=$('registerId').value.trim(),password=$('registerPw').value,confirmPw=$('registerPwConfirm').value;
 if(!no||no!==S.pendingEmployeeNo)throw Error('사번을 다시 확인해 줘.');
 if(password.length<8||password==='1111')throw Error('새 비밀번호는 8자 이상이어야 해.');
 if(password!==confirmPw)throw Error('새 비밀번호와 확인 입력이 달라.');
 const version=check(await db.rpc('edu_login_version',{p_employee_no:no}));
 const email=('fctedu+'+no+'.v'+version+'@fct-education.example').toLowerCase();
 await signupOrLogin({email,password,name:'FCT '+no});
 check(await db.rpc('edu_request_activation',{p_employee_no:no,p_initial_pin:'1111'}));
 if(!await identify())throw Error('비밀번호는 설정됐으나 직원 계정 연결을 확인해야 해. 다시 로그인해 줘.');
 $('registerPw').value='';$('registerPwConfirm').value='';
 S.pendingEmployeeNo=null;
 showApp();
 notice('새 비밀번호 설정 완료. 바로 교육관리를 이용할 수 있어.');
}
async function requestForgot(){
 const id=$('forgotId').value.trim();
 if(id.length<2)throw Error('사번을 입력해 줘.');
 check(await db.rpc('edu_request_password_reset',{p_employee_no:id}));
 $('forgotId').value='';
 switchTab('login');
 notice('관리자에게 비밀번호 초기화 요청을 보냈어. 초기화가 완료되면 사번과 1111로 로그인한 뒤 새 비밀번호를 설정해 줘.');
}
async function adminSetup(){
 const name=$('adminName').value.trim(),email=$('adminEmail').value.trim().toLowerCase(),password=$('adminPw').value,code=$('adminCode').value.trim();
 if(password.length<8)throw Error('비밀번호는 8자 이상으로 설정해 줘.');
 await signupOrLogin({email,password,name});
 check(await db.rpc('edu_claim_admin',{p_email:email,p_name:name,p_setup_code:code}));
 if(!await identify())throw Error('관리자 계정 연결을 확인해 줘.');
 showApp();notice('관리자 최초 설정 완료.');
}
async function signOut(){
 await db.auth.signOut();
 S.page='dashboard';
 location.hash='';
 showLogin();
 notice('로그아웃 완료.');
}
async function handleSubmit(form){
 if(form.id==='formLogin')return login(form);
 if(form.id==='formRegister')return registerStaff();
 if(form.id==='formForgot')return requestForgot();
 if(form.id==='formAdmin')return adminSetup();
 if(S.me?.role!=='admin')return;
 const page=await adminSubmit(form);
 if(page){S.page=page;location.hash=page;render();}
}
async function handleClick(target){
 // Never process protected menu/actions before a verified login.
 const nav=target.closest('[data-page]');
 if(!S.me&&target.closest('[data-page],[data-admin],[data-employee],[data-report]'))return;
 if(nav){if(S.me?.role==='admin'&&['staff','dashboard'].includes(nav.dataset.page))await loadData();move(nav.dataset.page);return;}
 const a=target.closest('[data-admin]');
 if(a){
  if(['records-csv','records-html','records-print','archive'].includes(a.dataset.admin)){await reportAction(a);return;}
  let page=await adminClick(a);
  if(page){S.page=page;location.hash=page;render();}
  return;
 }
 const report=target.closest('[data-report]');
 if(report){await reportAction(report);render();return;}
 const emp=target.closest('[data-employee]');
 if(emp){const page=await employeeAction(emp);if(page){S.page=page;location.hash=page;render();}return;}
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
$('tabAdmin').onclick=()=>switchTab('admin');
$('cancelActivation').onclick=()=>switchTab('login');
document.addEventListener('submit',async event=>{
 event.preventDefault();
 const btn=event.submitter,form=event.target;
 if(btn)btn.disabled=true;
 try{await handleSubmit(form);}
 catch(e){notice(e.message||String(e),true);}
 finally{if(btn?.isConnected)btn.disabled=false;}
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
 if(event.target.id==='staffFilter'){
  const term=event.target.value.trim().toLowerCase();
  document.querySelectorAll('[data-staff-row]').forEach(row=>{row.hidden=!!term&&!row.dataset.key.includes(term);});
 }
});
document.addEventListener('change',event=>{
 const el=event.target;
 if(el.id==='reportCourse'){S.courseId=el.value;render();}
 if(el.id==='assignScope'||el.id==='assignPlant'||el.name==='departments'){
  syncAssignmentForm();
 }
 if(el.name?.startsWith('q_'))S.answers[el.name.slice(2)]=Number(el.value);
});
window.addEventListener('hashchange',()=>{
 if(!S.me)return;
 let next=location.hash.slice(1);
 if(next&&next!==S.page&&next!=='lesson'){S.page=next;render();}
});
async function init(){
 // Start from a locked screen, even when restoring a browser session.
 $('workspace').hidden=true;
 $('authArea').hidden=true;
 $('loading').hidden=false;
 try{
  if(await identify()){S.page=location.hash.slice(1)||'dashboard';showApp();}
  else{
   const session=await db.auth.getSession();
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
  notice('Neon 연결을 확인해 줘: '+e.message,true);
 }finally{$('loading').hidden=true;}
}
window.addEventListener('pageshow',event=>{
 // Safari/Chrome back-forward cache can restore a previously visible dashboard.
 if(event.persisted)init();
});
init();
