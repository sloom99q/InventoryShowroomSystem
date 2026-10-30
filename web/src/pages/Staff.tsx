import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { ErrorNote, PageLoader, Panel } from '@/components/ui/misc'
import { useCompany } from '@/lib/auth'
import { fmtDate } from '@/lib/format'
import { ROLE_LABEL } from '@/lib/labels'
import { friendlyError, supabase } from '@/lib/supabase'
import type { AppRole } from '@/lib/types'


export default function Staff() {
  const { t } = useTranslation(['pages', 'common'])
  const { profile: me } = useCompany()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const q = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })
  const upd = useMutation({
    mutationFn: async (p: { id: string; patch: { role?: AppRole; active?: boolean } }) => {
      const { error } = await supabase.from('profiles').update(p.patch).eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); toast.success(t('staff.accessUpdated')) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  return (
    <>
      <PageHeader title={t('staff.title')} actions={<Button variant="primary" onClick={() => setAdding(true)}><UserPlus />{t('staff.add')}</Button>} />
      <Panel className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead><tr className="border-b border-line-soft text-[12.5px] text-ink-3">
            <th className="h-10 px-4 text-start font-medium">{t('staff.col.name')}</th><th className="px-3 text-start font-medium">{t('staff.col.role')}</th>
            <th className="px-3 text-start font-medium">{t('staff.col.since')}</th><th className="px-3 text-start font-medium">{t('staff.col.access')}</th>
          </tr></thead>
          <tbody>
            {q.data!.map((p) => (
              <tr key={p.id} className="border-b border-line-soft last:border-0">
                <td className="px-4 py-2.5 font-medium">{p.full_name || t('staff.unnamed')}{p.id === me.id && <span className="ms-2 text-[12px] text-ink-3">{t('common:terms.you')}</span>}</td>
                <td className="px-3 py-1.5">
                  <Select value={p.role} disabled={p.id === me.id} className="h-8 w-48" aria-label={t('staff.roleFor', { name: p.full_name })}
                    onChange={(e) => upd.mutate({ id: p.id, patch: { role: e.target.value as AppRole } })}>
                    {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </Select>
                  <p className="mt-0.5 text-[12px] text-ink-3">{t(`staff.roleHelp.${p.role}`)}</p>
                </td>
                <td className="px-3 text-ink-2">{fmtDate(p.created_at)}</td>
                <td className="px-3">
                  {p.id !== me.id && (
                    <Button size="sm" variant={p.active ? 'ghost' : 'secondary'} onClick={() => upd.mutate({ id: p.id, patch: { active: !p.active } })}>
                      {p.active ? t('staff.turnOff') : t('staff.turnOn')}
                    </Button>
                  )}
                  {!p.active && <span className="ms-2 text-[12.5px] text-danger">{t('staff.noAccess')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {adding && <AddStaff onClose={() => setAdding(false)} />}
    </>
  )
}

function AddStaff({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['pages', 'common'])
  const qc = useQueryClient()
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'secretary' as AppRole })
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-staff', { body: f })
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error(body?.error ?? error.message)
      }
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); qc.invalidateQueries({ queryKey: ['staff-names'] }); toast.success(t('staff.canSignIn', { name: f.full_name || f.email })); onClose() },
    onError: (e) => toast.error((e as Error).message),
  })
  return (
    <Dialog open onClose={onClose} title={t('staff.add')} description={t('staff.dialogDescription')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()} disabled={!f.email || f.password.length < 10}>{t('staff.add')}</Button></>}>
      <div className="grid gap-4">
        <Field label={t('staff.fullName')}>{(id) => <Input id={id} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />}</Field>
        <Field label={t('staff.email')}>{(id) => <Input id={id} type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" />}</Field>
        <Field label={t('staff.password')} hint={t('staff.passwordHint')}>{(id, d) => <Input id={id} dir="ltr" aria-describedby={d} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />}</Field>
        <Field label={t('staff.role')} hint={t(`staff.roleHelp.${f.role}`)}>{(id, d) => (
          <Select id={id} aria-describedby={d} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as AppRole })}>
            {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        )}</Field>
      </div>
    </Dialog>
  )
}
