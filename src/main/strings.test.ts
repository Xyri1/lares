import { describe, expect, it } from 'vitest'
import { en, L, resolveLocale, setLocale, zhCN } from './strings'

describe('locale resolution', () => {
  it('lets an explicit override win over the system locale', () => {
    expect(resolveLocale('en', 'zh-CN')).toBe('en')
    expect(resolveLocale('zh-CN', 'en-US')).toBe('zh-CN')
  })

  it('maps only Simplified Chinese variants to zh-CN under "system"', () => {
    expect(resolveLocale('system', 'zh')).toBe('zh-CN')
    expect(resolveLocale('system', 'zh-CN')).toBe('zh-CN')
    expect(resolveLocale('system', 'zh-Hans-CN')).toBe('zh-CN')
    expect(resolveLocale('system', 'zh-SG')).toBe('zh-CN')
  })

  it('falls back to English for Traditional Chinese and everything else under "system"', () => {
    expect(resolveLocale('system', 'zh-Hant-TW')).toBe('en')
    expect(resolveLocale('system', 'zh-TW')).toBe('en')
    expect(resolveLocale('system', 'zh-HK')).toBe('en')
    expect(resolveLocale('system', 'en-US')).toBe('en')
    expect(resolveLocale('system', 'fr')).toBe('en')
  })
})

describe('live locale binding', () => {
  it('flips L to the matching table and back', () => {
    setLocale('zh-CN')
    expect(L).toBe(zhCN)
    setLocale('en')
    expect(L).toBe(en)
  })
})
