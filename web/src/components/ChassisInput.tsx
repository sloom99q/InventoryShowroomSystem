import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { findByChassis } from '@/api/vehicles'
import { checkChassis } from '@/lib/vin'
import { cn } from '@/lib/cn'
import { useDeferredValue } from 'react'

/** Large chassis input with live format check and duplicate lookup. */
export function ChassisInput({ value, onChange, excludeId, autoFocus, id }: {
  value: string
  onChange: (v: string) => void
  excludeId?: string
  autoFocus?: boolean
  id?: string
}) {
  const { t } = useTranslation(['add', 'common'])
  const check = checkChassis(value)
  const deferred = useDeferredValue(check.normalized)
  const dup = useQuery({
    queryKey: ['chassis-exists', deferred],
    enabled: deferred.length >= 5,
    queryFn: () => findByChassis(deferred),
  })
  const existing = dup.data && dup.data.id !== excludeId ? dup.data : null

  return (
    <div>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="characters"
        dir="ltr"
        spellCheck={false}
        placeholder="LVVDB21B9PD012345"
        aria-invalid={!!existing || (value.length > 0 && check.errors.length > 0)}
        className="vin h-14 w-full rounded-lg border border-line bg-surface px-4 text-[22px] tracking-[0.08em] text-ink placeholder:text-ink-3/50 focus:border-accent focus:outline-none aria-invalid:border-danger sm:text-[26px]"
      />
      <div className="mt-2 min-h-5 space-y-1.5 text-[13px]" aria-live="polite">
        {value && (
          <p className="tnum text-ink-3">
            {t('chassis.characters', { count: check.normalized.length })}
            {check.kind === 'vin17' && check.years.length > 0 && ` · ${t('chassis.modelYear', { years: check.years.join(t('chassis.or')) })}`}
          </p>
        )}
        {existing ? (
          <p className="flex items-center gap-2 text-danger">
            <CircleAlert className="size-4 shrink-0" />
            <span>
              {existing.archived_at ? t('chassis.alreadyRegisteredArchived') : t('chassis.alreadyRegistered')}{' '}
              <Link to={`/vehicles/${existing.id}`} className="underline">{[existing.brand, existing.model].filter(Boolean).join(' ') || existing.chassis_number}</Link>
            </span>
          </p>
        ) : value && check.errors.length ? (
          <p className="flex items-center gap-2 text-danger"><CircleAlert className="size-4 shrink-0" />{check.errors[0]}</p>
        ) : null}
        {!existing && check.warnings.map((w) => (
          <p key={w} className="flex items-start gap-2 text-warn"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{w}</p>
        ))}
        {!existing && check.suggestion && (
          <button type="button" onClick={() => onChange(check.suggestion!)} className="text-[13px] text-accent underline">
            <Trans t={t} i18nKey="chassis.useInstead" values={{ value: check.suggestion }} components={[<span key="v" className="vin" />]} />
          </button>
        )}
        {!existing && check.kind === 'vin17' && check.checkDigitValid && !check.warnings.length && (
          <p className={cn('flex items-center gap-2 text-ok')}><CheckCircle2 className="size-4" />{t('chassis.valid')}</p>
        )}
      </div>
    </div>
  )
}

export function useChassisBlocked(value: string, excludeId?: string) {
  const n = checkChassis(value)
  const dup = useQuery({ queryKey: ['chassis-exists', n.normalized], enabled: n.normalized.length >= 5, queryFn: () => findByChassis(n.normalized) })
  return n.errors.length > 0 || (!!dup.data && dup.data.id !== excludeId)
}
