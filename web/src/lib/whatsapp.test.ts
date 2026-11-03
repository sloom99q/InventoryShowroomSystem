import { describe, expect, it } from 'vitest'
import { formatPhone, messageText, normalizePhone, waLink } from './whatsapp'

describe('WhatsApp click-to-chat', () => {
  it('understands UAE phone numbers as people type them', () => {
    for (const raw of ['050 555 0142', '0505550142', '+971 50 555 0142', '00971505550142', '971505550142', '50-555-0142'])
      expect(normalizePhone(raw), raw).toBe('+971505550142')
    expect(normalizePhone('04 123 4567')).toBe('+97141234567')
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123')
    for (const bad of ['', 'abc', '12345', '+0123']) expect(normalizePhone(bad), bad).toBeNull()
  })
  it('formats for display', () => expect(formatPhone('+971505550142')).toBe('+971 50 555 0142'))
  it('builds the wa.me link with the message encoded', () => {
    const url = waLink('+971505550142', 'مرحباً أحمد،\nline two & more')
    expect(url.startsWith('https://wa.me/971505550142?text=')).toBe(true)
    expect(decodeURIComponent(url.split('text=')[1])).toBe('مرحباً أحمد،\nline two & more')
  })
  it('writes the reminder in the customer\'s language', () => {
    const c = { firstName: 'Ahmed', car: 'VOYAH FREE', chassis6: '012345', company: 'Sinolink Motors', days: -12, part: 'Front brake pads' }
    expect(messageText('service', 'en', c)).toContain('is due for its service')
    expect(messageText('service', 'ar', { ...c, firstName: 'أحمد' })).toMatch(/^مرحباً أحمد،/)
    expect(messageText('part', 'en', c)).toContain('(Front brake pads) has arrived')
    expect(messageText('warranty', 'ar', { ...c, days: 41 })).toContain('بعد 41 يوماً')
    expect(messageText('service', 'en', c)).toContain('(…012345)')
  })
})
