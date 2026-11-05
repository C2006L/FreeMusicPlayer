import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const directory=dirname(fileURLToPath(import.meta.url))
test('supervisor restarts an exited provider worker',async()=>{
 const runtime=resolve(directory,'../.runtime');await mkdir(runtime,{recursive:true})
 const temporary=await mkdtemp(resolve(runtime,'provider-test-')),pidFile=resolve(temporary,'child.pid')
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
 const supervisor=spawn(process.execPath,[resolve(directory,'supervise.mjs')],{cwd:directory,env:{...process.env,PORT:String(port),FMP_PROVIDER_PID_FILE:pidFile},stdio:'ignore'})
 let childPid
 const ready=async(previous)=>{
  for(let i=0;i<150;i++){
   try{childPid=Number(await readFile(pidFile,'utf8'));const response=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(500)});if(childPid!==previous && response.ok)return childPid}catch{}
   await new Promise(r=>setTimeout(r,100))
  }
  throw new Error('provider worker readiness timeout')
 }
 try{const first=await ready();process.kill(first);const second=await ready(first);assert.notEqual(second,first)}
 finally{supervisor.kill();try{if(childPid)process.kill(childPid)}catch{};if(!temporary.startsWith(resolve(runtime,'provider-test-')))throw new Error('Unsafe test cleanup path');await rm(temporary,{recursive:true,force:true})}
})
