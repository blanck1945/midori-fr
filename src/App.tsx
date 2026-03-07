import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './api'
import type { CareTask, DashboardData, ProgressSnapshot, User } from './types'

type Tab = 'home' | 'tasks' | 'progress'

// Resize to max 1024px on longest side, JPEG 80% — enough for Gemini plant ID
function resizeImage(file: File, maxPx = 1024, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = String(e.target?.result)
    }
    reader.readAsDataURL(file)
  })
}

/* ─── Garden background ───────────────────────────────────────────────────── */

const GARDEN_POSITIONS: [number, number][] = [
  [15, 20], [85, 15], [50, 45],
  [10, 78], [90, 80], [45, 88],
]

type RGB = [number, number, number]

function parseRgb(colorRgb: string | null): RGB | null {
  if (!colorRgb) return null
  const parts = colorRgb.split(',').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  return parts as RGB
}

function extractDominantColor(imageUrl: string): Promise<RGB> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const size = 40
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, size, size)
      const data = ctx.getImageData(0, 0, size, size).data
      let r = 0, g = 0, b = 0, count = 0
      for (let i = 0; i < data.length; i += 4) {
        const br = (data[i] + data[i + 1] + data[i + 2]) / 3
        if (br > 25 && br < 230) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++
        }
      }
      resolve(count > 0
        ? [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
        : [62, 207, 110])
    }
    img.onerror = () => resolve([62, 207, 110])
    img.src = imageUrl
  })
}

function buildGardenBackground(colors: RGB[]): string {
  if (colors.length === 0) {
    return [
      'radial-gradient(ellipse 60% 55% at 25% 35%, rgba(62,207,110,0.10) 0%, transparent 70%)',
      'radial-gradient(ellipse 45% 45% at 78% 68%, rgba(46,184,91,0.07) 0%, transparent 65%)',
      'radial-gradient(ellipse 35% 40% at 55% 85%, rgba(30,79,53,0.12) 0%, transparent 60%)',
    ].join(', ')
  }
  return colors.slice(0, 6).map(([r, g, b], i) => {
    const [x, y] = GARDEN_POSITIONS[i % GARDEN_POSITIONS.length]
    return `radial-gradient(ellipse 55% 50% at ${x}% ${y}%, rgba(${r},${g},${b},0.16) 0%, transparent 65%)`
  }).join(', ')
}

/* ─── Primitives ─────────────────────────────────────────────────────────── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted">
      {children}
    </span>
  )
}

function Input({
  value, onChange, placeholder, type = 'text',
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      className="w-full rounded-xl border border-border bg-surface-alt px-3.5 py-2.5 text-sm text-text placeholder:text-dim focus:border-primary focus:bg-surface-raised focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

function Textarea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea
      rows={rows}
      className="w-full resize-none rounded-xl border border-border bg-surface-alt px-3.5 py-2.5 text-sm text-text placeholder:text-dim focus:border-primary focus:bg-surface-raised focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

function Select({
  value, onChange, options,
}: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select
      className="w-full rounded-xl border border-border bg-surface-alt px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Btn({
  children, onClick, type = 'button', variant = 'primary', size = 'md', disabled = false, className = '',
}: {
  children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md'
  disabled?: boolean; className?: string
}) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-xl tracking-wide transition active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm' }
  const variants = {
    primary: 'bg-primary text-primary-text hover:bg-primary-dk',
    secondary: 'bg-secondary text-secondary-text border border-border-bright hover:bg-surface-raised',
    danger: 'bg-danger text-white hover:bg-danger-dk',
    ghost: 'text-muted hover:text-strong hover:bg-surface-alt',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}

function Card({ children, accent = false, className = '' }: { children: React.ReactNode; accent?: boolean; className?: string }) {
  return (
    <div className={`relative rounded-2xl border bg-surface ${accent ? 'border-border-bright' : 'border-border'} overflow-hidden shadow-[0_6px_24px_rgba(0,0,0,0.4)] ${className}`}>
      {accent && <div className="absolute left-0 top-0 h-full w-[3px] rounded-l-2xl bg-primary opacity-80" />}
      <div className={accent ? 'pl-5 pr-5 py-5' : 'p-5'}>{children}</div>
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <h2 className="text-[17px] font-bold tracking-wide text-strong">{children}</h2>
      <div className="h-[2px] w-7 rounded-full bg-primary opacity-70" />
    </div>
  )
}

function Badge({ children, color = 'muted' }: { children: React.ReactNode; color?: 'primary' | 'warning' | 'danger' | 'muted' }) {
  const colors = {
    primary: 'border-primary text-primary', warning: 'border-warning text-warning',
    danger: 'border-danger text-danger', muted: 'border-border text-muted',
  }
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${colors[color]}`}>
      {children}
    </span>
  )
}

function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <span className="text-3xl">{emoji}</span>
      <p className="text-sm text-muted">{text}</p>
    </div>
  )
}

/* ─── Garden background layer ────────────────────────────────────────────── */

