import { zodResolver } from '@hookform/resolvers/zod'
import { Paperclip, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useDeleteExpense, useExpenses, useSaveExpense } from '@/api/records'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Empty, ErrorNote, PageLoader, Panel, PanelHeader } from '@/components/ui/misc'
import { useCompany } from '@/lib/auth'
import { openFile } from '@/lib/files'
import { fmtDate, fmtMoney, parseAmount, sumMoney, todayDubai } from '@/lib/format'
import { EXPENSE_LABEL } from '@/lib/labels'
import { friendlyError } from '@/lib/supabase'
import type { Expense, ExpenseCategory } from '@/lib/types'

export function ExpensesTab({ vehicleId }: { vehicleId: string }) {
  const { company, canWrite } = useCompany()
  const q = useExpenses(vehicleId)
  const del = useDeleteExpense(vehicleId)
  const [edit, setEdit] = useState<Expense | 'new' | null>(null)
  const [remove, setRemove] = useState<Expense | null>(null)

  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const rows = q.data!
  const total = sumMoney(rows.map((r) => r.amount))
  const byCat = Object.entries(
    rows.reduce<Record<string, number[]>>((acc, r) => ((acc[r.category] ??= []).push(r.amount), acc), {}),
  ).map(([k, v]) => [k as ExpenseCategory, sumMoney(v)] as const).sort((a, b) => b[1] - a[1])

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <Panel>
        <PanelHeader title="Expenses">
          {canWrite && <Button variant="primary" size="sm" onClick={() => setEdit('new')}><Plus />Add expense</Button>}
        </PanelHeader>
        {rows.length === 0 ? (
          <Empty icon={<Receipt />} title="No expenses recorded" action={canWrite && <Button onClick={() => setEdit('new')}><Plus />Add expense</Button>}>
            Record garage repairs, tyres, transport and other costs for this car.
          </Empty>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{r.title}</p>
                  <p className="text-[12.5px] text-ink-3">{EXPENSE_LABEL[r.category]} · {fmtDate(r.expense_date)}{r.supplier_name ? ` · ${r.supplier_name}` : ''}</p>
                  {r.description && <p className="mt-0.5 text-[12.5px] text-ink-2">{r.description}</p>}
                </div>
                {r.receipt_storage_path && <Button variant="ghost" size="icon-sm" title="Open receipt" aria-label="Open receipt" onClick={() => openFile(r.receipt_storage_path!)}><Paperclip /></Button>}
                <span className="tnum w-32 text-end text-[13.5px] font-medium">{fmtMoney(r.amount, r.currency)}</span>
                {canWrite && (
                  <div className="flex">
                    <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEdit(r)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setRemove(r)}><Trash2 /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="h-fit">
        <div className="border-b border-line-soft px-4 py-3">
          <p className="text-[13px] text-ink-2">Total recorded expenses</p>
          <p className="tnum mt-0.5 text-[22px] font-semibold">{fmtMoney(total, company.currency)}</p>
        </div>
        {byCat.length > 0 && (
          <table className="w-full text-[13px]">
            <tbody>
              {byCat.map(([k, v]) => (
                <tr key={k} className="border-b border-line-soft last:border-0">
                  <td className="px-4 py-2 text-ink-2">{EXPENSE_LABEL[k]}</td>
                  <td className="tnum px-4 text-end">{fmtMoney(v, company.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {edit && <ExpenseDialog companyId={company.id} vehicleId={vehicleId} expense={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title="Delete this expense?" confirmLabel="Delete expense" loading={del.isPending}
        onConfirm={() => remove && del.mutate(remove.id, { onSuccess: () => { toast.success('Expense deleted'); setRemove(null) }, onError: (e) => toast.error(friendlyError(e)) })}>
        {remove && <>“{remove.title}”, {fmtMoney(remove.amount, remove.currency)}. It is removed from the totals; the record and who deleted it stay in the change history.</>}
      </ConfirmDialog>
    </div>
  )
}

const schema = z.object({
  title: z.string().trim().min(1, 'Enter what the expense was for').max(200),
  category: z.enum(['mechanical', 'electrical', 'bodywork', 'paint', 'tires', 'maintenance', 'transportation', 'accessories', 'other']),
  amount: z.string().refine((v) => parseAmount(v) !== null, 'Enter an amount like 1200 or 1,200.50'),
  expense_date: z.string().min(1, 'Choose a date'),
  supplier_name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
})
type Form = z.infer<typeof schema>

export function ExpenseDialog({ companyId, vehicleId, expense, onClose }: { companyId: string; vehicleId: string; expense: Expense | null; onClose: () => void }) {
  const [receipt, setReceipt] = useState<File | null>(null)
  const save = useSaveExpense(companyId, vehicleId)
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: expense
      ? { title: expense.title, category: expense.category, amount: Number(expense.amount).toFixed(2), expense_date: expense.expense_date, supplier_name: expense.supplier_name ?? '', description: expense.description ?? '' }
      : { category: 'mechanical', expense_date: todayDubai(), amount: '' },
  })
  const submit = handleSubmit((f) =>
    save.mutate({ id: expense?.id, draft: { ...f, amount: parseAmount(f.amount)!, supplier_name: f.supplier_name?.trim() || null, description: f.description?.trim() || null, receipt } }, {
      onSuccess: () => { toast.success(expense ? 'Expense updated' : 'Expense added'); onClose() },
      onError: (e) => toast.error(friendlyError(e)),
    }),
  )
  return (
    <Dialog open onClose={onClose} title={expense ? 'Edit expense' : 'Add expense'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>{expense ? 'Save changes' : 'Add expense'}</Button></>}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="What was it for?" error={errors.title?.message} className="sm:col-span-2">
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.title} {...register('title')} placeholder="e.g. Front bumper repair" autoFocus />}
        </Field>
        <Field label="Category">
          {(id) => <Select id={id} {...register('category')}>{Object.entries(EXPENSE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}
        </Field>
        <Field label="Amount (AED)" error={errors.amount?.message}>
          {(id, d) => <Input id={id} inputMode="decimal" aria-describedby={d} aria-invalid={!!errors.amount} {...register('amount')} className="tnum" />}
        </Field>
        <Field label="Date" error={errors.expense_date?.message}>
          {(id) => <Input id={id} type="date" {...register('expense_date')} />}
        </Field>
        <Field label="Garage / supplier">
          {(id) => <Input id={id} {...register('supplier_name')} />}
        </Field>
        <Field label="Description" className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} {...register('description')} />}
        </Field>
        <Field label={expense?.receipt_storage_path ? 'Replace receipt (the old one is kept)' : 'Receipt or invoice (optional)'} className="sm:col-span-2">
          {(id) => <Input id={id} type="file" accept="application/pdf,image/*" className="h-auto py-1.5 file:me-3 file:rounded file:border-0 file:bg-raised file:px-2 file:py-1 file:text-ink" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />}
        </Field>
      </form>
    </Dialog>
  )
}
