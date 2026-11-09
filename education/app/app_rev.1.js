import {db,S,$,esc,check,notice,loadData,identify,stopPlayer} from './core_rev.1.js';
import {renderAdmin,adminSubmit,adminClick} from './admin_rev.1.js';
import {renderEmployee,openLesson,employeeAction} from './employee_rev.1.js';
import {reportAction} from './reports_rev.1.js';

function switchTab(name){
 const tabs=[['tabLogin','login'],['tabRegister','register'],['tabAdmin','admin']];
 const forms=[['formLogin','login'],['formRegister','register'],['formAdmin','admin']];
 for(const [id,key] of tabs)$(id).classList.toggle('active',key===name);
 for(const [id,key] of forms)$(id).hidden=key!==name;
}
function account(){
 const a=$('accountArea');
 a.innerHTML=S.me?'<span>'+esc(S.me.full_name)+' · '+esc(S.me.plant)+'</span><button id="qrBtn" class="small">접속 QR</button><button id="logoutBtn" class="small">로그아웃</button>':'<span class="chip">NEON CLOUD</span>';
}
function renderNav(){
 let pages=S.me.role==='admin'?[['dashboard','교육현황'],['staff','직원관리'],['courses','교육과정'],['editor','과정 상세'],['records','이수현황'],['archives','교육별 백업']]:[['dashboard','내 교육'],['history','수료이력']];
 $('nav').innerHTML=pages.map(([key,label])=>'<button data-page="'+key+'" class="'+(S.page===key?'active':'')+'">'+label+'</button>').join('')+'<div class="nav-info">FCT 교육관리<br>Neon 공동저장 · VER3 rev.1</div>';
}
function render(){
 if(!S.me)return;
 renderNav();$('main').innerHTML=S.me.role==='admin'?renderAdmin(S.page):renderEmployee(S.page);
}
function showApp(){
 $('authArea').hidden=true;$('workspace').hidden=false;account();render();
}
function move(page){
 stopPlayer();S.page=page;location.hash=page;render();
}
async function login(form){
 const id=$('loginId').value.trim(),password=$('loginPw').value;
 let email=id;
 if(!id.includes('@')){
  const version=check(await db.rpc('edu_login_version',{p_employee_no:id}));
  email='fctedu+'+id+'.v'+version+'@fct-education.example';
 }
 check(await db.auth.signIn.email({email:email.toLowerCase(),password}));
 if(!await identify())throw Error('직원 계정이 연결되지 않았어. 최초 등록 또는 비밀번호 초기화 화면을 이용해 줘.');
 showApp();notice('로그인 완료.');
}
async function signupOrLogin(data){
 const result=await db.auth.signUp.email(data);
 if(!result?.error)return;
 const existing=await db.auth.signIn.email({email:data.email,password:data.password});
 if(existing?.error)throw Error(result.error.message||'계정 등록 오류');
}
async function registerStaff(){
 const no=$('registerId').value.trim(),pin=$('registerPin').value,invite=$('registerInvite').value.trim(),password=$('registerPw').value;
 if(pin!=='1111')throw Error('초기화 PIN이 다릅니다.');
 if(password.length<8)throw Error('로그인 비밀번호는 8자 이상으로 만들어 줘.');
 const version=check(await db.rpc('edu_login_version',{p_employee_no:no}));
 const email=('fctedu+'+no+'.v'+version+'@fct-education.example').toLowerCase();
 await signupOrLogin({email,password,name:'FCT '+no});
 check(await db.rpc('edu_claim_staff',{p_employee_no:no,p_invite_code:invite}));
 if(!await identify())throw Error('직원 계정 연결을 확인해 줘.');
 showApp();notice('직원 계정 활성화 완료.');
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
 stopPlayer();await db.auth.signOut();S.me=null;S.lesson=null;S.courseId=null;S.page='dashboard';location.hash='';
 $('workspace').hidden=true;$('authArea').hidden=false;account();switchTab('login');notice('로그아웃 완료.');
}
async function handleSubmit(form){
 if(form.id==='formLogin')return login(form);
 if(form.id==='formRegister')return registerStaff();
 if(form.id==='formAdmin')return adminSetup();
 if(S.me?.role!=='admin')return;
 const page=await adminSubmit(form);
 if(page){S.page=page;location.hash=page;render();}
}
async function handleClick(target){
 const nav=target.closest('[data-page]');
 if(nav){move(nav.dataset.page);return;}
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
$('tabRegister').onclick=()=>switchTab('register');
$('tabAdmin').onclick=()=>switchTab('admin');
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
document.addEventListener('change',event=>{
 const el=event.target;
 if(el.id==='reportCourse'){S.courseId=el.value;render();}
 if(el.name?.startsWith('q_'))S.answers[el.name.slice(2)]=Number(el.value);
});
window.addEventListener('hashchange',()=>{
 if(!S.me)return;
 let next=location.hash.slice(1);
 if(next&&next!==S.page&&next!=='lesson'){S.page=next;render();}
});
async function init(){
 try{
  if(await identify()){S.page=location.hash.slice(1)||'dashboard';showApp();}
  else{$('authArea').hidden=false;}
 }catch(e){$('authArea').hidden=false;notice('Neon 연결을 확인해 줘: '+e.message,true);}
 finally{$('loading').hidden=true;}
}
init();
