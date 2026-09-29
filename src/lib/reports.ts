import {supabase} from './supabase'
import type {Diagnosis} from './types'
export type SavedScan={id:string;user_id:string;crop:string;diagnosis:Diagnosis;image_path:string;annotated_path:string;created_at:string}
function jpegBlob(dataUrl:string):Blob{const [meta,encoded]=dataUrl.split(',');if(meta!=='data:image/jpeg;base64'||!encoded)throw new Error('Invalid JPEG canvas data');const raw=atob(encoded);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:'image/jpeg'})}
export async function saveScan(userId:string,diagnosis:Diagnosis,image:string,annotated:string):Promise<SavedScan>{
 if(!supabase)throw new Error('Supabase is not configured')
 const id=crypto.randomUUID(),base=`${userId}/${id}`,imagePath=`${base}/original.jpg`,annotatedPath=`${base}/annotated.jpg`
 const original=await supabase.storage.from('crop-scans').upload(imagePath,jpegBlob(image),{contentType:'image/jpeg',upsert:false})
 if(original.error)throw original.error
 const overlay=await supabase.storage.from('crop-scans').upload(annotatedPath,jpegBlob(annotated),{contentType:'image/jpeg',upsert:false})
 if(overlay.error){await supabase.storage.from('crop-scans').remove([imagePath]);throw overlay.error}
 const {data,error}=await supabase.from('scan_history').insert({id,user_id:userId,crop:diagnosis.crop,diagnosis,image_path:imagePath,annotated_path:annotatedPath}).select().single()
 if(error){await supabase.storage.from('crop-scans').remove([imagePath,annotatedPath]);throw error}
 return data as SavedScan
}
export async function listScans():Promise<SavedScan[]>{if(!supabase)return[];const {data,error}=await supabase.from('scan_history').select('*').order('created_at',{ascending:false}).limit(50);if(error)throw error;return data as SavedScan[]}
export async function imageUrl(path:string){if(!supabase)throw new Error('Supabase is not configured');const {data,error}=await supabase.storage.from('crop-scans').download(path);if(error)throw error;return URL.createObjectURL(data)}
export async function deleteScan(scan:SavedScan){if(!supabase)throw new Error('Supabase is not configured');const {error}=await supabase.from('scan_history').delete().eq('id',scan.id);if(error)throw error;const removed=await supabase.storage.from('crop-scans').remove([scan.image_path,scan.annotated_path]);if(removed.error)throw removed.error}
export async function sendReport(scanId:string,recipient:string){if(!supabase)throw new Error('Supabase is not configured');const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Sign in again');const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-report`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,apikey:import.meta.env.VITE_SUPABASE_ANON_KEY},body:JSON.stringify({scan_id:scanId,recipient})});const result=await res.json().catch(()=>({error:'Invalid server response'}));if(!res.ok)throw new Error(result.error||'Email could not be sent');return result as {message_id:string}}
