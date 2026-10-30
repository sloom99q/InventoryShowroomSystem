import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import arCommon from './ar/common'
import enCommon from './en/common'
import arVehicle from './ar/vehicle'
import enVehicle from './en/vehicle'
import arAdd from './ar/add'
import enAdd from './en/add'
import arImporter from './ar/importer'
import enImporter from './en/importer'
import arPages from './ar/pages'
import enPages from './en/pages'
import arAuth from './ar/auth'
import enAuth from './en/auth'
import arDocimport from './ar/docimport'
import enDocimport from './en/docimport'
import arSettings from './ar/settings'
import enSettings from './en/settings'

// Each screen group has its own namespace file in en/ and ar/; register it here.
export const resources = {
  en: { common: enCommon, vehicle: enVehicle, add: enAdd, importer: enImporter, pages: enPages, auth: enAuth, settings: enSettings, docimport: enDocimport },
  ar: { common: arCommon, vehicle: arVehicle, add: arAdd, importer: arImporter, pages: arPages, auth: arAuth, settings: arSettings, docimport: arDocimport },
} as const

export type Locale = 'en' | 'ar'
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
]

function initial(): Locale {
  try {
    const s = localStorage.getItem('locale')
    if (s === 'en' || s === 'ar') return s
  } catch { /* storage blocked */ }
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('ar') ? 'ar' : 'en'
}

i18n.use(initReactI18next).init({
  resources,
  lng: initial(),
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
})

function applyDir(lng: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lng
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr'
}
applyDir(i18n.language)
i18n.on('languageChanged', (lng) => {
  applyDir(lng)
  try { localStorage.setItem('locale', lng) } catch { /* ignore */ }
})

/** BCP-47 tag for Intl formatting. Western digits in both languages, as UAE business documents use. */
export function intlLocale(): string {
  return i18n.language === 'ar' ? 'ar-AE-u-nu-latn' : 'en-AE'
}

export default i18n
