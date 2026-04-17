/**
 * AIAssistant — 悬浮 AI 问答助手（会话化版本）
 *
 * Props:
 *   contextType  'faultTree' | 'knowledgeGraph'
 *   projectId    string  当前项目 ID（会话绑定）
 *
 * 特性：
 *   - position:fixed 浮动圆形按钮，带脉冲波纹
 *   - 拖拽后吸附左/右侧（带弹性动画），位置持久化
 *   - 不遮挡顶部导航栏（56px）
 *   - 点击展开/关闭可拖拽缩放的对话面板
 *   - 10s 无操作显示方向自适应气泡提示
 *   - 基于后端会话化 API：消息持久化 + 历史游标加载
 *   - 懒创建会话（首条消息时），会话 ID 持久化到 localStorage
 *   - 模型选择器嵌入输入框底部，快捷提问显示于输入框上方
 *   - AI 回复时若面板较小自动动画展开
 */
import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Alert, Input, InputNumber, Spin, Tag, Tooltip, Select, Modal, message } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import {
  RobotOutlined,
  CloseOutlined,
  SendOutlined,
  ClearOutlined,
  BorderOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CopyOutlined,
  MessageOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { getQuickQuestions } from '../../services/aiService'
import {
  getAssistantModels,
  createConversation,
  getConversations,
  deleteConversation,
  getConversationMessages,
  sendMessage,
  sendMessageStream,
  sendAgentStream,
  confirmAgentAction,
  cancelAgentSession,
  getAgentSessionStatus,
} from '../../services/assistantService'
import { executeClientTool } from '../../utils/clientToolExecutor'
import { useEditorStore as editorStore } from '../../store/editorStore'
import { useAgentUIStore } from '../../store/useAgentUIStore'

// ─── 布局常量 ────────────────────────────────────────────────────────
const TOP_NAV_H           = 56
const BTN_SIZE            = 48
const EDGE_PAD            = 8
const SNAP_MS             = 580
const IDLE_MS             = 5000
const BUBBLE_W            = 186
const DRAG_THRESHOLD      = 5
const PANEL_MIN_W         = 360
const PANEL_MIN_H         = 520
const PANEL_EXPAND_RATIO  = 0.68   // AI 回复时目标高度占视口比例
const PANEL_EXPAND_THRESH = 0.52   // 低于该比例时触发自动展开
const DEFAULT_AGENT_MAX_TOOL_ROUNDS = 8

const CONTEXT_LABELS = {
  faultTree:      '故障树助手',
  knowledgeGraph: '知识图谱助手',
}

const AGENT_STATE_LABELS = {
  idle: '空闲',
  running: '运行中',
  paused_confirm: '等待确认',
  paused_preview: '等待预览确认',
  paused_iteration: '等待继续轮数',
  done: '已完成',
  cancelled: '已取消',
}

const AGENT_ERROR_MESSAGE_MAP = {
  40001: '请求参数无效，请稍后重试。',
  40009: '会话状态冲突，请刷新后重试。',
  40310: 'Agent 触发安全策略，建议新开一轮请求。',
  40410: 'Agent 会话不存在，请重新发起请求。',
  40810: 'Agent 会话等待超时，请稍后重试。',
  42910: '请求频率过高，请稍后再试。',
}

const MAX_AGENT_THINKING_STEPS = 120

const AGENT_THINKING_PHASE_META = {
  context_loaded: { label: '已加载上下文', tone: 'info' },
  context_override: { label: '使用前端快照上下文', tone: 'info' },
  round_start: { label: '轮次开始', tone: 'info' },
  round_limit_reached: { label: '达到轮次上限，等待确认', tone: 'warning' },
  round_resumed: { label: '已继续迭代', tone: 'success' },
  round_stopped: { label: '已停止迭代', tone: 'warning' },
  reasoning: { label: '模型思考中', tone: 'running' },
  tool_plan: { label: '规划工具调用', tone: 'info' },
  tool_execution: { label: '执行工具中', tone: 'running' },
  round_summary: { label: '本轮总结', tone: 'success' },
  context_refresh: { label: '刷新图上下文', tone: 'info' },
  finalizing: { label: '正在收尾', tone: 'running' },
  model_error: { label: '模型调用失败', tone: 'error' },
}

const AGENT_THINKING_TONE_META = {
  info: { dot: '#1677ff', bg: 'rgba(22,119,255,0.08)', border: 'rgba(22,119,255,0.2)', text: '#0958d9' },
  running: { dot: '#13a8a8', bg: 'rgba(19,168,168,0.1)', border: 'rgba(19,168,168,0.24)', text: '#006d75' },
  success: { dot: '#52c41a', bg: 'rgba(82,196,26,0.12)', border: 'rgba(82,196,26,0.22)', text: '#389e0d' },
  warning: { dot: '#fa8c16', bg: 'rgba(250,140,22,0.12)', border: 'rgba(250,140,22,0.22)', text: '#ad6800' },
  error: { dot: '#ff4d4f', bg: 'rgba(255,77,79,0.12)', border: 'rgba(255,77,79,0.22)', text: '#cf1322' },
}

// ─── 响应式面板初始尺寸 ──────────────────────────────────────────────
function getInitialPanelSize() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const minW = Math.min(PANEL_MIN_W, Math.max(280, vw - EDGE_PAD * 2))
  const minH = Math.min(PANEL_MIN_H, Math.max(360, vh - TOP_NAV_H - EDGE_PAD * 2))
  const maxW = Math.floor(vw * 0.42)
  const maxH = vh - TOP_NAV_H - EDGE_PAD * 2
  return {
    width:  Math.min(Math.max(minW, Math.round(vw * 0.27)), maxW),
    height: Math.min(Math.max(minH, Math.round(vh * 0.62)), maxH),
  }
}

// ─── 工具函数 ────────────────────────────────────────────────────────
function clampBtnPos(x, y) {
  return {
    x: Math.max(EDGE_PAD, Math.min(x, window.innerWidth  - BTN_SIZE - EDGE_PAD)),
    y: Math.max(TOP_NAV_H + EDGE_PAD, Math.min(y, window.innerHeight - BTN_SIZE - EDGE_PAD)),
  }
}

function getSavedPosition() {
  try {
    const raw = localStorage.getItem('ai_assistant_position')
    if (raw) {
      const { x, y } = JSON.parse(raw)
      return clampBtnPos(x, y)
    }
  } catch {
    // ignore invalid cached position payload
  }
  return clampBtnPos(0, window.innerHeight - 96)
}

function calcPanelPos(btnX, btnY, panelW, panelH) {
  let left = btnX - panelW - EDGE_PAD
  let top  = btnY - panelH + BTN_SIZE
  if (left < EDGE_PAD) left = btnX + BTN_SIZE + EDGE_PAD
  if (top  < TOP_NAV_H + EDGE_PAD) top = TOP_NAV_H + EDGE_PAD
  if (left + panelW > window.innerWidth  - EDGE_PAD) left = window.innerWidth  - panelW - EDGE_PAD
  if (top  + panelH > window.innerHeight - EDGE_PAD) top  = window.innerHeight - panelH - EDGE_PAD
  return { left, top }
}

// ─── 会话 ID 持久化工具 ──────────────────────────────────────────────
function getConvStorageKey(projectId, contextType, mode = 'ask') {
  return `ai_conv_${projectId}_${contextType}_${mode}`
}
function getSavedConversationId(projectId, contextType, mode = 'ask') {
  try {
    const keyValue = localStorage.getItem(getConvStorageKey(projectId, contextType, mode))
    if (keyValue) return keyValue
    if (mode === 'ask') {
      return localStorage.getItem(`ai_conv_${projectId}_${contextType}`) || null
    }
    return null
  } catch {
    return null
  }
}
function saveConversationId(projectId, contextType, id, mode = 'ask') {
  try {
    localStorage.setItem(getConvStorageKey(projectId, contextType, mode), id)
    // 兼容历史 ask 存储键，避免模式改造后丢失原会话入口
    if (mode === 'ask') {
      localStorage.setItem(`ai_conv_${projectId}_${contextType}`, id)
    }
  } catch {
    // ignore storage write failures
  }
}
function clearConversationId(projectId, contextType, mode = 'ask') {
  try {
    localStorage.removeItem(getConvStorageKey(projectId, contextType, mode))
    if (mode === 'ask') {
      localStorage.removeItem(`ai_conv_${projectId}_${contextType}`)
    }
  } catch {
    // ignore storage write failures
  }
}

function getConversationModeMapKey(projectId, contextType) {
  return `ai_conv_mode_map_${projectId}_${contextType}`
}

function getConversationModeMap(projectId, contextType) {
  try {
    const raw = localStorage.getItem(getConversationModeMapKey(projectId, contextType))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function setConversationMode(projectId, contextType, conversationId, mode) {
  if (!projectId || !contextType || !conversationId || !mode) return
  try {
    const next = {
      ...getConversationModeMap(projectId, contextType),
      [conversationId]: mode,
    }
    localStorage.setItem(getConversationModeMapKey(projectId, contextType), JSON.stringify(next))
  } catch {
    // ignore storage write failures
  }
}

function removeConversationMode(projectId, contextType, conversationId) {
  if (!projectId || !contextType || !conversationId) return
  try {
    const next = { ...getConversationModeMap(projectId, contextType) }
    delete next[conversationId]
    localStorage.setItem(getConversationModeMapKey(projectId, contextType), JSON.stringify(next))
  } catch {
    // ignore storage write failures
  }
}

function normalizeAgentCode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return null
}

function resolveAgentErrorMessage(errorLike, fallback = '') {
  const code = normalizeAgentCode(errorLike?.code ?? errorLike?.errorCode)
  if (Number.isFinite(code) && AGENT_ERROR_MESSAGE_MAP[code]) {
    return AGENT_ERROR_MESSAGE_MAP[code]
  }
  return errorLike?.message || errorLike?.errorMessage || fallback
}

function normalizeToolResultStatus(event) {
  const rawStatus = typeof event?.status === 'string' ? event.status.toLowerCase() : ''
  if (rawStatus) return rawStatus
  if (event?.success === true) return 'success'
  if (event?.success === false) return 'failed'
  return 'success'
}

function getToolResultStatusLabel(status) {
  if (status === 'failed') return '失败'
  if (status === 'cancelled') return '已取消'
  if (status === 'discarded') return '已放弃'
  if (status === 'client_only') return '前端执行'
  return '成功'
}

function normalizeThinkingPhase(phase) {
  if (typeof phase !== 'string') return 'reasoning'
  const normalized = phase.trim().toLowerCase()
  return normalized || 'reasoning'
}

function resolveThinkingPhaseMeta(phase) {
  const normalizedPhase = normalizeThinkingPhase(phase)
  return AGENT_THINKING_PHASE_META[normalizedPhase] || {
    label: normalizedPhase || '过程更新',
    tone: 'info',
  }
}

function buildThinkingMessage(event, phaseMeta) {
  const explicitMessage = typeof event?.message === 'string' ? event.message.trim() : ''
  if (explicitMessage) return explicitMessage

  const round = Number.isFinite(event?.round) ? Math.trunc(event.round) : null
  if (Number.isFinite(round)) {
    return `${phaseMeta.label}（第 ${round} 轮）`
  }
  return phaseMeta.label
}

function formatThinkingTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    return '--:--:--'
  }
}

