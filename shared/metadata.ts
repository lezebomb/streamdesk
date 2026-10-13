export function validYear(value:unknown,now=Date.now()):string|undefined {
 const year=String(value||'').match(/\d{4}/)?.[0],n=Number(year);
 return year&&n>=1888&&n<=new Date(now).getFullYear()?year:undefined;
}
export function validReleaseDate(value:unknown,now=Date.now()):string|undefined {
 const date=String(value||'').match(/\d{4}-\d{2}-\d{2}/)?.[0];if(!date)return;
 const time=Date.parse(date);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date&&time<=now?date:undefined;
}
