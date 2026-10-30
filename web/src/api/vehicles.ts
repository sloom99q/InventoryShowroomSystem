import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { VehicleInsert, VehicleOverview, VehicleStatus } from '@/lib/types'
import { normalizeChassis } from '@/lib/vin'

export type VehicleFilters = {
  q: string
  status: VehicleStatus | 'all' | 'available' | 'closed'
  archived: boolean
  unverified?: boolean
  from?: string
  to?: string
  sort: { id: string; desc: boolean }
  page: number
  pageSize: number
}

const SORTABLE = new Set(['created_at', 'arrival_at', 'chassis_normalized', 'brand', 'year', 'expense_total', 'status', 'sold_at'])

export function useVehicles(f: VehicleFilters) {
  return useQuery({
    queryKey: ['vehicles', f],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from('vehicle_overview').select('*', { count: 'exact' })
      q = f.archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
      if (f.status === 'available') q = q.in('status', ['in_stock', 'reserved'])
      else if (f.status === 'closed') q = q.in('status', ['sold', 'delivered'])
      else if (f.status !== 'all') q = q.eq('status', f.status)
      const term = f.q.trim()
      if (term) {
        const chassis = normalizeChassis(term)
        const safe = term.replace(/[,()%*"\\]/g, ' ').trim()
        const ors = [`brand.ilike.%${safe}%`, `model.ilike.%${safe}%`]
        if (chassis) ors.unshift(`chassis_normalized.ilike.%${chassis}%`)
        q = q.or(ors.join(','))
      }
      if (f.unverified) q = q.eq('chassis_verified', false)
      if (f.from) q = q.gte('arrival_at', f.from)
      if (f.to) q = q.lte('arrival_at', f.to)
      const col = SORTABLE.has(f.sort.id) ? f.sort.id : 'created_at'
      q = q.order(col, { ascending: !f.sort.desc, nullsFirst: false }).order('id')
      const start = f.page * f.pageSize
      const { data, error, count } = await q.range(start, start + f.pageSize - 1)
      if (error) throw error
      return { rows: data as VehicleOverview[], count: count ?? 0 }
    },
  })
}

/** Quick lookup for the global search box. Chassis matches rank first. */
export function useChassisSearch(term: string) {
  const chassis = normalizeChassis(term)
  return useQuery({
    queryKey: ['chassis-search', term],
    enabled: term.trim().length >= 2,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const safe = term.replace(/[,()%*"\\]/g, ' ').trim()
      const ors = [`brand.ilike.%${safe}%`, `model.ilike.%${safe}%`]
      if (chassis.length >= 2) ors.unshift(`chassis_normalized.ilike.%${chassis}%`)
      const { data, error } = await supabase
        .from('vehicle_overview')
        .select('id, chassis_number, chassis_normalized, brand, model, year, status, archived_at, cover_thumbnail_path')
        .or(ors.join(','))
        .limit(8)
      if (error) throw error
      return (data ?? []).sort((a, b) => {
        const ra = a.chassis_normalized?.startsWith(chassis) ? 0 : a.chassis_normalized?.includes(chassis) ? 1 : 2
        const rb = b.chassis_normalized?.startsWith(chassis) ? 0 : b.chassis_normalized?.includes(chassis) ? 1 : 2
        return ra - rb
      })
    },
  })
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: ['vehicle', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('vehicle_overview').select('*').eq('id', id!).single()
      if (error) throw error
      return data as VehicleOverview
    },
  })
}

/** Returns the existing vehicle (if any) with this chassis, ignoring formatting. */
export async function findByChassis(raw: string) {
  const n = normalizeChassis(raw)
  if (!n) return null
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, chassis_number, brand, model, archived_at')
    .eq('chassis_normalized', n)
    .maybeSingle()
  if (error) throw error
  return data
}

function invalidateVehicle(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ['vehicles'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  qc.invalidateQueries({ queryKey: ['chassis-search'] })
  if (id) {
    qc.invalidateQueries({ queryKey: ['vehicle', id] })
    qc.invalidateQueries({ queryKey: ['events', id] })
    qc.invalidateQueries({ queryKey: ['audit', id] })
  }
}

export function useCreateVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: VehicleInsert) => {
      const { data, error } = await supabase.from('vehicles').insert(v).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateVehicle(qc),
  })
}

export function useUpdateVehicle(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<VehicleInsert>) => {
      const { data, error } = await supabase.from('vehicles').update(patch).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateVehicle(qc, id),
  })
}

export function useChangeStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { status: VehicleStatus; at: string | null; note: string }) => {
      const { error } = await supabase.rpc('change_vehicle_status', {
        p_vehicle_id: id,
        p_status: p.status,
        p_event_at: p.at ?? undefined,
        p_note: p.note || undefined,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateVehicle(qc, id),
  })
}

export function useArchiveVehicle(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { archive: boolean; note?: string }) => {
      const { error } = await supabase.rpc('archive_vehicle', { p_vehicle_id: id, p_archive: p.archive, p_note: p.note })
      if (error) throw error
    },
    onSuccess: () => invalidateVehicle(qc, id),
  })
}

export type DashboardStats = {
  total: number
  in_stock: number
  in_garage: number
  reserved: number
  sold: number
  unverified_chassis: number
  unverified_documents: number
  expense_total: number
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const [stats, added, sold, events, expenses] = await Promise.all([
        supabase.rpc('dashboard_stats'),
        supabase.from('vehicle_overview').select('*').is('archived_at', null).order('created_at', { ascending: false }).limit(6),
        supabase.from('vehicle_overview').select('*').not('sold_at', 'is', null).order('sold_at', { ascending: false }).limit(5),
        supabase.from('vehicle_events').select('*, vehicles(chassis_number, brand, model)').order('created_at', { ascending: false }).limit(8),
        supabase.from('expenses').select('*, vehicles(chassis_number, brand, model)').is('deleted_at', null).order('created_at', { ascending: false }).limit(6),
      ])
      for (const r of [stats, added, sold, events, expenses]) if (r.error) throw r.error
      return {
        stats: stats.data as unknown as DashboardStats,
        added: added.data as VehicleOverview[],
        sold: sold.data as VehicleOverview[],
        events: events.data!,
        expenses: expenses.data!,
      }
    },
  })
}
