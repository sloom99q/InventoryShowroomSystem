// Expenses: the total with a category bar, one-tap add (type → amount → done), and the list.
import { Car, Package, Paperclip, Plus, ShieldCheck, Sparkles, Tag as TagIcon, Trash2, Wrench, X, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { tr } from '@/components/v3/bits'
import { toast } from 'sonner'
import type { ExpenseCategory } from '@/api/journey'
import { useDeleteExpense, useExpenses, useSaveExpense } from '@/api/records'
import { Button } from '@/components/ui/button'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { EmptyState, InlineText } from '@/components/v3/bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { downloadFile } from '@/lib/files'
import { fmtDate, fmtMoney, parseAmount, sumMoney, todayDubai } from '@/lib/format'
import { friendlyError } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'

/** One-tap types, with their colour in the bar. */
export const QUICK: { category: ExpenseCategory; icon: LucideIcon; color: string }[] = [
  { category: 'garage', icon: Wrench, color: '#c8102e' },
  { category: 'rta', icon: ShieldCheck, color: '#1f5fbf' },
  { category: 'transportation', icon: Car, color: '#b86e00' },
  { category: 'detailing', icon: Sparkles, color: '#16824f' },
  { category: 'tinting', icon: TagIcon, color: '#6a3fc1' },
  { category: 'parts', icon: Package, color: '#5b6470' },
  { category: 'other', icon: Plus, color: '#8a8f97' },
]
const COLOR = new Map<string, string>(QUICK.map((q) => [q.category, q.color]))
const colorOf = (c: string) => COLOR.get(c) ?? (c === 'mechanical' || c === 'electrical' || c === 'bodywork' || c === 'paint' || c === 'tires' || c === 'maintenance' ? '#c8102e' : '#8a8f97')

export function ExpensesPane({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('cars')
  const { canWrite } = useCompany()
  const q = useExpenses(v.id!)
  const [open, setOpen] = useState<ExpenseCategory | null>(null)
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const rows = q.data ?? []
  const total = sumMoney(rows.map((r) => r.amount))
  const byCat = new Map<string, number>()
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.amount))
  const last = rows.reduce<string | null>((m, r) => (!m || r.expense_date > m ? r.expense_date : m), null)
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="card p-5">
          <p className="text-[11.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{t('exp.totalLabel')}</p>
          <p className="tnum mt-1 text-[30px] font-bold tracking-[-0.02em]" data-testid="exp-total">{fmtMoney(total)}</p>
          <p className="text-[14px] text-ink-2">{rows.length ? t('exp.countLast', { count: rows.length, date: fmtDate(last).replace(/ \d{4}$/, '') }) : t('exp.none')}</p>
          {total > 0 && (
            <>
              <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                {[...byCat].map(([c, n]) => <span key={c} style={{ width: `${(n / total) * 100}%`, background: colorOf(c) }} />)}
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
                {[...byCat].map(([c]) => <li key={c} className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: colorOf(c) }} />{tr(t, `exp.cat.${c}`)}</li>)}
              </ul>
            </>
          )}
        </section>
        {canWrite && (
          <section className="card p-5">
            <h3 className="text-[15px] font-semibold">{t('exp.quickTitle')}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK.map(({ category, icon: Icon }) => (
                <button key={category} onClick={() => setOpen(open === category ? null : category)} aria-pressed={open === category}
                  className={cn('inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[14px] font-medium transition-colors',
                    open === category ? 'border-ink bg-ink text-white' : 'border-line bg-surface hover:border-ink-3')}>
                  <Icon className="size-4" />{tr(t, `exp.cat.${category}`)}
                </button>
              ))}
            </div>
            {open ? <QuickAdd v={v} category={open} onDone={() => setOpen(null)} key={open} />
              : <p className="mt-3 text-[13px] text-ink-3">{t('exp.quickHint')}</p>}
          </section>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card"><EmptyState anim="empty-expenses" title={t('exp.emptyTitle')}>{t('exp.emptyBody')}</EmptyState></div>
      ) : (
        <ul className="card divide-y divide-line-soft overflow-hidden">
          {rows.map((r) => <ExpenseRow key={r.id} v={v} r={r} canWrite={canWrite} />)}
        </ul>
      )}
    </div>
  )
}

