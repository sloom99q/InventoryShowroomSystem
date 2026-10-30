// Store an exported document with the vehicle. Previous versions are kept:
// the spec sheet becomes the new information card (old cards stay as history),
// the brochure becomes a new version of the vehicle's "Brochure" document.
import { objectPath, uploadObject } from '@/lib/files'
import { supabase } from '@/lib/supabase'
import type { DocKind } from './docdata'

export async function saveExport(p: { kind: DocKind; companyId: string; vehicleId: string; pdf: Uint8Array; filename: string; firstPage: string }) {
  const path = objectPath(p.companyId, p.vehicleId, p.kind === 'specsheet' ? 'card' : 'documents', 'pdf')
  await uploadObject(path, new Blob([p.pdf.slice()], { type: 'application/pdf' }), 'application/pdf')

  if (p.kind === 'specsheet') {
    // A picture of page 1 is the card's thumbnail; the PDF is the original.
    const png = await (await fetch(p.firstPage)).blob()
    const thumb = path.replace(/\.pdf$/, '.thumb.png')
    await uploadObject(thumb, png, 'image/png')
    const { error } = await supabase.rpc('set_information_card', {
      p_vehicle_id: p.vehicleId, p_storage_path: path, p_thumbnail_path: thumb,
      p_original_filename: p.filename, p_mime_type: 'application/pdf', p_file_size: p.pdf.length,
    })
    if (error) throw error
  } else {
    const { data: current, error: qErr } = await supabase.from('documents').select('id')
      .eq('vehicle_id', p.vehicleId).eq('document_type', 'brochure').is('superseded_at', null).is('deleted_at', null)
      .order('uploaded_at', { ascending: false }).limit(1)
    if (qErr) throw qErr
    const res = current?.[0]
      ? await supabase.rpc('add_document_version', {
          p_previous_id: current[0].id, p_storage_path: path, p_original_filename: p.filename, p_mime_type: 'application/pdf', p_file_size: p.pdf.length,
        })
      : await supabase.from('documents').insert({
          vehicle_id: p.vehicleId, document_type: 'brochure', original_filename: p.filename, storage_path: path,
          mime_type: 'application/pdf', file_size: p.pdf.length, verification_status: 'verified',
        })
    if (res.error) throw res.error
  }
  await supabase.from('vehicle_events').insert({
    vehicle_id: p.vehicleId, event_type: 'document_generated',
    description: p.kind === 'specsheet' ? 'Spec sheet exported' : 'Brochure exported',
  })
}
