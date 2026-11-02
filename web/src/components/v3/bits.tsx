// Small shared pieces of the v3 screens: stage pill, tags, inline editing, Lottie.
import LottieImport, { type LottieRefCurrentProps } from 'lottie-react'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import i18n from '@/i18n'
import { cn } from '@/lib/cn'
import { friendlyError } from '@/lib/supabase'

/** Translate a key built at runtime (e.g. from a category value). */
export const tr = (t: unknown, k: string) => (t as (k: string) => string)(k)

/** A stage, in its own colour: "● At RTA". */
export function StagePill({ name, color, className }: { name: string | null | undefined; color: string | null | undefined; className?: string }) {
  if (!name) return null
  const c = color ?? '#5b6470'
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold whitespace-nowrap', className)}
      style={{ color: c, background: `color-mix(in srgb, ${c} 11%, white)` }}>
      <span className="size-1.5 rounded-full" style={{ background: c }} aria-hidden />{name}
    </span>
  )
}

export function Tag({ tone = 'warn', children, className }: { tone?: 'warn' | 'danger' | 'neutral' | 'ok'; children: ReactNode; className?: string }) {
  const tones = {
    warn: 'bg-warn/10 text-warn',
    danger: 'bg-danger/10 text-danger',
    neutral: 'bg-hover text-ink-2',
    ok: 'bg-ok/10 text-ok',
  }
  return <span className={cn('inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[12px] font-semibold whitespace-nowrap', tones[tone], className)}>{children}</span>
}

/** Attention tags for a car (list and car page). */
export function attentionTags(v: { missing_accessories?: number | null; photo_count?: number | null; status?: string | null; delivered_at?: string | null }) {
  const t = i18n.t.bind(i18n)
  const tags: { key: string; text: string; tone: 'warn' | 'danger' }[] = []
  if (v.missing_accessories) tags.push({ key: 'acc', text: t('cars:tags.accessoryMissing', { count: v.missing_accessories }), tone: 'warn' })
  if (!v.photo_count) tags.push({ key: 'photos', text: t('cars:tags.noPhotos'), tone: 'warn' })
  if (v.status === 'sold' && !v.delivered_at) tags.push({ key: 'delivery', text: t('cars:tags.deliveryNotSet'), tone: 'warn' })
  return tags
}

/** Days a car has been in stock: arrival → sold (or today). */
export function daysInStock(v: { arrival_at?: string | null; created_at?: string | null; sold_at?: string | null }) {
  const from = v.arrival_at ?? v.created_at
  if (!from) return null
  const to = v.sold_at ? new Date(v.sold_at) : new Date()
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000))
}

type SaveState = 'idle' | 'saving' | 'saved'

// Saves still on their way: closing or reloading the page now would lose them, so the browser asks first.
let inFlight = 0
const guard = (e: BeforeUnloadEvent) => { if (inFlight > 0) { e.preventDefault(); e.returnValue = '' } }
if (typeof window !== 'undefined') window.addEventListener('beforeunload', guard)
/** Track a save so the page can't be closed while it's on its way. */
export async function tracked<T>(p: Promise<T>): Promise<T> {
  inFlight++
  document.documentElement.dataset.saving = String(inFlight)
  try { return await p } finally {
    inFlight--
    if (inFlight === 0) delete document.documentElement.dataset.saving
    else document.documentElement.dataset.saving = String(inFlight)
  }
}

/**
 * A value you click to edit in place: type, then Enter (or click away) saves,
 * Escape cancels, a small ✓ confirms. `data-inline` lets Enter jump to the next one.
 */
