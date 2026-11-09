import {createClient} from 'https://esm.sh/@neondatabase/neon-js@0.9.0-beta?target=es2022';
export const db=createClient({auth:{url:'https://ep-winter-bonus-azfs5ym3.neonauth.c-3.ap-southeast-1.aws.neon.tech/fct_edu_app/auth'},dataApi:{url:'https://ep-winter-bonus-azfs5ym3.apirest.c-3.ap-southeast-1.aws.neon.tech/fct_edu_app/rest/v1'}});
export const S={me:null,page:'dashboard',staff:[],courses:[],enroll:[],attempts:[],courseId:null,lesson:null,answers:{},player:null,interval:null,playing:false,watchSaving:false,drawn:false,signCanvas:null};
export const $=id=>document.getElementById(id);
export const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function check(r){if(r&&r.error)throw Error(r.error.message||String(r.error));return r?.data;}
export function notice(text,error=false){let el=$('toast');el.textContent=text;el.className='toast'+(error?' error':'');el.hidden=false;clearTimeout(notice.timeout);notice.timeout=setTimeout(()=>el.hidden=true,5500);}
export function modal(title,content){$('dialogBody').innerHTML='<h2>'+esc(title)+'</h2>'+content;$('dialog').showModal();}
export function badge(status){let v={draft:'작성중',published:'진행중',archived:'보관완료',assigned:'미수료',started:'수강중',completed:'수료'};return '<span class="pill '+(status==='completed'?'good':'')+'">'+esc(v[status]||status||'-')+'</span>';}
export function date(value){return value?new Date(value).toLocaleDateString('ko-KR'):'-';}
export function filename(name){return String(name||'교육').replace(/[\\/:*?"<>|]/g,'_').slice(0,40);}
export function csv(rows){let f=v=>{let s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};return '\ufeff'+rows.map(r=>r.map(f).join(',')).join('\r\n');}
export function parseCSV(src){let out=[],line=[],cell='',quote=false;src=src.replace(/^\ufeff/,'');for(let i=0;i<src.length;i++){let ch=src[i];if(ch==='"'){if(quote&&src[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(ch===','&&!quote){line.push(cell);cell='';}else if((ch==='\r'||ch==='\n')&&!quote){if(ch==='\r'&&src[i+1]==='\n')i++;line.push(cell);if(line.some(x=>x.trim()))out.push(line);line=[];cell='';}else cell+=ch;}line.push(cell);if(line.some(x=>x.trim()))out.push(line);return out;}
export function download(name,content,mime='text/plain;charset=utf-8'){let blob=content instanceof Blob?content:new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export async function all(table,cols='*',filter){let result=[];for(let i=0;i<30;i++){let q=db.from(table).select(cols).range(i*500,i*500+499);if(filter)q=filter(q);let rows=check(await q)||[];result.push(...rows);if(rows.length<500)break;}return result;}
export async function loadData(){
 const [courses,enroll]=await Promise.all([all('edu_courses'),all('edu_enrollments')]);S.courses=courses;S.enroll=enroll;
 if(S.me.role==='admin'){
  const [staff,attempts]=await Promise.all([all('edu_staff','id,employee_no,full_name,plant,department,role,active,login_version,hired_on'),all('edu_attempts','id,enrollment_id,score,passed,submitted_at')]);S.staff=staff;S.attempts=attempts;
 }else{S.staff=[S.me];S.attempts=[];}
}
export async function identify(){
 let r=check(await db.auth.getSession()),uid=r?.user?.id||r?.session?.user?.id;
 if(!r?.session||!uid)return false;
 let staff=check(await db.from('edu_staff').select('*').eq('auth_user_id',uid).limit(1))||[];
 if(!staff.length)return false;S.me=staff[0];
 await loadData();return true;
}
export function stopPlayer(){S.playing=false;if(S.interval)clearInterval(S.interval);S.interval=null;try{S.player?.destroy()}catch{}S.player=null;}
export function pageHeader(title,sub){return '<div class="pagehead"><div><h1>'+esc(title)+'</h1><p>'+esc(sub)+'</p></div></div>';}
export function panel(title,body){return '<section class="box"><h2>'+esc(title)+'</h2>'+body+'</section>';}
export function courseById(id){return S.courses.find(c=>c.id===id);}
export function enrollFor(id){return S.enroll.filter(e=>e.course_id===id);}
