import {esc} from './core_rev.12.js';

export function koreaToday(){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
}

export function periodStatus(course,today=koreaToday()){
 if(course.starts_on&&course.starts_on>today)return {text:'수강 예정',upcoming:true};
 if(!course.due_on)return null;
 const days=Math.round((Date.parse(course.due_on)-Date.parse(today))/86400000);
 if(days<0)return {text:'기한 경과',urgent:true};
 if(days<=3)return {text:days===0?'오늘 마감':'D-'+days,urgent:true};
 return {text:'D-'+days};
}

export function periodText(course){
 if(!course.starts_on&&!course.due_on)return '';
 return (course.starts_on||'시작일 미지정')+' ~ '+(course.due_on||'마감일 미지정');
}

export function scheduleFields(course={}){
 return '<label>교육 시작일 (선택)<input name="starts_on" type="date" value="'+esc(course.starts_on||'')+'"></label>'+
  '<label>수강 마감일 (선택)<input name="due_on" type="date" value="'+esc(course.due_on||'')+'"></label>';
}

export function scheduleValues(data){
 const starts_on=data.get('starts_on')||null,due_on=data.get('due_on')||null;
 if(starts_on&&due_on&&starts_on>due_on)throw Error('마감일은 시작일과 같거나 이후여야 합니다.');
 return {starts_on,due_on};
}

export function extendedDeadline(course){
 const today=koreaToday();
 const base=[today,course.starts_on||today,course.due_on||today].sort().at(-1);
 const date=new Date(base+'T00:00:00Z');
 date.setUTCDate(date.getUTCDate()+7);
 return date.toISOString().slice(0,10);
}

