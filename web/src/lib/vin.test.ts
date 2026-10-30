import { describe, expect, it } from 'vitest'
import { checkChassis, findCandidates, groupChassis, normalizeChassis } from './vin'
import { parseAmount, sumMoney } from './format'

describe('chassis rules', () => {
  it('normalises like the database', () => {
    expect(normalizeChassis(' lvv-db21b9 pd012345 ')).toBe('LVVDB21B9PD012345')
  })
  it('accepts a valid North-American VIN', () => {
    const c = checkChassis('1GNSKCKD7PR123456')
    expect(c.kind).toBe('vin17')
    expect(c.checkDigitValid).toBe(true)
    expect(c.errors).toEqual([])
  })
  it('warns but does not reject a non-NA check digit', () => {
    const c = checkChassis('W1NYC7HJ2RX512345')
    expect(c.errors).toEqual([])
    expect(c.checkDigitValid).toBe(false)
    expect(c.warnings.length).toBe(1)
  })
  it('suggests, never applies, I/O/Q fixes', () => {
    const c = checkChassis('1GNSKCKD7PRI23456')
    expect(c.normalized).toBe('1GNSKCKD7PRI23456')
    expect(c.suggestion).toBe('1GNSKCKD7PR123456')
  })
  it('allows non-standard frame numbers', () => {
    const c = checkChassis('URJ202-4012345')
    expect(c.kind).toBe('nonstandard')
    expect(c.errors).toEqual([])
  })
  it('rejects junk', () => {
    expect(checkChassis('AB1').errors.length).toBe(1)
  })
  it('groups VINs for display', () => {
    expect(groupChassis('LVVDB21B9PD012345')).toEqual(['LVV', 'DB21B9', 'PD012345'])
  })
})

describe('candidate detection', () => {
  it('finds a labelled VIN printed in groups', () => {
    const [c] = findCandidates(['Some header\nVIN: 1FT8W 3BTXSE B08612\nColour: white'])
    expect(c.value).toBe('1FT8W3BTXSEB08612')
    expect(c.labelAnchored).toBe(true)
  })
  it('finds a non-standard frame number next to its label', () => {
    const c = findCandidates(['Chassis No. URJ202-4012345'])
    expect(c.map((x) => x.value)).toContain('URJ2024012345')
  })
  it('ignores ordinary words that happen to join to 17 characters', () => {
    const c = findCandidates(['Issue Date 20261014\nVIN 1GNSKCKD7PR123456'])
    expect(c.map((x) => x.value)).toEqual(['1GNSKCKD7PR123456'])
  })
  it('reports the page', () => {
    const [c] = findCandidates(['cover letter', 'Chassis number 5YJ3E1EB8NF105280'])
    expect(c.page).toBe(2)
  })
})

describe('money', () => {
  it('sums without float drift', () => {
    expect(sumMoney([0.1, 0.2, '1200.10'])).toBe(1200.4)
  })
  it('parses typed amounts', () => {
    expect(parseAmount('1,200.5')).toBe('1200.50')
    expect(parseAmount('AED 850')).toBe('850.00')
    expect(parseAmount('-5')).toBeNull()
    expect(parseAmount('1.234')).toBeNull()
  })
})
