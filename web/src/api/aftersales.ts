// After-Sales data: customers and owners, warranty, service, parts, offers, messages.
// Technicians read through views without phone numbers or prices, and write through
// functions that check their role (see the After-Sales migration).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCompany } from '@/lib/auth'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

type T = Database['public']['Tables']
export type Customer = T['customers']['Row']
export type Warranty = T['warranties']['Row']
export type ServiceVisit = Omit<T['service_visits']['Row'], 'cost'> & { cost?: number | null }
export type PartRequest = Omit<T['part_requests']['Row'], 'cost'> & { cost?: number | null }
export type Offer = T['offers']['Row']
export type CatalogueItem = T['offer_catalogue']['Row']
export type NextService = Database['public']['Functions']['next_service']['Returns'][number]
export type Reminder = Database['public']['Functions']['aftersales_reminders']['Returns'][number]

export function useAftersalesRole() {
  const { profile } = useCompany()
  const r = profile.role
  return {
    manager: r === 'admin' || r === 'sales_manager',
    seesCustomers: r === 'admin' || r === 'sales_manager' || r === 'secretary',
    services: r === 'admin' || r === 'sales_manager' || r === 'technician',
    technician: r === 'technician',
    any: r === 'admin' || r === 'sales_manager' || r === 'secretary' || r === 'technician',
  }
}

const ok = <D,>({ data, error }: { data: D; error: unknown }): NonNullable<D> => { if (error) throw error; return data as NonNullable<D> }

/** Everything that shows a car's After-Sales: refresh after a change (here or on another device). */
export function refreshAftersales(qc: ReturnType<typeof useQueryClient>, vehicleId?: string) {
  qc.invalidateQueries({ queryKey: ['aftersales'] })
  if (vehicleId) qc.invalidateQueries({ queryKey: ['aftersales-car', vehicleId] })
}

// --- Home ---------------------------------------------------------------------------

export function useAftersalesHome() {
  const role = useAftersalesRole()
  return useQuery({
    queryKey: ['aftersales', 'home', role.seesCustomers, role.manager],
    queryFn: async () => {
      const reminders = ok(await supabase.rpc('aftersales_reminders')) as Reminder[]
      const cars = ok(await supabase.from('vehicle_overview')
        .select('id, chassis_number, brand, model, year, trim_level, status, sold_at, delivered_at, stage_name, stage_color, cover_thumbnail_path')
        .in('status', ['sold', 'delivered']).is('archived_at', null)
        .order('delivered_at', { ascending: false, nullsFirst: false }).order('sold_at', { ascending: false, nullsFirst: false }).limit(200))
      const ids = cars.map((c) => c.id!)
      const owners = ids.length ? ok(await supabase.from('owner_names').select('vehicle_id, full_name').in('vehicle_id', ids)) : []
      const phones = role.seesCustomers && ids.length
        ? ok(await supabase.from('vehicle_owners').select('vehicle_id, customers(full_name, phone, language)').is('to_date', null).in('vehicle_id', ids))
        : []
      const warranties = role.seesCustomers && ids.length ? ok(await supabase.from('warranties').select('vehicle_id').in('vehicle_id', ids)) : []
      const since = new Date(Date.now() - 8 * 7 * 86_400_000).toISOString()
      const parts = role.manager || role.seesCustomers
        ? ok(await supabase.from('part_requests').select('id, vehicle_id, status, cost').in('status', ['requested', 'ordered', 'arrived']))
        : ok(await supabase.from('part_requests_tech').select('id, vehicle_id, status').in('status', ['requested', 'ordered', 'arrived']))
      const offers = role.seesCustomers ? ok(await supabase.from('offers').select('id, price').eq('status', 'offered')) : []
      // Last 8 weeks, for the trend lines on the cards.
      const visitDates = (role.seesCustomers
        ? ok(await supabase.from('service_visits').select('visit_date').gte('visit_date', since.slice(0, 10)))
        : ok(await supabase.from('service_visits_tech').select('visit_date').gte('visit_date', since.slice(0, 10)))).map((r) => r.visit_date!)
      const partDates = (role.seesCustomers
        ? ok(await supabase.from('part_requests').select('requested_at').gte('requested_at', since))
        : ok(await supabase.from('part_requests_tech').select('requested_at').gte('requested_at', since))).map((r) => r.requested_at!)
      const offerDates = role.seesCustomers ? ok(await supabase.from('offers').select('offered_at').gte('offered_at', since)).map((r) => r.offered_at) : []
      const deliveryDates = cars.map((c) => c.delivered_at ?? c.sold_at).filter((d): d is string => !!d && d >= since)
      return {
        reminders, cars,
        owner: new Map(owners.map((o) => [o.vehicle_id!, o.full_name!])),
        contact: new Map((phones as unknown as { vehicle_id: string; customers: { full_name: string; phone: string | null; language: string } }[]).map((o) => [o.vehicle_id, o.customers])),
        hasWarranty: new Set(warranties.map((w) => w.vehicle_id)),
        parts, offers,
        trend: { visits: weekly(visitDates), parts: weekly(partDates), offers: weekly(offerDates), deliveries: weekly(deliveryDates) },
      }
    },
  })
}

