const MAX_BYTES=10*1024*1024
const MAX_SIDE=1600
export async function prepareImage(file:File):Promise<{dataUrl:string;width:number;height:number}> {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG, or WebP image.')
  if(file.size>MAX_BYTES)throw new Error('Image is over 10 MB. Choose a smaller photo.')
  const bitmap=await createImageBitmap(file)
  try{
    if(bitmap.width<256||bitmap.height<256)throw new Error('Image is too small. Use a photo at least 256 × 256 pixels.')
    const scale=Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height))
    const width=Math.round(bitmap.width*scale),height=Math.round(bitmap.height*scale)
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable in this browser.')
    ctx.drawImage(bitmap,0,0,width,height)
    return {dataUrl:canvas.toDataURL('image/jpeg',.82),width,height}
  }finally{bitmap.close()}
}
