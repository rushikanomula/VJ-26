import {useEffect,useRef} from 'react'
import type {Box} from '../lib/types'
type Props={image:string;boxes:Box[];onExport?:(dataUrl:string)=>void}
export function AnnotatedImage({image,boxes,onExport}:Props){
 const ref=useRef<HTMLCanvasElement>(null)
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return
  const picture=new Image()
  let frame=0,active=true
  picture.onload=()=>{
   canvas.width=picture.naturalWidth;canvas.height=picture.naturalHeight
   const ctx=canvas.getContext('2d');if(!ctx)return
   const scale=Math.max(1,canvas.width/850)
   const draw=(time:number)=>{
    if(!active)return
    ctx.drawImage(picture,0,0)
    ctx.lineWidth=3*scale;ctx.font=`600 ${Math.round(16*scale)}px Inter, sans-serif`
    boxes.forEach((b,i)=>{
    const x=b.x/1000*canvas.width,y=b.y/1000*canvas.height,w=b.width/1000*canvas.width,h=b.height/1000*canvas.height
    ctx.strokeStyle='#00D4FF';ctx.setLineDash([12*scale,7*scale]);ctx.lineDashOffset=-(time/70)% (19*scale);ctx.strokeRect(x,y,w,h);ctx.setLineDash([])
    const label=`${i+1} · ${b.label}`;const textWidth=ctx.measureText(label).width+20*scale
    ctx.fillStyle=b.severity==='high'?'#9b2727':'#073c49';ctx.fillRect(x,Math.max(0,y-31*scale),textWidth,29*scale)
    ctx.fillStyle='#fff';ctx.fillText(label,x+10*scale,Math.max(20*scale,y-11*scale))
    })
    if(time===0)onExport?.(canvas.toDataURL('image/jpeg',.9))
    if(boxes.length)frame=requestAnimationFrame(draw)
   }
   draw(0)
  }
  picture.src=image
  return()=>{active=false;cancelAnimationFrame(frame);picture.onload=null}
 },[image,boxes,onExport])
 return <canvas ref={ref} role="img" aria-label="Uploaded photo with approximate AI suggested annotation regions" className="w-full h-auto rounded-xl border border-cyan/30"/>
}
