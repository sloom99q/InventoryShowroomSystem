// Documents, images, accessories, expenses, timeline and audit for one vehicle.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { objectPath, uploadImage, uploadObject, validateFile } from '@/lib/files'
import { supabase } from '@/lib/supabase'
import type { AccessoryType, DocumentType, ExpenseCategory, ImageType, ItemStatus } from '@/lib/types'

function useInvalidate(vehicleId: string) {
  const qc = useQueryClient()
  return (...keys: string[]) => {
    for (const k of keys) qc.invalidateQueries({ queryKey: [k, vehicleId] })
    qc.invalidateQueries({ queryKey: ['vehicle', vehicleId] })
    qc.invalidateQueries({ queryKey: ['vehicles'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['audit', vehicleId] })
  }
}

// --- Documents -----------------------------------------------------------------

export function useDocuments(vehicleId: string) {
  return useQuery({
    queryKey: ['documents', vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .is('deleted_at', null)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useUploadDocument(companyId: string, vehicleId: string) {
  const invalidate = useInvalidate(vehicleId)
  return useMutation({
    mutationFn: async (p: { file: File; type: DocumentType; notes?: string; extractedText?: string; replaces?: string }) => {
      const s = await validateFile(p.file, 'pdf_or_image')
      const path = objectPath(companyId, vehicleId, 'documents', s.ext)
      await uploadObject(path, p.file, s.mime)
      if (p.replaces) {
        const { data, error } = await supabase.rpc('add_document_version', {
          p_previous_id: p.replaces,
          p_storage_path: path,
          p_original_filename: p.file.name,
          p_mime_type: s.mime,
          p_file_size: p.file.size,
          p_notes: p.notes,
        })
        if (error) throw error
        return data
      }
      const { data, error } = await supabase
        .from('documents')
        .insert({
          vehicle_id: vehicleId,
          document_type: p.type,
          original_filename: p.file.name,
          storage_path: path,
          mime_type: s.mime,
          file_size: p.file.size,
          notes: p.notes || null,
          extracted_text: p.extractedText || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => invalidate('documents'),
  })
}

export function useUpdateDocument(vehicleId: string) {
  const invalidate = useInvalidate(vehicleId)
  return useMutation({
    mutationFn: async (p: { id: string; patch: { document_type?: DocumentType; notes?: string | null; verification_status?: 'verified' | 'unverified'; deleted_at?: string } }) => {
      const { error } = await supabase.from('documents').update(p.patch).eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => invalidate('documents'),
  })
}

// --- Images --------------------------------------------------------------------

export function useImages(vehicleId: string) {
  return useQuery({
    queryKey: ['images', vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_images')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .is('deleted_at', null)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useUploadImages(companyId: string, vehicleId: string) {
  const invalidate = useInvalidate(vehicleId)
  return useMutation({
    mutationFn: async (p: { files: File[]; type: ImageType; onProgress?: (done: number) => void }) => {
      let done = 0
      for (const file of p.files) {
        const up = await uploadImage(companyId, vehicleId, p.type === 'information_card' ? 'card' : 'photos', file)
        if (p.type === 'information_card') {
          const { error } = await supabase.rpc('set_information_card', {
            p_vehicle_id: vehicleId,
            p_storage_path: up.storage_path,
            p_thumbnail_path: up.thumbnail_path ?? undefined,
            p_original_filename: up.original_filename,
            p_mime_type: up.mime_type,
            p_file_size: up.file_size,
          })
          if (error) throw error
        } else {
          const { error } = await supabase.from('vehicle_images').insert({ vehicle_id: vehicleId, image_type: p.type, ...up })
          if (error) throw error
        }
        p.onProgress?.(++done)
      }
    },
    onSuccess: () => invalidate('images'),
  })
}

export function useRemoveImage(vehicleId: string) {
  const invalidate = useInvalidate(vehicleId)
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehicle_images').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('images'),
  })
}

// --- Accessories ---------------------------------------------------------------

export function useAccessories(vehicleId: string) {
  return useQuery({
    queryKey: ['accessories', vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase.from('accessories').select('*').eq('vehicle_id', vehicleId).order('created_at')
      if (error) throw error
      return data
    },
  })
}

export type AccessoryDraft = { item_type: AccessoryType; item_name: string; quantity: number; status: ItemStatus; notes?: string | null }

export function useAddAccessories(vehicleId: string) {
  const invalidate = useInvalidate(vehicleId)
  return useMutation({
    mutationFn: async (items: AccessoryDraft[]) => {
      if (!items.length) return
      const { error } = await supabase.from('accessories').insert(items.map((i) => ({ ...i, vehicle_id: vehicleId })))
      if (error) throw error
    },
    onSuccess: () => invalidate('accessories'),
  })
}

export function useUpdateAccessory(vehicleId: string) {
  const invalidate = useInvalidate(vehicleId)
  return useMutation({
    mutationFn: async (p: { id: string; patch: Partial<AccessoryDraft> }) => {
      const { error } = await supabase.from('accessories').update(p.patch).eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => invalidate('accessories'),
  })
}

export function useDeleteAccessory(vehicleId: string) {
  const invalidate = useInvalidate(vehicleId)
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accessories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('accessories'),
  })
}

// --- Expenses ------------------------------------------------------------------

export function useExpenses(vehicleId: string) {
  return useQuery({
    queryKey: ['expenses', vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export type ExpenseDraft = {
  title: string
  category: ExpenseCategory
  amount: string
  expense_date: string
  supplier_name?: string | null
  description?: string | null
  receipt?: File | null
}

export function useSaveExpense(companyId: string, vehicleId: string) {
  const invalidate = useInvalidate(vehicleId)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id?: string; draft: ExpenseDraft }) => {
      const { receipt, ...fields } = p.draft
      let receipt_storage_path: string | undefined
      if (receipt) {
        const s = await validateFile(receipt, 'pdf_or_image')
        receipt_storage_path = objectPath(companyId, vehicleId, 'receipts', s.ext)
        await uploadObject(receipt_storage_path, receipt, s.mime)
      }
      // amount is sent as a string so Postgres parses it as an exact numeric.
      const row = { ...fields, amount: fields.amount as unknown as number, ...(receipt_storage_path ? { receipt_storage_path } : {}) }
      const res = p.id
        ? await supabase.from('expenses').update(row).eq('id', p.id)
        : await supabase.from('expenses').insert({ ...row, vehicle_id: vehicleId })
      if (res.error) throw res.error
    },
    onSuccess: () => {
      invalidate('expenses')
      qc.invalidateQueries({ queryKey: ['all-expenses'] })
    },
  })
}

export function useDeleteExpense(vehicleId: string) {
  const invalidate = useInvalidate(vehicleId)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate('expenses')
      qc.invalidateQueries({ queryKey: ['all-expenses'] })
    },
  })
}

// --- Timeline & audit --------------------------------------------------------------

export function useEvents(vehicleId: string) {
  return useQuery({
    queryKey: ['events', vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_events')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('event_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useAddNote(vehicleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { description: string; event_at: string }) => {
      const { error } = await supabase.from('vehicle_events').insert({ vehicle_id: vehicleId, event_type: 'note', ...p })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', vehicleId] }),
  })
}

export function useAudit(vehicleId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['audit', vehicleId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data
    },
  })
}

/** id → display name for everyone in the company (for "who did it"). */
export function useStaffNames() {
  return useQuery({
    queryKey: ['staff-names'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return new Map(data.map((p) => [p.id, p.full_name || 'Staff member']))
    },
  })
}
