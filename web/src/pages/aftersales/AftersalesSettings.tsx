// After-Sales settings (managers): warranty per brand, service plan per brand, offer catalogue.
// A row without a brand applies to every brand that has no row of its own.
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAftersalesSettings, useSaveSetting } from '@/api/aftersales'
import { Button } from '@/components/ui/button'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { InlineText } from '@/components/v3/bits'
import { fmtMoney, parseAmount } from '@/lib/format'
import { friendlyError } from '@/lib/supabase'

const num = (x: string) => /^\d{1,7}$/.test(x.replace(/[,\s]/g, ''))

export default function AftersalesSettings() {
  const { t } = useTranslation('aftersales')
  const q = useAftersalesSettings()
  const save = useSaveSetting()
  if (q.isLoading) return <PageLoader />
  if (q.error || !q.data) return <ErrorNote error={q.error} />
  const err = (e: unknown) => toast.error(friendlyError(e))
  const set = (table: 'warranty_defaults' | 'service_plans' | 'offer_catalogue', id: string, row: Record<string, unknown>) => save.mutateAsync({ table, id, row })
  const brand = (b: string | null) => b ?? t('settings.allBrands')
  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <Link to="/aftersales" className="inline-flex items-center gap-1.5 text-[14.5px] text-ink-2 hover:text-ink"><ChevronLeft className="size-4 flip-rtl" />{t('home.title')}</Link>
      <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t('settings.title')}</h1>

      <Panel title={t('settings.warranty')} hint={t('settings.warrantyHint')}
        onAdd={() => save.mutate({ table: 'warranty_defaults', row: { brand: t('settings.newBrand'), kind: 'vehicle', years: 5, km: 150000 } }, { onError: err })} addLabel={t('settings.addBrand')}>
        {q.data.warranty.map((w) => (
          <Row key={w.id} onDelete={w.brand ? () => save.mutate({ table: 'warranty_defaults', id: w.id, row: {}, remove: true }, { onError: err }) : undefined}>
            <InlineText id={`wd-brand-${w.id}`} label={t('settings.brand')} value={w.brand ?? ''} display={brand(w.brand)} placeholder={t('settings.allBrands')} disabled={!w.brand} onSave={(x) => set('warranty_defaults', w.id, { brand: x || null })} />
            <span className="text-[14px] text-ink-2">{t(`warranty.kindShort.${w.kind as 'vehicle'}`)}</span>
            <InlineText id={`wd-years-${w.id}`} label={t('warranty.years')} value={String(w.years)} display={t('warranty.yearsN', { count: w.years })} inputMode="numeric"
              validate={(x) => (/^\d{1,2}$/.test(x) ? null : t('warranty.badNumber'))} onSave={(x) => set('warranty_defaults', w.id, { years: Number(x) })} />
            <InlineText id={`wd-km-${w.id}`} label={t('warranty.km')} value={w.km ? String(w.km) : ''} display={w.km ? `${w.km.toLocaleString('en')} km` : t('warranty.noKm')} inputMode="numeric"
              validate={(x) => (num(x) ? null : t('warranty.badNumber'))} onSave={(x) => set('warranty_defaults', w.id, { km: x ? Number(x.replace(/[,\s]/g, '')) : null })} />
          </Row>
        ))}
      </Panel>

      <Panel title={t('settings.service')} hint={t('settings.serviceHint')}
        onAdd={() => save.mutate({ table: 'service_plans', row: { brand: t('settings.newBrand'), months: 12, km: 10000 } }, { onError: err })} addLabel={t('settings.addBrand')}>
        {q.data.plans.map((p) => (
          <Row key={p.id} onDelete={p.brand ? () => save.mutate({ table: 'service_plans', id: p.id, row: {}, remove: true }, { onError: err }) : undefined}>
            <InlineText id={`sp-brand-${p.id}`} label={t('settings.brand')} value={p.brand ?? ''} display={brand(p.brand)} placeholder={t('settings.allBrands')} disabled={!p.brand} onSave={(x) => set('service_plans', p.id, { brand: x || null })} />
            <span className="text-[14px] text-ink-2">{t('settings.every')}</span>
            <InlineText id={`sp-months-${p.id}`} label={t('settings.months')} value={String(p.months)} display={t('settings.monthsN', { count: p.months })} inputMode="numeric"
              validate={(x) => (/^\d{1,2}$/.test(x) && Number(x) > 0 ? null : t('warranty.badNumber'))} onSave={(x) => set('service_plans', p.id, { months: Number(x) })} />
            <InlineText id={`sp-km-${p.id}`} label={t('warranty.km')} value={String(p.km)} display={`${p.km.toLocaleString('en')} km`} inputMode="numeric"
              validate={(x) => (num(x) ? null : t('warranty.badNumber'))} onSave={(x) => set('service_plans', p.id, { km: Number(x.replace(/[,\s]/g, '')) })} />
          </Row>
        ))}
      </Panel>

      <Panel title={t('settings.catalogue')} hint={t('settings.catalogueHint')}
        onAdd={() => save.mutate({ table: 'offer_catalogue', row: { name: t('settings.newOffer'), default_price: null, position: q.data.catalogue.length + 1 } }, { onError: err })} addLabel={t('settings.addOffer')}>
        {q.data.catalogue.map((c) => (
          <Row key={c.id} onDelete={() => save.mutate({ table: 'offer_catalogue', id: c.id, row: {}, remove: true }, { onError: err })}>
            <InlineText id={`oc-name-${c.id}`} label={t('settings.offerName')} value={c.name} validate={(x) => (x ? null : t('settings.nameRequired'))} onSave={(x) => set('offer_catalogue', c.id, { name: x })} />
            <span />
            <InlineText id={`oc-price-${c.id}`} label={t('offers.price')} value={c.default_price !== null ? String(Number(c.default_price)) : ''} display={fmtMoney(c.default_price)} inputMode="decimal"
              validate={(x) => (parseAmount(x) ? null : t('offers.badPrice'))} onSave={(x) => set('offer_catalogue', c.id, { default_price: x ? Number(parseAmount(x)) : null })} />
            <span />
          </Row>
        ))}
      </Panel>
    </div>
  )
}

function Panel({ title, hint, children, onAdd, addLabel }: { title: string; hint: string; children: React.ReactNode; onAdd: () => void; addLabel: string }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div><h2 className="text-[16px] font-semibold">{title}</h2><p className="text-[13.5px] text-ink-2">{hint}</p></div>
        <Button size="sm" onClick={onAdd}><Plus />{addLabel}</Button>
      </header>
      <div className="divide-y divide-line-soft">{children}</div>
    </section>
  )
}

function Row({ children, onDelete }: { children: React.ReactNode; onDelete?: () => void }) {
  return (
    <div className="grid items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[minmax(0,1.2fr)_110px_minmax(0,1fr)_minmax(0,1fr)_40px]">
      {children}
      {onDelete ? <button onClick={onDelete} className="flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-danger" aria-label="Delete"><Trash2 className="size-4" /></button> : <span />}
    </div>
  )
}
