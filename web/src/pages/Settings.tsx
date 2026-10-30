import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Panel } from '@/components/ui/misc'
import { useCompany } from '@/lib/auth'
import { friendlyError, supabase } from '@/lib/supabase'

export default function Settings() {
  const { company } = useCompany()
  const qc = useQueryClient()
  const [name, setName] = useState(company.name)
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('companies').update({ name: name.trim() }).eq('id', company.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); toast.success('Settings saved') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <>
      <PageHeader title="Settings" />
      <Panel className="max-w-xl space-y-4 p-5">
        <Field label="Showroom name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-4 text-[13.5px]">
          <div><p className="text-ink-3">Currency</p><p>{company.currency}</p></div>
          <div><p className="text-ink-3">Time zone for dates</p><p>{company.timezone} (UAE time)</p></div>
        </div>
        <Button variant="primary" loading={m.isPending} disabled={!name.trim() || name === company.name} onClick={() => m.mutate()}>Save settings</Button>
      </Panel>
    </>
  )
}
