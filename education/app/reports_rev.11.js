import {db,S,$,esc,check,notice,modal,date,filename,csv,download,all,loadData,courseById,enrollFor} from './core_rev.8.js';

function listForCourse(c){
 const staff=new Map(S.staff.map(x=>[x.id,x]));
 return enrollFor(c.id).map((en,i)=>{
  let s=staff.get(en.staff_id),a=S.attempts.filter(x=>x.enrollment_id===en.id).sort((x,y)=>y.submitted_at.localeCompare(x.submitted_at))[0];
  return {index:i+1,enrollment_id:en.id,employee_no:s?.employee_no||'',full_name:s?.full_name||'',plant:s?.plant||'',department:s?.department||'',status:en.status,score:a?.score??'',completed_at:en.completed_at};
 });
}
function participantsCSV(c){
 const rows=listForCourse(c);
 return csv([['No','사번','성명','사업장','부서','수료상태','평가점수','수료일'],...rows.map(x=>[x.index,x.employee_no,x.full_name,x.plant,x.department,x.status,x.score,x.completed_at||''])]);
}
export async function journalHTML(c,signatures){
 const rows=listForCourse(c),sigs=signatures||await all('edu_signatures','*'),map=new Map(sigs.map(s=>[s.enrollment_id,s.signature_data_uri]));
 let tr='';
 for(const r of rows){
  let img=map.get(r.enrollment_id);
  tr+='<tr><td>'+r.index+'</td><td>'+esc(r.employee_no)+'</td><td>'+esc(r.full_name)+'</td><td>'+esc(r.plant)+'</td><td>'+esc(r.department)+'</td><td>'+esc(r.status==='completed'?'수료':'미수료')+'</td><td>'+esc(r.score)+'</td><td>'+date(r.completed_at)+'</td><td>'+(img?'<img alt="전자서명" style="max-width:110px;max-height:35px;object-fit:contain" src="'+img+'">':'-')+'</td></tr>';
 }
 return '<!doctype html><html lang="ko"><meta charset="utf-8"><title>FCT 교육일지</title><style>body{font:13px "Malgun Gothic",sans-serif;color:#1a3440;padding:24px}h1{font-size:23px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #b3c1c4;padding:7px;text-align:center}th{background:#f2f7f8}img{display:block;margin:auto}p{line-height:1.7}@media print{@page{size:A4 landscape;margin:12mm}button{display:none}thead{display:table-header-group}tr{page-break-inside:avoid}}</style><button onclick="window.print()">PDF로 인쇄/저장</button><h1>FCT 교육일지 · 수료자 서명부</h1><p><b>교육명:</b> '+esc(c.title)+'　<b>교육월:</b> '+esc(c.education_month)+'　<b>교육일:</b> '+esc(c.course_date||'-')+'　<b>사업장:</b> '+esc(c.plant)+'</p><p><b>교육구분:</b> '+esc(c.course_type)+'　<b>교육시간:</b> '+c.duration_minutes+'분　<b>배정 인원:</b> '+rows.length+'명　<b>수료:</b> '+rows.filter(x=>x.status==='completed').length+'명</p><p><b>교육내용:</b> '+esc(c.description)+'</p><table><thead><tr><th>No</th><th>사번</th><th>성명</th><th>공장</th><th>부서</th><th>수료</th><th>평가</th><th>수료일</th><th>서명</th></tr></thead><tbody>'+tr+'</tbody></table><p>※ 교육시간·법정교육 인정여부와 교육자료 적정성은 관리자가 확인해야 합니다.</p></html>';
}
function dvSet(bytes,at,val,len){let v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(len===2)v.setUint16(at,val,true);else v.setUint32(at,val>>>0,true);}
function crc32(bytes){let c=0xffffffff;for(let x of bytes){c^=x;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function makeZip(entries){
 const encoder=new TextEncoder(),locals=[],central=[];let offset=0;
 for(const [fileName,content] of entries){
  const n=encoder.encode(fileName),d=typeof content==='string'?encoder.encode(content):new Uint8Array(content),crc=crc32(d);
  const h=new Uint8Array(30+n.length);dvSet(h,0,0x04034b50,4);dvSet(h,4,20,2);dvSet(h,6,0x800,2);dvSet(h,14,crc,4);dvSet(h,18,d.length,4);dvSet(h,22,d.length,4);dvSet(h,26,n.length,2);h.set(n,30);locals.push(h,d);
  const c=new Uint8Array(46+n.length);dvSet(c,0,0x02014b50,4);dvSet(c,4,20,2);dvSet(c,6,20,2);dvSet(c,8,0x800,2);dvSet(c,16,crc,4);dvSet(c,20,d.length,4);dvSet(c,24,d.length,4);dvSet(c,28,n.length,2);dvSet(c,42,offset,4);c.set(n,46);central.push(c);offset+=h.length+d.length;
 }
 const end=new Uint8Array(22),size=central.reduce((sum,x)=>sum+x.length,0);
 dvSet(end,0,0x06054b50,4);dvSet(end,8,entries.length,2);dvSet(end,10,entries.length,2);dvSet(end,12,size,4);dvSet(end,16,offset,4);
 return new Blob([...locals,...central,end],{type:'application/zip'});
}
async function sha(buffer){const hash=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('');}
async function courseData(c){
 const enrol=enrollFor(c.id),ids=new Set(enrol.map(e=>e.id));
 const [videos,materials,questions,answers,attempts,progress,signatures]=await Promise.all([
  all('edu_videos','*',q=>q.eq('course_id',c.id)),
  all('edu_materials','*',q=>q.eq('course_id',c.id)),
  all('edu_questions','*',q=>q.eq('course_id',c.id)),
  all('edu_answers'),
  all('edu_attempts','*'),
  all('edu_progress','*'),
  all('edu_signatures','*')
 ]);
 const qids=new Set(questions.map(q=>q.id));
 return {exportVersion:'FCT-EDU-VER3-rev.1',exportedAt:new Date().toISOString(),course:c,staff:listForCourse(c),enrollments:enrol,videos,materials,questions,answerKeys:answers.filter(a=>qids.has(a.question_id)),quizAttempts:attempts.filter(a=>ids.has(a.enrollment_id)),videoProgress:progress.filter(p=>ids.has(p.enrollment_id)),signatures:signatures.filter(s=>ids.has(s.enrollment_id))};
}
export async function openArchive(c){
 const archives=await all('edu_archives','*',q=>q.eq('course_id',c.id)),a=archives[0],rows=listForCourse(c),done=rows.filter(e=>e.status==='completed').length;
 let status=a?.status||'없음';
 let html='<p><b>'+esc(c.title)+'</b></p><p>교육대상 '+rows.length+'명 · 수료 '+done+'명 · 백업상태 '+esc(status)+'</p>';
 html+='<div class="actions"><button class="primary" data-report="backup" data-course="'+c.id+'" '+(done!==rows.length||rows.length===0||status==='purged'?'disabled':'')+'>교육별 ZIP 백업 생성</button></div>';
 if(a?.status==='downloaded')html+='<p>파일을 회사 PC 등에 저장하고, 내려받은 ZIP 파일을 다시 선택하여 검증해 주세요.</p><button class="outline" data-report="verify" data-course="'+c.id+'">백업파일 재검증</button>';
 if(a?.status==='verified')html+='<p class="notice">ZIP 파일 검증이 완료되었습니다. 별도 저장장치에 보관한 후 상세 기록 정리를 승인할 수 있습니다.</p><button class="danger" data-report="purge" data-course="'+c.id+'">상세 교육기록 정리</button>';
 if(a?.status==='purged')html+='<p>서버의 상세 기록이 정리되었습니다. 보관용 ZIP 파일을 안전하게 유지해 주세요.</p>';
 html+='<input type="file" id="verifyZip" accept=".zip" hidden>';
 modal('교육별 백업·보관',html);
}
async function backupCourse(c){
 const rows=listForCourse(c);
 if(!rows.length||rows.some(r=>r.status!=='completed'))throw Error('교육 대상자가 모두 수료한 후 백업할 수 있습니다.');
 const content=await courseData(c);
 if(content.signatures.length!==rows.length)throw Error('서명 자료가 누락되어 백업할 수 없습니다.');
 const report=await journalHTML(c,content.signatures),data=JSON.stringify(content,null,2);
 const files=[['교육일지_서명부.html',report],['교육이수자명단.csv',participantsCSV(c)],['교육기록_복원데이터.json',data],['보관안내.txt','FCT 교육관리 교육별 보관파일\n개인정보 및 전자서명이 포함되어 있습니다.\n회사 승인 보관장치에 암호화하여 보관하세요.\nZIP 파일 재검증 후에만 서버 상세기록을 정리할 수 있습니다.']];
 const zip=makeZip(files),checksum=await sha(await zip.arrayBuffer()),name='FCT_'+c.education_month+'_'+filename(c.title)+'_backup_rev.1.zip';
 download(name,zip);
 check(await db.rpc('edu_archive_downloaded',{p_course_id:c.id,p_checksum:checksum,p_filename:name,p_records:rows.length,p_signatures:content.signatures.length}));
 notice('교육별 백업파일 다운로드를 요청했습니다. 내려받은 ZIP 파일을 다시 선택하여 검증해 주세요.');
 await openArchive(c);
}
async function verifyCourse(c){
 const archive=(await all('edu_archives','*',q=>q.eq('course_id',c.id)))[0];
 if(!archive)throw Error('백업 생성 이력이 없습니다.');
 const input=$('verifyZip');if(!input)throw Error('백업파일 선택 항목을 찾지 못했습니다.');
 input.value='';
 input.onchange=async()=>{
  const file=input.files?.[0];if(!file)return;
  try{
   const hash=await sha(await file.arrayBuffer());if(hash!==archive.checksum_sha256)throw Error('선택한 ZIP 파일이 백업 기록과 일치하지 않습니다.');
   check(await db.rpc('edu_archive_verify',{p_course_id:c.id,p_checksum:hash}));
   notice('백업파일 SHA-256 검증 완료.');await openArchive(c);
  }catch(e){notice(e.message,true);}
 };
 input.click();
}
async function purgeCourse(c){
 if(!confirm('백업 ZIP 파일을 별도 저장장치에 안전하게 보관하셨습니까? 확인 후에는 서버의 평가·서명 상세 데이터가 삭제됩니다.'))return;
 const text=prompt('상세 기록 정리를 승인하려면 교육명을 정확히 입력해 주세요.\n'+c.title);
 if(text===null)return;
 if(text!==c.title)throw Error('교육명이 일치하지 않아 처리를 취소했습니다.');
 check(await db.rpc('edu_archive_purge',{p_course_id:c.id,p_confirm:text}));
 await loadData();notice('교육 상세 기록 정리가 완료되었습니다. 보관용 ZIP 파일을 안전하게 유지해 주세요.');$('dialog').close();
}
export async function reportAction(button){
 const action=button.dataset.report||button.dataset.admin;
 if(action==='records-csv'){
  let c=courseById(S.courseId)||S.courses[0];if(c)download('FCT_교육이수자_'+c.education_month+'_rev.1.csv',participantsCSV(c),'text/csv;charset=utf-8');return;
 }
 if(action==='records-html'||action==='records-print'){
  let c=courseById(S.courseId)||S.courses[0];if(!c)return;
  const html=await journalHTML(c);
  if(action==='records-html')download('FCT_교육일지_'+c.education_month+'_rev.1.html',html,'text/html;charset=utf-8');
  else{const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000);}
  return;
 }
 const id=button.dataset.course||button.dataset.id,c=courseById(id);
 if(!c)throw Error('교육과정을 먼저 선택해 주세요.');
 if(action==='archive'){await openArchive(c);return;}
 if(action==='backup'){await backupCourse(c);return;}
 if(action==='verify'){await verifyCourse(c);return;}
 if(action==='purge'){await purgeCourse(c);return;}
}
