import {lazy,Suspense,useCallback,useEffect,useState} from 'react'
import type {ChangeEvent,DragEvent,FormEvent} from 'react'
import type {User} from '@supabase/supabase-js'
import {Camera,Leaf,ScanLine,ShieldCheck,Upload,Download,LogOut} from 'lucide-react'
import {supabase,configured} from './lib/supabase'
import {prepareImage} from './lib/image'
import {AnnotatedImage} from './components/AnnotatedImage'
import type {Diagnosis} from './lib/types'
import {saveScan,listScans,imageUrl,deleteScan,sendReport} from './lib/reports'
import type {SavedScan} from './lib/reports'

const FarmScene=lazy(()=>import('./components/FarmScene'))
const Profile=lazy(()=>import('./components/Profile'))

type Mode=
  |'login'
  |'disease-detector'
  |'ar-scanner'
  |'history'
  |'farm-explorer'
  |'profile'

function getMode():Mode
{
  const path=location.pathname.slice(1)

  if(
    [
      'login',
      'ar-scanner',
      'history',
      'farm-explorer',
      'profile'
    ].includes(path)
  )
  {
    return path as Mode
  }

  return 'disease-detector'
}

function App()
{
  const [mode,setMode]=useState<Mode>(getMode)

  const [user,setUser]=useState<User|null>(null)
  const [authReady,setAuthReady]=useState(!configured)

  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [authBusy,setAuthBusy]=useState(false)

  const [image,setImage]=useState('')
  const [annotated,setAnnotated]=useState('')
  const [crop,setCrop]=useState('Auto detect')

  const [result,setResult]=useState<Diagnosis|null>(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)

  const [organic,setOrganic]=useState(true)
  const [dragging,setDragging]=useState(false)

  const [scans,setScans]=useState<SavedScan[]>([])
  const [saved,setSaved]=useState<SavedScan|null>(null)
  const [recipient,setRecipient]=useState('')
  const [selected,setSelected]=useState<SavedScan|null>(null)
  const [sending,setSending]=useState(false)

  /*
   * Get the current Supabase user and listen for login/logout changes.
   */
  useEffect(()=>
  {
    if(!supabase)
    {
      setAuthReady(true)
      return
    }

    supabase.auth.getUser()
      .then(({data})=>
      {
        setUser(data.user)
        setAuthReady(true)
      })
      .catch(()=>
      {
        setAuthReady(true)
      })

    const
    {
      data:
      {
        subscription
      }
    }=supabase.auth.onAuthStateChange((_event,session)=>
    {
      setUser(session?.user??null)
    })

    return()=>
    {
      subscription.unsubscribe()
    }
  },[])

  /*
   * Keep saved reports linked to the currently signed-in user.
   */
  useEffect(()=>
  {
    if(user)
    {
      void listScans()
        .then(setScans)
        .catch(()=>
        {
          setScans([])
        })
    }
    else
    {
      setScans([])
    }
  },[user])

  /*
   * Handle browser back/forward navigation.
   */
  useEffect(()=>
  {
    const onPop=()=>
    {
      setMode(getMode())
    }

    window.addEventListener('popstate',onPop)

    return()=>
    {
      window.removeEventListener('popstate',onPop)
    }
  },[])

  /*
   * Protect all pages except the login page.
   *
   * Not logged in -> /login
   * Logged in on /login -> /disease-detector
   */
  useEffect(()=>
  {
    if(!configured||!authReady)
    {
      return
    }

    if(!user&&mode!=='login')
    {
      history.replaceState({},'','/login')
      setMode('login')
    }

    if(user&&mode==='login')
    {
      history.replaceState({},'','/disease-detector')
      setMode('disease-detector')
    }
  },[user,authReady,mode])

  /*
   * Navigate between pages.
   */
  const go=(next:Mode)=>
  {
    history.pushState({},'',`/${next}`)
    setMode(next)

    setResult(null)
    setAnnotated('')
    setError('')
    setNotice('')
    setSelected(null)
  }

  const exportCanvas=useCallback((url:string)=>
  {
    setAnnotated(url)
  },[])

  /*
   * Prepare the selected crop image.
   */
  async function selectFile(file?:File)
  {
    if(!file)
    {
      return
    }

    setError('')
    setNotice('')
    setResult(null)
    setAnnotated('')
    setSaved(null)

    try
    {
      const prepared=await prepareImage(file)
      setImage(prepared.dataUrl)
    }
    catch(e)
    {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not open this image.'
      )
    }
  }

  function drop(e:DragEvent)
  {
    e.preventDefault()
    setDragging(false)

    void selectFile(e.dataTransfer.files[0])
  }

  function changed(e:ChangeEvent<HTMLInputElement>)
  {
    void selectFile(e.target.files?.[0])
    e.target.value=''
  }

  /*
   * Sign in or create a Supabase account.
   */
  async function authenticate(
    e:FormEvent,
    register:boolean
  )
  {
    e.preventDefault()

    if(!supabase)
    {
      setError('Supabase is not configured.')
      return
    }

    setAuthBusy(true)
    setError('')
    setNotice('')

    try
    {
      const
      {
        error:authError
      }=register
        ?await supabase.auth.signUp(
          {
            email,
            password
          }
        )
        :await supabase.auth.signInWithPassword(
          {
            email,
            password
          }
        )

      if(authError)
      {
        throw authError
      }

      if(register)
      {
        setNotice(
          'Account created. If email confirmation is enabled, verify your email and then sign in.'
        )
      }
    }
    catch(e)
    {
      setError(
        e instanceof Error
          ? e.message
          : 'Authentication failed.'
      )
    }
    finally
    {
      setAuthBusy(false)
    }
  }

  /*
   * Google sign-in.
   */
  async function google()
  {
    if(!supabase)
    {
      return
    }

    const
    {
      error:googleError
    }=await supabase.auth.signInWithOAuth(
      {
        provider:'google',
        options:
        {
          redirectTo:`${location.origin}/disease-detector`
        }
      }
    )

    if(googleError)
    {
      setError(googleError.message)
    }
  }

  /*
   * Run crop analysis through the Supabase Edge Function.
   */
  async function analyze()
  {
    if(!image||!supabase||!user)
    {
      return
    }

    setBusy(true)
    setError('')
    setResult(null)

    try
    {
      const
      {
        data:
        {
          session
        },
        error:sessionError
      }=await supabase.auth.getSession()

      if(sessionError||!session)
      {
        throw new Error(
          'Your session expired. Please sign in again.'
        )
      }

      const response=await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-crop`,
        {
          method:'POST',

          headers:
          {
            'Content-Type':'application/json',
            'Authorization':`Bearer ${session.access_token}`,
            'apikey':import.meta.env.VITE_SUPABASE_ANON_KEY
          },

          body:JSON.stringify(
            {
              image_data_url:image,
              crop_hint:crop,
              mode
            }
          )
        }
      )

      const payload=await response
        .json()
        .catch(()=>
        ({
          error:'Invalid server response'
        }))

      if(!response.ok)
      {
        throw new Error(
          typeof payload.error==='string'
            ?payload.error
            :`Analysis failed (${response.status}).`
        )
      }

      setResult(payload as Diagnosis)
    }
    catch(e)
    {
      setError(
        e instanceof Error
          ? e.message
          : 'Analysis failed.'
      )
    }
    finally
    {
      setBusy(false)
    }
  }

  /*
   * Save the analysis report.
   */
  async function persist()
  {
    if(!user||!result||!annotated)
    {
      return
    }

    setBusy(true)
    setError('')

    try
    {
      const record=await saveScan(
        user.id,
        result,
        image,
        annotated
      )

      setSaved(record)
      setScans(current=>
      [
        record,
        ...current
      ])

      setNotice(
        'Report saved securely to your account.'
      )
    }
    catch(e)
    {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save report'
      )
    }
    finally
    {
      setBusy(false)
    }
  }

  /*
   * Email a saved report.
   */
  async function dispatch()
  {
    if(!saved||!recipient)
    {
      return
    }

    setSending(true)
    setError('')

    try
    {
      await sendReport(
        saved.id,
        recipient
      )

      setNotice(
        `Report sent to ${recipient}`
      )
    }
    catch(e)
    {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not send email'
      )
    }
    finally
    {
      setSending(false)
    }
  }

  /*
   * Open an existing saved report.
   */
  async function openScan(scan:SavedScan)
  {
    setError('')

    try
    {
      const url=await imageUrl(
        scan.image_path
      )

      setImage(url)
      setResult(scan.diagnosis)
      setSelected(scan)
      setSaved(scan)

      history.pushState(
        {},
        '',
        '/disease-detector'
      )

      setMode('disease-detector')
    }
    catch(e)
    {
      setError(
        e instanceof Error
          ? e.message
          : 'Cannot open report'
      )
    }
  }

  /*
   * Delete a saved report.
   */
  async function removeScan(scan:SavedScan)
  {
    if(!confirm('Delete this report and its photos?'))
    {
      return
    }

    try
    {
      await deleteScan(scan)

      setScans(current=>
        current.filter(
          s=>s.id!==scan.id
        )
      )

      setNotice('Report deleted.')
    }
    catch(e)
    {
      setError(
        e instanceof Error
          ? e.message
          : 'Delete failed'
      )
    }
  }

  function download()
  {
    if(!annotated)
    {
      return
    }

    const a=document.createElement('a')

    a.href=annotated
    a.download=`varuna-${Date.now()}.jpg`

    a.click()
  }

  /*
   * Dedicated login page.
   */
  if(mode==='login')
  {
    return(
      <div className="min-h-screen bg-charcoal text-slate-100">

        <header className="border-b border-white/10 bg-[#101a19] px-5 py-4 md:px-10">

          <div className="mx-auto flex max-w-7xl items-center justify-center">

            <div className="flex items-center gap-3 text-xl font-extrabold tracking-tight">

              <span className="rounded-xl bg-leaf p-2">
                <Leaf size={22}/>
              </span>

              Varuna

              <span className="hidden font-hud text-xs tracking-widest text-cyan sm:inline">
                FIELD INTELLIGENCE
              </span>

            </div>

          </div>

        </header>

        <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-7xl items-center justify-center p-5 md:p-10">

          <section className="panel w-full max-w-xl">

            <div className="mb-7 text-center">

              <div className="mb-3 flex justify-center">
                <span className="rounded-2xl bg-leaf p-4">
                  <Leaf size={32}/>
                </span>
              </div>

              <h1 className="text-3xl font-bold tracking-tight">
                Welcome to Varuna
              </h1>

              <p className="mt-3 text-slate-400">
                Sign in to access crop analysis,
                saved reports, and your farm tools.
              </p>

            </div>

            {!configured&&
              <div
                role="alert"
                className="mb-6 rounded-xl border border-amber/40 bg-amber/10 p-4 text-amber"
              >
                Set VITE_SUPABASE_URL and
                VITE_SUPABASE_ANON_KEY in .env.local
                to connect authentication.
              </div>
            }

            {configured&&
              <form
                onSubmit={e=>
                  authenticate(e,false)
                }
                className="space-y-4"
              >

                <label className="block">

                  <span className="label">
                    Email
                  </span>

                  <input
                    className="field"
                    type="email"
                    value={email}
                    onChange={e=>
                      setEmail(e.target.value)
                    }
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                  />

                </label>

                <label className="block">

                  <span className="label">
                    Password
                  </span>

                  <input
                    className="field"
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={e=>
                      setPassword(e.target.value)
                    }
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                  />

                </label>

                <div className="flex flex-wrap gap-3">

                  <button
                    disabled={authBusy}
                    className="btn flex-1"
                  >
                    {authBusy
                      ?'Please wait…'
                      :'Sign in'}
                  </button>

                  <button
                    disabled={authBusy}
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={()=>
                    {
                      const fake=
                      {
                        preventDefault:()=>{}
                      } as FormEvent

                      void authenticate(
                        fake,
                        true
                      )
                    }}
                  >
                    Create account
                  </button>

                </div>

                <div className="my-5 flex items-center gap-3">

                  <div className="h-px flex-1 bg-white/10"/>

                  <span className="text-xs text-slate-500">
                    OR
                  </span>

                  <div className="h-px flex-1 bg-white/10"/>

                </div>

                <button
                  type="button"
                  className="btn-secondary w-full"
                  onClick={google}
                  disabled={authBusy}
                >
                  Continue with Google
                </button>

              </form>
            }

            {error&&
              <div
                role="alert"
                className="mt-5 rounded-xl border border-red-500/40 bg-red-900/20 p-4 text-red-200"
              >
                {error}
              </div>
            }

            {notice&&
              <div
                role="status"
                className="mt-5 rounded-xl border border-leaf/40 bg-forest/40 p-4"
              >
                {notice}
              </div>
            }

          </section>

        </main>

      </div>
    )
  }

  /*
   * Main authenticated application.
   */
  return(
    <div className="min-h-screen bg-charcoal text-slate-100">

      <header className="border-b border-white/10 bg-[#101a19] px-5 py-4 md:px-10">

        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">

          <button
            onClick={()=>
              go('disease-detector')
            }
            className="flex items-center gap-3 text-xl font-extrabold tracking-tight"
          >

            <span className="rounded-xl bg-leaf p-2">
              <Leaf size={22}/>
            </span>

            Varuna

            <span className="hidden font-hud text-xs tracking-widest text-cyan sm:inline">
              FIELD INTELLIGENCE
            </span>

          </button>

          <div className="flex flex-wrap items-center gap-2">

            <button
              onClick={()=>
                go('disease-detector')
              }
              className={
                mode==='disease-detector'
                  ?'btn'
                  :'btn-secondary'
              }
            >
              <Camera size={17}/>
              Disease detector
            </button>

            <button
              onClick={()=>
                go('ar-scanner')
              }
              className={
                mode==='ar-scanner'
                  ?'btn'
                  :'btn-secondary'
              }
            >
              <ScanLine size={17}/>
              AR scanner
            </button>

            <button
              onClick={()=>
                go('history')
              }
              className={
                mode==='history'
                  ?'btn'
                  :'btn-secondary'
              }
            >
              History
            </button>

            <button
              onClick={()=>
                go('farm-explorer')
              }
              className={
                mode==='farm-explorer'
                  ?'btn'
                  :'btn-secondary'
              }
            >
              3D farm
            </button>

            <button
              onClick={()=>
                go('profile')
              }
              className={
                mode==='profile'
                  ?'btn'
                  :'btn-secondary'
              }
            >
              Profile
            </button>

            {user&&
              <button
                title="Sign out"
                className="btn-secondary"
                onClick={()=>
                  supabase?.auth.signOut()
                }
              >
                <LogOut size={17}/>
              </button>
            }

          </div>

        </div>

      </header>

      <main className="mx-auto max-w-7xl p-5 md:p-10">

        <div className="mb-7">

          <div className="mb-2 font-hud text-xs tracking-widest text-cyan">
            CROP ANALYSIS / PHASE 1
          </div>

          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">

            {mode==='ar-scanner'
              ?'AR crop scanner'
              :mode==='history'
              ?'Saved reports'
              :mode==='farm-explorer'
              ?'3D farm explorer'
              :mode==='profile'
              ?'Farm profile'
              :'Crop disease detector'}

          </h1>

          <p className="mt-3 max-w-3xl text-slate-400">
            Upload a real field photo for AI assisted observations.
            Verify every finding with local agronomic expertise
            before treating a crop.
          </p>

        </div>

        {!configured&&
          <div
            role="alert"
            className="mb-6 rounded-xl border border-amber/40 bg-amber/10 p-4 text-amber"
          >
            Set VITE_SUPABASE_URL and
            VITE_SUPABASE_ANON_KEY in .env.local
            to connect the analysis backend. See README.md.
          </div>
        }

        {mode==='profile'&&user&&
          <Suspense fallback={<p>Loading profile…</p>}>
            <Profile user={user}/>
          </Suspense>
        }

        {mode==='farm-explorer'&&
          <section className="panel">

            <h2 className="mb-4 text-xl font-bold">
              Interactive field model
            </h2>

            <Suspense fallback={<p>Loading the 3D scene…</p>}>
              <FarmScene/>
            </Suspense>

            <p className="mt-3 text-sm text-slate-400">
              Drag to rotate and scroll to zoom.
              This is an illustrative crop scene,
              not a model of your farm.
            </p>

          </section>
        }

        {mode==='history'&&
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

            {scans.length
              ?scans.map(scan=>
                <article
                  className="panel"
                  key={scan.id}
                >

                  <div className="font-hud text-xs text-cyan">
                    {new Date(
                      scan.created_at
                    ).toLocaleString()}
                  </div>

                  <h2 className="mt-2 text-lg font-semibold">
                    {scan.diagnosis.diagnosis}
                  </h2>

                  <p className="mt-2 text-sm text-slate-400">
                    {scan.crop} · {scan.diagnosis.severity}
                  </p>

                  <div className="mt-4 flex gap-2">

                    <button
                      className="btn"
                      onClick={()=>
                        openScan(scan)
                      }
                    >
                      Open
                    </button>

                    <button
                      className="btn-secondary"
                      onClick={()=>
                        removeScan(scan)
                      }
                    >
                      Delete
                    </button>

                  </div>

                </article>
              )
              :<div className="panel">
                No saved reports yet.
                Analyze a photo and select Save report.
              </div>
            }

          </section>
        }

        {(mode==='ar-scanner'||mode==='disease-detector')&&
          <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">

            <section className="panel">

              <h2 className="mb-1 text-xl font-bold">
                1. Add a field photo
              </h2>

              <p className="mb-5 text-sm text-slate-400">
                JPG, PNG, or WebP up to 10 MB.
                Resized locally to 1600 pixels before analysis.
              </p>

              <label
                className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
                  dragging
                    ?'border-cyan bg-cyan/10'
                    :'border-emerald-600/50 bg-forest/20 hover:border-cyan/60'
                }`}
                onDragOver={e=>
                {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={()=>
                  setDragging(false)
                }
                onDrop={drop}
              >

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={changed}
                />

                {image
                  ?<img
                    src={image}
                    alt="Selected crop"
                    className="max-h-96 w-full object-contain"
                  />
                  :<>
                    <Upload
                      className="mb-4 text-cyan"
                      size={38}
                    />

                    <strong>
                      Drop a photo or choose a file
                    </strong>

                    <span className="mt-2 text-sm text-slate-400">
                      Clear, well lit crop or leaf photos work best
                    </span>
                  </>
                }

              </label>

              <label className="mt-5 block">

                <span className="label">
                  Crop
                </span>

                <select
                  className="field"
                  value={crop}
                  onChange={e=>
                    setCrop(e.target.value)
                  }
                >
                  {[
                    'Auto detect',
                    'Rice',
                    'Wheat',
                    'Maize',
                    'Tomato',
                    'Potato',
                    'Sugarcane',
                    'Other'
                  ].map(x=>
                    <option key={x}>
                      {x}
                    </option>
                  )}
                </select>

              </label>

              <button
                disabled={
                  !configured||
                  !user||
                  !image||
                  busy
                }
                onClick={analyze}
                className="btn mt-5 w-full py-3"
              >
                {busy
                  ?'Analyzing image…'
                  :'Analyze real photo'}
              </button>

              <p className="mt-3 text-xs text-slate-500">
                Image data is sent to your Supabase function
                and then OpenAI. It is stored privately only
                if you select Save report.
              </p>

            </section>

            <section className="panel">

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">

                <h2 className="text-xl font-bold">
                  2. Visual analysis
                </h2>

                {annotated&&
                  <button
                    className="btn-secondary text-sm"
                    onClick={download}
                  >
                    <Download size={16}/>
                    Download annotated image
                  </button>
                }

              </div>

              {result
                ?<AnnotatedImage
                  image={image}
                  boxes={result.boxes}
                  onExport={exportCanvas}
                />
                :<div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-white/10 bg-[#111b20] text-center">

                  <ScanLine
                    className="mb-4 text-cyan"
                    size={42}
                  />

                  <h3 className="font-semibold">
                    Analysis appears here
                  </h3>

                  <p className="mt-2 max-w-xs text-sm text-slate-400">
                    AI suggested regions will be drawn
                    on your actual uploaded photo.
                  </p>

                </div>
              }

              <p className="mt-3 text-xs text-slate-500">
                Bounding boxes are visual estimates generated
                by the model, not precise segmentation.
              </p>

            </section>

          </div>
        }

        {error&&
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-500/40 bg-red-900/20 p-4 text-red-200"
          >
            {error}
          </div>
        }

        {notice&&
          <div
            role="status"
            className="mt-5 rounded-xl border border-leaf/40 bg-forest/40 p-4"
          >
            {notice}
          </div>
        }

        {(mode==='ar-scanner'||mode==='disease-detector')&&result&&
          <section
            className="panel mt-6"
            aria-live="polite"
          >

            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">

              <div>

                <div className="font-hud text-xs tracking-widest text-cyan">
                  AI ASSESSMENT · REVIEW REQUIRED
                </div>

                <h2 className="mt-2 text-2xl font-bold">
                  {result.diagnosis}
                </h2>

                <p className="mt-2 text-slate-300">
                  {result.summary}
                </p>

              </div>

              <span className="rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-sm text-amber">
                {result.severity} severity · {Math.round(result.confidence*100)}% model estimate
              </span>

            </div>

            <div className="grid gap-5 md:grid-cols-2">

              <div>

                <div className="mb-3 flex gap-2">

                  <button
                    className={
                      organic
                        ?'btn'
                        :'btn-secondary'
                    }
                    onClick={()=>
                      setOrganic(true)
                    }
                  >
                    Organic options
                  </button>

                  <button
                    className={
                      !organic
                        ?'btn'
                        :'btn-secondary'
                    }
                    onClick={()=>
                      setOrganic(false)
                    }
                  >
                    Chemical options
                  </button>

                </div>

                {(organic
                  ?result.organic_treatments
                  :result.chemical_treatments
                ).length
                  ?(
                    organic
                      ?result.organic_treatments
                      :result.chemical_treatments
                  ).map((t,i)=>
                    <article
                      key={i}
                      className="mb-3 rounded-xl border border-white/10 bg-white/5 p-4"
                    >

                      <h3 className="font-semibold text-cyan">
                        {t.name}
                      </h3>

                      <p className="mt-2 text-sm text-slate-300">
                        {t.instructions}
                      </p>

                      <p className="mt-2 text-xs text-amber">
                        {t.precautions}
                      </p>

                    </article>
                  )
                  :<p className="text-slate-400">
                    No suitable options could be suggested
                    from this image.
                  </p>
                }

              </div>

              <div>

                <h3 className="mb-3 font-semibold">
                  Recommended next steps
                </h3>

                <ul className="space-y-2 text-sm text-slate-300">

                  {result.next_steps.map((x,i)=>
                    <li key={i}>
                      • {x}
                    </li>
                  )}

                </ul>

                <div className="mt-5 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm">

                  <ShieldCheck
                    className="mb-2 text-amber"
                    size={21}
                  />

                  <strong>
                    Assessment limits
                  </strong>

                  <ul className="mt-2 space-y-1 text-slate-300">

                    {result.limitations.map((x,i)=>
                      <li key={i}>
                        • {x}
                      </li>
                    )}

                  </ul>

                  <p className="mt-3 text-amber">
                    Confirm diagnosis, product approval,
                    dose, and safety instructions with a
                    local qualified expert.
                  </p>

                </div>

              </div>

            </div>

            <div className="mt-6 border-t border-white/10 pt-5">

              <div className="flex flex-wrap gap-3">

                <button
                  className="btn-secondary"
                  disabled={
                    busy||
                    !annotated||
                    !!saved
                  }
                  onClick={persist}
                >
                  {saved
                    ?'Saved to history'
                    :'Save report'}
                </button>

                {selected&&
                  <span className="text-sm text-slate-400">
                    Viewing a saved report
                  </span>
                }

              </div>

              {saved&&
                <div className="mt-4 flex flex-wrap items-end gap-3">

                  <label>

                    <span className="label">
                      Email report to farmer or field officer
                    </span>

                    <input
                      className="field"
                      type="email"
                      value={recipient}
                      onChange={e=>
                        setRecipient(e.target.value)
                      }
                      placeholder="recipient@example.com"
                    />

                  </label>

                  <button
                    className="btn"
                    disabled={
                      sending||
                      !recipient
                    }
                    onClick={dispatch}
                  >
                    {sending
                      ?'Sending…'
                      :'Send email'}
                  </button>

                </div>
              }

            </div>

          </section>
        }

      </main>

    </div>
  )
}

export default App