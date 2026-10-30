import { Camera, ImagePlus, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/** Pick photos from files or, on a phone, straight from the camera. */
export function PhotoPicker({ files, onChange, multiple = true, label }: {
  files: File[]
  onChange: (f: File[]) => void
  multiple?: boolean
  label?: string
}) {
  const { t } = useTranslation('add')
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  const add = (list: FileList | null) => {
    if (!list) return
    onChange(multiple ? [...files, ...Array.from(list)] : Array.from(list).slice(0, 1))
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {urls.map((u, i) => (
          <div key={u} className="relative size-20 overflow-hidden rounded-md bg-raised">
            <img src={u} alt="" className="size-full object-cover" />
            <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute end-1 top-1 rounded-full bg-black/70 p-0.5 text-white" aria-label={t('photosPicker.remove')}>
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-[11.5px] text-ink-3 hover:border-accent/60 hover:text-ink">
          <ImagePlus className="size-5" />
          {label ?? t('photosPicker.add')}
          <input type="file" accept="image/*" multiple={multiple} className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </label>
        <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-[11.5px] text-ink-3 hover:border-accent/60 hover:text-ink sm:hidden">
          <Camera className="size-5" />
          {t('photosPicker.camera')}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </label>
      </div>
    </div>
  )
}
