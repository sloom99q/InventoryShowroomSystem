// A vehicle's data in the shape of the fixed field catalogue: single fields,
// ordered lists and "Other" (facts that match no field; kept, never printed).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FIELD_BY_KEY, FIELDS, isListKey, labelFor, SECTION_OF, STORED_FIELDS, VEHICLE_COLUMNS } from '@/lib/fields'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type SpecRow = Database['public']['Tables']['vehicle_specs']['Row']
export type Bilingual = { en?: string | null; ar?: string | null }

export type VehicleData = {
  /** field_key → row (single-value fields). */
  fields: Map<string, SpecRow>
  /** list key → rows in order. */
  lists: Record<string, SpecRow[]>
  /** Rows that match no field. */
  other: SpecRow[]
}

export function splitSpecs(rows: SpecRow[]): VehicleData {
  const fields = new Map<string, SpecRow>()
  const lists: Record<string, SpecRow[]> = {}
  const other: SpecRow[] = []
  for (const r of rows) {
    if (r.field_key && r.position !== null && isListKey(r.field_key)) (lists[r.field_key] ??= []).push(r)
    else if (r.field_key && r.position === null && FIELD_BY_KEY.has(r.field_key) && !fields.has(r.field_key)) fields.set(r.field_key, r)
    else other.push(r)
  }
  for (const k of Object.keys(lists)) lists[k].sort((a, b) => a.position! - b.position!)
  return { fields, lists, other }
}

export function useVehicleData(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ['specs', vehicleId],
    enabled: !!vehicleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_specs')
        .select('*, documents(original_filename)')
        .eq('vehicle_id', vehicleId!)
        .order('sort_order')
      if (error) throw error
      return data
    },
    select: (rows) => ({ rows, ...splitSpecs(rows as SpecRow[]) }),
  })
}

const clean = (s: string | null | undefined) => (s?.trim() ? s.trim() : null)

export function useFieldWriter(vehicleId: string) {
  const qc = useQueryClient()
  const done = () => {
    qc.invalidateQueries({ queryKey: ['specs', vehicleId] })
    qc.invalidateQueries({ queryKey: ['audit', vehicleId] })
  }
  const nextSort = async () => {
    const { data } = await supabase.from('vehicle_specs').select('sort_order').eq('vehicle_id', vehicleId).order('sort_order', { ascending: false }).limit(1)
    return (data?.[0]?.sort_order ?? 0) + 1
  }

  /** Set (or clear, when both are empty) one field's English/Arabic value. */
  const setField = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: Bilingual }) => {
      const en = clean(value.en)
      const ar = clean(value.ar)
      const { data: existing } = await supabase.from('vehicle_specs').select('id, value_en, value_ar')
        .eq('vehicle_id', vehicleId).eq('field_key', key).is('position', null).maybeSingle()
      const nextEn = value.en === undefined ? existing?.value_en ?? null : en
      const nextAr = value.ar === undefined ? existing?.value_ar ?? null : ar
      if (!nextEn && !nextAr) {
        if (existing) {
          const { error } = await supabase.from('vehicle_specs').delete().eq('id', existing.id)
          if (error) throw error
        }
        return
      }
      if (existing) {
        const { error } = await supabase.from('vehicle_specs').update({ value_en: nextEn, value_ar: nextAr, verified: true }).eq('id', existing.id)
        if (error) throw error
        return
      }
      const def = FIELD_BY_KEY.get(key)!
      const { error } = await supabase.from('vehicle_specs').insert({
        vehicle_id: vehicleId, field_key: key, label: def.label_en, label_alt: def.label_ar,
        section: SECTION_OF.get(key)?.title_en ?? null, value_en: nextEn, value_ar: nextAr, verified: true, sort_order: await nextSort(),
      })
      if (error) throw error
    },
    onSuccess: done,
  })

  const addItem = useMutation({
    mutationFn: async ({ list, value }: { list: string; value: Bilingual }) => {
      const { data: last } = await supabase.from('vehicle_specs').select('position')
        .eq('vehicle_id', vehicleId).eq('field_key', list).not('position', 'is', null).order('position', { ascending: false }).limit(1)
      const { error } = await supabase.from('vehicle_specs').insert({
        vehicle_id: vehicleId, field_key: list, position: (last?.[0]?.position ?? 0) + 1, label: labelFor(list),
        section: SECTION_OF.get(list)?.title_en ?? labelFor(list), value_en: clean(value.en), value_ar: clean(value.ar), verified: true,
        sort_order: await nextSort(),
      })
      if (error) throw error
    },
    onSuccess: done,
  })

  const updateRow = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<SpecRow, 'value_en' | 'value_ar' | 'label' | 'label_alt' | 'unit' | 'verified' | 'section'>> }) => {
      const { error } = await supabase.from('vehicle_specs').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: done,
  })

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehicle_specs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: done,
  })

  /** Swap a list item with its neighbour. */
  const moveItem = useMutation({
    mutationFn: async ({ items, index, dir }: { items: SpecRow[]; index: number; dir: -1 | 1 }) => {
      const a = items[index]
      const b = items[index + dir]
      if (!a || !b) return
      // Positions are unique only by convention, so a direct swap is safe.
      const r1 = await supabase.from('vehicle_specs').update({ position: b.position }).eq('id', a.id)
      if (r1.error) throw r1.error
      const r2 = await supabase.from('vehicle_specs').update({ position: a.position }).eq('id', b.id)
      if (r2.error) throw r2.error
    },
    onSuccess: done,
  })

  /** Move an "Other" fact into a field (keeps its values). */
  const assignOther = useMutation({
    mutationFn: async ({ row, key }: { row: SpecRow; key: string }) => {
      if (isListKey(key)) {
        await addItem.mutateAsync({ list: key, value: { en: row.value_en, ar: row.value_ar } })
      } else {
        await setField.mutateAsync({ key, value: { en: [row.value_en, row.unit].filter(Boolean).join(' ') || null, ar: row.value_ar } })
      }
      const { error } = await supabase.from('vehicle_specs').delete().eq('id', row.id)
      if (error) throw error
    },
    onSuccess: done,
  })

  return { setField, addItem, updateRow, removeRow, moveItem, assignOther }
}

