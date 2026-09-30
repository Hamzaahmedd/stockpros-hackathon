import { escapeHtml } from '../html'

describe('escapeHtml', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapes %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected)
  })

  it('escapes "&" first so its own output is not double-escaped', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;') // already-escaped text is data, not markup
  })

  it('neutralises the classic injection payloads', () => {
    const out = escapeHtml(
      '<script>alert(1)</script><img src=x onerror="alert(1)">',
    )
    expect(out).not.toMatch(/[<>"]/)
    expect(out).toContain('&lt;script&gt;')
  })

  it('can be placed safely inside a double- or single-quoted attribute', () => {
    const value = escapeHtml('x" onmouseover="alert(1) y\' onfocus=\'z')
    expect(value).not.toMatch(/["']/)
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('Hello, Alex Morgan — Rs 5,999')).toBe(
      'Hello, Alex Morgan — Rs 5,999',
    )
    expect(escapeHtml('')).toBe('')
  })

  it('escapes every occurrence, not just the first', () => {
    expect(escapeHtml('<<>>&&""\'\'')).toBe(
      '&lt;&lt;&gt;&gt;&amp;&amp;&quot;&quot;&#39;&#39;',
    )
  })
})
