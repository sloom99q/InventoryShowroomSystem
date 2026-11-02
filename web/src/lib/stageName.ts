import { useTranslation } from 'react-i18next'

/** A stage's name in the current language (Arabic when it has one). */
export function useStageName() {
  const { i18n } = useTranslation()
  return (s: { name_en?: string | null; name_ar?: string | null; stage_name?: string | null; stage_name_ar?: string | null } | undefined | null) => {
    if (!s) return ''
    const en = s.name_en ?? s.stage_name ?? ''
    const ar = s.name_ar ?? s.stage_name_ar
    return i18n.language === 'ar' && ar ? ar : en
  }
}
