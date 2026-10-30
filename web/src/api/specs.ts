import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useSpecs(vehicleId: string) {
  return useQuery({
    queryKey: ['specs', vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_specs')
        .select('*, documents(original_filename)')
        .eq('vehicle_id', vehicleId)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export type SpecPatch = { section?: string | null; label?: string; value?: string; unit?: string | null; verified?: boolean }

export function useSpecMutations(vehicleId: string) {
  const qc = useQueryClient()
  const done = () => {
    qc.invalidateQueries({ queryKey: ['specs', vehicleId] })
    qc.invalidateQueries({ queryKey: ['audit', vehicleId] })
  }
  return {
    update: useMutation({
      mutationFn: async (p: { id: string; patch: SpecPatch }) => {
        const { error } = await supabase.from('vehicle_specs').update(p.patch).eq('id', p.id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    add: useMutation({
      mutationFn: async (p: { section: string | null; label: string; value: string; unit: string | null }) => {
        const { data: last } = await supabase.from('vehicle_specs').select('sort_order').eq('vehicle_id', vehicleId).order('sort_order', { ascending: false }).limit(1)
        const { error } = await supabase.from('vehicle_specs').insert({ ...p, vehicle_id: vehicleId, verified: true, sort_order: (last?.[0]?.sort_order ?? 0) + 1 })
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('vehicle_specs').delete().eq('id', id)
        if (error) throw error
      },
      onSuccess: done,
    }),
  }
}