/** Counts per week for the last 8 weeks (oldest first). */
export function weekly(dates: string[], now = Date.now()) {
  const out = Array<number>(8).fill(0)
  for (const d of dates) {
    const w = Math.floor((now - new Date(d).getTime()) / (7 * 86_400_000))
    if (w >= 0 && w < 8) out[7 - w]++
  }
  return out
}

// --- One customer's car ------------------------------------------------------------------

export function useAftersalesCar(vehicleId: string) {
  const role = useAftersalesRole()
  return useQuery({
    queryKey: ['aftersales-car', vehicleId, role.seesCustomers],
    queryFn: async () => {
      const next = (ok(await supabase.rpc('next_service', { p_vehicle_id: vehicleId })) as NextService[])[0] ?? null
      const ownerName = ok(await supabase.from('owner_names').select('full_name').eq('vehicle_id', vehicleId)).at(0)?.full_name ?? null
      if (!role.seesCustomers) {
        const visits = ok(await supabase.from('service_visits_tech').select('*').eq('vehicle_id', vehicleId).order('visit_date', { ascending: false })) as ServiceVisit[]
        const parts = ok(await supabase.from('part_requests_tech').select('*').eq('vehicle_id', vehicleId).order('requested_at', { ascending: false })) as PartRequest[]
        return { next, ownerName, customer: null, ownerId: null, warranties: [] as Warranty[], visits, parts, offers: [] as Offer[], messages: [] }
      }
      const owner: { id: string; from_date: string; sold_by: string | null; customers: unknown } | null = ok(await supabase.from('vehicle_owners').select('id, from_date, sold_by, customers(*)').eq('vehicle_id', vehicleId).is('to_date', null).maybeSingle()) ?? null
      const [warranties, visits, parts, offers, messages] = await Promise.all([
        supabase.from('warranties').select('*').eq('vehicle_id', vehicleId).order('kind'),
        supabase.from('service_visits').select('*').eq('vehicle_id', vehicleId).order('visit_date', { ascending: false }),
        supabase.from('part_requests').select('*').eq('vehicle_id', vehicleId).order('requested_at', { ascending: false }),
        supabase.from('offers').select('*').eq('vehicle_id', vehicleId).order('offered_at'),
        supabase.from('message_log').select('*').eq('vehicle_id', vehicleId).order('opened_at', { ascending: false }),
      ])
      return {
        next, ownerName,
        customer: (owner?.customers ?? null) as Customer | null,
        ownerId: owner?.id ?? null,
        soldBy: owner?.sold_by ?? null,
        warranties: ok(warranties) as Warranty[], visits: ok(visits) as ServiceVisit[], parts: ok(parts) as PartRequest[],
        offers: ok(offers) as Offer[], messages: ok(messages),
      }
    },
  })
}

function useCarMutation<P>(vehicleId: string, fn: (p: P) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => refreshAftersales(qc, vehicleId) })
}

/** New customer (or an existing one by id) becomes the car's owner; warranty fills itself. */
export function useSetOwner(vehicleId: string) {
  return useCarMutation(vehicleId, async (p: { customerId?: string; customer?: Partial<Customer> }) => {
    let id = p.customerId
    if (!id) id = ok(await supabase.from('customers').insert(p.customer as T['customers']['Insert']).select('id').single()).id
    ok(await supabase.from('vehicle_owners').insert({ vehicle_id: vehicleId, customer_id: id! }))
  })
}

export function useFindCustomerByPhone(phone: string | null) {
  return useQuery({
    queryKey: ['aftersales', 'customer-phone', phone],
    enabled: !!phone,
    queryFn: async () => ok(await supabase.from('customers').select('id, full_name, phone, language').eq('phone', phone!).limit(1)).at(0) ?? null,
  })
}