// ---------------------------------------------------------------------------
// "Documents X% ready"
// ---------------------------------------------------------------------------

export type Gap = { kind: 'empty' | 'arabic'; key: string; label: string; rowId?: string }

type VehicleIdentity = { brand: string | null; model: string | null; year: number | null; trim_level: string | null; listing_price: number | null }

/** What's still missing before the documents are complete: empty fields and missing Arabic. */
export function readiness(v: VehicleIdentity, data: VehicleData) {
  const gaps: Gap[] = []
  let total = 0
  for (const f of FIELDS.identity) {
    total++
    const col = VEHICLE_COLUMNS[f.key as keyof typeof VEHICLE_COLUMNS]
    const filled = col ? v[col] !== null && v[col] !== undefined && String(v[col]).trim() !== '' : !!data.fields.get(f.key)?.value_en
    if (!filled) gaps.push({ kind: 'empty', key: f.key, label: f.label_en })
  }
  for (const f of STORED_FIELDS.filter((x) => SECTION_OF.has(x.key))) {
    const row = data.fields.get(f.key)
    if (!row?.value_en) {
      total++
      gaps.push({ kind: 'empty', key: f.key, label: f.label_en })
    } else {
      total += 2 // the value and its Arabic
      if (!row.value_ar) gaps.push({ kind: 'arabic', key: f.key, label: f.label_en, rowId: row.id })
    }
  }
  for (const s of FIELDS.sections.filter((x) => x.list)) {
    const items = data.lists[s.list!] ?? []
    total++
    if (!items.length) gaps.push({ kind: 'empty', key: s.list!, label: s.title_en })
    for (const it of items) {
      total++
      if (!it.value_ar) gaps.push({ kind: 'arabic', key: s.list!, label: it.value_en ?? s.title_en, rowId: it.id })
    }
  }
  total++
  if (!(data.lists.key_features ?? []).length) gaps.push({ kind: 'empty', key: 'key_features', label: FIELDS.key_features.label_en })
  const filled = Math.max(0, total - gaps.length)
  return { pct: total ? Math.round((filled / total) * 100) : 100, gaps, empty: gaps.filter((g) => g.kind === 'empty').length, arabic: gaps.filter((g) => g.kind === 'arabic').length }
}
