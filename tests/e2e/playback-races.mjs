import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url),{chromium}=require(process.env.FMP_PLAYWRIGHT_MODULE||'playwright')
const wav=Buffer.alloc(44+8000*24*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40)
const browser=await chromium.launch({headless:true,...(process.env.FMP_BROWSER_CHANNEL?{channel:process.env.FMP_BROWSER_CHANNEL}:{})})
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{const A=window.Audio;window.Audio=class extends A{constructor(...args){super(...args);window.qaAudio=this}}})
 const local=id=>({songId:id,songName:id===11?'Slow':'Fast',artistName:'Fixture',album:'Test',duration:'24',coverUrl:'',audioUrl:'http://localhost:18080/test-audio/'+id,likeStatus:0})
 const bad={songId:'online:jamendo:bad',songName:'Fault',artistName:'Fixture',album:'Test',duration:'24',coverUrl:'',audioUrl:'http://localhost:18080/song/streamOnline?source=jamendo&id=bad',source:'jamendo',sourceSongId:'bad',sourceUrlId:'bad',providerEngine:'go-music-api',online:true}
 let fallbackStarted=false,goodRequests=0
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.port!=='18080'&&!url.pathname.startsWith('/api/'))return route.continue()
  const path=url.pathname.replace(/^\/api/,'');let data={}
  if(path.includes('streamOnline')||path.startsWith('/test-audio/')){
   if(url.searchParams.get('id')==='bad')return route.fulfill({status:404,body:'missing'})
   if(url.searchParams.get('id')==='good')goodRequests++
   const match=req.headers().range?.match(/bytes=(\d+)-(\d*)/),start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),wav.length-1):wav.length-1
   return route.fulfill({status:match?206:200,headers:{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':String(end-start+1),...(match?{'Content-Range':`bytes ${start}-${end}/${wav.length}`}:{})},body:wav.subarray(start,end+1)})
  }
  if(path==='/song/getAllSongs')data={items:[local(11),local(12)],total:2}
  else if(path.startsWith('/song/getSongDetail/')){const id=Number(path.split('/').at(-1));await new Promise(r=>setTimeout(r,id===11?1200:30));data=local(id)}
  else if(path==='/song/searchOnline'){
   if(url.searchParams.getAll('sources').length>1){fallbackStarted=true;await new Promise(r=>setTimeout(r,1200));data=[{...bad,songId:'online:migu:good',source:'migu',sourceSongId:'good',sourceUrlId:'good',availability:'full',audioUrl:'http://localhost:18080/song/streamOnline?source=migu&id=good'}]}
   else data=url.searchParams.get('sources')==='jamendo'?[bad]:[]
  }else if(path.includes('lyric'))data={lyric:''}
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,data})})
 })
 const base=process.env.FMP_TEST_URL||'http://localhost:8090'
 await page.goto(base+'/library?source=local');await page.locator('.song-row').nth(1).waitFor()
 const slow=page.locator('.song-row').filter({hasText:'Slow'}).locator('.cover-button'),fast=page.locator('.song-row').filter({hasText:'Fast'}).locator('.cover-button')
 const detail=page.waitForRequest(r=>r.url().includes('/getSongDetail/11'))
 await slow.click();await detail;await page.locator('.player-shell').getByRole('button',{name:'暂停',exact:true}).click()
 await page.waitForTimeout(1400);assert.equal(await page.evaluate(()=>window.qaAudio.paused),true,'pause during detail loading must persist')
 await slow.click();await fast.click();await page.waitForFunction(()=>window.qaAudio.currentTime>0.2)
 await page.locator('.player-shell').getByRole('button',{name:'暂停',exact:true}).click()
 await page.waitForTimeout(1400);assert.equal(await page.evaluate(()=>window.qaAudio.paused),true,'late old selection must not resume the new song')
 await page.locator('.player-shell').getByRole('button',{name:'播放',exact:true}).click();await page.waitForFunction(()=>!window.qaAudio.paused)
 await page.evaluate(()=>{window.qaAudio.currentTime=23.8});await page.waitForFunction(()=>window.qaAudio.ended)
 await page.locator('.player-shell').getByRole('button',{name:'播放',exact:true}).waitFor()
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'切换播放模式',exact:true}).click()
 await page.locator('.player-shell').getByRole('button',{name:'下一首',exact:true}).click()
 await page.waitForFunction(()=>window.qaAudio.currentSrc.includes('/test-audio/11')&&window.qaAudio.currentTime>0.2)
 await page.locator('.player-shell').getByRole('button',{name:'下一首',exact:true}).click()
 await page.waitForFunction(()=>window.qaAudio.currentSrc.includes('/test-audio/12')&&window.qaAudio.currentTime>0.2)
 await page.evaluate(()=>{window.qaAudio.currentTime=23.8})
 await page.waitForFunction(()=>window.qaAudio.currentTime<2&&!window.qaAudio.paused)
 await page.goto(base+'/library?source=jamendo&query=Fault');await page.locator('.song-row .cover-button').first().click()
 for(let i=0;i<50&&!fallbackStarted;i++)await page.waitForTimeout(50)
 assert.equal(fallbackStarted,true)
 await page.locator('.player-shell').getByRole('button',{name:'暂停',exact:true}).click();await page.waitForTimeout(1500)
 assert.equal(goodRequests,0,'paused fallback must not load an alternative');assert.equal(await page.evaluate(()=>window.qaAudio.paused),true)
 await page.locator('.player-shell').getByRole('button',{name:'播放',exact:true}).click()
 await page.waitForFunction(()=>window.qaAudio.currentTime>0.5&&!window.qaAudio.paused,null,{timeout:12000})
 assert.ok(goodRequests>0);assert.deepEqual(errors,[])
 console.log(JSON.stringify({playbackRaces:true,pauseWhileLoading:true,lateSelectionDoesNotResume:true,pauseDuringFallback:true,retryFallback:true,orderEnds:true,singleRepeat:true,manualNextInSingleMode:true,consoleErrors:0}))
}finally{await browser.close()}
