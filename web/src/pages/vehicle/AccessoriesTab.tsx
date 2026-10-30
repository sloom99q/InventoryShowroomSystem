import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAccessories, useAddAccessories, useDeleteAccessory, useUpdateAccessory, type AccessoryDraft } from '@/api/records'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Empty, ErrorNote, PageLoader, Panel, PanelHeader } from '@/components/ui/misc'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { ACCESSORY_LABEL, ITEM_STATUS_LABEL } from '@/lib/labels'
import { friendlyError } from '@/lib/supabase'
import type { Accessory, AccessoryType, ItemStatus } from '@/lib/types'

const STATUS_TONE: Record<ItemStatus, string> = { present: 'text-ok', missing: 'text-danger', unknown: 'text-warn' }
const TYPES: AccessoryType[] = ['physical_key', 'smart_key', 'nfc_card', 'charger', 'other']

export function AccessoriesTab({ vehicleId }: { vehicleId: string }) {
  const { canWrite } = useCompany()
  const q = useAccessories(vehicleId)
  const upd = useUpdateAccessory(vehicleId)
  const del = useDeleteAccessory(vehicleId)
  const [adding, setAdding] = useState(false)
  const [remove, setRemove] = useState<Accessory | null>(null)

  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const items = q.data!
  const missing = items.filter((i) => i.status === 'missing')
  const count = (t: AccessoryType) => items.filter((i) => i.item_type === t && i.status === 'present').reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="space-y-5">
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['physical_key', 'smart_key', 'nfc_card', 'charger'] as const).map((t) => (
            <Panel key={t} className="px-4 py-3">
              <p className="text-[12.5px] text-ink-3">{ACCESSORY_LABEL[t]}s present</p>
              <p className="tnum text-[20px] font-semibold">{count(t)}</p>
            </Panel>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13.5px] text-danger">
          Missing before delivery: {missing.map((m) => m.item_name).join(', ')}
        </p>
      )}
      <Panel>
        <PanelHeader title="Items">
          {canWrite && <Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus />Add item</Button>}
        </PanelHeader>
        {items.length === 0 ? (
          <Empty icon={<KeyRound />} title="No accessories recorded" action={canWrite && <Button onClick={() => setAdding(true)}><Plus />Add item</Button>}>
            Record each key, NFC card and charger separately so missing items are easy to spot.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line-soft text-[12.5px] text-ink-3">
                  <th className="h-9 px-4 text-start font-medium">Item</th>
                  <th className="px-3 text-start font-medium">Type</th>
                  <th className="px-3 text-end font-medium">Qty</th>
                  <th className="px-3 text-start font-medium">Status</th>
                  <th className="px-3 text-start font-medium">Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-2 font-medium">{it.item_name}</td>
                    <td className="px-3 text-ink-2">{ACCESSORY_LABEL[it.item_type]}</td>
                    <td className="tnum px-3 text-end">{it.quantity}</td>
                    <td className="px-3 py-1.5">
                      {canWrite ? (
                        <Select aria-label={`Status of ${it.item_name}`} value={it.status} className={cn('h-8 w-32', STATUS_TONE[it.status])}
                          onChange={(e) => upd.mutate({ id: it.id, patch: { status: e.target.value as ItemStatus } }, { onError: (er) => toast.error(friendlyError(er)) })}>
                          {(['present', 'missing', 'unknown'] as const).map((s) => <option key={s} value={s}>{ITEM_STATUS_LABEL[s]}</option>)}
                        </Select>
                      ) : <span className={STATUS_TONE[it.status]}>{ITEM_STATUS_LABEL[it.status]}</span>}
                    </td>
                    <td className="px-3 text-ink-2">{it.notes}</td>
                    <td className="px-3 text-end">
                      {canWrite && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${it.item_name}`} onClick={() => setRemove(it)}><Trash2 /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {adding && <AddItem vehicleId={vehicleId} existing={items} onClose={() => setAdding(false)} />}
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title={`Remove ${remove?.item_name}?`} confirmLabel="Remove item" loading={del.isPending}
        onConfirm={() => remove && del.mutate(remove.id, { onSuccess: () => setRemove(null), onError: (e) => toast.error(friendlyError(e)) })}>
        Use this only for an item added by mistake. If the item is lost, set its status to Missing instead. The removal is recorded in the change history.
      </ConfirmDialog>
    </div>
  )
}

function AddItem({ vehicleId, existing, onClose }: { vehicleId: string; existing: Accessory[]; onClose: () => void }) {
  const [type, setType] = useState<AccessoryType>('physical_key')
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [status, setStatus] = useState<ItemStatus>('present')
  const [notes, setNotes] = useState('')
  const add = useAddAccessories(vehicleId)
  const n = existing.filter((e) => e.item_type === type).length + 1
  const defaultName = type === 'other' ? '' : type === 'charger' ? 'Charger' : `${ACCESSORY_LABEL[type]} ${n}`
  const item: AccessoryDraft = { item_type: type, item_name: name.trim() || defaultName, quantity: Math.max(0, Number(qty) || 0), status, notes: notes.trim() || null }
  return (
    <Dialog open onClose={onClose} title="Add item"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={add.isPending} disabled={!item.item_name}
          onClick={() => add.mutate([item], { onSuccess: () => { toast.success('Item added'); onClose() }, onError: (e) => toast.error(friendlyError(e)) })}>Add item</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value as AccessoryType)}>{TYPES.map((t) => <option key={t} value={t}>{ACCESSORY_LABEL[t]}</option>)}</Select>}</Field>
        <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName || 'e.g. Floor mats'} />}</Field>
        <Field label="Quantity">{(id) => <Input id={id} type="number" min={0} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>{(['present', 'missing', 'unknown'] as const).map((s) => <option key={s} value={s}>{ITEM_STATUS_LABEL[s]}</option>)}</Select>}</Field>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={type === 'charger' ? 'e.g. Type 2 portable' : ''} />}</Field>
      </div>
    </Dialog>
  )
}
