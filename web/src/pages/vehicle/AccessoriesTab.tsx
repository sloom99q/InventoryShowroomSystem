import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
const SUMMARY = [
  ['physical_key', 'presentPhysical'],
  ['smart_key', 'presentSmart'],
  ['nfc_card', 'presentNfc'],
  ['charger', 'presentCharger'],
] as const

export function AccessoriesTab({ vehicleId }: { vehicleId: string }) {
  const { t, i18n } = useTranslation(['vehicle', 'common'])
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
  const count = (ty: AccessoryType) => items.filter((i) => i.item_type === ty && i.status === 'present').reduce((s, i) => s + i.quantity, 0)
  const sep = i18n.dir() === 'rtl' ? '، ' : ', '

  return (
    <div className="space-y-5">
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SUMMARY.map(([ty, key]) => (
            <Panel key={ty} className="px-4 py-3">
              <p className="text-[12.5px] text-ink-3">{t(`accessories.${key}`)}</p>
              <p className="tnum text-[20px] font-semibold">{count(ty)}</p>
            </Panel>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13.5px] text-danger">
          {t('accessories.missingBefore', { items: missing.map((m) => m.item_name).join(sep) })}
        </p>
      )}
      <Panel>
        <PanelHeader title={t('accessories.items')}>
          {canWrite && <Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus />{t('accessories.add')}</Button>}
        </PanelHeader>
        {items.length === 0 ? (
          <Empty icon={<KeyRound />} title={t('accessories.emptyTitle')} action={canWrite && <Button onClick={() => setAdding(true)}><Plus />{t('accessories.add')}</Button>}>
            {t('accessories.emptyBody')}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line-soft bg-raised text-[12.5px] text-ink-3">
                  <th className="h-9 px-4 text-start font-medium">{t('accessories.colItem')}</th>
                  <th className="px-3 text-start font-medium">{t('accessories.colType')}</th>
                  <th className="px-3 text-end font-medium">{t('accessories.colQty')}</th>
                  <th className="px-3 text-start font-medium">{t('accessories.colStatus')}</th>
                  <th className="px-3 text-start font-medium">{t('accessories.colNotes')}</th>
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
                        <Select aria-label={t('accessories.statusOf', { name: it.item_name })} value={it.status} className={cn('h-8 w-32', STATUS_TONE[it.status])}
                          onChange={(e) => upd.mutate({ id: it.id, patch: { status: e.target.value as ItemStatus } }, { onError: (er) => toast.error(friendlyError(er)) })}>
                          {(['present', 'missing', 'unknown'] as const).map((s) => <option key={s} value={s}>{ITEM_STATUS_LABEL[s]}</option>)}
                        </Select>
                      ) : <span className={STATUS_TONE[it.status]}>{ITEM_STATUS_LABEL[it.status]}</span>}
                    </td>
                    <td className="px-3 text-ink-2">{it.notes}</td>
                    <td className="px-3 text-end">
                      {canWrite && <Button variant="ghost" size="icon-sm" aria-label={t('accessories.removeAria', { name: it.item_name })} onClick={() => setRemove(it)}><Trash2 /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {adding && <AddItem vehicleId={vehicleId} existing={items} onClose={() => setAdding(false)} />}
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title={t('accessories.removeTitle', { name: remove?.item_name ?? '' })} confirmLabel={t('accessories.removeConfirm')} loading={del.isPending}
        onConfirm={() => remove && del.mutate(remove.id, { onSuccess: () => setRemove(null), onError: (e) => toast.error(friendlyError(e)) })}>
        {t('accessories.removeBody')}
      </ConfirmDialog>
    </div>
  )
}

function AddItem({ vehicleId, existing, onClose }: { vehicleId: string; existing: Accessory[]; onClose: () => void }) {
  const { t } = useTranslation(['vehicle', 'common'])
  const [type, setType] = useState<AccessoryType>('physical_key')
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [status, setStatus] = useState<ItemStatus>('present')
  const [notes, setNotes] = useState('')
  const add = useAddAccessories(vehicleId)
  const n = existing.filter((e) => e.item_type === type).length + 1
  const defaultName = type === 'other' ? '' : type === 'charger' ? ACCESSORY_LABEL.charger : `${ACCESSORY_LABEL[type]} ${n}`
  const item: AccessoryDraft = { item_type: type, item_name: name.trim() || defaultName, quantity: Math.max(0, Number(qty) || 0), status, notes: notes.trim() || null }
  return (
    <Dialog open onClose={onClose} title={t('accessories.addTitle')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
        <Button variant="primary" loading={add.isPending} disabled={!item.item_name}
          onClick={() => add.mutate([item], { onSuccess: () => { toast.success(t('accessories.toastAdded')); onClose() }, onError: (e) => toast.error(friendlyError(e)) })}>{t('accessories.add')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('accessories.type')}>{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value as AccessoryType)}>{TYPES.map((ty) => <option key={ty} value={ty}>{ACCESSORY_LABEL[ty]}</option>)}</Select>}</Field>
        <Field label={t('accessories.name')}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName || t('accessories.namePlaceholder')} />}</Field>
        <Field label={t('accessories.quantity')}>{(id) => <Input id={id} type="number" min={0} inputMode="numeric" dir="ltr" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
        <Field label={t('accessories.status')}>{(id) => <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>{(['present', 'missing', 'unknown'] as const).map((s) => <option key={s} value={s}>{ITEM_STATUS_LABEL[s]}</option>)}</Select>}</Field>
        <Field label={t('accessories.notes')} className="sm:col-span-2">{(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={type === 'charger' ? t('accessories.chargerPlaceholder') : ''} />}</Field>
      </div>
    </Dialog>
  )
}
