import { useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/AppShell'
import { Input, Select } from '@/components/ui/form'
import { Empty, ErrorNote, PageLoader, Panel } from '@/components/ui/misc'
import { Chassis, vehicleTitle } from '@/components/vehicle-bits'
import { useCompany } from '@/lib/auth'
import { fmtDate, fmtMoney, sumMoney } from '@/lib/format'
import { EXPENSE_LABEL } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { ExpenseCategory } from '@/lib/types'

export default function Expenses() {
  const { company } = useCompany()
  const [params, setParams] = useSearchParams()
  const cat = params.get('category') ?? 'all'
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const q = useQuery({
    queryKey: ['all-expenses', cat, from, to],
    queryFn: async () => {
      let r = supabase.from('expenses').select('*, vehicles!inner(id, chassis_number, brand, model, year)').is('deleted_at', null)
        .order('expense_date', { ascending: false }).order('created_at', { ascending: false }).limit(2000)
      if (cat !== 'all') r = r.eq('category', cat as ExpenseCategory)
      if (from) r = r.gte('expense_date', from)
      if (to) r = r.lte('expense_date', to)
      const { data, error } = await r
      if (error) throw error
      return data
    },
  })
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v === 'all' || !v) n.delete(k); else n.set(k, v); setParams(n, { replace: true }) }
  const rows = q.data ?? []
  const total = sumMoney(rows.map((r) => r.amount))
  const byCat = Object.entries(rows.reduce<Record<string, number[]>>((a, r) => ((a[r.category] ??= []).push(r.amount), a), {}))
    .map(([k, v]) => [k as ExpenseCategory, sumMoney(v)] as const).sort((a, b) => b[1] - a[1])

  return (
    <>
      <PageHeader title="Expenses" description="All recorded costs across vehicles. Add expenses from a vehicle's page." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={cat} onChange={(e) => set('category', e.target.value)} className="w-auto" aria-label="Category">
          <option value="all">All categories</option>{Object.entries(EXPENSE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">From <Input type="date" value={from} onChange={(e) => set('from', e.target.value)} className="w-auto" /></label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">to <Input type="date" value={to} onChange={(e) => set('to', e.target.value)} className="w-auto" /></label>
      </div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorNote error={q.error} /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <Panel className="overflow-x-auto">
            {!rows.length ? <Empty icon={<Receipt />} title="No expenses in this range" /> : (
              <table className="w-full text-[13.5px]">
                <thead><tr className="border-b border-line-soft text-[12.5px] text-ink-3">
                  <th className="h-10 px-4 text-start font-medium">Date</th><th className="px-3 text-start font-medium">Expense</th>
                  <th className="px-3 text-start font-medium">Vehicle</th><th className="px-4 text-end font-medium">Amount</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-line-soft last:border-0">
                      <td className="tnum px-4 py-2.5 whitespace-nowrap text-ink-2">{fmtDate(r.expense_date)}</td>
                      <td className="px-3"><p>{r.title}</p><p className="text-[12.5px] text-ink-3">{EXPENSE_LABEL[r.category]}{r.supplier_name ? ` · ${r.supplier_name}` : ''}</p></td>
                      <td className="px-3"><Link to={`/vehicles/${r.vehicles.id}?tab=expenses`} className="hover:underline"><p>{vehicleTitle(r.vehicles)}</p><Chassis value={r.vehicles.chassis_number} className="text-[12.5px] text-ink-2" /></Link></td>
                      <td className="tnum px-4 text-end font-medium whitespace-nowrap">{fmtMoney(r.amount, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Panel className="h-fit">
            <div className="border-b border-line-soft px-4 py-3">
              <p className="text-[13px] text-ink-2">Total{cat !== 'all' || from || to ? ' for these filters' : ''}</p>
              <p className="tnum mt-0.5 text-[22px] font-semibold">{fmtMoney(total, company.currency)}</p>
            </div>
            <table className="w-full text-[13px]"><tbody>
              {byCat.map(([k, v]) => (
                <tr key={k} className="border-b border-line-soft last:border-0"><td className="px-4 py-2 text-ink-2">{EXPENSE_LABEL[k]}</td><td className="tnum px-4 text-end">{fmtMoney(v, company.currency)}</td></tr>
              ))}
            </tbody></table>
          </Panel>
        </div>
      )}
    </>
  )
}