function GardenBg({ background }: { background: string }) {
  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ background, transition: 'background 4s ease', zIndex: 0 }}
    />
  )
}

/* ─── Login ──────────────────────────────────────────────────────────────── */

function LoginScreen({
  onLogin, onRegister, gardenBackground,
}: {
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (email: string, name: string, password: string) => Promise<void>
  gardenBackground: string
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      setBusy(true)
      setError(null)
      if (mode === 'login') {
        await onLogin(email, password)
      } else {
        await onRegister(email, name, password)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-bg">
      <GardenBg background={gardenBackground} />
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex flex-col gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border-bright bg-accent-soft text-4xl shadow-[0_0_32px_rgba(62,207,110,0.15)]">
              🍃
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Midori</p>
              <h1 className="font-display text-5xl font-bold leading-[1.1] tracking-tight text-hero">
                Tu jardín<br />con IA
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Subí una foto y la IA diagnostica el estado de tu planta al instante.
              </p>
            </div>
          </div>
          <Card>
            {/* Toggle */}
            <div className="mb-4 flex rounded-xl border border-border bg-surface-alt p-1">
              <button type="button" onClick={() => { setMode('login'); setError(null) }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition cursor-pointer ${mode === 'login' ? 'bg-surface text-strong shadow-sm' : 'text-muted hover:text-strong'}`}>
                Ingresar
              </button>
              <button type="button" onClick={() => { setMode('register'); setError(null) }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition cursor-pointer ${mode === 'register' ? 'bg-surface text-strong shadow-sm' : 'text-muted hover:text-strong'}`}>
                Registrarse
              </button>
            </div>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <Field label="Email">
                <Input value={email} onChange={setEmail} placeholder="tu@email.com" type="email" />
              </Field>
              {mode === 'register' && (
                <Field label="Nombre">
                  <Input value={name} onChange={setName} placeholder="Tu nombre" />
                </Field>
              )}
              <Field label="Contraseña">
                <Input value={password} onChange={setPassword} placeholder="••••••••" type="password" />
              </Field>
              <Btn type="submit" disabled={busy} className="mt-1 w-full py-3 text-base font-bold">
                {busy ? '...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
              </Btn>
              {import.meta.env.DEV && (
                <button type="button"
                  onClick={async () => {
                    setBusy(true)
                    setError(null)
                    try {
                      await onLogin('demo@midori.app', 'demo1234')
                    } catch {
                      try {
                        await onRegister('demo@midori.app', 'Demo User', 'demo1234')
                      } catch (err) {
                        setError(String(err))
                      }
                    } finally {
                      setBusy(false)
                    }
                  }}
                  className="text-xs text-dim hover:text-muted transition cursor-pointer text-center w-full">
                  Usar credenciales de test
                </button>
              )}
              {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            </form>
          </Card>
        </div>
      </main>
    </div>
  )
}

/* ─── Main App ───────────────────────────────────────────────────────────── */

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [tasksToday, setTasksToday] = useState<CareTask[]>([])
  const [progress, setProgress] = useState<ProgressSnapshot[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [plantName, setPlantName] = useState('')
  const [speciesGuess, setSpeciesGuess] = useState('')
  const [location, setLocation] = useState('')
  const [lightLevel, setLightLevel] = useState<'low' | 'medium' | 'high'>('medium')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [context, setContext] = useState('')
  const [note, setNote] = useState('')
  const [diagnosisResult, setDiagnosisResult] = useState('')

  // Garden background derived from plants' colorRgb — no extra requests
  const gardenBackground = useMemo(() => {
    const colors = (dashboard?.plants ?? [])
      .map((p) => parseRgb(p.colorRgb))
      .filter(Boolean) as RGB[]
    return buildGardenBackground(colors)
  }, [dashboard?.plants])

  const refreshData = async (token = authToken) => {
    if (!token) return
    const [dashboardData, todayTasks, progressData] = await Promise.all([
      api.getDashboard(token),
      api.getTasksToday(token),
      api.getProgress(token),
    ])
    setDashboard(dashboardData)
    setTasksToday(todayTasks)
    setProgress(progressData)
  }

  useEffect(() => {
    if (!authToken) return
    refreshData().catch((err) => setError(String(err)))
  }, [authToken])

  const handleLogin = async (email: string, password: string) => {
    const result = await api.login(email, password)
    setAuthToken(result.token)
    setUser(result.user)
  }

  const handleRegister = async (email: string, name: string, password: string) => {
    const result = await api.register(email, name, password)
    setAuthToken(result.token)
    setUser(result.user)
  }

  const handlePhotoChange = (file?: File) => {
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleCreatePlant = async (e: FormEvent) => {
    e.preventDefault()
    if (!authToken) return
    if (!plantName.trim()) { setError('El nombre de la planta es obligatorio.'); return }
    try {
      setBusy(true)
      setError(null)
      setDiagnosisResult('')

      const created = await api.createPlant(authToken, {
        name: plantName.trim(),
        speciesGuess: speciesGuess.trim() || 'Especie no identificada',
        location: location.trim() || 'Sin ubicación',
        lightLevel,
      })

      if (photoFile) {
        // Extract color and save to DB (once, at creation time)
        extractDominantColor(photoPreview).then((rgb) =>
          api.updatePlantColor(authToken!, created.id, rgb.join(',')).catch(() => {})
        )

        const imageUrl = await resizeImage(photoFile)
        const diagnosis = await api.diagnosePlant(authToken, created.id, {
          imageUrl,
          context: context.trim() || 'Foto inicial de alta de planta para diagnóstico visual.',
          note: note.trim() || undefined,
        })
        setDiagnosisResult(
          `${diagnosis.diagnosis.summary}\n\nTareas generadas: ${diagnosis.generatedTasks.length}`,
        )
      }

      setPlantName(''); setSpeciesGuess(''); setLocation(''); setLightLevel('medium')
      setPhotoFile(null); setPhotoPreview(''); setContext(''); setNote('')
      await refreshData(authToken)
      setTab('home')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleTaskStatus = async (taskId: string, status: CareTask['status']) => {
    if (!authToken) return
    try {
      setBusy(true)
      await api.updateTaskStatus(authToken, taskId, status)
      await refreshData(authToken)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const headerStats = useMemo(() => [
    { label: 'Plantas', value: dashboard?.plants.length ?? 0 },
    { label: 'Tareas hoy', value: tasksToday.length },
    { label: 'Alertas', value: dashboard?.criticalAlerts.length ?? 0 },
  ], [dashboard?.plants.length, tasksToday.length, dashboard?.criticalAlerts.length])

  if (!authToken) {
    return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} gardenBackground={gardenBackground} />
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'home', label: 'Inicio' },
    { key: 'tasks', label: 'Tareas' },
    { key: 'progress', label: 'Progreso' },
  ]

  return (
    <div className="relative min-h-screen bg-bg">
      <GardenBg background={gardenBackground} />

      <div className="relative" style={{ zIndex: 1 }}>
        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur-sm">
          <div className="mx-auto w-[80%] max-w-[80%] px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-bright bg-accent-soft text-lg">🍃</div>
                <div>
                  <h1 className="font-display text-xl font-bold leading-none text-hero">Midori</h1>
                  <p className="mt-0.5 text-xs text-muted">Hola, {user?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden gap-2 sm:flex">
                  {headerStats.map((s) => (
                    <div key={s.label} className="rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-center">
                      <p className="text-base font-bold leading-none text-strong">{s.value}</p>
                      <p className="mt-0.5 text-[10px] text-muted">{s.label}</p>
                    </div>
                  ))}
                </div>
                <Btn variant="ghost" size="sm" onClick={() => { setAuthToken(null); setUser(null); setDashboard(null) }}>
                  Salir
                </Btn>
              </div>
            </div>
            <nav className="mt-4 flex gap-1 border-t border-border pt-1">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`relative px-4 py-2 text-sm font-semibold tracking-wide transition cursor-pointer ${tab === t.key ? 'text-primary' : 'text-muted hover:text-strong'}`}>
                  {t.label}
                  {tab === t.key && <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-primary" />}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto w-[80%] max-w-[80%] px-4 py-6">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-3 text-danger/60 hover:text-danger cursor-pointer">✕</button>
            </div>
          )}

          {/* ── HOME ── */}
          {tab === 'home' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardTitle>Agregar planta</CardTitle>
                <form className="flex flex-col gap-4" onSubmit={handleCreatePlant}>
                  <Field label="Nombre *">
                    <Input value={plantName} onChange={setPlantName} placeholder="Ej: Mi monstera" />
                  </Field>
                  <Field label="Especie estimada">
                    <Input value={speciesGuess} onChange={setSpeciesGuess} placeholder="Ej: Monstera deliciosa" />
                  </Field>
                  <Field label="Ubicación">
                    <Input value={location} onChange={setLocation} placeholder="Living, balcón, jardín..." />
                  </Field>
                  <Field label="Nivel de luz">
                    <Select value={lightLevel} onChange={(v) => setLightLevel(v as 'low' | 'medium' | 'high')}
                      options={[{ value: 'low', label: 'Baja' }, { value: 'medium', label: 'Media' }, { value: 'high', label: 'Alta' }]} />
                  </Field>
                  <Field label="Foto inicial">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-secondary-text hover:border-border-bright hover:bg-surface-raised transition">
                        <span>📷</span> Sacar foto
                        <input type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={(e) => handlePhotoChange(e.target.files?.[0])} />
                      </label>
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-secondary-text hover:border-border-bright hover:bg-surface-raised transition">
                        <span>🖼️</span> Galería
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => handlePhotoChange(e.target.files?.[0])} />
                      </label>
                    </div>
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" className="mt-2 h-44 w-full rounded-xl border border-border object-cover" />
                    ) : (
                      <div className="mt-2 flex h-24 items-center justify-center rounded-xl border border-dashed border-border bg-surface-alt text-sm text-dim">
                        Opcional — recomendado para diagnóstico IA
                      </div>
                    )}
                  </Field>
                  <Field label="Contexto para la IA">
                    <Textarea value={context} onChange={setContext} placeholder="Ej: Hojas amarillas, riego cada 3 días..." />
                  </Field>
                  <Field label="Nota">
                    <Textarea value={note} onChange={setNote} placeholder="Nota opcional" rows={2} />
                  </Field>
                  <Btn type="submit" disabled={busy} className="w-full py-3 font-bold">
                    {busy ? 'Guardando...' : 'Guardar planta'}
                  </Btn>
                </form>
                {diagnosisResult && (
                  <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-primary">Diagnóstico IA</p>
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed text-text">{diagnosisResult}</pre>
                  </div>
                )}
              </Card>

              <Card>
                <CardTitle>Mi jardín</CardTitle>
                {dashboard?.plants.length ? (
                  <div className="flex flex-col gap-2">
                    {dashboard.plants.map((plant) => {
                      const rgb = parseRgb(plant.colorRgb)
                      return (
                        <div key={plant.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-alt p-3 hover:border-border-bright transition">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl"
                            style={{ backgroundColor: rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.25)` : undefined }}>
                            🪴
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-strong">{plant.name}</p>
                            <p className="truncate text-xs italic text-muted">{plant.speciesGuess}</p>
                            <p className="text-xs text-dim">{plant.location}</p>
                          </div>
                          <Badge color="muted">{plant.lightLevel}</Badge>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState emoji="🌱" text="Tu jardín está vacío. Agregá tu primera planta." />
                )}
                {dashboard?.criticalAlerts.length ? (
                  <div className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-warning">Alertas críticas</p>
                    <ul className="flex flex-col gap-1.5">
                      {dashboard.criticalAlerts.map((alert) => (
                        <li key={alert} className="flex items-start gap-2 text-sm text-warning">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                          {alert}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Card>
            </div>
          )}

          {/* ── TASKS ── */}
          {tab === 'tasks' && (
            <div className="flex flex-col gap-4">
              <Card>
                <CardTitle>Agenda de hoy</CardTitle>
                {tasksToday.length ? (
                  <div className="flex flex-col gap-3">
                    {tasksToday.map((task) => {
                      const priorityColor = task.priority >= 4 ? 'danger' : task.priority >= 3 ? 'warning' : 'muted'
                      return (
                        <div key={task.id} className="rounded-xl border border-border bg-surface-alt p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-strong">{task.title}</p>
                                <Badge color={priorityColor as 'danger' | 'warning' | 'muted'}>
                                  {task.priority >= 4 ? 'alta' : task.priority >= 3 ? 'media' : 'baja'}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm leading-relaxed text-muted">{task.details}</p>
                              <p className="mt-2 text-xs text-dim">
                                {new Date(task.scheduledFor).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Btn size="sm" onClick={() => handleTaskStatus(task.id, 'done')} disabled={busy}>✓ Hecha</Btn>
                            <Btn size="sm" variant="secondary" onClick={() => handleTaskStatus(task.id, 'skipped')} disabled={busy}>Omitir</Btn>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState emoji="✅" text="No hay tareas para hoy." />
                )}
              </Card>
            </div>
          )}

          {/* ── PROGRESS ── */}
          {tab === 'progress' && (
            <div className="flex flex-col gap-4">
              <Card>
                <CardTitle>Progreso semanal</CardTitle>
                {progress.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {progress.map((item) => {
                      const pct = item.adherenceRate
                      const textColor = pct >= 75 ? 'text-primary' : pct >= 40 ? 'text-warning' : 'text-danger'
                      const plant = dashboard?.plants.find((p) => p.id === item.plantId)
                      const rgb = parseRgb(plant?.colorRgb ?? null)
                      return (
                        <div key={item.plantId} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-alt p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                              style={{ backgroundColor: rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.25)` : undefined }}>
                              🪴
                            </div>
                            <p className="font-semibold text-strong">
                              {plant?.name ?? `Planta ${item.plantId.slice(0, 6)}…`}
                            </p>
                          </div>
                          <div>
                            <div className="mb-1 flex items-baseline justify-between">
                              <p className="text-xs text-muted">Adherencia</p>
                              <p className={`text-base font-bold ${textColor}`}>{pct}%</p>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                              <div className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : '#3ECF6E',
                                }} />
                            </div>
                          </div>
                          <div className="flex gap-4 text-sm">
                            <div>
                              <p className="text-xs text-dim">Tareas (7d)</p>
                              <p className="font-semibold text-strong">{item.tasksDoneLast7Days}/{item.tasksTotalLast7Days}</p>
                            </div>
                            <div>
                              <p className="text-xs text-dim">Tendencia</p>
                              <p className="font-semibold text-strong capitalize">{item.trend}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState emoji="📊" text="Aún no hay datos de progreso." />
                )}
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
