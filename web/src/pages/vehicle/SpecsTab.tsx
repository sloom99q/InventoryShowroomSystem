import { Check, ListTree, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useSpecMutations, useSpecs } from '@/api/specs'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Empty, ErrorNote, PageLoader, Panel, PanelHeader } from '@/components/ui/misc'
import { useCompany } from '@/lib/auth'
import { friendlyError } from '@/lib/supabase'

type Spec = NonNullable<ReturnType<typeof useSpecs>['data']>[number]

function SpecRow({ s, canWrite, vehicleId }: { s: Spec; canWrite: boolean; vehicleId: string }) {
  const { t } = useTranslation(['docimport', 'common'])
  const { update, remove } = useSpecMutations(vehicleId)
  const [edit, setEdit] = useState(false)
  const [label, setLabel] = useState(s.label)
  const [value, setValue] = useState(s.value)
  const [unit, setUnit] = useState(s.unit ?? '')
  const save = () =>
    update.mutate({ id: s.id, patch: { label: label.trim(), value: value.trim(), unit: unit.trim() || null } }, {
      onSuccess: () => setEdit(false),
      onError: (e) => toast.error(friendlyError(e)),
    })
  const source = s.documents?.original_filename
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13.5px]">
      {edit ? (
        <>
          <Input aria-label={t('specs.label')} value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 w-56" dir="auto" />
          <Input aria-label={t('specs.value')} value={value} onChange={(e) => setValue(e.target.value)} className="h-8 min-w-40 flex-1" dir="auto" />
          <Input aria-label={t('specs.unit')} value={unit} onChange={(e) => setUnit(e.target.value)} className="h-8 w-20" dir="auto" />
          <Button size="icon-sm" variant="primary" aria-label={t('common:actions.save')} loading={update.isPending} disabled={!label.trim() || !value.trim()} onClick={save}><Check /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={t('common:actions.cancel')} onClick={() => setEdit(false)}><X /></Button>
        </>
      ) : (
        <>
          <div className="min-w-0 basis-56 text-ink-2">
            <span className="block" dir="auto">{s.label}</span>
            {s.label_alt && <span className="block text-[12.5px] text-ink-3" dir="auto">{s.label_alt}</span>}
          </div>
          <div className="min-w-0 flex-1 font-medium" dir="auto">{s.value}{s.unit && <span className="ms-1 font-normal text-ink-2">{s.unit}</span>}</div>
          {source && <span className="text-[12px] text-ink-3" dir="auto">{source}{s.source_page ? ` · ${t('review.pageN', { n: s.source_page })}` : ''}</span>}
          {canWrite && (
            <span className="flex">
              <Button variant="ghost" size="icon-sm" aria-label={t('common:actions.edit')} onClick={() => setEdit(true)}><Pencil /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={t('common:actions.remove')} loading={remove.isPending}
                onClick={() => remove.mutate(s.id, { onError: (e) => toast.error(friendlyError(e)) })}><Trash2 /></Button>
            </span>
          )}
        </>
      )}
    </li>
  )
}

export function SpecsTab({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation(['docimport', 'common'])
  const { canWrite } = useCompany()
  const q = useSpecs(vehicleId)
  const { add } = useSpecMutations(vehicleId)
  const [draft, setDraft] = useState<{ section: string; label: string; value: string; unit: string } | null>(null)

  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const specs = q.data!
  const sections = [...new Set(specs.map((s) => s.section ?? ''))]

  const importLink = canWrite && (
    <Link to={`/vehicles/${vehicleId}/import`} className={buttonVariants({ size: 'sm' })}><Upload />{t('specs.importFiles')}</Link>
  )

  return (
    <div className="space-y-5">
      {specs.length === 0 && !draft ? (
        <Panel>
          <Empty icon={<ListTree />} title={t('specs.emptyTitle')} action={canWrite && (
            <div className="flex gap-2">{importLink}<Button size="sm" onClick={() => setDraft({ section: '', label: '', value: '', unit: '' })}><Plus />{t('specs.add')}</Button></div>
          )}>
            {t('specs.emptyBody')}
          </Empty>
        </Panel>
      ) : (
        <>
          {canWrite && (
            <div className="flex justify-end gap-2">
              {importLink}
              <Button size="sm" onClick={() => setDraft({ section: '', label: '', value: '', unit: '' })}><Plus />{t('specs.add')}</Button>
            </div>
          )}
          {sections.map((sec) => (
            <Panel key={sec || '-'}>
              <PanelHeader title={<span dir="auto">{sec || t('specs.general')}</span>} />
              <ul className="divide-y divide-line-soft">
                {specs.filter((s) => (s.section ?? '') === sec).map((s) => <SpecRow key={s.id} s={s} canWrite={canWrite} vehicleId={vehicleId} />)}
              </ul>
            </Panel>
          ))}
        </>
      )}
      {draft && (
        <Panel className="p-4">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
            e.preventDefault()
            add.mutate({ section: draft.section.trim() || null, label: draft.label.trim(), value: draft.value.trim(), unit: draft.unit.trim() || null }, {
              onSuccess: () => { setDraft(null); toast.success(t('specs.added')) },
              onError: (er) => toast.error(friendlyError(er)),
            })
          }}>
            <Input aria-label={t('specs.section')} placeholder={t('specs.section')} value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })} className="w-44" dir="auto" list="spec-sections" />
            <datalist id="spec-sections">{sections.filter(Boolean).map((s) => <option key={s} value={s} />)}</datalist>
            <Input aria-label={t('specs.label')} placeholder={t('specs.label')} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="w-48" dir="auto" autoFocus />
            <Input aria-label={t('specs.value')} placeholder={t('specs.value')} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} className="min-w-40 flex-1" dir="auto" />
            <Input aria-label={t('specs.unit')} placeholder={t('specs.unit')} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className="w-24" dir="auto" />
            <Button type="submit" variant="primary" loading={add.isPending} disabled={!draft.label.trim() || !draft.value.trim()}>{t('specs.add')}</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>{t('common:actions.cancel')}</Button>
          </form>
        </Panel>
      )}
    </div>
  )
}