export function useSaveCustomer(vehicleId: string) {
  return useCarMutation(vehicleId, async (p: { id: string; patch: T['customers']['Update'] }) => { ok(await supabase.from('customers').update(p.patch).eq('id', p.id)) })
}
export function useSaveWarranty(vehicleId: string) {
  return useCarMutation(vehicleId, async (p: { id?: string; patch: Partial<Warranty> }) => {
    if (p.id) ok(await supabase.from('warranties').update(p.patch as never).eq('id', p.id))
    else ok(await supabase.from('warranties').insert({ vehicle_id: vehicleId, ...p.patch } as T['warranties']['Insert']))
  })
}
export function useLogService(vehicleId: string) {
  return useCarMutation(vehicleId, async (p: { date: string; km: number | null; title: string; work: string; cost: number | null; notes?: string }) => {
    ok(await supabase.rpc('log_service_visit', { p_vehicle_id: vehicleId, p_visit_date: p.date, p_odometer_km: p.km as number, p_title: p.title, p_work_done: p.work || undefined, p_cost: p.cost ?? undefined, p_notes: p.notes || undefined }))
  })
}
export function useRequestPart(vehicleId: string) {
  return useCarMutation(vehicleId, async (p: { name: string; qty: number; partNo?: string; supplier?: string; cost?: number | null }) => {
    ok(await supabase.rpc('request_part', { p_vehicle_id: vehicleId, p_name: p.name, p_qty: p.qty, p_part_no: p.partNo || undefined, p_supplier: p.supplier || undefined, p_cost: p.cost ?? undefined }))
  })
}
export function useSetPartStatus(vehicleId: string) {
  return useCarMutation(vehicleId, async (p: { id: string; status: string }) => { ok(await supabase.rpc('set_part_status', { p_part_id: p.id, p_status: p.status })) })
}
export function useOffers(vehicleId: string) {
  const add = useCarMutation(vehicleId, async (c: CatalogueItem) => {
    ok(await supabase.from('offers').insert({ vehicle_id: vehicleId, catalogue_id: c.id, name: c.name, icon: c.icon, price: c.default_price }))
  })
  const status = useCarMutation(vehicleId, async (p: { id: string; status: 'offered' | 'accepted' | 'declined' }) => {
    ok(await supabase.from('offers').update({ status: p.status, decided_at: p.status === 'offered' ? null : new Date().toISOString() }).eq('id', p.id))
  })
  const price = useCarMutation(vehicleId, async (p: { id: string; price: number | null }) => { ok(await supabase.from('offers').update({ price: p.price }).eq('id', p.id)) })
  return { add, status, price }
}
export function useLogMessage(vehicleId: string) {
  return useCarMutation(vehicleId, async (p: { customerId: string | null; kind: string; text: string; phone: string }) => {
    ok(await supabase.from('message_log').insert({ vehicle_id: vehicleId, customer_id: p.customerId, kind: p.kind, text: p.text, phone: p.phone }))
  })
}

// --- Settings (warranty defaults, service plans, offer catalogue) -----------------------------

export function useAftersalesSettings() {
  return useQuery({
    queryKey: ['aftersales', 'settings'],
    queryFn: async () => ({
      warranty: ok(await supabase.from('warranty_defaults').select('*').order('brand', { nullsFirst: true }).order('kind')),
      plans: ok(await supabase.from('service_plans').select('*').order('brand', { nullsFirst: true })),
      catalogue: ok(await supabase.from('offer_catalogue').select('*').order('position')),
    }),
  })
}

export function useSaveSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { table: 'warranty_defaults' | 'service_plans' | 'offer_catalogue'; id?: string; row: Record<string, unknown>; remove?: boolean }) => {
      const q = supabase.from(p.table)
      if (p.remove) ok(await q.delete().eq('id', p.id!))
      else if (p.id) ok(await q.update(p.row as never).eq('id', p.id))
      else ok(await q.insert(p.row as never))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['aftersales'] }),
  })
}

export function useCatalogue() {
  return useQuery({
    queryKey: ['aftersales', 'catalogue'],
    queryFn: async () => ok(await supabase.from('offer_catalogue').select('*').order('position')),
  })
}

/** Customer search (name or phone) for the top search box. */
export async function searchCustomers(term: string) {
  const safe = term.replace(/[,()%*"\\]/g, ' ').trim()
  const digits = safe.replace(/\D/g, '')
  const ors = [`full_name.ilike.%${safe}%`]
  if (digits.length >= 4) ors.push(`phone.ilike.%${digits.slice(-9)}%`)
  const custs = ok(await supabase.from('customers').select('id, full_name, phone').or(ors.join(',')).limit(6))
  if (!custs.length) return []
  const owners = ok(await supabase.from('vehicle_owners').select('vehicle_id, customer_id, vehicles(chassis_number, brand, model, year)').is('to_date', null).in('customer_id', custs.map((c) => c.id)))
  return owners.map((o) => ({ ...(o as unknown as { vehicle_id: string; customer_id: string; vehicles: { chassis_number: string; brand: string | null; model: string | null; year: number | null } }), customer: custs.find((c) => c.id === o.customer_id)! }))
}
