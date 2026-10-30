import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImageUp, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Panel, PanelHeader } from '@/components/ui/misc'
import { LOCALES, type Locale } from '@/i18n'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { uploadObject, useSignedUrl, validateFile } from '@/lib/files'
import { friendlyError, supabase } from '@/lib/supabase'
import { applyBranding, chromeIsDark, contrast, inkOn, PRESETS } from '@/lib/theme'
import type { Company } from '@/lib/types'

type Draft = Pick<Company, 'name' | 'accent_color' | 'sidebar_color' | 'theme_mode' | 'logo_path' | 'logo_dark_path' | 'default_locale' | 'known_brands'>

function ColorField({ label, hint, value, onChange, warning }: { label: string; hint?: string; value: string; onChange: (v: string) => void; warning?: string }) {
  const [text, setText] = useState(value)
  return (
    <Field label={label} hint={warning ? <span className="text-warn">{warning}</span> : hint}>
      {(id, d) => (
        <div className="flex items-center gap-2">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
            className="h-9 w-12 cursor-pointer rounded-md border border-line bg-surface p-1" />
          <Input id={id} aria-describedby={d} dir="ltr" value={text} maxLength={7} className="w-28 font-mono uppercase"
            onChange={(e) => {
              setText(e.target.value)
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase())
            }} />
        </div>
      )}
    </Field>
  )
}

function LogoField({ label, hint, path, companyId, onChange, dark }: { label: string; hint: string; path: string | null; companyId: string; onChange: (p: string | null) => void; dark?: boolean }) {
  const { t } = useTranslation('settings')
  const url = useSignedUrl(path)
  const [busy, setBusy] = useState(false)
  async function upload(f: File) {
    setBusy(true)
    try {
      const s = await validateFile(f, 'image')
      if (s.mime === 'image/heic') throw new Error(t('logoHint'))
      const p = `${companyId}/branding/logo-${crypto.randomUUID()}.${s.ext}`
      await uploadObject(p, f, s.mime)
      onChange(p)
      toast.success(t('logoUploaded'))
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="flex flex-wrap items-center gap-3">
          <div className={cn('flex h-16 w-44 items-center justify-center rounded-md border border-line p-2', dark ? 'bg-[var(--chrome)]' : 'bg-white')}>
            {url.data ? <img src={url.data} alt="" className="max-h-full max-w-full object-contain" /> : <ImageUp className="size-5 text-ink-3" />}
          </div>
          <label className={cn('inline-flex h-9 cursor-pointer items-center rounded-md border border-line bg-surface px-3 text-sm hover:bg-hover', busy && 'pointer-events-none opacity-60')}>
            {path ? t('replaceLogo') : t('uploadLogo')}
            <input id={id} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          {path && <Button variant="ghost" size="sm" onClick={() => onChange(null)}><Trash2 />{t('removeLogo')}</Button>}
        </div>
      )}
    </Field>
  )
}

