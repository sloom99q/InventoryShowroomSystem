// Rebuild v3 data: the showroom's stages, a car's journey, labels, accessory
// quantities, one-tap expenses, photo order/cover — and realtime sync.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type Stage = Database['public']['Tables']['stages']['Row']
export type JourneyEvent = Database['public']['Tables']['vehicle_events']['Row'] & { profiles?: { full_name: string | null } | null }
type AccessoryType = Database['public']['Enums']['accessory_type']
export type ExpenseCategory = Database['public']['Enums']['expense_category']

/** Everything that shows a car: refresh it after a change (here or on another device). */
export function refreshCar(qc: QueryClient, vehicleId?: string | null) {
  qc.invalidateQueries({ queryKey: ['vehicles'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  qc.invalidateQueries({ queryKey: ['chassis-search'] })
  if (vehicleId) {
    for (const k of ['vehicle', 'journey', 'events', 'audit', 'images', 'accessories', 'expenses', 'documents', 'specs', 'aftersales-car']) {
      qc.invalidateQueries({ queryKey: [k, vehicleId] })
    }
  }
  qc.invalidateQueries({ queryKey: ['aftersales'] })
}

// --- Stages -----------------------------------------------------------------

export function useStages() {
  return useQuery({
    queryKey: ['stages'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('stages').select('*').order('position')
      if (error) throw error
      return data
    },
  })
}

export function useSaveStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: Partial<Stage> & { id?: string }) => {
      const { id, company_id: _c, created_at: _t, ...patch } = s
      const q = id ? supabase.from('stages').update(patch).eq('id', id) : supabase.from('stages').insert(patch as Stage)
      const { error } = await q
      if (error) throw error
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['stages'] }); qc.invalidateQueries({ queryKey: ['vehicles'] }) },
  })
}

export function useReorderStages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const [i, id] of ids.entries()) {
        const { error } = await supabase.from('stages').update({ position: i + 1 }).eq('id', id)
        if (error) throw error
      }
    },
    onMutate: (ids) => {
      qc.setQueryData<Stage[]>(['stages'], (old) => old && ids.map((id, i) => ({ ...old.find((s) => s.id === id)!, position: i + 1 })))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['stages'] }),
  })
}

export function useDeleteStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stages').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['stages'] }),
  })
}

// --- Journey ----------------------------------------------------------------

export function useJourney(vehicleId: string) {
  return useQuery({
    queryKey: ['journey', vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase.from('vehicle_events').select('*')
        .eq('vehicle_id', vehicleId).eq('event_type', 'stage').order('event_at', { ascending: false }).order('created_at', { ascending: false })
      if (error) throw error
      const ids = [...new Set(data.map((e) => e.created_by).filter(Boolean))] as string[]
      const names = new Map<string, string | null>()
      if (ids.length) {
        const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids)
        for (const p of ps ?? []) names.set(p.id, p.full_name)
      }
      return data.map((e) => ({ ...e, by: e.created_by ? names.get(e.created_by) ?? null : null }))
    },
  })
}

export function useMoveStage(vehicleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { stageId: string; at: string; note?: string }) => {
      const { error } = await supabase.rpc('move_vehicle_stage', {
        p_vehicle_id: vehicleId, p_stage_id: p.stageId, p_event_at: p.at, p_note: p.note || undefined,
      })
      if (error) throw error
    },
    onSettled: () => refreshCar(qc, vehicleId),
  })
}

// --- Car fields and labels (optimistic) ---------------------------------------

type VehiclePatch = Database['public']['Tables']['vehicles']['Update']

export function useSaveCar(vehicleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: VehiclePatch) => {
      const { error } = await supabase.from('vehicles').update(patch).eq('id', vehicleId)
      if (error) throw error
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['vehicle', vehicleId] })
      const prev = qc.getQueryData(['vehicle', vehicleId])
      qc.setQueryData(['vehicle', vehicleId], (old: object | undefined) => old && { ...old, ...patch })
      return { prev }
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(['vehicle', vehicleId], ctx.prev) },
    onSettled: () => refreshCar(qc, vehicleId),
  })
}