export function InlineText({ value, onSave, placeholder, display, dir = 'auto', lang, inputMode, className, inputClassName, id, label, disabled, multiline, validate, repeat }: {
  value: string
  onSave: (v: string) => Promise<unknown>
  placeholder?: string
  display?: ReactNode
  dir?: 'ltr' | 'rtl' | 'auto'
  lang?: string
  inputMode?: 'decimal' | 'numeric' | 'text'
  className?: string
  inputClassName?: string
  id?: string
  label: string
  disabled?: boolean
  multiline?: boolean
  /** Returns an error message, or null when the value can be saved. */
  validate?: (v: string) => string | null
  /** An "add" row: after saving it clears and stays open for the next one (empty Enter moves on). */
  repeat?: boolean
}) {
  const { t } = useTranslation('cars')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [state, setState] = useState<SaveState>('idle')
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const sent = useRef<string | null>(null)
  // Shown right away while it saves (optimistic), until the stored value catches up.
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => { setPending(null) }, [value])
  useLayoutEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select() } }, [editing])

  const commit = async (next?: 'next') => {
    const v = draft.trim()
    const problem = v && validate ? validate(v) : null
    if (problem) { setErr(problem); return false }
    setErr(null)
    const from = ref.current
    if (repeat) {
      if (!v) { setEditing(false); if (next) focusNextInline(from); return true }
      setDraft('')
      if (!next) setEditing(false)
      try { await tracked(onSave(v)) } catch (e) { toast.error(friendlyError(e)) }
      return true
    }
    setEditing(false)
    if (next) focusNextInline(from)
    if (v === value.trim() || v === sent.current) return true
    sent.current = v
    setState('saving')
    setPending(v)
    try {
      await tracked(onSave(v))
      window.setTimeout(() => setPending(null), 4000)
      setState('saved')
      window.setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 1400)
    } catch (e) {
      setState('idle')
      setPending(null)
      toast.error(friendlyError(e))
      setDraft(value)
    } finally {
      sent.current = null
    }
    return true
  }

  if (editing) {
    const common = {
      ref, id, value: draft, dir, lang, inputMode, 'aria-label': label, 'aria-invalid': !!err, 'data-inline-input': id,
      onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => { setDraft(e.target.value); setErr(null) },
      onBlur: () => { void commit() },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); void commit('next') }
        if (e.key === 'Escape') { setDraft(value); setErr(null); setEditing(false) }
      },
      placeholder,
      className: cn('w-full rounded-md border border-accent bg-surface px-2.5 py-1.5 text-[14.5px] outline-none ring-3 ring-accent/10', inputClassName),
    }
    return (
      <span className={cn('block min-w-0', className)}>
        {multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
        {err && <span className="mt-1 block text-[12px] text-danger" role="alert">{err}</span>}
      </span>
    )
  }
  const shown = pending ?? value
  const empty = !shown.trim()
  return (
    <span className={cn('group inline-flex min-w-0 max-w-full items-center gap-2', className)}>
      <button type="button" data-inline={id} disabled={disabled} onClick={() => setEditing(true)} aria-label={`${label}: ${empty ? t('inline.empty') : shown}`}
        className={cn('min-w-0 cursor-text rounded-md px-1.5 py-1 -mx-1.5 text-start text-[14.5px] transition-colors hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent',
          empty ? 'text-ink-3' : 'text-ink')} dir={empty ? undefined : dir} lang={empty ? undefined : lang}>
        <span className="block truncate whitespace-pre-wrap">{empty ? (placeholder ?? t('inline.clickToAdd')) : (pending !== null ? pending : (display ?? value))}</span>
      </button>
      {state !== 'idle' && (
        <span aria-live="polite" className="shrink-0">
          {state === 'saving' ? <Loader2 className="size-3.5 animate-spin text-ink-3" /> : <Check className="size-3.5 text-ok" aria-label={t('inline.saved')} />}
        </span>
      )}
    </span>
  )
}

/**
 * After Enter, open the next inline value on the page (keyboard-only filling). It opens in the
 * same keystroke, so fast typing never lands in between two fields.
 */
function focusNextInline(from: HTMLElement | null) {
  if (!from) return
  const next = [...document.querySelectorAll<HTMLButtonElement>('button[data-inline]:not([disabled])')]
    .find((b) => from.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
  next?.click()
}

// lottie-react ships CommonJS and ESM; depending on the bundler the default export can arrive wrapped once more.
const Lottie = ((LottieImport as unknown as { default?: typeof LottieImport }).default ?? LottieImport) as typeof LottieImport

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A Lottie animation from /public/lottie (loaded on demand). Still frame when motion is reduced. */
export function Anim({ name, loop = false, className, label }: { name: 'success' | 'empty-cars' | 'empty-photos' | 'empty-expenses' | 'exported'; loop?: boolean; className?: string; label?: string }) {
  const [data, setData] = useState<object | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/lottie/${name}.json`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setData(d) }).catch(() => {})
    return () => { alive = false }
  }, [name])
  const still = reduced()
  const ref = useRef<LottieRefCurrentProps>(null)
  return (
    <div className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {data && <Lottie lottieRef={ref} animationData={data} loop={loop && !still} autoplay={!still} style={{ width: '100%', height: '100%' }}
        onDOMLoaded={() => { if (still) { const n = ref.current?.getDuration(true) ?? 1; ref.current?.goToAndStop(loop ? Math.floor(n / 2) : n - 1, true) } }} />}
    </div>
  )
}

/** Empty state with an animation and one action. */
export function EmptyState({ anim, title, children, action }: { anim: 'empty-cars' | 'empty-photos' | 'empty-expenses'; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <Anim name={anim} loop className="mb-3 h-24 w-32" />
      <p className="text-[16px] font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-sm text-[14px] text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
