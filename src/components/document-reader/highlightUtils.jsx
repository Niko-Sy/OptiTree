import React from 'react'

export function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function findTextMatches(text = '', query = '') {
  const source = String(text || '')
  const keyword = String(query || '').trim()
  if (!source || !keyword) return []

  const regex = new RegExp(escapeRegExp(keyword), 'gi')
  const matches = []
  let match
  while ((match = regex.exec(source)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    })
    if (match.index === regex.lastIndex) {
      regex.lastIndex += 1
    }
  }
  return matches
}

export function renderHighlightedText(text = '', query = '', activeMatchIndex = -1, counterRef = { current: 0 }, keyPrefix = 'hl') {
  const source = String(text ?? '')
  const matches = findTextMatches(source, query)
  if (!matches.length) return source

  const nodes = []
  let cursor = 0
  matches.forEach((match, localIndex) => {
    if (match.start > cursor) {
      nodes.push(source.slice(cursor, match.start))
    }
    const globalIndex = counterRef.current
    counterRef.current += 1
    nodes.push(
      <mark
        key={`${keyPrefix}-${localIndex}-${globalIndex}`}
        data-match-index={globalIndex}
        className={globalIndex === activeMatchIndex ? 'document-reader-mark document-reader-mark-active' : 'document-reader-mark'}
      >
        {source.slice(match.start, match.end)}
      </mark>,
    )
    cursor = match.end
  })
  if (cursor < source.length) {
    nodes.push(source.slice(cursor))
  }
  return nodes
}

export function highlightReactNode(node, query, activeMatchIndex, counterRef, keyPrefix = 'node') {
  if (typeof node === 'string') {
    return renderHighlightedText(node, query, activeMatchIndex, counterRef, keyPrefix)
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => highlightReactNode(child, query, activeMatchIndex, counterRef, `${keyPrefix}-${index}`))
  }

  if (React.isValidElement(node) && node.props?.children) {
    return React.cloneElement(node, {
      ...node.props,
      children: highlightReactNode(node.props.children, query, activeMatchIndex, counterRef, keyPrefix),
    })
  }

  return node
}
