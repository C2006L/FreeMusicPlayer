const normalize=(value:string)=>String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'')
// Verified complete audio is promoted; trials and unavailable entries sink.
// Relevance still dominates: a badly matching 'full' result never outranks an exact title.
const availabilityBonus=(value?:string)=>value==='full'?40:value==='preview'?-40:value==='unavailable'?-80:value==='restricted'?-10:0
export const searchRank=(song:{songName?:string;artistName?:string;duration?:number|string;availability?:string},query:string)=>{
 const q=normalize(query),name=normalize(song.songName || ''),artist=normalize(song.artistName || '')
 const terms=query.trim().split(/\s+/).map(normalize).filter(Boolean)
 return (artist===q?130:artist.includes(q)?25:0)+(name===q?100:name.startsWith(q)?80:name.includes(q)?60:0)
  +(terms.some(term=>name===term)?100:0)+(terms.some(term=>artist===term)?80:0)
  +terms.filter(term=>name.includes(term)||artist.includes(term)).length*15+(Number(song.duration)>0?2:0)
  +availabilityBonus(song.availability)
}
