export const defaultTimeZone = 'Asia/Taipei';
export function validateTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > 80) throw new Error('site.timeZone must be an IANA time zone');
  try { new Intl.DateTimeFormat('en',{timeZone:value}).format(); }
  catch { throw new Error('site.timeZone must be a valid IANA time zone'); }
  return value;
}
function parts(date,timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
}
const wall = values => `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
function offset(date,timeZone) {
  const values=parts(date,timeZone);
  return Date.parse(wall(values)+'Z')-Math.floor(date.valueOf()/1000)*1000;
}
export function publicationTimestamp(date=new Date(),timeZone=defaultTimeZone) {
  const values=parts(date,timeZone),minutes=offset(date,timeZone)/60000;
  const sign=minutes<0?'-':'+';
  return wall(values)+sign+String(Math.floor(Math.abs(minutes)/60)).padStart(2,'0')+':'+String(Math.abs(minutes)%60).padStart(2,'0');
}
export function parsePublicationDate(value,timeZone=defaultTimeZone) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value !== 'string') throw new Error('Publication date must be a date or timestamp');
  const match=value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/);
  if (!match || new Date(match[1]+'T00:00:00Z').toISOString().slice(0,10)!==match[1]) throw new Error('Invalid publication date');
  if (!match[2]) return new Date(match[1]+'T00:00:00Z'); // Calendar date, never a fabricated local midnight.
  const local=match[1]+'T'+match[2]+':'+match[3]+':'+(match[4]||'00');
  const naive=Date.parse(local+(match[5]||'')+'Z');
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0,19)!==local) throw new Error('Invalid publication time');
  if (match[6]) {
    const date=new Date(local+(match[5]||'')+match[6]);
    if (!Number.isNaN(date.valueOf())) return date;
    throw new Error('Invalid publication offset');
  }
  const candidates=new Set();
  // Probe both sides of DST transitions. Ambiguous/nonexistent times require an explicit offset.
  for(const delta of [-172800000,0,172800000]) {
    const candidate=new Date(naive-offset(new Date(naive+delta),timeZone));
    if(wall(parts(candidate,timeZone))===local)candidates.add(candidate.valueOf());
  }
  if(candidates.size!==1)throw new Error('Ambiguous or nonexistent publication time; include an explicit timezone offset');
  return new Date([...candidates][0]);
}
export function publicationCalendar(value,date,timeZone=defaultTimeZone) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10) : publicationTimestamp(date,timeZone).slice(0,10);
}
