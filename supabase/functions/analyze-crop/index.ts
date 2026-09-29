import {createClient} from 'npm:@supabase/supabase-js@2'

const MAX_BODY=4_000_000

const cors=(origin:string|null)=>
{
  const origins=(Deno.env.get('ALLOWED_ORIGINS')||'http://localhost:5173')
    .split(',')
    .map(x=>x.trim())

  return {
    'Access-Control-Allow-Origin':
      origin&&origins.includes(origin)
        ?origin
        :origins[0],

    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info',

    'Access-Control-Allow-Methods':
      'POST, OPTIONS',

    'Vary':'Origin',

    'Content-Type':
      'application/json; charset=utf-8',

    'Cache-Control':'no-store'
  }
}

const reply=(
  body:unknown,
  status:number,
  origin:string|null
)=>
{
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers:cors(origin)
    }
  )
}

const treatment=
{
  type:'object',
  additionalProperties:false,

  required:
  [
    'name',
    'instructions',
    'precautions'
  ],

  properties:
  {
    name:
    {
      type:'string'
    },

    instructions:
    {
      type:'string'
    },

    precautions:
    {
      type:'string'
    }
  }
}

const box=
{
  type:'object',
  additionalProperties:false,

  required:
  [
    'x',
    'y',
    'width',
    'height',
    'label',
    'severity'
  ],

  properties:
  {
    x:
    {
      type:'number'
    },

    y:
    {
      type:'number'
    },

    width:
    {
      type:'number'
    },

    height:
    {
      type:'number'
    },

    label:
    {
      type:'string'
    },

    severity:
    {
      type:'string',
      enum:
      [
        'low',
        'moderate',
        'high'
      ]
    }
  }
}

const schema=
{
  type:'object',
  additionalProperties:false,

  required:
  [
    'crop',
    'diagnosis',
    'summary',
    'confidence',
    'severity',
    'boxes',
    'organic_treatments',
    'chemical_treatments',
    'next_steps',
    'limitations',
    'needs_expert_review'
  ],

  properties:
  {
    crop:
    {
      type:'string'
    },

    diagnosis:
    {
      type:'string'
    },

    summary:
    {
      type:'string'
    },

    confidence:
    {
      type:'number'
    },

    severity:
    {
      type:'string',
      enum:
      [
        'none',
        'low',
        'moderate',
        'high',
        'unknown'
      ]
    },

    boxes:
    {
      type:'array',
      items:box
    },

    organic_treatments:
    {
      type:'array',
      items:treatment
    },

    chemical_treatments:
    {
      type:'array',
      items:treatment
    },

    next_steps:
    {
      type:'array',
      items:
      {
        type:'string'
      }
    },

    limitations:
    {
      type:'array',
      items:
      {
        type:'string'
      }
    },

    needs_expert_review:
    {
      type:'boolean'
    }
  }
}

function valid(v:unknown)
{
  if(!v||typeof v!=='object')
  {
    return false
  }

  const d=v as Record<string,unknown>

  return(
    typeof d.crop==='string'&&
    typeof d.diagnosis==='string'&&
    typeof d.summary==='string'&&

    typeof d.confidence==='number'&&
    d.confidence>=0&&
    d.confidence<=1&&

    [
      'none',
      'low',
      'moderate',
      'high',
      'unknown'
    ].includes(String(d.severity))&&

    Array.isArray(d.boxes)&&
    d.boxes.length<=8&&

    d.boxes.every(
      (b:Record<string,unknown>)=>
        b&&
        ['x','y','width','height'].every(
          k=>
            typeof b[k]==='number'&&
            Number.isFinite(b[k])&&
            Number(b[k])>=0&&
            Number(b[k])<=1000
        )&&

        Number(b.width)>0&&
        Number(b.height)>0&&

        Number(b.x)+Number(b.width)<=1000&&
        Number(b.y)+Number(b.height)<=1000&&

        typeof b.label==='string'
    )&&

    Array.isArray(d.organic_treatments)&&
    Array.isArray(d.chemical_treatments)&&
    Array.isArray(d.next_steps)&&
    Array.isArray(d.limitations)&&
    typeof d.needs_expert_review==='boolean'
  )
}