function buildAgentRequestPayload(contextType) {
  if (contextType !== 'faultTree') {
    return {
      readOnly: true,
      maxToolRounds: DEFAULT_AGENT_MAX_TOOL_ROUNDS,
    }
  }

  const graphState = editorStore.getState()
  const nodes = Array.isArray(graphState?.nodes) ? graphState.nodes : []
  const edges = Array.isArray(graphState?.edges) ? graphState.edges : []
  const revision = Number.isFinite(graphState?.revision) ? Math.trunc(graphState.revision) : null

  return {
    graphSnapshot: { nodes, edges },
    ...(Number.isFinite(revision) ? { clientRevision: revision } : {}),
    readOnly: false,
    maxToolRounds: DEFAULT_AGENT_MAX_TOOL_ROUNDS,
  }
}

// ─── 消息规范化（API 新→旧 → 展示旧→新，role 映射） ──────────────────
function normalizeApiMessages(apiMessages) {
  return [...apiMessages].reverse().map(m => ({
    id:         m.id,
    role:       m.role === 'assistant' ? 'ai' : m.role,
    content:    m.content || '',
    isPartial:  !!m.isPartial,
    model:      m.model || null,
    tokensUsed: Number.isFinite(m.tokensUsed) ? m.tokensUsed : null,
  }))
}

function toConversationOptions(list) {
  return (Array.isArray(list) ? list : []).map(item => ({
    value: item.id,
    label: item.title || '未命名会话',
  }))
}

