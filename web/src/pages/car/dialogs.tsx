// Car dialogs kept from the earlier car page: correct the chassis, archive/restore, delete permanently.
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useArchiveVehicle, useDeleteVehicle, useUpdateVehicle } from '@/api/vehicles'
import { ChassisInput, useChassisBlocked } from '@/components/ChassisInput'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/form'
import { vehicleTitle } from '@/components/vehicle-bits'
import { friendlyError } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'

export function ChassisDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const { t } = useTranslation(['vehicle', 'common', 'salesdocs'])
  const [value, setValue] = useState(v.chassis_number!)
  const [reason, setReason] = useState('')
  const blocked = useChassisBlocked(value, v.id!)
  const upd = useUpdateVehicle(v.id!)
  return (
    <Dialog open={open} onClose={onClose} title={t('chassisDialog.title')} size="lg"
      description={t('chassisDialog.description')}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
        <Button variant="primary" loading={upd.isPending} disabled={blocked || value.trim() === v.chassis_number || !reason.trim()}
          onClick={() => upd.mutate({
            chassis_number: value.trim(),
            chassis_verified: false,
            notes: [v.notes, t('chassisDialog.note', { old: v.chassis_number, reason: reason.trim() })].filter(Boolean).join('\n'),
          }, {
            onSuccess: () => { toast.success(t('chassisDialog.toast')); onClose() },
            onError: (e) => toast.error(friendlyError(e)),
          })}>{t('chassisDialog.save')}</Button>
      </>}>
      <div className="space-y-4">
        <ChassisInput value={value} onChange={setValue} excludeId={v.id!} />
        <Field label={t('chassisDialog.reason')}>
          {(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('chassisDialog.reasonPlaceholder')} />}
        </Field>
      </div>
    </Dialog>
  )
}

export function ArchiveDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const { t } = useTranslation('vehicle')
  const m = useArchiveVehicle(v.id!)
  const archiving = !v.archived_at
  return (
    <ConfirmDialog open={open} onClose={onClose} title={archiving ? t('archiveDialog.titleArchive') : t('archiveDialog.titleRestore')} danger={archiving}
      confirmLabel={archiving ? t('archiveDialog.confirmArchive') : t('archiveDialog.confirmRestore')} loading={m.isPending}
      onConfirm={() => m.mutate({ archive: archiving }, {
        onSuccess: () => { toast.success(archiving ? t('archiveDialog.toastArchived') : t('archiveDialog.toastRestored')); onClose() },
        onError: (e) => toast.error(friendlyError(e)),
      })}>
      {archiving ? t('archiveDialog.bodyArchive') : t('archiveDialog.bodyRestore')}
    </ConfirmDialog>
  )
}

/** Permanent delete (admins): the car, everything recorded about it, and its files. */
export function DeleteDialog({ v, onClose }: { v: VehicleOverview; onClose: () => void }) {
  const { t } = useTranslation(['vehicle', 'common'])
  const nav = useNavigate()
  const del = useDeleteVehicle()
  const [typed, setTyped] = useState('')
  const last6 = v.chassis_number!.slice(-6).toUpperCase()
  const ok = typed.replace(/\s/g, '').toUpperCase() === last6
  return (
    <Dialog open onClose={onClose} title={t('deleteDialog.title')} size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={del.isPending}>{t('common:actions.cancel')}</Button>
        <Button variant="danger" disabled={!ok} loading={del.isPending}
          onClick={async () => {
            try {
              const r = await del.mutateAsync({ id: v.id!, confirm: typed })
              nav('/vehicles', { replace: true })
              if (r.filesLeft) toast.warning(t('deleteDialog.filesLeft', { count: r.filesLeft }))
              else toast.success(t('deleteDialog.done', { chassis: v.chassis_number }))
            } catch (e) {
              toast.error(friendlyError(e))
            }
          }}><Trash2 />{t('deleteDialog.confirm')}</Button>
      </>}>
      <div className="space-y-4 text-[14px]">
        <div className="rounded-md border border-line-soft bg-raised px-3 py-2.5">
          <p className="vin text-[17px] font-semibold tracking-wide" dir="ltr">{v.chassis_number}</p>
          <p className="text-[13px] text-ink-2">{vehicleTitle(v)}</p>
        </div>
        <p className="text-ink-2">{t('deleteDialog.body')}</p>
        <p className="text-ink-2">{t('deleteDialog.archiveHint')}</p>
        <Field label={t('deleteDialog.typeLabel', { last6 })}>
          {(id) => (
            <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" spellCheck={false}
              dir="ltr" className="vin uppercase tracking-[0.2em]" placeholder={last6} aria-invalid={typed.length >= 6 && !ok} />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