Deno.serve(async req=>
{
  const origin=req.headers.get('origin')

  if(req.method==='OPTIONS')
  {
    return new Response(
      null,
      {
        status:204,
        headers:cors(origin)
      }
    )
  }

  if(req.method!=='POST')
  {
    return reply(
      {
        error:'Method not allowed'
      },
      405,
      origin
    )
  }

  if(
    Number(
      req.headers.get('content-length')||0
    )>MAX_BODY
  )
  {
    return reply(
      {
        error:'Image payload is too large.'
      },
      413,
      origin
    )
  }

  const token=
    req.headers
      .get('authorization')
      ?.match(/^Bearer (.+)$/i)
      ?.[1]

  if(!token)
  {
    return reply(
      {
        error:'Sign in to analyze images.'
      },
      401,
      origin
    )
  }

  const url=Deno.env.get('SUPABASE_URL')
  const anon=Deno.env.get('SUPABASE_ANON_KEY')
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  /*
   * Groq replaces OpenAI as the analysis provider.
   */
  const groqKey=Deno.env.get('GROQ_API_KEY')

  if(
    !url||
    !anon||
    !service||
    !groqKey
  )
  {
    return reply(
      {
        error:'Analysis is not configured.'
      },
      503,
      origin
    )
  }

  try
  {
    /*
     * Verify the Supabase user.
     */
    const publicClient=createClient(
      url,
      anon,
      {
        auth:
        {
          autoRefreshToken:false,
          persistSession:false
        }
      }
    )

    const
    {
      data:
      {
        user
      },
      error:authError
    }=
      await publicClient.auth.getUser(token)

    if(authError||!user)
    {
      return reply(
        {
          error:'Session is invalid. Sign in again.'
        },
        401,
        origin
      )
    }

    /*
     * Read and validate the request body.
     */
    const bodyText=await req.text()

    if(bodyText.length>MAX_BODY)
    {
      return reply(
        {
          error:'Image payload is too large.'
        },
        413,
        origin
      )
    }

    let body:Record<string,unknown>

    try
    {
      body=JSON.parse(bodyText)
    }
    catch
    {
      return reply(
        {
          error:'Invalid JSON request.'
        },
        400,
        origin
      )
    }

    const image=body.image_data_url
    const crop=body.crop_hint
    const mode=body.mode

    if(
      typeof image!=='string'||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)||
      image.length>MAX_BODY||
      image.length<1000
    )
    {
      return reply(
        {
          error:'Send a compressed JPEG data URL.'
        },
        400,
        origin
      )
    }

    if(
      typeof crop!=='string'||
      crop.length>60||
      ![
        'ar-scanner',
        'disease-detector'
      ].includes(String(mode))
    )
    {
      return reply(
        {
          error:'Invalid crop or mode.'
        },
        400,
        origin
      )
    }

    /*
     * Check the existing Supabase vision quota.
     */
    const admin=createClient(
      url,
      service,
      {
        auth:
        {
          autoRefreshToken:false,
          persistSession:false
        }
      }
    )

    const
    {
      data:allowed,
      error:quotaError
    }=
      await admin.rpc(
        'allow_vision_request',
        {
          p_user_id:user.id
        }
      )

    if(quotaError)
    {
      console.error(
        'Quota failed',
        quotaError.message
      )

      return reply(
        {
          error:'Analysis is temporarily unavailable.'
        },
        503,
        origin
      )
    }

    if(!allowed)
    {
      return reply(
        {
          error:'Hourly analysis limit reached. Try later.'
        },
        429,
        origin
      )
    }

    /*
     * Call Groq Vision.
     *
     * qwen/qwen3.8-27b supports:
     * - image input
     * - JSON mode
     * - JSON schema mode
     */
    const controller=new AbortController()

    const timer=setTimeout(
      ()=>
        controller.abort(),
      45000
    )

    let upstream:Response

    try
    {
      upstream=await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method:'POST',

          signal:controller.signal,

          headers:
          {
            'Authorization':`Bearer ${groqKey}`,
            'Content-Type':'application/json'
          },

          body:JSON.stringify(
          {
            model:'qwen/qwen3.8-27b',

            temperature:0.1,

            max_completion_tokens:1800,

            response_format:
            {
              type:'json_schema',

              json_schema:
              {
                name:'crop_diagnosis',

                strict:true,

                schema
              }
            },

            messages:
            [
              {
                role:'system',

                content:
                  'You are an agricultural image observation assistant. '+
                  'Use only visible evidence. '+
                  'If uncertain, say unknown and recommend expert review. '+
                  'confidence is a subjective model estimate, not a calibrated probability. '+
                  'Return approximate boxes in normalized 0–1000 coordinates; '+
                  'use zero boxes when no reliable finding. '+
                  'Never invent precise segmentation. '+
                  'Do not give pesticide doses, brand names, or unsupported application instructions. '+
                  'Chemical options require local registration, label instructions, and qualified review. '+
                  'Include limitations.'
              },

              {
                role:'user',

                content:
                [
                  {
                    type:'text',

                    text:
                      `Analyze this real farm photo. `+
                      `Crop hint: ${crop}. `+
                      `Interface: ${mode}. `+
                      `Distinguish disease, nutrient, pest, and non-crop possibilities. `+
                      `State uncertainty. `+
                      `Return ONLY the requested JSON object.`
                  },

                  {
                    type:'image_url',

                    image_url:
                    {
                      url:image,
                      detail:'high'
                    }
                  }
                ]
              }
            ]
          })
        }
      )
    }
    finally
    {
      clearTimeout(timer)
    }

    /*
     * Handle Groq errors.
     */
    if(!upstream.ok)
    {
      let errorDetails=''

      try
      {
        const errorBody=await upstream.json()

        errorDetails=
          JSON.stringify(errorBody)
      }
      catch
      {
        errorDetails=''
      }

      console.error(
        'Groq status',
        upstream.status,
        errorDetails
      )

      if(upstream.status===429)
      {
        return reply(
          {
            error:'Analysis provider is rate limited. Try again shortly.'
          },
          429,
          origin
        )
      }

      if(upstream.status===401)
      {
        return reply(
          {
            error:'Groq API authentication failed.'
          },
          502,
          origin
        )
      }

      if(upstream.status===403)
      {
        return reply(
          {
            error:'Groq API access was denied.'
          },
          502,
          origin
        )
      }

      return reply(
        {
          error:'Analysis provider is unavailable.'
        },
        502,
        origin
      )
    }

    /*
     * Parse the Groq response.
     */
    const output=await upstream.json()

    const choice=
      output.choices?.[0]

    if(choice?.message?.refusal)
    {
      return reply(
        {
          error:'This image could not be analyzed.'
        },
        422,
        origin
      )
    }

    if(
      typeof choice?.message?.content!=='string'
    )
    {
      return reply(
        {
          error:'Incomplete analysis. Try again.'
        },
        502,
        origin
      )
    }

    let diagnosis:unknown

    try
    {
      diagnosis=
        JSON.parse(
          choice.message.content
        )
    }
    catch
    {
      console.error(
        'Groq returned invalid JSON'
      )

      return reply(
        {
          error:'Invalid analysis format. Try again.'
        },
        502,
        origin
      )
    }

    /*
     * Validate the model output using
     * the same validation rules as the original function.
     */
    if(!valid(diagnosis))
    {
      console.error(
        'Groq returned invalid diagnosis format'
      )

      return reply(
        {
          error:'Invalid analysis format. Try again.'
        },
        502,
        origin
      )
    }

    return reply(
      diagnosis,
      200,
      origin
    )
  }
  catch(e)
  {
    console.error(
      'Analysis error',
      e instanceof Error
        ?e.name
        :'unknown'
    )

    return reply(
      {
        error:
          e instanceof DOMException&&
          e.name==='AbortError'
            ?'Analysis timed out.'
            :'Analysis failed.'
      },
      502,
      origin
    )
  }
})