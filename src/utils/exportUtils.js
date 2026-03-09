/**
 * exportUtils.js — SVG / PNG export helpers
 * Used by Toolbar, KgToolbar and Collaboration
 */

const FT_NODE_COLORS = {
  topEvent:   { fill: '#bfdbfe', stroke: '#3b82f6', text: '#1e3a8a' },
  midEvent:   { fill: '#d1fae5', stroke: '#10b981', text: '#064e3b' },
  basicEvent: { fill: '#fef3c7', stroke: '#f59e0b', text: '#78350f' },
  gate:       { fill: '#ede9fe', stroke: '#8b5cf6', text: '#4c1d95' },
}

function escXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Build an SVG string for a fault tree (x/y coordinate system)
 * @param {Array} nodes  — { id, x, y, width, height, type, name, gateType }
 * @param {Array} edges  — { from, to }
 * @returns {string|null}
 */
export function buildFaultTreeSVG(nodes, edges) {
  if (!nodes.length) return null

  const pad = 40
  const xs = nodes.flatMap(n => [n.x - n.width / 2, n.x + n.width / 2])
  const ys = nodes.flatMap(n => [n.y, n.y + n.height])
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const W = Math.max(...xs) + pad - minX
  const H = Math.max(...ys) + pad - minY

  const nodeMap = {}
  nodes.forEach(n => { nodeMap[n.id] = n })

  const edgeEls = edges.map(e => {
    const p = nodeMap[e.from]; const c = nodeMap[e.to]
    if (!p || !c) return ''
    const sx = p.x - minX, sy = p.y + p.height - minY
    const ex = c.x - minX, ey = c.y - minY
    return `<path d="M ${sx} ${sy} C ${sx} ${sy + 50}, ${ex} ${ey - 50}, ${ex} ${ey}" stroke="#94a3b8" stroke-width="1.5" fill="none"/>`
  }).join('\n  ')

  const nodeEls = nodes.map(n => {
    const cfg = FT_NODE_COLORS[n.type] || FT_NODE_COLORS.midEvent
    const x = n.x - n.width / 2 - minX
    const y = n.y - minY
    const rx = n.type === 'gate' ? Math.round(n.width / 2) : 8
    const label = n.type === 'gate' ? (n.gateType || n.name || '') : (n.name || '')
    return `<rect x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="${rx}" fill="${cfg.fill}" stroke="${cfg.stroke}" stroke-width="1.5"/>
  <text x="${x + n.width / 2}" y="${y + n.height / 2 + 4}" text-anchor="middle" font-size="11" fill="${cfg.text}" font-family="system-ui,sans-serif">${escXml(label)}</text>`
  }).join('\n  ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  ${edgeEls}
  ${nodeEls}
</svg>`
}

/**
 * Build an SVG string for a knowledge graph (React Flow position system)
 * @param {Array} rfNodes — { id, position:{x,y}, data:{label,...}, width?, height?, style? }
 * @param {Array} rfEdges — { source, target }
 * @returns {string|null}
 */
export function buildKgSVG(rfNodes, rfEdges) {
  if (!rfNodes.length) return null

  const DEFAULT_W = 160, DEFAULT_H = 44
  const pad = 40
  const gx = n => n.position?.x ?? n.x ?? 0
  const gy = n => n.position?.y ?? n.y ?? 0
  const gw = n => Number(n.width ?? n.style?.width ?? DEFAULT_W)
  const gh = n => Number(n.height ?? n.style?.height ?? DEFAULT_H)

  const xs = rfNodes.flatMap(n => [gx(n), gx(n) + gw(n)])
  const ys = rfNodes.flatMap(n => [gy(n), gy(n) + gh(n)])
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const W = Math.max(...xs) + pad - minX
  const H = Math.max(...ys) + pad - minY

  const nodeMap = {}
  rfNodes.forEach(n => { nodeMap[n.id] = n })

  const edgeEls = rfEdges.map(e => {
    const s = nodeMap[e.source]; const t = nodeMap[e.target]
    if (!s || !t) return ''
    const sx = gx(s) + gw(s) / 2 - minX, sy = gy(s) + gh(s) / 2 - minY
    const ex = gx(t) + gw(t) / 2 - minX, ey = gy(t) + gh(t) / 2 - minY
    const label = escXml(e.data?.label || e.label || '')
    const midX = (sx + ex) / 2, midY = (sy + ey) / 2
    return `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#94a3b8" stroke-width="1.5"/>` +
      (label ? `<text x="${midX}" y="${midY - 4}" text-anchor="middle" font-size="10" fill="#6b7280" font-family="system-ui,sans-serif">${label}</text>` : '')
  }).join('\n  ')

  const nodeEls = rfNodes.map(n => {
    const x = gx(n) - minX, y = gy(n) - minY
    const w = gw(n), h = gh(n)
    const label = n.data?.label || n.data?.name || n.label || ''
    const bg = n.data?.color || (n.style?.background) || '#dbeafe'
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${escXml(bg)}" stroke="#93c5fd" stroke-width="1.5"/>
  <text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="12" fill="#1e3a8a" font-family="system-ui,sans-serif">${escXml(label)}</text>`
  }).join('\n  ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  ${edgeEls}
  ${nodeEls}
</svg>`
}

/** Trigger browser SVG file download */
export function downloadSvg(svgString, filename) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Convert SVG string → PNG and trigger browser download (2× retina) */
export function downloadSvgAsPng(svgString, filename) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new window.Image()
  img.onload = () => {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width  = img.naturalWidth  * scale
    canvas.height = img.naturalHeight * scale
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    const pngUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = pngUrl
    a.download = filename
    a.click()
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}
