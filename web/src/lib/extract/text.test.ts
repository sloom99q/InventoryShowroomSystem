// "Paste specs": pasted text goes through the extractor and lands on the fixed fields.
import { describe, expect, it } from 'vitest'
import { matchField, matchList } from '@/lib/fields'
import { placeFacts } from '@/pages/import/session'
import { mergeFacts } from './index'
import { extractText } from './text'

const place = (text: string) =>
  placeFacts(mergeFacts([{ fileKey: 'paste', facts: extractText(text, 'paste') }]), matchField, matchList, new Set(['brand', 'model', 'year', 'trim', 'listing_price']))

describe('paste specs', () => {
  it('maps "Label: value" lines, synonyms and units to fields', () => {
    const p = place(['Top speed: 200 km/h', 'Total output: 360 kW / 490 HP', 'Seats: 5', '0-100 km/h: 4.5 s', 'Warranty: 5 years'].join('\n'))
    expect(p.fields.get('top_speed')?.[0].en).toBe('200 km/h')
    expect(p.fields.get('total_output')?.[0].en).toMatch(/^360 kW \/ 490 HP/)
    expect(p.fields.get('seating')?.[0].en).toBe('5')
    expect(p.fields.get('acceleration')?.[0].en).toMatch(/^4\.5 s/)
    expect(p.other.map((o) => o.label)).toEqual(['Warranty'])
  })

  it('reads a table pasted from Excel/Word: label, value, Arabic label', () => {
    const p = place(['Engine\t1.5L turbo range extender\tالمحرك', 'Battery\t43 kWh\tالبطارية', 'Range\t1,200 km\tالمدى الإجمالي'].join('\n'))
    expect(p.fields.get('engine')?.[0].en).toBe('1.5L turbo range extender')
    expect(p.fields.get('battery')?.[0].en).toBe('43 kWh')
    expect(p.fields.get('range')?.[0].en).toBe('1,200 km')
  })

  it('puts bullets under their list from the heading', () => {
    const p = place(['SMART DRIVING', '• Adaptive Cruise Control', '• Lane Keeping Assist', 'INTERIOR SPECS', '• Panoramic roof'].join('\n'))
    expect(p.lists.get('smart_features')?.map((i) => i.en)).toEqual(['Adaptive Cruise Control', 'Lane Keeping Assist'])
    expect(p.lists.get('interior_features')?.map((i) => i.en)).toEqual(['Panoramic roof'])
  })

  it('takes Arabic labels too', () => {
    const p = place('السرعة القصوى: 200 كم/ساعة')
    const c = p.fields.get('top_speed')?.[0]
    expect(c?.en || c?.ar).toBeTruthy()
  })

  it('ignores empty input', () => {
    const p = place('  \n\n')
    expect(p.fields.size + p.lists.size + p.other.length).toBe(0)
  })
})
