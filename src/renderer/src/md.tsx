/* Release notes: a small Markdown reader (headings, paragraphs, two levels of "- " lists, **bold**,
   `code` and [links](https://…)). Builds React elements, never HTML strings. */
import type { JSX, ReactNode } from 'react'

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const k = `${key}-${n++}`
    if (m[1] != null) out.push(<strong key={k}>{m[1]}</strong>)
    else if (m[2] != null) out.push(<code key={k}>{m[2]}</code>)
    else {
      const url = m[4]
      out.push(
        <a
          key={k}
          href={url}
          onClick={(e) => {
            e.preventDefault()
            void window.api.open(url)
          }}
        >
          {m[3]}
        </a>
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

interface Item {
  text: string
  sub: string[]
}

export function Markdown({ text }: { text: string }): JSX.Element {
  const blocks: JSX.Element[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let para: string[] = []
  let list: Item[] | null = null
  const flushPara = (): void => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '), 'p' + blocks.length)}</p>)
    para = []
  }
  const flushList = (): void => {
    if (!list) return
    const k = blocks.length
    blocks.push(
      <ul key={k}>
        {list.map((it, i) => (
          <li key={i}>
            {inline(it.text, `l${k}-${i}`)}
            {it.sub.length > 0 && (
              <ul>
                {it.sub.map((s, j) => (
                  <li key={j}>{inline(s, `l${k}-${i}-${j}`)}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    )
    list = null
  }
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ')
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    const li = /^(\s*)[-*]\s+(.*)$/.exec(line)
    if (!line.trim()) {
      flushPara()
      flushList()
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushPara()
      flushList()
      blocks.push(<hr key={blocks.length} />)
    } else if (h) {
      flushPara()
      flushList()
      blocks.push(<h4 key={blocks.length}>{inline(h[2], 'h' + blocks.length)}</h4>)
    } else if (li) {
      flushPara()
      if (!list) list = []
      if (li[1].length >= 2 && list.length) list[list.length - 1].sub.push(li[2])
      else list.push({ text: li[2], sub: [] })
    } else if (list && /^\s{2,}\S/.test(line)) {
      // a list item carried onto the next line
      const last = list[list.length - 1]
      if (last.sub.length) last.sub[last.sub.length - 1] += ' ' + line.trim()
      else last.text += ' ' + line.trim()
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return <div className="md">{blocks}</div>
}