// --- Accessories --------------------------------------------------------------

/** The default catalogue every car is checked against, in tile order. */
export const ACCESSORY_CATALOGUE: { type: AccessoryType; icon: string }[] = [
  { type: 'smart_key', icon: 'remote' },
  { type: 'physical_key', icon: 'key' },
  { type: 'nfc_card', icon: 'card' },
  { type: 'charger', icon: 'plug' },
  { type: 'charging_cable', icon: 'cable' },
  { type: 'floor_mats', icon: 'mats' },
  { type: 'owners_manual', icon: 'book' },
  { type: 'warning_triangle', icon: 'triangle' },
]

type AccessoryRow = Database['public']['Tables']['accessories']['Row']

export function useSetQuantity(vehicleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id?: string; type: AccessoryType; name: string; quantity: number }) => {
      const q = Math.max(0, Math.min(99, p.quantity))
      const { error } = p.id
        ? await supabase.from('accessories').update({ quantity: q }).eq('id', p.id)
        : await supabase.from('accessories').insert({ vehicle_id: vehicleId, item_type: p.type, item_name: p.name, quantity: q })
      if (error) throw error
    },
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: ['accessories', vehicleId] })
      const prev = qc.getQueryData<AccessoryRow[]>(['accessories', vehicleId])
      const q = Math.max(0, Math.min(99, p.quantity))
      const status = q > 0 ? 'present' as const : 'missing' as const
      qc.setQueryData<AccessoryRow[]>(['accessories', vehicleId], (old = []) => p.id
        ? old.map((a) => (a.id === p.id ? { ...a, quantity: q, status } : a))
        : [...old, { id: `tmp-${p.type}-${p.name}`, vehicle_id: vehicleId, company_id: '', item_type: p.type, item_name: p.name, quantity: q, status, notes: null, created_at: new Date().toISOString(), updated_at: '' }])
      return { prev }
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(['accessories', vehicleId], ctx.prev) },
    onSettled: () => refreshCar(qc, vehicleId),
  })
}

// --- Photos -------------------------------------------------------------------

export function useSetCover(vehicleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (imageId: string) => {
      const { error } = await supabase.rpc('set_cover_image', { p_image_id: imageId })
      if (error) throw error
    },
    onSettled: () => refreshCar(qc, vehicleId),
  })
}

export function useReorderPhotos(vehicleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reorder_images', { p_vehicle_id: vehicleId, p_ids: ids })
      if (error) throw error
    },
    onSettled: () => refreshCar(qc, vehicleId),
  })
}

// --- Realtime -----------------------------------------------------------------

const TABLES = ['vehicles', 'vehicle_specs', 'vehicle_images', 'accessories', 'expenses', 'vehicle_events', 'documents', 'stages',
  'customers', 'vehicle_owners', 'warranties', 'service_visits', 'part_requests', 'offers', 'message_log'] as const

/**
 * One subscription for the whole app: any change to the company's cars (on this
 * device or another) refreshes what shows it. RLS limits it to the company.
 */
export function useRealtimeSync() {
  const qc = useQueryClient()
  useEffect(() => {
    let timer: number | undefined
    const pending = new Set<string>()
    let stages = false
    const flush = () => {
      for (const id of pending) refreshCar(qc, id)
      if (!pending.size) refreshCar(qc)
      if (stages) qc.invalidateQueries({ queryKey: ['stages'] })
      pending.clear()
      stages = false
    }
    const ch = supabase.channel('company-changes')
    for (const table of TABLES) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, (msg) => {
        const row = (msg.new && Object.keys(msg.new).length ? msg.new : msg.old) as { id?: string; vehicle_id?: string }
        if (table === 'stages') stages = true
        else pending.add(table === 'vehicles' ? row.id ?? '' : row.vehicle_id ?? '')
        pending.delete('')
        window.clearTimeout(timer)
        timer = window.setTimeout(flush, 150)
      })
    }
    ch.subscribe()
    return () => { window.clearTimeout(timer); supabase.removeChannel(ch) }
  }, [qc])
}
