import { describe, it, expect } from 'vitest'
import { ldJson, ldScript } from './jsonLd'

describe('ldJson', () => {
  it('escapes every "<" so a script block cannot be closed early', () => {
    const out = ldJson({ name: '</script><img src=x onerror=alert(1)>' })
    expect(out).not.toContain('</script')
    expect(out).not.toContain('<')
    expect(out).toContain('\\u003c')
  })

  it('escapes "<" wherever it appears, not just the first one', () => {
    const out = ldJson({ a: '<one>', b: '<two>', c: ['<three>'] })
    expect(out.match(/\\u003c/g)).toHaveLength(3)
    expect(out).not.toContain('<')
  })

  // The payload that motivated this: a set slug comes straight off the URL.
  it('neutralises a hostile route param used as a schema name', () => {
    const slug = decodeURIComponent('%3C/script%3E%3Cscript%3Ealert(1)%3C/script%3E')
    const out = ldJson({ '@type': 'CollectionPage', name: slug })
    expect(out).not.toContain('</script')
  })

  it('still produces JSON that parses back to the original value', () => {
    const obj = { name: '</script>', nested: { list: ['<a>', '<b>'] } }
    expect(JSON.parse(ldJson(obj))).toEqual(obj)
  })

  it('leaves ordinary card names untouched', () => {
    expect(ldJson({ name: 'Maxx "C"' })).toBe('{"name":"Maxx \\"C\\""}')
  })
})

describe('ldScript', () => {
  it('builds a useHead entry with the escaped body', () => {
    const entry = ldScript({ name: '<x>' })
    expect(entry.type).toBe('application/ld+json')
    expect(entry.innerHTML).not.toContain('<')
  })
})