export default function Settings() {
  const { t } = useTranslation(['settings', 'common', 'docimport'])
  const { company } = useCompany()
  const [brand, setBrand] = useState('')
  const qc = useQueryClient()
  const initial: Draft = {
    name: company.name, accent_color: company.accent_color, sidebar_color: company.sidebar_color, theme_mode: company.theme_mode,
    logo_path: company.logo_path, logo_dark_path: company.logo_dark_path, default_locale: company.default_locale,
    known_brands: company.known_brands ?? [],
  }
  const [d, setD] = useState<Draft>(initial)
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)

  // Live preview across the whole app; restore the saved branding if the page is left unsaved.
  useEffect(() => { applyBranding(d) }, [d])
  useEffect(() => () => applyBranding(company), [company])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('companies').update({ ...d, name: d.name.trim() }).eq('id', company.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); toast.success(t('saved')) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const pageBg = d.theme_mode === 'dark' ? '#1a1d22' : '#ffffff'
  const accentWarn = contrast(d.accent_color, pageBg) < 3 ? t('lowContrast', { bg: d.theme_mode === 'dark' ? t('darkBg') : t('white') }) : undefined
  const sidebarDark = chromeIsDark(d.sidebar_color)

  return (
    <>
      <PageHeader title={t('title')} actions={dirty && (
        <>
          <Button variant="ghost" onClick={() => setD(initial)}>{t('discard')}</Button>
          <Button variant="primary" loading={save.isPending} disabled={!d.name.trim()} onClick={() => save.mutate()}>{t('save')}</Button>
        </>
      )} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel>
            <PanelHeader title={t('showroom')} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label={t('name')}>{(id) => <Input id={id} value={d.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
              <Field label={t('defaultLanguage')} hint={t('defaultLanguageHint')}>
                {(id, h) => (
                  <Select id={id} aria-describedby={h} value={d.default_locale} onChange={(e) => set({ default_locale: e.target.value as Locale })}>
                    {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </Select>
                )}
              </Field>
              <div className="text-[13.5px]"><p className="text-ink-3">{t('currency')}</p><p>{company.currency}</p></div>
              <div className="text-[13.5px]"><p className="text-ink-3">{t('timezone')}</p><p>{t('timezoneValue', { tz: company.timezone })}</p></div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={t('docimport:brands.title')} />
            <div className="space-y-3 p-5">
              <p className="text-[13px] text-ink-2">{t('docimport:brands.hint')}</p>
              <div className="flex flex-wrap gap-1.5">
                {d.known_brands.map((b) => (
                  <span key={b} className="flex items-center gap-1 rounded-sm border border-line bg-raised ps-2 text-[13px]" dir="auto">
                    {b}
                    <button className="flex size-6 cursor-pointer items-center justify-center text-ink-3 hover:text-danger" aria-label={t('docimport:brands.remove', { name: b })}
                      onClick={() => set({ known_brands: d.known_brands.filter((x) => x !== b) })}><Trash2 className="size-3.5" /></button>
                  </span>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={(e) => {
                e.preventDefault()
                const b = brand.trim()
                if (b && !d.known_brands.some((x) => x.toLowerCase() === b.toLowerCase())) set({ known_brands: [...d.known_brands, b] })
                setBrand('')
              }}>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={t('docimport:brands.placeholder')} className="max-w-xs" dir="auto" aria-label={t('docimport:brands.placeholder')} />
                <Button type="submit" disabled={!brand.trim()}>{t('docimport:brands.add')}</Button>
              </form>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={t('branding')} />
            <div className="space-y-6 p-5">
              <p className="text-[13.5px] text-ink-2">{t('brandingHint')}</p>
              <LogoField label={t('logo')} hint={t('logoHint')} path={d.logo_path} companyId={company.id} onChange={(p) => set({ logo_path: p })} />
              <LogoField label={t('logoDark')} hint={t('logoDarkHint')} path={d.logo_dark_path} companyId={company.id} onChange={(p) => set({ logo_dark_path: p })} dark />

              <div>
                <p className="mb-2 text-[13px] font-medium text-ink-2">{t('presets')}</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => {
                    const active = p.accent === d.accent_color && p.sidebar === d.sidebar_color && p.mode === d.theme_mode
                    return (
                      <button key={p.name} onClick={() => set({ accent_color: p.accent, sidebar_color: p.sidebar, theme_mode: p.mode })} aria-pressed={active} title={p.name}
                        className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px]', active ? 'border-accent ring-1 ring-accent' : 'border-line hover:bg-hover')}>
                        <span className="flex overflow-hidden rounded-sm border border-line" aria-hidden>
                          <span className="size-4" style={{ background: p.sidebar }} />
                          <span className="size-4" style={{ background: p.accent }} />
                          <span className="size-4" style={{ background: p.mode === 'dark' ? '#1a1d22' : '#ffffff' }} />
                        </span>
                        <span dir="ltr">{p.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                <ColorField key={`a${d.accent_color}`} label={t('accent')} hint={t('accentHint')} value={d.accent_color} onChange={(v) => set({ accent_color: v })} warning={accentWarn} />
                <ColorField key={`s${d.sidebar_color}`} label={t('sidebar')} value={d.sidebar_color} onChange={(v) => set({ sidebar_color: v })} />
                <Field label={t('mode')}>
                  {() => (
                    <div className="flex rounded-md border border-line p-0.5" role="group">
                      {(['light', 'dark'] as const).map((m) => (
                        <button key={m} onClick={() => set({ theme_mode: m })} aria-pressed={d.theme_mode === m}
                          className={cn('h-8 flex-1 cursor-pointer rounded-sm text-[13px]', d.theme_mode === m ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:text-ink')}>
                          {t(m)}
                        </button>
                      ))}
                    </div>
                  )}
                </Field>
              </div>
            </div>
          </Panel>
        </div>

        {/* Miniature of the workspace with the draft branding. */}
        <div className="xl:sticky xl:top-24 xl:self-start">
          <p className="mb-2 text-[13px] font-medium text-ink-2">{t('preview')}</p>
          <div className="flex h-56 overflow-hidden rounded-lg border border-line" aria-hidden>
            <div className="flex w-32 flex-col gap-1.5 p-2.5" style={{ background: d.sidebar_color, color: inkOn(d.sidebar_color) }}>
              <PreviewLogo d={d} dark={sidebarDark} />
              <div className="relative mt-2 rounded px-2 py-1 text-[11px] font-medium" style={{ background: 'color-mix(in srgb, currentColor 9%, transparent)' }}>
                <span className="absolute inset-y-1 start-0 w-[2px] rounded" style={{ background: d.accent_color }} />
                {t('previewNav')}
              </div>
              {[60, 72, 54].map((w) => <div key={w} className="mx-2 my-1 h-1.5 rounded opacity-30" style={{ width: `${w}%`, background: 'currentColor' }} />)}
            </div>
            <div className="flex-1 space-y-2 bg-bg p-3">
              <div className="flex justify-end"><span className="rounded px-2 py-1 text-[11px] font-medium" style={{ background: d.accent_color, color: inkOn(d.accent_color) }}>{t('previewButton')}</span></div>
              <div className="space-y-1.5 rounded border border-line-soft bg-surface p-2">
                {[80, 64, 72].map((w) => <div key={w} className="h-1.5 rounded bg-line" style={{ width: `${w}%` }} />)}
              </div>
              <div className="h-1.5 w-1/3 rounded" style={{ background: d.accent_color }} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function PreviewLogo({ d, dark }: { d: Draft; dark: boolean }) {
  const path = dark ? d.logo_dark_path ?? d.logo_path : d.logo_path
  const url = useSignedUrl(path)
  if (!url.data) return <span className="truncate text-[12px] font-semibold">{d.name}</span>
  return (
    <span className={cn('flex h-9 items-center', dark && !d.logo_dark_path && 'rounded bg-white px-1.5')}>
      <img src={url.data} alt="" className="max-h-full max-w-full object-contain" />
    </span>
  )
}