// ─── Markdown 渲染（支持表格、任务列表、删除线、代码块等） ─────────────
function MarkdownContent({ content }) {
  if (!content) return null

  return (
    <div style={{ lineHeight: 1.7 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => (
            <p style={{ margin: '0 0 6px' }}>{children}</p>
          ),
          h1: ({ children }) => (
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 4px', borderBottom: '1px solid #e8e8e8', paddingBottom: 4 }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '8px 0 4px', borderBottom: '1px solid #e8e8e8', paddingBottom: 4 }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '6px 0 4px' }}>{children}</h3>
          ),
          ul: ({ children }) => (
            <ul style={{ margin: '0 0 6px 18px', padding: 0 }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: '0 0 6px 18px', padding: 0 }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: 2 }}>{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote style={{
              margin: '6px 0',
              padding: '2px 0 2px 10px',
              borderLeft: '3px solid #1677ff',
              color: '#595959',
              fontStyle: 'italic',
            }}>
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr style={{ border: 'none', borderTop: '1px solid #e0e0e0', margin: '8px 0' }} />
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#1677ff', textDecoration: 'underline' }}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '8px 0', border: '1px solid #e8e8e8', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ background: '#fafafa' }}>{children}</thead>
          ),
          th: ({ children }) => (
            <th style={{ borderBottom: '1px solid #e8e8e8', padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{ borderBottom: '1px solid #f0f0f0', padding: '6px 8px', verticalAlign: 'top' }}>
              {children}
            </td>
          ),
          code: ({ inline, className, children }) => {
            if (inline) {
              return (
                <code style={{
                  background: 'rgba(0,0,0,0.07)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  fontSize: '0.88em',
                  fontFamily: '"Fira Code",Consolas,monospace',
                }}>
                  {children}
                </code>
              )
            }

            return (
              <pre style={{
                background: '#1e1e2e',
                color: '#cdd6f4',
                padding: '10px 14px',
                borderRadius: 8,
                overflowX: 'auto',
                fontSize: 12,
                lineHeight: 1.6,
                margin: '6px 0',
                fontFamily: '"Fira Code",Consolas,monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <code className={className}>{children}</code>
              </pre>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ─── 消息气泡 ────────────────────────────────────────────────────────
function AgentThinkingInline({
  steps,
  expanded,
  running,
  onToggleExpand,
}) {
  const stepCount = Array.isArray(steps) ? steps.length : 0
  if (!stepCount) return null

  return (
    <div className="agent-thinking-inline">
      <button
        type="button"
        onClick={onToggleExpand}
        className="agent-thinking-inline-head"
      >
        <span className="agent-thinking-inline-arrow">
          {expanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
        </span>
        <span className="agent-thinking-inline-title">
          {running ? '思考中...' : `已完成 ${stepCount} 步思考`}
        </span>
        {running && <span className="agent-thinking-live-dot" />}
      </button>
      {expanded && (
        <div className="agent-thinking-inline-body">
          {steps.map((step, idx) => {
            const toneMeta = AGENT_THINKING_TONE_META[step.tone] || AGENT_THINKING_TONE_META.info
            const isLast = idx === steps.length - 1
            return (
              <div key={step.id} className="agent-thinking-inline-item">
                <span
                  className="agent-thinking-inline-dot"
                  style={{ background: toneMeta.dot }}
                />
                {!isLast && <span className="agent-thinking-inline-line" />}
                <div className="agent-thinking-inline-main">
                  <div className="agent-thinking-inline-item-head">
                    <span style={{ color: toneMeta.text }}>{step.label}</span>
                    <span>{formatThinkingTime(step.ts)}</span>
                  </div>
                  <div className="agent-thinking-inline-item-msg">{step.message}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AgentThinkingBubble({
  steps,
  expanded,
  running,
  onToggleExpand,
}) {
  const hasSteps = Array.isArray(steps) && steps.length > 0
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
      <div className="ai-msg-avatar">
        <RobotOutlined style={{ color: '#fff', fontSize: 13 }} />
      </div>
      <div className="ai-msg-wrap">
        <div className="ai-msg ai-msg-assistant">
          {hasSteps ? (
            <AgentThinkingInline
              steps={steps}
              expanded={expanded}
              running={running}
              onToggleExpand={onToggleExpand}
            />
          ) : (
            <div className="agent-thinking-inline-empty">正在建立上下文并规划执行步骤...</div>
          )}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ role, content, isPartial, agentSteps, thinkingExpanded, onToggleThinking, showThinkingInline, thinkingRunning }) {
  const isUser = role === 'user'

  const handleCopy = async () => {
    const text = String(content || '')
    if (!text) return

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      message.success('已复制消息内容')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      {!isUser && (
        <div className="ai-msg-avatar">
          <RobotOutlined style={{ color: '#fff', fontSize: 13 }} />
        </div>
      )}
      <div className={`ai-msg-wrap ${isUser ? 'ai-msg-wrap-user' : ''}`}>
        <div className={`ai-msg ${isUser ? 'ai-msg-user' : 'ai-msg-assistant'}`}>
          {!isUser && showThinkingInline && Array.isArray(agentSteps) && agentSteps.length > 0 && (
            <AgentThinkingInline
              steps={agentSteps}
              expanded={thinkingExpanded}
              running={thinkingRunning}
              onToggleExpand={onToggleThinking}
            />
          )}
          {!isUser && isPartial && (
            <div style={{ marginBottom: 6 }}>
              <Tag color="orange" style={{ marginInlineEnd: 0, fontSize: 11 }}>部分回答</Tag>
            </div>
          )}
          {isUser ? content : <MarkdownContent content={content} />}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          onMouseEnter={(e) => {
            if (!content) return
            e.currentTarget.style.background = '#e5e5e5'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
          
          disabled={!content}
          className={`ai-copy-btn ${isUser ? 'is-user' : ''}`}
          style={{ cursor: content ? 'pointer' : 'not-allowed', opacity: content ? undefined : 0.3 }}
        >
          {/* <CopyOutlined style={{ fontSize: 14 }} /> */}
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill='none' viewBox="0 0 20 20" aria-hidden="true" className="icon">
            <path xmlns="http://www.w3.org/2000/svg" d="M12.668 10.667c0-.71 0-1.204-.031-1.588a2.4 2.4 0 0 0-.113-.615l-.055-.13a1.84 1.84 0 0 0-.676-.731l-.127-.072c-.158-.08-.37-.137-.745-.168-.384-.031-.877-.031-1.588-.031H6.5c-.711 0-1.204 0-1.588.031a2.4 2.4 0 0 0-.615.113l-.13.055a1.84 1.84 0 0 0-.731.676l-.07.127c-.081.158-.138.37-.169.745-.031.384-.032.877-.032 1.588V13.5c0 .711 0 1.204.032 1.588.031.376.088.587.168.745l.07.126c.177.288.43.522.732.676l.13.056c.144.052.333.089.615.112.384.031.877.032 1.588.032h2.833c.71 0 1.204 0 1.588-.032.376-.031.587-.088.745-.168l.127-.07c.287-.177.522-.43.676-.732l.055-.13c.052-.144.09-.333.113-.615.031-.384.031-.877.031-1.588zm1.33 1.998c.455-.002.803-.005 1.09-.028.376-.031.587-.088.745-.168l.126-.071c.288-.177.522-.43.676-.732l.056-.13a2.4 2.4 0 0 0 .112-.615c.031-.384.032-.877.032-1.588V6.5c0-.711 0-1.204-.032-1.588a2.4 2.4 0 0 0-.112-.615l-.056-.13a1.84 1.84 0 0 0-.676-.731l-.126-.07c-.158-.081-.37-.138-.745-.169-.384-.031-.877-.032-1.588-.032h-2.833c-.71 0-1.204.001-1.588.032-.282.023-.471.06-.615.112l-.13.056a1.84 1.84 0 0 0-.731.676l-.072.126c-.08.158-.137.37-.168.745-.023.287-.027.635-.029 1.09h1.999c.689 0 1.246 0 1.696.036.458.038.865.117 1.242.309l.217.122c.496.304.9.74 1.165 1.26l.067.143c.144.337.21.698.242 1.099.037.45.036 1.007.036 1.696zm4.167-3.332c0 .689 0 1.246-.036 1.696-.033.401-.098.762-.242 1.099l-.067.143c-.265.52-.67.956-1.165 1.26l-.219.122c-.376.192-.782.271-1.24.309-.337.027-.734.031-1.2.033-.003.467-.007.864-.034 1.201-.033.401-.098.762-.242 1.098l-.067.142c-.265.522-.669.958-1.165 1.262l-.217.122c-.377.192-.784.271-1.242.309-.45.037-1.007.036-1.696.036H6.5c-.69 0-1.246 0-1.696-.036-.4-.033-.762-.098-1.098-.242l-.143-.067a3.17 3.17 0 0 1-1.261-1.165l-.122-.219c-.192-.376-.271-.782-.309-1.24-.037-.45-.036-1.007-.036-1.696v-2.833c0-.689 0-1.246.036-1.696.038-.458.117-.865.309-1.242l.122-.217c.304-.496.74-.9 1.261-1.165l.143-.067c.336-.144.697-.21 1.098-.242.337-.027.733-.032 1.2-.034.002-.467.007-.863.034-1.2.037-.458.117-.864.309-1.24l.122-.22c.304-.495.74-.899 1.26-1.164l.143-.067c.337-.144.698-.21 1.099-.242.45-.037 1.007-.036 1.696-.036H13.5c.69 0 1.246 0 1.696.036.458.038.864.117 1.24.309l.22.122c.495.304.899.74 1.164 1.261l.067.143c.144.336.21.697.242 1.098.037.45.036 1.007.036 1.696z" fill='currentcolor'/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── 主组件 ──────────────────────────────────────────────────────────
const AIAssistant = forwardRef(function AIAssistant({ contextType = 'faultTree', projectId }, ref) {
  const [pos,             setPos]             = useState(() => getSavedPosition())
  const [isSnapping,      setIsSnapping]      = useState(false)
  const [isOpen,          setIsOpen]          = useState(false)
  const [messages,        setMessages]        = useState([])
  const [inputVal,        setInputVal]        = useState('')
  const [loading,         setLoading]         = useState(false)
  const [isTyping,        setIsTyping]        = useState(false)
  const [showBubble,      setShowBubble]      = useState(false)
  const [panelSize,       setPanelSize]       = useState(getInitialPanelSize)
  const [isAutoExpanding, setIsAutoExpanding] = useState(false)
  // 会话相关
  const [conversationId,          setConversationId]          = useState(null)
  const [conversationTitle,       setConversationTitle]       = useState(null)
  const [conversationList,        setConversationList]        = useState([])
  const [conversationListLoading, setConversationListLoading] = useState(false)
  const [deletingConversation,    setDeletingConversation]    = useState(false)
  const [models,                  setModels]                  = useState([])
  const [selectedModel,           setSelectedModel]           = useState(null)
  const [historyLoading,          setHistoryLoading]          = useState(false)
  const [nextCursor,              setNextCursor]              = useState(null)
  const [hasMoreHistory,          setHasMoreHistory]          = useState(false)
  const [streamNotice,            setStreamNotice]            = useState('')
  const [thinkingSteps,           setThinkingSteps]           = useState([])
  const [thinkingExpanded,        setThinkingExpanded]        = useState(true)
  const supportsAgent = contextType === 'faultTree'
  const [chatMode, setChatMode] = useState('ask')
  const [continueRounds, setContinueRounds] = useState(1)

  const agentState = useAgentUIStore(s => s.agentState)
  const pendingConfirm = useAgentUIStore(s => s.pendingConfirm)
  const pendingPreview = useAgentUIStore(s => s.pendingPreview)
  const pendingIteration = useAgentUIStore(s => s.pendingIteration)
  const activeSessionId = useAgentUIStore(s => s.activeSessionId)
  const setAgentState = useAgentUIStore(s => s.setAgentState)
  const setActiveSession = useAgentUIStore(s => s.setActiveSession)
  const setPendingConfirm = useAgentUIStore(s => s.setPendingConfirm)
  const clearPendingConfirm = useAgentUIStore(s => s.clearPendingConfirm)
  const setPendingPreview = useAgentUIStore(s => s.setPendingPreview)
  const clearPendingPreview = useAgentUIStore(s => s.clearPendingPreview)
  const setPendingIteration = useAgentUIStore(s => s.setPendingIteration)
  const clearPendingIteration = useAgentUIStore(s => s.clearPendingIteration)
  const resetAgentUiState = useAgentUIStore(s => s.resetAgentUiState)

  const effectiveMode = supportsAgent ? chatMode : 'ask'
  const quickQuestions  = getQuickQuestions(contextType)
  const messagesEndRef  = useRef(null)
  const inputRef        = useRef(null)
  const abortCtrlRef    = useRef(null)
  const skipScrollRef   = useRef(false)
  const streamStateRef  = useRef({ startedAt: 0, lastHeartbeatAt: 0 })
  const autoExpandedRef = useRef(false)
  const panelSizeRef    = useRef(panelSize)
  const thinkingStepSeqRef = useRef(0)

  const btnDrag   = useRef({ active: false, startMX: 0, startMY: 0, startBX: 0, startBY: 0, moved: false })
  const resizeRef = useRef({ active: false, edge: null, startMX: 0, startMY: 0, startW: 0, startH: 0 })

  // 保持 panelSizeRef 同步，供 handleSend 回调读取当前尺寸
  useEffect(() => { panelSizeRef.current = panelSize }, [panelSize])

  const resetThinkingTrail = useCallback(() => {
    thinkingStepSeqRef.current = 0
    setThinkingSteps([])
    setThinkingExpanded(true)
  }, [])

  const appendThinkingStep = useCallback((eventLike = {}) => {
    const phase = normalizeThinkingPhase(eventLike?.phase)
    const phaseMeta = resolveThinkingPhaseMeta(phase)
    const round = Number.isFinite(eventLike?.round) ? Math.trunc(eventLike.round) : null
    const step = {
      id: `agent_step_${Date.now()}_${thinkingStepSeqRef.current++}`,
      phase,
      label: phaseMeta.label,
      tone: phaseMeta.tone,
      round,
      message: buildThinkingMessage(eventLike, phaseMeta),
      ts: Date.now(),
    }

    setThinkingSteps((prev) => {
      const next = [...prev, step]
      if (next.length <= MAX_AGENT_THINKING_STEPS) return next
      return next.slice(next.length - MAX_AGENT_THINKING_STEPS)
    })
  }, [])

  useEffect(() => {
    if (!supportsAgent && chatMode !== 'ask') {
      setChatMode('ask')
    }
  }, [supportsAgent, chatMode])

  useEffect(() => {
    return () => {
      resetAgentUiState()
    }
  }, [resetAgentUiState])

  const resetConversationState = useCallback(() => {
    setConversationId(null)
    setConversationTitle(null)
    setMessages([])
    setNextCursor(null)
    setHasMoreHistory(false)
    setStreamNotice('')
    resetThinkingTrail()
  }, [resetThinkingTrail])

  const loadConversationList = useCallback(async () => {
    if (!projectId) {
      setConversationList([])
      return []
    }

    setConversationListLoading(true)
    try {
      const data = await getConversations({
        projectId,
        type: contextType,
        page: 1,
        pageSize: 20,
      })
      const list = Array.isArray(data?.list) ? data.list : []
      const modeMap = getConversationModeMap(projectId, contextType)
      const filtered = list.filter((item) => {
        const mode = modeMap[item.id] || 'ask'
        return mode === effectiveMode
      })
      setConversationList(filtered)
      return filtered
    } catch {
      setConversationList([])
      return []
    } finally {
      setConversationListLoading(false)
    }
  }, [projectId, contextType, effectiveMode])

  const loadConversationHistory = useCallback(async (targetConversationId, { before, limit = 30, append = false } = {}) => {
    if (!targetConversationId || !projectId) return

    if (!append) {
      resetThinkingTrail()
    }

    const query = { limit }
    if (before) query.before = before

    const { conversation, messages: apiMsgs, nextCursor: cursor, hasMore } = await getConversationMessages(
      targetConversationId,
      query
    )

    const normalized = normalizeApiMessages(apiMsgs)
    if (append) {
      skipScrollRef.current = true
      setMessages(prev => [...normalized, ...prev])
    } else {
      setMessages(normalized)
    }

    setConversationId(targetConversationId)
    setConversationTitle(conversation?.title || null)
    setNextCursor(cursor || null)
    setHasMoreHistory(!!hasMore)
    saveConversationId(projectId, contextType, targetConversationId, effectiveMode)
    setConversationMode(projectId, contextType, targetConversationId, effectiveMode)
  }, [projectId, contextType, effectiveMode, resetThinkingTrail])

  useImperativeHandle(ref, () => ({ open: () => setIsOpen(true) }))

  // ── 挂载时加载模型列表 ────────────────────────────────────────
  useEffect(() => {
    getAssistantModels().then(list => {
      if (!Array.isArray(list) || list.length === 0) return
      setModels(list)
      const rec = list.find(m => m.recommended)
      setSelectedModel(rec?.value ?? list[0]?.value ?? null)
    }).catch(() => {})
  }, [])

  // ── 面板打开时加载历史消息 ────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !projectId) return

    let disposed = false
    const bootstrap = async () => {
      await loadConversationList()
      if (disposed) return

      const storedId = getSavedConversationId(projectId, contextType, effectiveMode)
      if (!storedId) {
        resetConversationState()
        return
      }

      setHistoryLoading(true)
      try {
        await loadConversationHistory(storedId, { limit: 30 })
      } catch (err) {
        if (err?.status === 404 || err?.code === 40400 || err?.status === 403 || err?.code === 40300) {
          clearConversationId(projectId, contextType, effectiveMode)
          removeConversationMode(projectId, contextType, storedId)
          resetConversationState()
        }
      } finally {
        if (!disposed) setHistoryLoading(false)
      }
    }

    bootstrap()
    return () => {
      disposed = true
    }
  }, [isOpen, projectId, contextType, effectiveMode, loadConversationList, loadConversationHistory, resetConversationState])

  // ── 自动滚动到底部（加载历史时跳过）────────────────────────
  useEffect(() => {
    if (skipScrollRef.current) { skipScrollRef.current = false; return }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── 窗口缩放时重新定位 + 约束面板尺寸 ──────────────────────
  useEffect(() => {
    const onResize = () => {
      setPos(prev => {
        const raw = clampBtnPos(prev.x, prev.y)
        const snapToX = raw.x + BTN_SIZE / 2 < window.innerWidth / 2
          ? EDGE_PAD
          : window.innerWidth - BTN_SIZE - EDGE_PAD
        const snapped = { x: snapToX, y: raw.y }
        try {
          localStorage.setItem('ai_assistant_position', JSON.stringify(snapped))
        } catch {
          // ignore storage write failures
        }
        return snapped
      })
      setPanelSize(sz => {
        const maxW = Math.floor(window.innerWidth  * 0.42)
        const maxH = window.innerHeight - TOP_NAV_H - EDGE_PAD * 2
        const minW = Math.min(PANEL_MIN_W, Math.max(280, window.innerWidth - EDGE_PAD * 2))
        const minH = Math.min(PANEL_MIN_H, Math.max(360, window.innerHeight - TOP_NAV_H - EDGE_PAD * 2))
        return {
          width:  Math.min(Math.max(minW, sz.width),  maxW),
          height: Math.min(Math.max(minH, sz.height), maxH),
        }
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── 10s 无操作显示气泡提示 ──────────────────────────────────
  useEffect(() => {
    let timer = null
    const reset = () => {
      setShowBubble(false)
      clearTimeout(timer)
      if (!isOpen) timer = setTimeout(() => setShowBubble(true), IDLE_MS)
    }
    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'click', 'scroll', 'touchstart']
    EVENTS.forEach(ev => document.addEventListener(ev, reset, { passive: true }))
    if (!isOpen) timer = setTimeout(() => setShowBubble(true), IDLE_MS)
    return () => {
      clearTimeout(timer)
      EVENTS.forEach(ev => document.removeEventListener(ev, reset))
      setShowBubble(false)
    }
  }, [isOpen])

  // ── 新建对话 ────────────────────────────────────────────────
  const handleNewConversation = useCallback(() => {
    abortCtrlRef.current?.abort()
    setLoading(false)
    setIsTyping(false)
    if (projectId) clearConversationId(projectId, contextType, effectiveMode)
    resetAgentUiState()
    resetConversationState()
    setInputVal('')
    autoExpandedRef.current = false
  }, [projectId, contextType, effectiveMode, resetConversationState, resetAgentUiState])

  // ── 切换会话 ────────────────────────────────────────────────
  const handleSelectConversation = useCallback(async (targetConversationId) => {
    if (!targetConversationId || loading || historyLoading) return

    autoExpandedRef.current = false
    setHistoryLoading(true)
    setStreamNotice('')
    try {
      await loadConversationHistory(targetConversationId, { limit: 30 })
    } catch (err) {
      if (err?.status === 404 || err?.code === 40400) {
        message.warning('会话不存在，已从列表移除')
        if (projectId) clearConversationId(projectId, contextType, effectiveMode)
        removeConversationMode(projectId, contextType, targetConversationId)
        resetConversationState()
        await loadConversationList()
      } else {
        message.error(err?.message || '加载会话失败')
      }
    } finally {
      setHistoryLoading(false)
    }
  }, [loading, historyLoading, loadConversationHistory, projectId, contextType, effectiveMode, resetConversationState, loadConversationList])

  // ── 删除会话 ────────────────────────────────────────────────
  const handleDeleteConversation = useCallback((targetConversationId) => {
    if (!targetConversationId || deletingConversation || loading) return

    Modal.confirm({
      title: '删除当前会话？',
      content: '删除后不可恢复，会话下消息会被一并删除。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setDeletingConversation(true)
        try {
          await deleteConversation(targetConversationId)

          if (projectId) {
            const storedId = getSavedConversationId(projectId, contextType, effectiveMode)
            if (storedId === targetConversationId) {
              clearConversationId(projectId, contextType, effectiveMode)
            }
            removeConversationMode(projectId, contextType, targetConversationId)
          }

          if (conversationId === targetConversationId) {
            resetConversationState()
          }

          await loadConversationList()
          message.success('会话已删除')
        } catch (err) {
          message.error(err?.message || '删除会话失败')
        } finally {
          setDeletingConversation(false)
        }
      },
    })
  }, [deletingConversation, loading, projectId, contextType, effectiveMode, conversationId, resetConversationState, loadConversationList])

  // ── 加载更多历史 ─────────────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    if (!conversationId || !nextCursor || historyLoading) return
    setHistoryLoading(true)
    try {
      await loadConversationHistory(conversationId, {
        before: nextCursor,
        limit: 30,
        append: true,
      })
    } catch {
      // silent
    } finally {
      setHistoryLoading(false)
    }
  }, [conversationId, nextCursor, historyLoading, loadConversationHistory])

  // ── 中断回答 ────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    abortCtrlRef.current?.abort()
    if (supportsAgent && effectiveMode === 'agent' && activeSessionId) {
      try {
        await cancelAgentSession(activeSessionId)
      } catch {
        // best effort cancellation
      }
    }
  }, [supportsAgent, effectiveMode, activeSessionId])

  // ── 发送消息 ────────────────────────────────────────────────
  const handleSend = useCallback(async (text) => {
    const msg = (text ?? inputVal).trim()
    if (!msg || loading || !projectId) return
    if (msg.length > 2000) {
      message.warning('消息长度不能超过 2000 字符')
      return
    }

    const userMsgId = Date.now()
    const aiMsgId   = userMsgId + 1
    let convId = conversationId

    setInputVal('')
    setStreamNotice('')
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: msg, isPartial: false }])

    const controller = new AbortController()
    abortCtrlRef.current = controller
    setLoading(true)
    setIsTyping(true)
    let aiMsgAdded = false
    let streamDoneMeta = null
    let gotPartialEvent = false

    try {
      // Step 1: 确保会话存在（懒创建）
      if (!convId) {
        const conv = await createConversation(projectId, contextType)
        convId = conv?.id
        if (!convId) throw new Error('创建对话失败，请重试')
        saveConversationId(projectId, contextType, convId, 'ask')
        setConversationMode(projectId, contextType, convId, 'ask')
        setConversationId(convId)
        setConversationTitle(conv?.title || null)
      } else {
        setConversationMode(projectId, contextType, convId, 'ask')
      }

      // Step 2: 流式发送消息
      await sendMessageStream(convId, msg, selectedModel, {
        signal: controller.signal,
        onStarted: () => {
          streamStateRef.current.startedAt = Date.now()
          setIsTyping(true)
        },
        onHeartbeat: () => {
          streamStateRef.current.lastHeartbeatAt = Date.now()
        },
        onChunk: (chunk) => {
          if (!chunk) return
          setIsTyping(false)

          // ── AI 回复时若面板较小，自动动画展开 ──────────────
          if (!autoExpandedRef.current) {
            autoExpandedRef.current = true
            const vh = window.innerHeight
            const currentH = panelSizeRef.current.height
            if (currentH < vh * PANEL_EXPAND_THRESH) {
              const targetH = Math.min(
                Math.round(vh * PANEL_EXPAND_RATIO),
                vh - TOP_NAV_H - EDGE_PAD * 2,
              )
              const minH = Math.min(PANEL_MIN_H, Math.max(360, window.innerHeight - TOP_NAV_H - EDGE_PAD * 2))
              setIsAutoExpanding(true)
              setPanelSize(prev => ({ ...prev, height: Math.max(targetH, minH) }))
              setTimeout(() => setIsAutoExpanding(false), 520)
            }
          }

          if (!aiMsgAdded) {
            aiMsgAdded = true
            setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: chunk, isPartial: false }])
          } else {
            setMessages(prev => prev.map(item =>
              item.id === aiMsgId ? { ...item, content: item.content + chunk } : item
            ))
          }
        },
        onPartial: () => {
          gotPartialEvent = true
        },
        onDone: (meta) => {
          streamDoneMeta = meta
        },
      })

      // 若会话标题刚刚由后端生成（首消息后），更新展示
      if (!conversationTitle) {
        setConversationTitle(msg.slice(0, 30))
      }

      // partial + done(isPartial=true)
      if ((streamDoneMeta?.isPartial || gotPartialEvent) && aiMsgAdded) {
        setMessages(prev => prev.map(item =>
          item.id === aiMsgId ? { ...item, isPartial: true } : item
        ))
        setStreamNotice(streamDoneMeta?.errorMessage || '回答中断，已保存部分内容。')
      }

      await loadConversationList()
    } catch (err) {
      const isAborted = err?.name === 'AbortError' || controller.signal.aborted
      if (isAborted) {
        if (!aiMsgAdded) {
          setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: '（已停止生成）', isPartial: false }])
        }
      } else if (aiMsgAdded) {
        setMessages(prev => prev.map(item =>
          item.id === aiMsgId ? { ...item, isPartial: true } : item
        ))
        setStreamNotice(err?.message || '流式中断，已保存部分内容。')
        await loadConversationList()
      } else if (convId) {
        try {
          const syncRes = await sendMessage(convId, msg, selectedModel)
          const syncReply = syncRes?.assistantMessage?.content || syncRes?.reply || ''
          if (!syncReply) throw new Error('同步接口未返回有效回复')

          setMessages(prev => [...prev, {
            id: aiMsgId,
            role: 'ai',
            content: syncReply,
            isPartial: false,
          }])
          setStreamNotice('流式中断，已自动切换为同步回复。')
          await loadConversationList()
        } catch (fallbackErr) {
          setMessages(prev => [...prev, {
            id: aiMsgId,
            role: 'ai',
            content: '抱歉，AI 助手暂时无法响应，请稍后重试。',
            isPartial: false,
          }])
          message.error(fallbackErr?.message || '发送失败，请稍后重试')
        }
      } else {
        setMessages(prev => [...prev, {
          id: aiMsgId,
          role: 'ai',
          content: '抱歉，AI 助手暂时无法响应，请稍后重试。',
          isPartial: false,
        }])
      }
    } finally {
      abortCtrlRef.current = null
      setLoading(false)
      setIsTyping(false)
    }
  }, [
    inputVal,
    loading,
    projectId,
    contextType,
    conversationId,
    selectedModel,
    conversationTitle,
    loadConversationList,
  ])

  const recoverAgentPendingFromStatus = useCallback((statusPayload) => {
    const session = statusPayload?.session
    if (!session || typeof session !== 'object') return

    const sessionId = session.sessionId || session.id || null
    if (sessionId) setActiveSession(sessionId)

    const state = typeof (session.state || session.status) === 'string'
      ? (session.state || session.status).toLowerCase()
      : ''
    const callId = session.pendingCallId || session.pending_call_id
    const tool = session.pendingTool || session.pending_tool || ''
    const args = session.pendingArgs || session.pending_args || {}
    const preview = session.previewPatch || session.preview_patch || null
    const iteration = session.pendingIteration || session.pending_iteration || null
    const suggestedContinueRounds = Number.isFinite(session?.suggestedContinueRounds)
      ? session.suggestedContinueRounds
      : Number.isFinite(session?.suggested_continue_rounds)
        ? session.suggested_continue_rounds
        : Number.isFinite(iteration?.suggestedContinueRounds)
          ? iteration.suggestedContinueRounds
          : Number.isFinite(iteration?.suggested_continue_rounds)
            ? iteration.suggested_continue_rounds
            : 1

    if (state === 'paused_confirm' && callId) {
      setPendingConfirm({ callId, tool, args })
      setAgentState('paused_confirm')
      appendThinkingStep({
        phase: 'context_refresh',
        message: `已恢复会话，等待确认危险操作：${tool || 'unknown_tool'}。`,
      })
      return
    }

    if (state === 'paused_preview' && callId) {
      setPendingPreview({ callId, tool, preview })
      setAgentState('paused_preview')
      appendThinkingStep({
        phase: 'context_refresh',
        message: `已恢复会话，等待确认预览变更：${tool || 'hybrid_tool'}。`,
      })
      return
    }

    if (state === 'paused_iteration') {
      const iterationCallId = callId || iteration?.callId || iteration?.call_id
      if (iterationCallId) {
        setPendingIteration({
          callId: iterationCallId,
          round: session?.round ?? session?.currentRound ?? iteration?.round,
          maxRounds: session?.maxRounds ?? session?.max_rounds ?? iteration?.maxRounds ?? iteration?.max_rounds,
          suggestedContinueRounds,
        })
        setContinueRounds(Math.min(20, Math.max(1, Number(suggestedContinueRounds) || 1)))
        setAgentState('paused_iteration')
        appendThinkingStep({
          phase: 'context_refresh',
          round: session?.round ?? session?.currentRound ?? iteration?.round,
          message: '已恢复会话，等待继续迭代确认。',
        })
        return
      }
    }

    if (state === 'running') {
      setAgentState('running')
      appendThinkingStep({
        phase: 'context_refresh',
        message: '已恢复会话，Agent 正在继续执行。',
      })
      return
    }

    if (state === 'done') {
      setAgentState('done')
      appendThinkingStep({
        phase: 'finalizing',
        message: '会话已完成，可继续发起新任务。',
      })
      return
    }

    if (state === 'cancelled') {
      setAgentState('cancelled')
      setStreamNotice('Agent 会话已取消。')
      appendThinkingStep({
        phase: 'round_stopped',
        message: '会话已取消。',
      })
      return
    }

    setAgentState('idle')
  }, [
    appendThinkingStep,
    setActiveSession,
    setAgentState,
    setPendingConfirm,
    setPendingPreview,
    setPendingIteration,
  ])

  const handleAgentSend = useCallback(async (text) => {
    const msg = (text ?? inputVal).trim()
    if (!msg || loading || !projectId) return
    if (msg.length > 2000) {
      message.warning('消息长度不能超过 2000 字符')
      return
    }

    const userMsgId = Date.now()
    const aiMsgId = userMsgId + 1
    let convId = conversationId

    setInputVal('')
    setStreamNotice('')
    resetThinkingTrail()
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: msg, isPartial: false }])

    const controller = new AbortController()
    abortCtrlRef.current = controller
    setLoading(true)
    setIsTyping(true)
    resetAgentUiState()
    setAgentState('running')
    let aiMsgAdded = false
    let doneMeta = null

    try {
      if (!convId) {
        const conv = await createConversation(projectId, contextType)
        convId = conv?.id
        if (!convId) throw new Error('创建 Agent 会话失败，请重试')
        saveConversationId(projectId, contextType, convId, 'agent')
        setConversationMode(projectId, contextType, convId, 'agent')
        setConversationId(convId)
        setConversationTitle(conv?.title || null)
      } else {
        setConversationMode(projectId, contextType, convId, 'agent')
      }

      const agentRequestPayload = buildAgentRequestPayload(contextType)
      if (agentRequestPayload.readOnly !== true && !Number.isFinite(agentRequestPayload.clientRevision)) {
        throw new Error('当前图版本尚未同步，请稍后重试。')
      }

      await sendAgentStream(convId, msg, selectedModel, {
        ...agentRequestPayload,
        signal: controller.signal,
        onStarted: (event) => {
          streamStateRef.current.startedAt = Date.now()
          setActiveSession(event?.sessionId || null)
          setAgentState('running')
          setIsTyping(true)
          appendThinkingStep({
            phase: 'context_loaded',
            message: '已建立 Agent 会话，正在分析你的请求与图上下文。',
          })
        },
        onHeartbeat: () => {
          streamStateRef.current.lastHeartbeatAt = Date.now()
        },
        onThinking: (event) => {
          appendThinkingStep(event)
        },
        onChunk: (chunk) => {
          if (!chunk) return
          setIsTyping(false)

          if (!autoExpandedRef.current) {
            autoExpandedRef.current = true
            const vh = window.innerHeight
            const currentH = panelSizeRef.current.height
            if (currentH < vh * PANEL_EXPAND_THRESH) {
              const targetH = Math.min(
                Math.round(vh * PANEL_EXPAND_RATIO),
                vh - TOP_NAV_H - EDGE_PAD * 2,
              )
              const minH = Math.min(PANEL_MIN_H, Math.max(360, window.innerHeight - TOP_NAV_H - EDGE_PAD * 2))
              setIsAutoExpanding(true)
              setPanelSize(prev => ({ ...prev, height: Math.max(targetH, minH) }))
              setTimeout(() => setIsAutoExpanding(false), 520)
            }
          }

          if (!aiMsgAdded) {
            aiMsgAdded = true
            setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: chunk, isPartial: false }])
          } else {
            setMessages(prev => prev.map(item =>
              item.id === aiMsgId ? { ...item, content: item.content + chunk } : item
            ))
          }
        },
        onClientTool: (event) => {
          executeClientTool(event.tool, event.args || {})
        },
        onToolCallStart: (event) => {
          const affected = Array.isArray(event?.affectedNodes) ? event.affectedNodes : []
          if (affected.length) {
            useAgentUIStore.getState().setHighlight(affected, 'agent-primary')
          }
          appendThinkingStep({
            phase: 'tool_execution',
            message: `开始执行工具 ${event?.tool || 'unknown_tool'}`,
          })
        },
        onToolCallResult: (event) => {
          const schemaVersion = Number.isFinite(event?.schemaVersion) ? Math.trunc(event.schemaVersion) : 1
          if (schemaVersion !== 1) {
            setStreamNotice(`收到暂不支持的工具结果版本 v${schemaVersion}，已忽略该事件。`)
            return
          }

          const resultStatus = normalizeToolResultStatus(event)
          const statusLabel = getToolResultStatusLabel(resultStatus)
          useAgentUIStore.getState().clearHighlight()

          if (resultStatus === 'success' && event?.patch && contextType === 'faultTree') {
            editorStore.getState().applyGraphPatch?.(event.patch)
          }

          if (resultStatus === 'failed' && event?.error) {
            setStreamNotice(`工具调用失败：${event.error}`)
          }

          const phaseByStatus = {
            success: 'round_summary',
            failed: 'model_error',
            cancelled: 'round_stopped',
            discarded: 'round_stopped',
            client_only: 'tool_execution',
          }
          appendThinkingStep({
            phase: phaseByStatus[resultStatus] || 'round_summary',
            message: `${event?.tool || 'tool'} ${statusLabel}${event?.summary ? `：${event.summary}` : ''}`,
          })

          if (event?.summary && aiMsgAdded) {
            setMessages(prev => prev.map(item =>
              item.id === aiMsgId
                ? { ...item, content: `${item.content}\n\n- [${statusLabel}] ${event.summary}` }
                : item
            ))
          }
        },
        onToolCallError: (event) => {
          useAgentUIStore.getState().clearHighlight()
          appendThinkingStep({
            phase: 'model_error',
            message: `工具 ${event?.tool || 'unknown_tool'} 执行失败${event?.error ? `：${event.error}` : ''}`,
          })
          if (event?.error) {
            setStreamNotice(`工具调用失败：${event.error}`)
          }
        },
        onToolCallCancelled: (event) => {
          useAgentUIStore.getState().clearHighlight()
          appendThinkingStep({
            phase: 'round_stopped',
            message: `工具 ${event?.tool || 'unknown_tool'} 已取消。`,
          })
        },
        onConfirmRequired: (event) => {
          setPendingConfirm(event)
          setAgentState('paused_confirm')
          appendThinkingStep({
            phase: 'round_limit_reached',
            message: `等待你确认危险操作：${event?.tool || 'unknown_tool'}`,
          })
          const affected = Array.isArray(event?.affectedNodes) ? event.affectedNodes : []
          if (affected.length) {
            useAgentUIStore.getState().setHighlight(affected, 'agent-warning')
          }
        },
        onPreviewReady: (event) => {
          const wrapped = {
            callId: event?.callId,
            tool: event?.tool,
            preview: event?.preview || null,
          }
          setPendingPreview(wrapped)
          setAgentState('paused_preview')
          appendThinkingStep({
            phase: 'tool_plan',
            message: `已生成预览方案，等待你确认提交（${event?.tool || 'hybrid_tool'}）。`,
          })
        },
        onPreviewDiscarded: () => {
          clearPendingPreview()
          setAgentState('running')
          appendThinkingStep({
            phase: 'round_stopped',
            message: '已放弃当前预览方案，继续后续流程。',
          })
        },
        onIterationLimitReached: (event) => {
          setPendingIteration(event)
          setContinueRounds(Number.isFinite(event?.suggestedContinueRounds) ? event.suggestedContinueRounds : 1)
          setAgentState('paused_iteration')
          appendThinkingStep({
            phase: 'round_limit_reached',
            round: event?.round,
            message: `达到最大轮次 ${event?.maxRounds || '-'}，等待继续迭代确认。`,
          })
        },
        onIterationResumed: (event) => {
          clearPendingIteration()
          setAgentState('running')
          appendThinkingStep({
            phase: 'round_resumed',
            round: event?.round,
            message: `继续迭代 ${event?.continueRounds || 1} 轮，新的上限 ${event?.newMaxRounds || '-'}`,
          })
        },
        onIterationStopped: (event) => {
          clearPendingIteration()
          setAgentState('running')
          appendThinkingStep({
            phase: 'round_stopped',
            round: event?.round,
            message: `已停止继续迭代（当前上限 ${event?.maxRounds || '-'}）。`,
          })
        },
        onDone: (event) => {
          doneMeta = event
          useAgentUIStore.getState().clearHighlight()
          useAgentUIStore.getState().clearLayoutPreview()
          useAgentUIStore.getState().clearAllAnnotations()
          if (event?.errorCode) {
            setStreamNotice(resolveAgentErrorMessage(event, `Agent 已结束，错误码 ${event.errorCode}`))
            appendThinkingStep({
              phase: 'model_error',
              message: resolveAgentErrorMessage(event, '执行结束，但存在错误。'),
            })
            return
          }
          appendThinkingStep({
            phase: 'finalizing',
            message: 'Agent 执行完成，结果已同步到画布。',
          })
        },
      })

      if (!conversationTitle) {
        setConversationTitle(msg.slice(0, 30))
      }

      if (doneMeta?.errorCode && aiMsgAdded) {
        setMessages(prev => prev.map(item =>
          item.id === aiMsgId
            ? { ...item, isPartial: true }
            : item
        ))
      }

      await loadConversationList()
    } catch (err) {
      const isAborted = err?.name === 'AbortError' || controller.signal.aborted
      if (isAborted) {
        appendThinkingStep({
          phase: 'round_stopped',
          message: '你已停止本次 Agent 执行。',
        })
        if (!aiMsgAdded) {
          setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: '（已停止执行）', isPartial: false }])
        }
      } else {
        const sessionId = useAgentUIStore.getState().activeSessionId
        if (sessionId) {
          try {
            const statusPayload = await getAgentSessionStatus(sessionId)
            recoverAgentPendingFromStatus(statusPayload)
          } catch {
            // recovery is best effort
          }
        }

        if (aiMsgAdded) {
          setMessages(prev => prev.map(item =>
            item.id === aiMsgId ? { ...item, isPartial: true } : item
          ))
          setStreamNotice(resolveAgentErrorMessage(err, 'Agent 流式中断，已保留部分结果。'))
        } else {
          setMessages(prev => [...prev, {
            id: aiMsgId,
            role: 'ai',
            content: '抱歉，Agent 暂时无法响应，请稍后重试。',
            isPartial: false,
          }])
          setStreamNotice(resolveAgentErrorMessage(err, 'Agent 请求失败，请稍后重试。'))
        }
        appendThinkingStep({
          phase: 'model_error',
          message: resolveAgentErrorMessage(err, 'Agent 执行失败，请稍后重试。'),
        })
      }
    } finally {
      abortCtrlRef.current = null
      setLoading(false)
      setIsTyping(false)
      const uiState = useAgentUIStore.getState()
      if (!uiState.pendingConfirm && !uiState.pendingPreview && !uiState.pendingIteration) {
        setAgentState('idle')
      }
      await loadConversationList()
    }
  }, [
    inputVal,
    loading,
    projectId,
    contextType,
    conversationId,
    selectedModel,
    conversationTitle,
    appendThinkingStep,
    clearPendingIteration,
    clearPendingPreview,
    loadConversationList,
    recoverAgentPendingFromStatus,
    resetThinkingTrail,
    resetAgentUiState,
    setActiveSession,
    setAgentState,
    setPendingConfirm,
    setPendingIteration,
    setPendingPreview,
  ])

  const handleSendByMode = useCallback((text) => {
    if (effectiveMode === 'agent' && supportsAgent) {
      return handleAgentSend(text)
    }
    return handleSend(text)
  }, [effectiveMode, supportsAgent, handleAgentSend, handleSend])

  const handleModeSwitch = useCallback((nextMode) => {
    if (!supportsAgent || (nextMode !== 'ask' && nextMode !== 'agent')) return
    if (nextMode === chatMode) return
    if (loading) {
      message.warning('请等待当前回复结束后再切换模式')
      return
    }

    abortCtrlRef.current?.abort()
    resetConversationState()
    resetAgentUiState()
    setContinueRounds(1)
    setChatMode(nextMode)
  }, [supportsAgent, chatMode, loading, resetConversationState, resetAgentUiState])

  const handleConfirmRequired = useCallback(async (approved) => {
    if (!activeSessionId || !pendingConfirm?.callId) return
    try {
      await confirmAgentAction(activeSessionId, {
        callId: pendingConfirm.callId,
        approved,
      })
      clearPendingConfirm()
      useAgentUIStore.getState().clearHighlight()
      setAgentState('running')
      if (!approved) {
        setStreamNotice('已取消本次高风险操作。')
        appendThinkingStep({
          phase: 'round_stopped',
          message: `你已拒绝危险操作：${pendingConfirm.tool || 'unknown_tool'}。`,
        })
        return
      }
      appendThinkingStep({
        phase: 'round_resumed',
        message: `你已确认继续执行：${pendingConfirm.tool || 'unknown_tool'}。`,
      })
    } catch (err) {
      message.error(err?.message || '确认操作失败')
    }
  }, [activeSessionId, pendingConfirm, clearPendingConfirm, setAgentState, appendThinkingStep])

  const handlePreviewApply = useCallback(async (eventCallId, checkedIds = []) => {
    const callId = eventCallId || pendingPreview?.callId
    const approvedOps = Array.isArray(checkedIds)
      ? checkedIds.filter((id) => typeof id === 'string' && id.trim())
      : []

    if (!activeSessionId || !callId) return
    if (!approvedOps.length) {
      message.warning('请至少选择一项预览变更')
      return
    }
    try {
      await confirmAgentAction(activeSessionId, {
        callId,
        approved: true,
        approvedOps,
      })
      clearPendingPreview()
      setAgentState('running')
      appendThinkingStep({
        phase: 'round_resumed',
        message: `已应用 ${approvedOps.length} 项预览变更，继续执行。`,
      })
    } catch (err) {
      message.error(err?.message || '提交预览确认失败')
    }
  }, [activeSessionId, pendingPreview, clearPendingPreview, setAgentState, appendThinkingStep])

  const handlePreviewDiscard = useCallback(async (eventCallId) => {
    const callId = eventCallId || pendingPreview?.callId
    if (!activeSessionId || !callId) return
    try {
      await confirmAgentAction(activeSessionId, {
        callId,
        approved: false,
      })
      clearPendingPreview()
      setAgentState('running')
      appendThinkingStep({
        phase: 'round_stopped',
        message: '已放弃本次预览提交，Agent 将继续其他步骤。',
      })
    } catch (err) {
      message.error(err?.message || '放弃预览失败')
    }
  }, [activeSessionId, pendingPreview, clearPendingPreview, setAgentState, appendThinkingStep])

  useEffect(() => {
    if (!supportsAgent) return

    const onApply = (event) => {
      const callId = event?.detail?.callId
      const checkedIds = event?.detail?.checkedIds
      handlePreviewApply(callId, checkedIds)
    }

    const onDiscard = (event) => {
      const callId = event?.detail?.callId
      handlePreviewDiscard(callId)
    }

    window.addEventListener('agent:hybrid-preview-apply', onApply)
    window.addEventListener('agent:hybrid-preview-discard', onDiscard)

    return () => {
      window.removeEventListener('agent:hybrid-preview-apply', onApply)
      window.removeEventListener('agent:hybrid-preview-discard', onDiscard)
    }
  }, [supportsAgent, handlePreviewApply, handlePreviewDiscard])

  const handleIterationDecision = useCallback(async (approved) => {
    if (!activeSessionId || !pendingIteration?.callId) return
    try {
      await confirmAgentAction(activeSessionId, {
        callId: pendingIteration.callId,
        approved,
        continueRounds: approved ? Math.min(20, Math.max(1, Number(continueRounds) || 1)) : undefined,
      })
      clearPendingIteration()
      setAgentState('running')
      if (!approved) {
        setStreamNotice('已停止继续迭代。')
        appendThinkingStep({
          phase: 'round_stopped',
          message: '你已选择停止继续迭代。',
        })
        return
      }
      appendThinkingStep({
        phase: 'round_resumed',
        message: `你已同意继续 ${Math.min(20, Math.max(1, Number(continueRounds) || 1))} 轮迭代。`,
      })
    } catch (err) {
      message.error(err?.message || '提交迭代确认失败')
    }
  }, [activeSessionId, pendingIteration, continueRounds, clearPendingIteration, setAgentState, appendThinkingStep])

  const handleClear = useCallback(() => {
    setMessages([])
    setNextCursor(null)
    setHasMoreHistory(false)
    setStreamNotice('')
    setContinueRounds(1)
    resetThinkingTrail()
    resetAgentUiState()
  }, [resetAgentUiState, resetThinkingTrail])

  // ── 按钮拖拽 ─────────────────────────────────────────────────
  const onBtnMouseMove = useCallback((e) => {
    const d = btnDrag.current
    if (!d.active) return
    const dx = e.clientX - d.startMX
    const dy = e.clientY - d.startMY
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    d.moved = true
    setPos(clampBtnPos(d.startBX + dx, d.startBY + dy))
  }, [])

  const onBtnMouseUp = useCallback((e) => {
    const d = btnDrag.current
    if (!d.active) return
    d.active = false
    document.removeEventListener('mousemove', onBtnMouseMove)
    document.removeEventListener('mouseup',   onBtnMouseUp)
    if (!d.moved) return
    const raw = clampBtnPos(
      d.startBX + (e.clientX - d.startMX),
      d.startBY + (e.clientY - d.startMY),
    )
    const snapToX = raw.x + BTN_SIZE / 2 < window.innerWidth / 2
      ? EDGE_PAD
      : window.innerWidth - BTN_SIZE - EDGE_PAD
    const snapped = { x: snapToX, y: raw.y }
    setIsSnapping(true)
    setPos(snapped)
    try {
      localStorage.setItem('ai_assistant_position', JSON.stringify(snapped))
    } catch {
      // ignore storage write failures
    }
    setTimeout(() => setIsSnapping(false), SNAP_MS + 50)
  }, [onBtnMouseMove])

  const onBtnMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const d   = btnDrag.current
    d.active  = true
    d.moved   = false
    d.startMX = e.clientX
    d.startMY = e.clientY
    d.startBX = pos.x
    d.startBY = pos.y
    document.addEventListener('mousemove', onBtnMouseMove)
    document.addEventListener('mouseup',   onBtnMouseUp)
  }, [pos, onBtnMouseMove, onBtnMouseUp])

  const onBtnClick = useCallback(() => {
    if (btnDrag.current.moved) return
    setShowBubble(false)
    setIsOpen(v => !v)
  }, [])

  // ── 面板边缘缩放 ─────────────────────────────────────────────
  const onResizeMouseMove = useCallback((e) => {
    const r = resizeRef.current
    if (!r.active) return
    const dx  = e.clientX - r.startMX
    const dy  = e.clientY - r.startMY
    const maxW = Math.floor(window.innerWidth  * 0.42)
    const maxH = window.innerHeight - TOP_NAV_H - EDGE_PAD * 2
    const minW = Math.min(PANEL_MIN_W, Math.max(280, window.innerWidth - EDGE_PAD * 2))
    const minH = Math.min(PANEL_MIN_H, Math.max(360, window.innerHeight - TOP_NAV_H - EDGE_PAD * 2))
    setPanelSize(prev => ({
      width:  (r.edge === 'right'  || r.edge === 'corner')
        ? Math.min(maxW, Math.max(minW, r.startW + dx))
        : prev.width,
      height: (r.edge === 'bottom' || r.edge === 'corner')
        ? Math.min(maxH, Math.max(minH, r.startH + dy))
        : prev.height,
    }))
  }, [])

  const onResizeMouseUp = useCallback(() => {
    resizeRef.current.active = false
    document.removeEventListener('mousemove', onResizeMouseMove)
    document.removeEventListener('mouseup',   onResizeMouseUp)
  }, [onResizeMouseMove])

  const startResize = useCallback((edge) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    const r   = resizeRef.current
    r.active  = true
    r.edge    = edge
    r.startMX = e.clientX
    r.startMY = e.clientY
    r.startW  = panelSize.width
    r.startH  = panelSize.height
    document.addEventListener('mousemove', onResizeMouseMove)
    document.addEventListener('mouseup',   onResizeMouseUp)
  }, [panelSize, onResizeMouseMove, onResizeMouseUp])

  // ── 派生值 ───────────────────────────────────────────────────
  const panelPos    = calcPanelPos(pos.x, pos.y, panelSize.width, panelSize.height)
  const panelMinW   = Math.min(PANEL_MIN_W, Math.max(280, window.innerWidth - EDGE_PAD * 2))
  const panelMinH   = Math.min(PANEL_MIN_H, Math.max(360, window.innerHeight - TOP_NAV_H - EDGE_PAD * 2))
  const bubbleRight = pos.x < BUBBLE_W + EDGE_PAD * 2
  const bubbleTop   = pos.y + BTN_SIZE / 2 - 19

  return (
    <>
      {/* ── 全局微样式 ──────────────────────────────────────────── */}
      <style>{`
        .ai-quick-scroll::-webkit-scrollbar { display: none; }
        .ai-quick-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .ai-input-box:focus-within {
          border-color: #60a5fa !important;
          box-shadow: 0 0 0 4px rgba(59,130,246,0.13) !important;
        }
        .ai-quick-btn:hover:not(:disabled) {
          background: #deeaff !important;
          border-color: #91caff !important;
        }
        .ai-conv-refresh:hover:not(:disabled) {
          background: rgba(22,119,255,0.08) !important;
        }
        .ai-model-sel .ant-select-selector {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          padding-left: 4px !important;
        }
        .ai-model-sel .ant-select-selection-item {
          color: #475569;
          font-size: 11px;
          font-weight: 600;
        }
        .ai-model-sel .ant-select-arrow { color: #aab0c0; }
        .ai-conv-sel .ant-select-selector {
          min-height: 28px !important;
          border-radius: 9px !important;
          border-color: #d9e5ff !important;
          background: #ffffff !important;
        }
        .ai-conv-sel .ant-select-selection-item {
          white-space: normal;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.35;
          color: #334155;
        }
        .ai-conv-sel-dropdown .ant-select-item-option-content {
          white-space: normal;
          word-break: break-word;
          line-height: 1.45;
        }
        .agent-thinking-inline-body::-webkit-scrollbar {
          width: 6px;
        }
        .agent-thinking-inline-body::-webkit-scrollbar-thumb {
          background: rgba(148,163,184,0.45);
          border-radius: 999px;
        }
        .ai-msg-avatar {
          width: 28px;
          height: 28px;
          border-radius: 9px;
          background: linear-gradient(135deg, #1677ff, #60a5fa);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-right: 8px;
          margin-top: 2px;
          box-shadow: 0 4px 10px rgba(22,119,255,0.25);
        }
        .ai-msg-wrap {
          max-width: 88%;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
        .ai-msg-wrap-user {
          align-items: flex-end;
        }
        .ai-msg {
          width: 100%;
          padding: 9px 12px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.6;
          word-break: break-word;
        }
        .ai-msg-assistant {
          border-radius: 14px 14px 14px 4px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #0f172a;
          box-shadow: 0 1px 4px rgba(15,23,42,0.06);
        }
        .ai-msg-user {
          border-radius: 14px 14px 4px 14px;
          background: linear-gradient(135deg,#1677ff,#4096ff);
          color: #fff;
          box-shadow: 0 4px 12px rgba(22,119,255,0.28);
        }
        .ai-copy-btn {
          margin-top: 4px;
          border: none;
          background: transparent;
          border-radius: 6px;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          opacity: 0;
          padding: 2px;
          transition: all 0.2s ease;
        }
        .ai-copy-btn.is-user {
          margin-right: 8px;
        }
        .ai-msg-wrap:not(.ai-msg-wrap-user) .ai-copy-btn {
          margin-left: 8px;
        }
        .ai-msg-wrap:hover .ai-copy-btn {
          opacity: 0.76;
        }
        .agent-thinking-inline {
          margin-bottom: 8px;
          border: 1px solid #dbeafe;
          background: #eff6ff;
          border-radius: 10px;
          overflow: hidden;
        }
        .agent-thinking-inline-head {
          width: 100%;
          border: none;
          background: transparent;
          padding: 7px 9px;
          display: flex;
          align-items: center;
          gap: 6px;
          text-align: left;
          cursor: pointer;
          color: #1d4ed8;
        }
        .agent-thinking-inline-arrow {
          width: 14px;
          display: inline-flex;
          justify-content: center;
          color: #475569;
        }
        .agent-thinking-inline-title {
          font-size: 11px;
          font-weight: 700;
          color: #1e3a8a;
        }
        .agent-thinking-inline-body {
          max-height: 190px;
          overflow-y: auto;
          padding: 2px 9px 8px;
        }
        .agent-thinking-inline-item {
          position: relative;
          display: flex;
          gap: 8px;
          padding: 4px 0 7px;
        }
        .agent-thinking-inline-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          margin-top: 4px;
          flex-shrink: 0;
        }
        .agent-thinking-inline-line {
          position: absolute;
          left: 3px;
          top: 14px;
          bottom: -3px;
          width: 1px;
          background: #bfdbfe;
        }
        .agent-thinking-inline-main {
          flex: 1;
          min-width: 0;
        }
        .agent-thinking-inline-item-head {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: space-between;
          font-size: 10px;
          color: #64748b;
          margin-bottom: 2px;
        }
        .agent-thinking-inline-item-msg {
          font-size: 11px;
          color: #334155;
          line-height: 1.55;
        }
        .agent-thinking-inline-empty {
          font-size: 11px;
          color: #475569;
          line-height: 1.6;
        }
        .agent-thinking-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #13a8a8;
          box-shadow: 0 0 0 0 rgba(19,168,168,0.45);
          animation: agent-thinking-pulse 1.35s ease-out infinite;
        }
        @keyframes agent-thinking-pulse {
          0% { box-shadow: 0 0 0 0 rgba(19,168,168,0.45); }
          70% { box-shadow: 0 0 0 7px rgba(19,168,168,0); }
          100% { box-shadow: 0 0 0 0 rgba(19,168,168,0); }
        }
      `}</style>

      {/* ── 对话面板 ─────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="ai-panel-enter"
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left:   panelPos.left,
            top:    panelPos.top,
            width:  panelSize.width,
            height: panelSize.height,
            zIndex: 1001,
            borderRadius: 20,
            background: '#fff',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 32px 72px rgba(0,0,0,0.14), 0 8px 24px rgba(22,119,255,0.07)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            minWidth: panelMinW, minHeight: panelMinH,
            transition: isAutoExpanding
              ? 'height 0.45s cubic-bezier(0.34,1.3,0.64,1)'
              : 'none',
          }}
        >
          {/* ── 标题栏 ────────────────────────────────────────── */}
          <div style={{
            padding: '9px 14px 8px',
            background: 'linear-gradient(120deg,#0f2a5f 0%,#1d4ed8 42%,#3b82f6 100%)',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div style={{ flex: 1, minWidth: 0 ,paddingLeft: 8 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15.5, lineHeight: 1.2, letterSpacing: 0.2 }}>
                {CONTEXT_LABELS[contextType] ?? 'AI 助手'}
              </div>
              {supportsAgent && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'inline-flex', borderRadius: 999, background: 'rgba(255,255,255,0.2)', padding: 2, border: '1px solid rgba(255,255,255,0.32)' }}>
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('ask')}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontSize: 11,
                        color: '#fff',
                        fontWeight: effectiveMode === 'ask' ? 700 : 500,
                        background: effectiveMode === 'ask' ? 'rgba(255,255,255,0.34)' : 'transparent',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      disabled={loading}
                    >
                      Ask
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('agent')}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontSize: 11,
                        color: '#fff',
                        fontWeight: effectiveMode === 'agent' ? 700 : 500,
                        background: effectiveMode === 'agent' ? 'rgba(255,255,255,0.34)' : 'transparent',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      disabled={loading}
                    >
                      Agent
                    </button>
                  </div>
                  {effectiveMode === 'agent' && (
                    <Tag style={{ marginInlineEnd: 0, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 10, borderRadius: 999 }}>
                      {AGENT_STATE_LABELS[agentState] || agentState}
                    </Tag>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              <Tooltip title="新建对话">
                <button onClick={handleNewConversation} style={TOOL_BTN}>
                  <PlusOutlined style={{ fontSize: 13 }} />
                </button>
              </Tooltip>
              <Tooltip title="删除当前会话">
                <button
                  onClick={() => handleDeleteConversation(conversationId)}
                  disabled={!conversationId || deletingConversation || loading}
                  style={{
                    ...TOOL_BTN,
                    opacity: (!conversationId || deletingConversation || loading) ? 0.38 : 1,
                  }}
                >
                  <DeleteOutlined style={{ fontSize: 13 }} />
                </button>
              </Tooltip>
              <Tooltip title="清空显示">
                <button onClick={handleClear} style={TOOL_BTN}>
                  <ClearOutlined style={{ fontSize: 13 }} />
                </button>
              </Tooltip>
              <button onClick={() => setIsOpen(false)} style={{ ...TOOL_BTN, marginLeft: 3 }} title="关闭">
                <CloseOutlined style={{ fontSize: 13 }} />
              </button>
            </div>
          </div>

          {/* ── 历史会话选择（优雅版）────────────────────────── */}
          <div style={{
            padding: '5px 12px 5px',
            background: 'linear-gradient(180deg, #e6f4ff 0%, #ffffff 100%)',
            borderBottom: '1px solid rgba(22, 119, 255, 0.1)',
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 7,
              background: 'linear-gradient(135deg,#dbeafe,#eff6ff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 1px 3px rgba(22,119,255,0.12)',
            }}>
              <MessageOutlined style={{ fontSize: 13, color: '#1677ff' }} />
            </div>
            <Select
              size="medium"
              value={conversationId || undefined}
              onChange={handleSelectConversation}
              options={toConversationOptions(conversationList)}
              placeholder={conversationListLoading ? '加载中...' : '新对话（未保存）'}
              disabled={loading || deletingConversation}
              loading={conversationListLoading}
              allowClear
              onClear={handleNewConversation}
              style={{ flex: 1, fontSize: 11 }}
              popupMatchSelectWidth={false}
              className="ai-conv-sel"
              popupClassName="ai-conv-sel-dropdown"
            />
            <Tooltip title="刷新会话列表">
              <button
                onClick={loadConversationList}
                disabled={conversationListLoading}
                className="ai-conv-refresh"
                style={CONV_ICON_BTN}
              >
                <ReloadOutlined style={{
                  fontSize: 14,
                  color: conversationListLoading ? '#c8ccd8' : '#4096ff',
                  transition: 'color 0.2s',
                }} />
              </button>
            </Tooltip>
          </div>

          {/* ── 消息区 ───────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: 'scroll', padding: '12px 12px 8px', display: 'flex', flexDirection: 'column' }}>
            {streamNotice && (
              <div style={{
                marginBottom: 8, fontSize: 11, lineHeight: 1.6,
                color: '#ad6800', background: '#fff7e6',
                border: '1px solid #ffd591', borderRadius: 8,
                padding: '6px 10px',
              }}>
                {streamNotice}
              </div>
            )}

            {/* 加载更多历史 */}
            {hasMoreHistory && (
              <div style={{ textAlign: 'center', padding: '4px 0 10px', flexShrink: 0 }}>
                <button
                  onClick={handleLoadMore}
                  disabled={historyLoading}
                  style={{
                    border: '1px solid #d0e4ff', background: '#f0f7ff',
                    color: '#1677ff', borderRadius: 20, padding: '3px 18px',
                    fontSize: 11, cursor: historyLoading ? 'not-allowed' : 'pointer',
                    opacity: historyLoading ? 0.6 : 1, transition: 'opacity 0.15s',
                  }}
                >
                  {historyLoading ? '加载中...' : '↑ 加载更多'}
                </button>
              </div>
            )}

            {/* 历史加载中（空消息列表） */}
            {historyLoading && messages.length === 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <Spin size="small" />
              </div>
            )}

            {/* 空状态 */}
            {messages.length === 0 && !loading && !historyLoading && (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 12, paddingBottom: 20,
              }}>
                <div style={{
                  width: 58, height: 58, borderRadius: 16,
                  background: 'linear-gradient(135deg,#e0ecff,#dbeafe 45%,#eff6ff)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 18px rgba(22,119,255,0.15)',
                }}>
                  <RobotOutlined style={{ fontSize: 27, color: '#60a5fa' }} />
                </div>
                <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.8, color: '#94a3b8' }}>
                  欢迎使用{CONTEXT_LABELS[contextType]}<br />
                  <span style={{ fontSize: 11 }}>可以选择快捷提问，或直接描述你的任务目标</span>
                </div>
              </div>
            )}

            {messages.map(m => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                isPartial={m.isPartial}
                agentSteps={thinkingSteps}
                thinkingExpanded={thinkingExpanded}
                onToggleThinking={() => setThinkingExpanded((prev) => !prev)}
                thinkingRunning={loading || agentState === 'running'}
                showThinkingInline={
                  effectiveMode === 'agent'
                  && m.role === 'ai'
                  && messages[messages.length - 1]?.id === m.id
                  && thinkingSteps.length > 0
                }
              />
            ))}

            {isTyping && (
              effectiveMode === 'agent' ? (
                <AgentThinkingBubble
                  steps={thinkingSteps}
                  expanded={thinkingExpanded}
                  running
                  onToggleExpand={() => setThinkingExpanded((prev) => !prev)}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div className="ai-msg-avatar">
                    <RobotOutlined style={{ color: '#fff', fontSize: 12 }} />
                  </div>
                  <div style={{
                    padding: '8px 14px', background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px 12px 12px 4px',
                    display: 'flex', alignItems: 'center', gap: 7,
                  }}>
                    <Spin size="small" />
                    <span style={{ fontSize: 11, color: '#64748b' }}>AI 助手正在思考...</span>
                  </div>
                </div>
              )
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── 快捷提问（水平滚动，紧贴输入框上方）────────── */}
          {quickQuestions.length > 0 && (
            <div style={{
              padding: '4px 15px',
              borderRadius: 20,
              borderTop: '1px solid rgba(0,0,0,0.05)',
              flexShrink: 0,
              background: '#fafbff',
            }}>
              <div
                className="ai-quick-scroll"
                style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 1 }}
              >
                {quickQuestions.map(q => (
                  <button
                    key={q.id}
                    onClick={() => !loading && !deletingConversation && handleSendByMode(q.question)}
                    disabled={loading || deletingConversation}
                    className="ai-quick-btn"
                    style={{
                      flexShrink: 0,
                      padding: '3px 11px',
                      borderRadius: 20,
                      border: '1px solid #cfe2ff',
                      background: (loading || deletingConversation) ? '#f5f6fa' : '#eef4ff',
                      color: (loading || deletingConversation) ? '#c0c4d0' : '#1677ff',
                      fontSize: 11,
                      cursor: (loading || deletingConversation) ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                      lineHeight: '20px',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 输入区（ChatGPT / Claude 风格）──────────────── */}
          <div style={{ padding: '1px 12px 10px', flexShrink: 0, background: '#fff' }}>
            <div
              className="ai-input-box"
              style={{
                border: '1.5px solid #dde3ef',
                borderRadius: 14,
                background: '#fff',
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                boxShadow: '0 2px 10px rgba(22,119,255,0.07)',
              }}
            >
              {/* 文本输入 */}
              <Input.TextArea
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onPressEnter={e => {
                  if (!e.shiftKey) {
                    e.preventDefault()
                    if (!loading && !deletingConversation) handleSendByMode()
                  }
                }}
                placeholder={effectiveMode === 'agent' ? '描述你希望 Agent 执行的编辑任务...' : '向 AI 助手提问...'}
                autoSize={{ minRows: 1, maxRows: 5 }}
                disabled={loading || deletingConversation}
                style={{
                  border: 'none', boxShadow: 'none',
                  borderRadius: 0, fontSize: 14,
                  resize: 'none', background: 'transparent',
                  padding: '8px 12px 6px', lineHeight: 1.45,
                }}
              />

              {/* 底部工具栏：模型选择 + 发送 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                borderRadius: '14px',
                padding: '4px 8px 6px',
                borderTop: '1px solid #f0f3fa',
                background: 'linear-gradient(180deg,#f8fbff,#f3f8ff)',
              }}>
                {models.length > 0 && (
                  <Select
                    size="small"
                    value={selectedModel}
                    onChange={setSelectedModel}
                    options={models}
                    disabled={loading || deletingConversation}
                    popupMatchSelectWidth={false}
                    className="ai-model-sel"
                    style={{ minWidth: 60, maxWidth: 160, fontSize: 13 }}
                  />
                )}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: '#c4c9d8', userSelect: 'none', letterSpacing: 0.2 }}>
                  ⇧↵ 换行
                </span>
                {loading ? (
                  <button
                    onClick={handleStop}
                    title="停止生成"
                    style={{
                      width: 30, height: 30, borderRadius: '50%',
                      border: 'none', flexShrink: 0,
                      background: 'linear-gradient(135deg,#ff4d4f,#ff7875)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(255,77,79,0.3)',
                    }}
                  >
                    <BorderOutlined style={{ fontSize: 13, color: '#fff' }} />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSendByMode()}
                    disabled={!inputVal.trim() || deletingConversation}
                    style={{
                      width: 30, height: 30, borderRadius: '50%',
                      border: 'none', flexShrink: 0,
                      background: (inputVal.trim() && !deletingConversation)
                        ? 'linear-gradient(135deg,#1677ff,#4096ff)' : '#eef1f8',
                      cursor: (inputVal.trim() && !deletingConversation) ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: (inputVal.trim() && !deletingConversation)
                        ? '0 2px 8px rgba(22,119,255,0.3)' : 'none',
                      transition: 'background 0.18s, box-shadow 0.18s',
                    }}
                  >
                    <SendOutlined style={{
                      fontSize: 13,
                      color: (inputVal.trim() && !deletingConversation) ? '#fff' : '#c0c6d6',
                    }} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {effectiveMode === 'agent' && pendingConfirm && (
            <Modal
              open
              title={<span style={{ color: '#ff4d4f' }}>确认执行高风险操作</span>}
              okText="确认执行"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onOk={() => handleConfirmRequired(true)}
              onCancel={() => handleConfirmRequired(false)}
              destroyOnClose
            >
              <Alert
                type="warning"
                showIcon
                message={pendingConfirm.warning || '该操作可能影响现有结构，请确认后继续。'}
                style={{ marginBottom: 12 }}
              />
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                工具：{pendingConfirm.tool || '-'}
              </div>
              {Array.isArray(pendingConfirm.affectedNodes) && pendingConfirm.affectedNodes.length > 0 && (
                <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {pendingConfirm.affectedNodes.map((nodeId) => (
                    <Tag key={nodeId} style={{ marginBottom: 6 }}>{nodeId}</Tag>
                  ))}
                </div>
              )}
            </Modal>
          )}

          {effectiveMode === 'agent' && pendingIteration && (
            <Modal
              open
              title="达到最大迭代轮次"
              okText="继续迭代"
              cancelText="停止"
              onOk={() => handleIterationDecision(true)}
              onCancel={() => handleIterationDecision(false)}
              destroyOnClose
            >
              <div style={{ marginBottom: 10, fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
                当前轮次 {pendingIteration.round || '-'} / 上限 {pendingIteration.maxRounds || '-'}。
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: '#374151' }}>继续轮数</span>
                <InputNumber
                  min={1}
                  max={20}
                  value={continueRounds}
                  onChange={(value) => {
                    if (!Number.isFinite(value)) return
                    setContinueRounds(value)
                  }}
                />
                <span style={{ fontSize: 12, color: '#9ca3af' }}>建议范围 1 - 20</span>
              </div>
            </Modal>
          )}

          {/* ── 缩放把手 ─────────────────────────────────────── */}
          <div onMouseDown={startResize('right')}
            style={{ position: 'absolute', right: 0, top: 14, bottom: 14, width: 6, cursor: 'ew-resize', zIndex: 10 }} />
          <div onMouseDown={startResize('bottom')}
            style={{ position: 'absolute', bottom: 0, left: 14, right: 14, height: 6, cursor: 'ns-resize', zIndex: 10 }} />
          <div onMouseDown={startResize('corner')}
            style={{
              position: 'absolute', right: 0, bottom: 0, width: 16, height: 16,
              cursor: 'nwse-resize', zIndex: 11, borderBottomRightRadius: 18,
              background: 'linear-gradient(135deg,transparent 40%,rgba(22,119,255,0.18) 40%,rgba(22,119,255,0.18) 52%,transparent 52%,transparent 66%,rgba(22,119,255,0.18) 66%,rgba(22,119,255,0.18) 78%,transparent 78%)',
            }} />
        </div>
      )}

      {/* ── 闲置气泡提示（方向自适应） ───────────────────────── */}
      {showBubble && !isOpen && (
        bubbleRight ? (
          <div className="ai-bubble-enter-right" style={{
            position: 'fixed',
            left: pos.x + BTN_SIZE + 4,
            top: bubbleTop,
            zIndex: 1000, display: 'flex', alignItems: 'center',
            pointerEvents: 'none',
            filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.15))',
          }}>
            <div style={{ width: 0, height: 0, flexShrink: 0,
              borderTop: '7px solid transparent', borderBottom: '7px solid transparent',
              borderRight: '8px solid #fff' }}
            />
            <div style={BUBBLE_TEXT}>有什么问题？可以来问我</div>
          </div>
        ) : (
          <div className="ai-bubble-enter-left" style={{
            position: 'fixed',
            left: pos.x - BUBBLE_W - 4,
            top: bubbleTop,
            zIndex: 1000, display: 'flex', alignItems: 'center',
            pointerEvents: 'none',
            filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.15))',
          }}>
            <div style={BUBBLE_TEXT}>有什么问题？可以来问我</div>
            <div style={{ width: 0, height: 0, flexShrink: 0,
              borderTop: '7px solid transparent', borderBottom: '7px solid transparent',
              borderLeft: '8px solid #fff' }}
            />
          </div>
        )
      )}

      {/* ── 浮动按钮 ─────────────────────────────────────────── */}
      <div
        onMouseDown={onBtnMouseDown}
        onClick={onBtnClick}
        style={{
          position: 'fixed',
          left: pos.x,
          top:  pos.y,
          width:  BTN_SIZE,
          height: BTN_SIZE,
          zIndex: 1000,
          cursor: btnDrag.current.active ? 'grabbing' : 'grab',
          userSelect: 'none',
          transition: isSnapping
            ? `left ${SNAP_MS}ms cubic-bezier(0.34,1.56,0.64,1)`
            : 'none',
        }}
      >
        {!isOpen && <div className="ai-pulse-ring" />}
        <div style={{
          width: BTN_SIZE, height: BTN_SIZE, borderRadius: '50%',
          position: 'relative', zIndex: 1,
          background: isOpen
            ? 'linear-gradient(135deg,#0958d9,#1677ff)'
            : 'linear-gradient(135deg,#1677ff,#4096ff)',
          boxShadow: isOpen
            ? '0 4px 20px rgba(22,119,255,0.5)'
            : '0 4px 16px rgba(22,119,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s,box-shadow 0.2s,transform 0.15s',
          transform: isOpen ? 'scale(0.9)' : 'scale(1)',
        }}>
          <RobotOutlined style={{ color: '#fff', fontSize: 24 }} />
        </div>
      </div>
    </>
  )
})

// ─── 共享样式对象 ────────────────────────────────────────────────────
const TOOL_BTN = {
  background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 7,
  padding: '5px 5px', cursor: 'pointer', color: '#fff',
  display: 'flex', alignItems: 'center',
  transition: 'background 0.15s',
}

const CONV_ICON_BTN = {
  width: 26, height: 26,
  border: 'none', borderRadius: 7,
  background: 'transparent',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0,
  transition: 'background 0.15s',
  padding: 0,
}

const BUBBLE_TEXT = {
  background: '#fff', borderRadius: 10,
  padding: '7px 13px', fontSize: 13, color: '#1a1a1a',
  whiteSpace: 'nowrap', lineHeight: 1.5, fontWeight: 500,
}

export default AIAssistant
