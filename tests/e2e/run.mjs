import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const client=fileURLToPath(new URL('../../vibe-music-client/',import.meta.url))
process.env.FMP_TEST_URL='http://127.0.0.1:4173'
const server=spawn(process.execPath,[fileURLToPath(new URL('../../vibe-music-client/node_modules/vite/bin/vite.js',import.meta.url)),'preview','--host','127.0.0.1','--port','4173','--strictPort'],{cwd:client,stdio:'ignore'})
let exited=false;server.on('exit',()=>{exited=true})
try {
 let ready=false
 for(let attempt=0;attempt<100;attempt++){
  if(exited)throw new Error('Vite preview failed to start; build the client first and ensure port 4173 is free')
  try{ready=(await fetch(process.env.FMP_TEST_URL)).ok}catch{}
  if(ready)break
  await new Promise(resolve=>setTimeout(resolve,200))
 }
 if(!ready)throw new Error('Vite preview readiness timeout')
 await import('./workspace-smoke.mjs')
 await import('./playback-races.mjs')
}finally{server.kill()}
