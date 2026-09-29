import {useEffect,useState} from 'react'
import type {User} from '@supabase/supabase-js'
import {supabase} from '../lib/supabase'
export default function Profile({user}:{user:User}){
 const [name,setName]=useState(''),[farm,setFarm]=useState(''),[location,setLocation]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{supabase?.from('profiles').select('display_name,farm_name,location').eq('id',user.id).maybeSingle().then(({data})=>{if(data){setName(data.display_name);setFarm(data.farm_name);setLocation(data.location)}})},[user.id])
 async function save(){if(!supabase)return;setBusy(true);setStatus('');const {error}=await supabase.from('profiles').upsert({id:user.id,display_name:name.trim(),farm_name:farm.trim(),location:location.trim(),updated_at:new Date().toISOString()});setBusy(false);setStatus(error?error.message:'Profile saved.')}
 return <section className="panel max-w-2xl"><h2 className="mb-5 text-xl font-semibold">Farm profile</h2><label className="mb-4 block"><span className="label">Your name</span><input className="field" value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label><label className="mb-4 block"><span className="label">Farm name</span><input className="field" value={farm} onChange={e=>setFarm(e.target.value)} maxLength={100}/></label><label className="mb-4 block"><span className="label">Location</span><input className="field" value={location} onChange={e=>setLocation(e.target.value)} maxLength={100}/></label><button className="btn" disabled={busy} onClick={save}>Save profile</button>{status&&<p role="status" className="mt-3 text-sm">{status}</p>}</section>
}