function QuickAdd({ v, category, onDone }: { v: VehicleOverview; category: ExpenseCategory; onDone: () => void }) {
  const { t } = useTranslation(['cars', 'common'])
  const { company } = useCompany()
  const save = useSaveExpense(company.id, v.id!)
  const [amount, setAmount] = useState('')
  const [more, setMore] = useState(false)
  const [title, setTitle] = useState('')
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const parsed = parseAmount(amount)
  const go = () => {
    if (!parsed || Number(parsed) <= 0) return
    save.mutate({ draft: {
      title: title.trim() || tr(t, `exp.cat.${category}`), category, amount: parsed, expense_date: todayDubai(),
      supplier_name: supplier.trim() || null, description: note.trim() || null, receipt,
    } }, {
      onSuccess: () => { toast.success(t('exp.added', { amount: fmtMoney(parsed), type: tr(t, `exp.cat.${category}`) })); onDone() },
      onError: (e) => toast.error(friendlyError(e)),
    })
  }
  const INPUT = 'h-11 rounded-xl border border-line bg-surface px-3 outline-none focus:border-ink'
  return (
    <form className="mt-4 space-y-3 rounded-xl bg-raised p-3.5" onSubmit={(e) => { e.preventDefault(); go() }}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="exp-amount" className="text-[14px] font-semibold">{tr(t, `exp.cat.${category}`)}</label>
        <span className="relative flex-1">
          <input id="exp-amount" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" placeholder="0"
            className={cn(INPUT, 'tnum w-full min-w-[120px] ps-12 text-[16px] font-semibold', amount && !parsed && 'border-danger')} aria-label={t('exp.amount')} />
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">AED</span>
        </span>
        <Button variant="primary" size="lg" type="submit" disabled={!parsed || Number(parsed) <= 0} loading={save.isPending} data-testid="exp-save">{t('exp.save')}</Button>
        <Button variant="ghost" size="icon" onClick={onDone} aria-label={t('common:actions.cancel')}><X /></Button>
      </div>
      {more ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('exp.titlePh')} className={INPUT} aria-label={t('exp.titleLabel')} />
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder={t('exp.supplierPh')} className={INPUT} aria-label={t('exp.supplier')} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('exp.notePh')} className={cn(INPUT, 'sm:col-span-2')} aria-label={t('exp.note')} />
          <input ref={file} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => file.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-dashed border-line px-3 text-[14px] text-ink-2 hover:border-ink-3">
            <Paperclip className="size-4" />{receipt ? receipt.name : t('exp.addReceipt')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setMore(true)} className="text-[13.5px] text-ink-2 underline-offset-2 hover:underline">{t('exp.moreDetails')}</button>
      )}
    </form>
  )
}

type ExpenseRowT = NonNullable<ReturnType<typeof useExpenses>['data']>[number]

function ExpenseRow({ v, r, canWrite }: { v: VehicleOverview; r: ExpenseRowT; canWrite: boolean }) {
  const { t } = useTranslation('cars')
  const { company } = useCompany()
  const save = useSaveExpense(company.id, v.id!)
  const del = useDeleteExpense(v.id!)
  const draft = (patch: Partial<{ title: string; amount: string }>) => ({
    title: r.title, category: r.category, amount: String(r.amount), expense_date: r.expense_date,
    supplier_name: r.supplier_name, description: r.description, ...patch,
  })
  return (
    <li className="group flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5" data-expense={r.title}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(r.category) }} aria-hidden />
      <div className="min-w-0 flex-1">
        <InlineText id={`exp-title-${r.id}`} label={t('exp.titleLabel')} value={r.title} disabled={!canWrite} className="font-semibold"
          onSave={(x) => (x ? save.mutateAsync({ id: r.id, draft: draft({ title: x }) }) : Promise.resolve())} />
        <p className="text-[13.5px] text-ink-3">{[tr(t, `exp.cat.${r.category}`), r.supplier_name, fmtDate(r.expense_date).replace(/ \d{4}$/, ''), r.description].filter(Boolean).join(' · ')}</p>
      </div>
      {r.receipt_storage_path && (
        <button onClick={() => downloadFile(r.receipt_storage_path!, `receipt-${r.title}`)} className="text-[14px] font-medium text-info hover:underline">{t('exp.receipt')}</button>
      )}
      <InlineText id={`exp-amount-${r.id}`} label={t('exp.amount')} value={String(Number(r.amount))} disabled={!canWrite} inputMode="decimal" dir="ltr" inputClassName="w-32"
        display={<span className="tnum font-semibold">{fmtMoney(r.amount)}</span>}
        validate={(x) => (parseAmount(x) ? null : t('car.badPrice'))}
        onSave={(x) => save.mutateAsync({ id: r.id, draft: draft({ amount: parseAmount(x)! }) })} />
      {canWrite && (
        <button onClick={() => del.mutate(r.id, { onSuccess: () => toast.success(t('exp.removed')), onError: (e) => toast.error(friendlyError(e)) })}
          className="flex size-8 items-center justify-center rounded-lg text-ink-3 opacity-60 hover:bg-hover hover:text-danger group-hover:opacity-100" aria-label={t('exp.remove', { title: r.title })}>
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  )
}

