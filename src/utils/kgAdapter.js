/**
 * kgAdapter.js — 前端 React Flow 格式 ↔ 后端平铺格式转换
 *
 * 前端 RF 格式（KnowledgeGraphNode）：
 * {
 *   id: string,
 *   type: 'entityNode'|'eventNode'|'causeNode',
 *   position: { x: number, y: number },
 *   data: { label, entityType, description, sourceDoc, ...extra },
 *   style: { width, height, backgroundColor, ... },
 * }
 *
 * 后端数据库格式（KnowledgeGraphNode 后端）：
 * {
 *   id: string,
 *   projectId?: string,
 *   type: string,
 *   positionX: number,
 *   positionY: number,
 *   label: string,
 *   entityType: string,
 *   description: string|null,
 *   sourceDoc: string|null,
 *   style: object|null,
 *   dataExt: object|null,   // 存放 data 中除已知字段外的其余扩展字段
 * }
 */

const KNOWN_DATA_KEYS = new Set(['label', 'entityType', 'description', 'sourceDoc'])

/**
 * 将前端 React Flow 节点转换为后端平铺格式
 * @param {object} rfNode
 * @returns {object} backendNode
 */
export function rfNodeToBackend(rfNode) {
  const { id, type, position = {}, data = {}, style, ...rest } = rfNode
  const { label, entityType, description, sourceDoc, ...dataExt } = data

  // 收集 data 中除已知字段外的扩展字段
  const extraDataExt = Object.keys(dataExt).length > 0 ? dataExt : null
  // rest 中去掉 React Flow 运行时字段（selected, dragging 等）
  const { selected, dragging, width, height, measured, ...cleanRest } = rest // eslint-disable-line

  return {
    id,
    type,
    positionX: position.x ?? 0,
    positionY: position.y ?? 0,
    label: label ?? '',
    entityType: entityType ?? 'other',
    description: description ?? null,
    sourceDoc: sourceDoc ?? null,
    style: style ?? null,
    dataExt: extraDataExt,
    // 保留除以上字段外的其余 rfNode 顶层字段（如 measured 等已被清理）
    ...cleanRest,
  }
}

/**
 * 将后端平铺格式节点转换为前端 React Flow 格式
 * @param {object} backendNode
 * @returns {object} rfNode
 */
export function backendToRFNode(backendNode) {
  const {
    id,
    type,
    positionX,
    positionY,
    label,
    entityType,
    description,
    sourceDoc,
    style,
    dataExt,
    projectId, // eslint-disable-line
    ...rest
  } = backendNode

  return {
    id,
    type,
    position: { x: positionX ?? 0, y: positionY ?? 0 },
    data: {
      label: label ?? '',
      entityType: entityType ?? 'other',
      ...(description != null && { description }),
      ...(sourceDoc != null && { sourceDoc }),
      ...(dataExt || {}),
    },
    ...(style && { style }),
    ...rest,
  }
}
