import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory=dirname(fileURLToPath(import.meta.url))
const pidFile=process.env.FMP_PROVIDER_PID_FILE || resolve(directory,'../.runtime/pids/provider-child.pid')
mkdirSync(dirname(pidFile),{recursive:true})
let child, timer, stopped=false, failures=0
const launch=()=>{
  if(stopped)return
  const started=Date.now()
  child=spawn(process.execPath,[resolve(directory,'server.mjs')],{cwd:directory,stdio:'inherit',windowsHide:true})
  if(child.pid)writeFileSync(pidFile,String(child.pid))
  child.on('error',error=>console.error(JSON.stringify({event:'provider-start-error',error:error.message})))
  child.on('exit',(code,signal)=>{
    rmSync(pidFile,{force:true})
    if(stopped)return
    failures=Date.now()-started>60000?0:failures+1
    const retryMs=Math.min(30000,1000*2**Math.min(failures,5))
    console.error(JSON.stringify({event:'provider-exited',code,signal,retryMs,at:new Date().toISOString()}))
    timer=setTimeout(launch,retryMs)
  })
}
const stop=()=>{stopped=true;clearTimeout(timer);child?.kill();rmSync(pidFile,{force:true})}
process.on('SIGTERM',stop);process.on('SIGINT',stop)
launch()
