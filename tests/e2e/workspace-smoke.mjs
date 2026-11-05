// API fixtures are isolated to browser tests. Playback uses an actual generated WAV,
// exercising HTMLAudioElement, Vue events and the real seek controls.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
const require=createRequire(import.meta.url)
const { chromium }=require(process.env.FMP_PLAYWRIGHT_MODULE || 'playwright')
const base=process.env.FMP_TEST_URL || 'http://localhost:8090'
const wav=Buffer.alloc(44+8000*24*2)
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16)
wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28)
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40)
const browser=await chromium.launch({headless:true,...(process.env.FMP_BROWSER_CHANNEL?{channel:process.env.FMP_BROWSER_CHANNEL}:{})})
try {
 const page=await browser.newPage({viewport:{width:1440,height:960}})
 const errors=[],reports=[];page.on('pageerror',error=>errors.push(error.message))
 let slowFinished=false,statusChecks=0,translationCancels=0,failLyrics=false
 const song={songId:'online:jamendo:qa1',songName:'Browser check',artistName:'Test fixture',duration:24,source:'jamendo',sourceSongId:'qa1',sourceUrlId:'qa1',online:true,providerEngine:'go-music-api',audioUrl:'http://localhost:18080/song/streamOnline?source=jamendo&id=qa1',coverUrl:''}
 await page.addInitScript(()=>{
   sessionStorage.setItem('UserStore',JSON.stringify({isLoggedIn:true,userInfo:{userId:101,username:'browsercheck',token:'test-only'}}))
   const OriginalAudio=window.Audio
   window.Audio=class extends OriginalAudio{constructor(...args){super(...args);window.qaAudio=this}}
 })
 await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url())
   if(!url.pathname.startsWith('/api/') && url.port!=='18080')return route.continue()
   const path=url.pathname.replace(/^\/api/,'')
   if(path.includes('streamOnline')){
     const raw=request.headers().range,range=raw?.match(/bytes=(\d+)-(\d*)/)
     const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),wav.length-1):wav.length-1
     return route.fulfill({status:range?206:200,headers:{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':String(end-start+1),...(range?{'Content-Range':`bytes ${start}-${end}/${wav.length}`}:{})},body:wav.subarray(start,end+1)})
   }
   let data=null,code=0
   if(path.includes('searchOnline')){
     const source=url.searchParams.get('sources') || ''
     if(source==='jamendo'){await new Promise(r=>setTimeout(r,80));data=[song]}
     else {await new Promise(r=>setTimeout(r,1800));slowFinished=true;if(source==='qq')code=1;data=[]}
   }else if(path==='/song/getAllSongs')data={items:[],total:0}
   else if(path==='/user/getUserInfo')data={userId:101,username:'browsercheck'}
   else if(path==='/workspace/imports')data=[{id:'job-test',title:'Browser collection',status:'SUCCEEDED',processed:1,total:1,succeeded:1,failed:0}]
   else if(path==='/workspace/collections')data=[{id:'collection-test',title:'Browser collection',source:'jamendo',song_count:1}]
   else if(path==='/workspace/collections/collection-test/songs')data=[song]
   else if(path==='/workspace/listening' && request.method()==='POST'){reports.push(request.postDataJSON())}
   else if(path==='/workspace/listening')data={summary:{playedSeconds:180,playCount:1,uniqueSongs:1},top:[],recent:[]}
   else if(path==='/agent/lyrics/translations'){
     await new Promise(resolve=>setTimeout(resolve,800))
     data={id:'translation-test',status:'RUNNING',processed:0,total:1,error:'',lines:[]}
   }
   else if(path==='/agent/lyrics/translations/translation-test'){
     if(request.method()==='DELETE')translationCancels++
     data={id:'translation-test',status:request.method()==='DELETE'?'CANCELLED':'SUCCEEDED',processed:1,total:1,error:'',lines:[{id:0,text:'测试中文翻译'}]}
   }
   else if(path==='/agent/status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({configured:++statusChecks>1,provider:'ollama',model:'test-model',message:'模型探测暂时超时'})})
   else if(path==='/agent/chat')return route.fulfill({status:200,contentType:'text/event-stream',body:'event: status\ndata: 正在生成回复\n\nevent: text\ndata: 已连接，以下是测试回复。\n\nevent: songs\ndata: '+JSON.stringify([{...song,coverUrl:'http://localhost:18080/test-broken-cover'}])+'\n\nevent: done\ndata: \n\n'})
   else if(path.includes('lyric')){
     if(failLyrics)code=1
     data={lyric:'[00:01]心配したって[00:05]\n[00:01]shi n pa i shi ta tte[00:05]\n[00:01]即使担心[00:05]\n[00:08]下一句[00:12]',source:'Browser fixture'}
   }
   else data={items:[],total:0}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code,message:'ok',data})})
 })
 await page.goto(`${base}/library?query=Browser`)
 await page.locator('.song-row').first().waitFor({timeout:20000})
 assert.equal(slowFinished,false,'fast platform must render before slow sources finish')
 const reportRequest=page.waitForRequest(request=>request.url().includes('/workspace/listening') && request.method()==='POST',{timeout:15000})
 await page.locator('.song-row .cover-button').first().click()
 await page.waitForFunction(()=>window.qaAudio?.currentTime>3 && !window.qaAudio.paused,null,{timeout:15000})
 await page.waitForFunction(()=>document.querySelector('.progress-row [role=slider]')?.getAttribute('aria-valuenow')>0)
 assert.equal((await reportRequest).postDataJSON().songId,'qa1')
 const slider=page.locator('.progress-row .el-slider__runway'),box=await slider.boundingBox()
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
 await page.waitForFunction(()=>window.qaAudio.currentTime>=10,null,{timeout:5000})
 await page.locator('.player-shell img').first().click()
 const lyrics=page.locator('.lyrics-panel')
 await lyrics.locator('.lyric-line').first().waitFor()
 assert.equal(await lyrics.locator('.lyric-line').count(),2,'interval ends and co-timed language channels must not create duplicate rows')
 await lyrics.getByRole('button',{name:'罗马音',exact:true}).click()
 await lyrics.locator('.lyric-roma').getByText('shi n pa i shi ta tte',{exact:true}).waitFor()
 assert.equal(await lyrics.locator('.lyric-translation').textContent(),'即使担心')
 await lyrics.locator('.lyrics-scroll').hover();await page.mouse.wheel(0,-100)
 await lyrics.getByRole('button',{name:'回到当前句',exact:true}).click()
 const timeShift=lyrics.getByRole('spinbutton',{name:'歌词时间偏移（秒）'})
 const cacheBefore=await page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('fmp-lyrics-v1',1);req.onsuccess=()=>{const db=req.result,get=db.transaction('lyrics').objectStore('lyrics').getAll();get.onsuccess=()=>{resolve(get.result[0]);db.close()}};req.onerror=()=>reject(req.error)}))
 await timeShift.fill('0.5');await timeShift.press('Tab')
 assert.equal(await timeShift.inputValue(),'0.5')
 await page.waitForFunction(async expected=>new Promise(resolve=>{const req=indexedDB.open('fmp-lyrics-v1',1);req.onsuccess=()=>{const db=req.result,get=db.transaction('lyrics').objectStore('lyrics').getAll();get.onsuccess=()=>{resolve(get.result.some(row=>row.offset===0.5&&row.updated===expected));db.close()}}}),cacheBefore.updated)
 await lyrics.locator('input[type=file]').setInputFiles({name:'words.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:01]<00:01>one <00:10>two[00:18]\n[00:18]Next[00:23]')})
 await page.locator('.el-message-box').getByRole('button').last().click()
 await lyrics.locator('.lyric-word').first().waitFor()
 await lyrics.locator('.lyric-line').first().click()
 await page.waitForFunction(()=>window.qaAudio.currentTime>=1&&window.qaAudio.currentTime<4)
 await lyrics.locator('.lyric-word[data-current=true]').getByText('one',{exact:true}).waitFor()
 await mkdir(fileURLToPath(new URL('../../.runtime/screenshots/',import.meta.url)),{recursive:true})
 await page.screenshot({path:fileURLToPath(new URL('../../.runtime/screenshots/lyrics-word-timing.png',import.meta.url))})
 await lyrics.getByRole('button',{name:'逐字',exact:true}).click()
 assert.equal(await lyrics.locator('.lyric-word').count(),0)
 await lyrics.locator('input[type=file]').setInputFiles({name:'test.txt',mimeType:'text/plain',buffer:Buffer.from('A plain lyric')})
 await page.locator('.el-message-box').getByRole('button').last().click()
 await lyrics.getByText('非同步歌词',{exact:true}).waitFor()
 assert.equal(await lyrics.locator('.lyric-line').first().isDisabled(),true,'plain text must not seek to a fabricated timestamp')
 const createTranslation=page.waitForRequest(request=>request.url().endsWith('/agent/lyrics/translations')&&request.method()==='POST')
 await lyrics.getByRole('button',{name:'补充中文翻译',exact:true}).click();await createTranslation
 await lyrics.getByRole('button',{name:/停止翻译 ·/}).click()
 await lyrics.getByRole('button',{name:'正在停止翻译…',exact:true}).waitFor()
 await lyrics.getByRole('button',{name:'补充中文翻译',exact:true}).waitFor()
 assert.equal(translationCancels,1,'late creation must be cancelled before retry becomes available')
 await lyrics.getByRole('button',{name:'补充中文翻译',exact:true}).click()
 await lyrics.locator('.lyric-translation').getByText('测试中文翻译',{exact:true}).waitFor()
 await lyrics.getByText('本地导入 · test.txt · 含 Ollama 机器翻译',{exact:true}).waitFor()
 await page.waitForTimeout(100)
 assert.equal(translationCancels,1,'a completed translation must not be cancelled')
 failLyrics=true
 await lyrics.getByRole('button',{name:'重新获取',exact:true}).click()
 await page.locator('.el-message-box').getByRole('button').last().click()
 await lyrics.getByText(/已保留原有歌词/).waitFor()
 assert.equal(await lyrics.locator('.lyric-line > span').first().textContent(),'A plain lyric')
 failLyrics=false
 await page.reload()
 await page.locator('.player-shell img').first().click()
 await lyrics.locator('.lyric-translation').getByText('测试中文翻译',{exact:true}).waitFor()
 assert.equal(await lyrics.locator('.lyric-line > span').first().textContent(),'A plain lyric','reload must retain imported lyrics and translation')
 await page.setViewportSize({width:560,height:900})
 assert.ok(await lyrics.locator('.lyrics-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth),'lyrics must wrap without horizontal scrolling')
 await page.setViewportSize({width:1440,height:960})
 await page.locator('.now-playing-drawer .el-drawer__header button').first().click()
 await page.goto(`${base}/workspace`)
 await page.getByRole('button',{name:'Browser collection'}).click()
 await page.locator('.song-row').first().waitFor()
 await page.getByRole('button',{name:'听歌统计',exact:true}).click()
 await page.getByText('分钟',{exact:true}).waitFor()
 await page.getByRole('button',{name:'导入任务',exact:true}).click()
 await page.getByText('已完成',{exact:true}).waitFor()
 await page.locator('.splash-screen').waitFor({state:'hidden'})
 const screenshot=process.env.FMP_TEST_SCREENSHOT || fileURLToPath(new URL('../../.runtime/screenshots/workspace-browser.png',import.meta.url))
 await mkdir(dirname(screenshot),{recursive:true})
 await page.screenshot({path:screenshot,fullPage:true})
 await page.setViewportSize({width:560,height:900})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'narrow workspace must not overflow horizontally')
 await page.getByRole('button',{name:'个人歌单',exact:true}).click()
 await page.getByRole('button',{name:'Browser collection'}).waitFor()
 await page.setViewportSize({width:1440,height:960})
 await page.getByRole('button',{name:'打开 FreeMusic Assistant',exact:true}).click()
 await page.getByText('模型探测暂时超时',{exact:true}).waitFor()
 await page.getByPlaceholder('告诉我你想听什么...').fill('连接恢复测试')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await page.getByText('已连接，以下是测试回复。',{exact:true}).waitFor()
 await page.getByText('ollama · test-model',{exact:true}).waitFor()
 await page.waitForFunction(()=>{const image=document.querySelector('[data-testid="agent-song-card"] img');return image?.complete && image.naturalWidth>0 && !image.src.includes('test-broken-cover')})
 assert.equal(await page.getByRole('button',{name:'停止生成',exact:true}).count(),0,'completed lookup must not remain in loading state')
 assert.deepEqual(errors,[],'browser must not raise uncaught errors')
 console.log(JSON.stringify({passed:true,progressiveSearch:true,nativeAudioPlayback:true,seek:true,lyricGrouping:true,lyricImport:true,lyricTranslation:true,lyricOffset:true,lyricWords:true,lyricCacheAge:true,lyricCancelRetry:true,lyricPersistence:true,lyricNarrowLayout:true,listeningReport:true,workspaceTabs:true,agentStatusRecovery:true,agentCoverFallback:true,consoleErrors:errors.length}))
}finally{await browser.close()}
