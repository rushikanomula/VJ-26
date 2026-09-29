import {createClient} from 'npm:@supabase/supabase-js@2'
const cors=(origin:string|null)=>{const origins=(Deno.env.get('ALLOWED_ORIGINS')||'http://localhost:5173').split(',').map(x=>x.trim());return {'Access-Control-Allow-Origin':origin&&origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}}
const reply=(body:unknown,status:number,origin:string|null)=>new Response(JSON.stringify(body),{status,headers:cors(origin)})
const esc=(x:unknown)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const list=(items:unknown)=>Array.isArray(items)?items.slice(0,10).map(x=>`<li style="margin:6px 0">${esc(x)}</li>`).join(''):''
const treatment=(items:unknown)=>Array.isArray(items)?items.slice(0,6).map(x=>`<tr><td style="padding:12px;border-bottom:1px solid #dee8e0"><strong>${esc(x?.name)}</strong><br>${esc(x?.instructions)}<br><small>${esc(x?.precautions)}</small></td></tr>`).join(''):''
function template(d:Record<string,unknown>,crop:string){return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f2f6f3;font:16px Arial,sans-serif;color:#233329"><div style="max-width:680px;margin:28px auto;background:#fff;border-radius:12px;overflow:hidden"><div style="background:#1B4332;color:#fff;padding:25px 30px"><div style="font-size:24px;font-weight:bold">Varuna</div><div>Field observation report</div></div><div style="padding:28px 30px"><p style="font-size:13px;color:#5b7165">AI assisted assessment · Expert review recommended</p><h1 style="font-size:26px;margin:10px 0">${esc(d.diagnosis)}</h1><p><strong>Crop:</strong> ${esc(crop)} &nbsp; <strong>Severity:</strong> ${esc(d.severity)} &nbsp; <strong>Model estimate:</strong> ${Math.round(Number(d.confidence||0)*100)}%</p><p>${esc(d.summary)}</p><img src="cid:crop-analysis" alt="Annotated crop photo" style="width:100%;max-width:610px;border-radius:8px;border:1px solid #d5e2da"><h2 style="font-size:19px">Next steps</h2><ul>${list(d.next_steps)}</ul><h2 style="font-size:19px">Organic options</h2><table style="width:100%;border-collapse:collapse">${treatment(d.organic_treatments)}</table><h2 style="font-size:19px">Chemical options</h2><table style="width:100%;border-collapse:collapse">${treatment(d.chemical_treatments)}</table><div style="margin-top:25px;background:#fff4d9;padding:16px;border-radius:8px"><strong>Limitations</strong><ul>${list(d.limitations)}</ul><p style="margin-bottom:0">Visual AI findings can be wrong. Confirm the diagnosis, local product registration, label directions, and safety guidance with a qualified agronomist before treatment.</p></div></div></div></body></html>`}
Deno.serve(async req=>{
 const origin=req.headers.get('origin');if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)})
 if(req.method!=='POST')return reply({error:'Method not allowed'},405,origin)
 if(Number(req.headers.get('content-length')||0)>2048)return reply({error:'Invalid request size'},413,origin)
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
 if(!token)return reply({error:'Sign in to send reports'},401,origin)
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('REPORT_FROM_EMAIL')
 if(!url||!anon||!service||!key||!from)return reply({error:'Email service is not configured'},503,origin)
 try{
  const {scan_id,recipient}=await req.json()
  if(typeof scan_id!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(scan_id)||typeof recipient!=='string'||recipient.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)))return reply({error:'Enter a valid report and recipient email'},400,origin)
  const publicClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:authError}=await publicClient.auth.getUser(token)
  if(authError||!user)return reply({error:'Invalid session'},401,origin)
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:allowed,error:quotaError}=await admin.rpc('allow_email_request',{p_user_id:user.id})
  if(quotaError)return reply({error:'Email is temporarily unavailable'},503,origin)
  if(!allowed)return reply({error:'Hourly email limit reached'},429,origin)
  const {data:scan,error:scanError}=await admin.from('scan_history').select('id,user_id,crop,diagnosis,annotated_path').eq('id',scan_id).eq('user_id',user.id).single()
  if(scanError||!scan)return reply({error:'Report not found'},404,origin)
  const {data:blob,error:storageError}=await admin.storage.from('crop-scans').download(scan.annotated_path)
  if(storageError||!blob)return reply({error:'Annotated image is unavailable'},404,origin)
  const bytes=new Uint8Array(await blob.arrayBuffer());if(bytes.byteLength>5_000_000)return reply({error:'Annotated image is too large'},413,origin)
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
  const html=template(scan.diagnosis as Record<string,unknown>,scan.crop)
  const resend=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`${user.id}-${scan_id}-${recipient.toLowerCase()}-${new Date().toISOString().slice(0,13)}`},body:JSON.stringify({from,to:[recipient],subject:`Varuna field report: ${String(scan.diagnosis?.diagnosis||'Crop analysis').slice(0,100)}`,html,attachments:[{filename:'crop-analysis.jpg',content:btoa(binary),content_type:'image/jpeg',content_id:'crop-analysis'}]})})
  if(!resend.ok){console.error('Email provider status',resend.status);return reply({error:'Email provider rejected the request'},502,origin)}
  const sent=await resend.json()
  const {error:logError}=await admin.from('email_dispatches').insert({user_id:user.id,scan_id,recipient,provider_message_id:sent.id})
  if(logError)console.error('Email was sent but audit log failed',logError.message)
  return reply({message_id:sent.id},200,origin)
 }catch(e){console.error('Report email error',e instanceof Error?e.name:'unknown');return reply({error:'Could not send report'},502,origin)}
})
