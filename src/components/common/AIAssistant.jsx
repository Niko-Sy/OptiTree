/**
 * AIAssistant — 悬浮 AI 问答助手
 *
 * Props:
 *   contextType  'faultTree' | 'knowledgeGraph'
 *   getContext   () => { nodes, edges }  返回当前图数据
 *
 * 特性：
 *   - position:fixed 浮动圆形按钮，带脉冲波纹
 *   - 拖拽后吸附左/右侧（带弹性动画），位置持久化
 *   - 不遮挡顶部导航栏（56px）
 *   - 点击展开/关闭可拖拽缩放的对话面板
 *   - 10s 无操作显示方向自适应气泡提示
 *   - 调用 aiService.chatWithAI 获取 AI 回复
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Input, Spin, Tag, Tooltip } from 'antd'
import {
  RobotOutlined,
  CloseOutlined,
  SendOutlined,
  ClearOutlined,
} from '@ant-design/icons'
import { chatWithAI, getQuickQuestions } from '../../services/aiService'

// ─── 布局常量 ────────────────────────────────────────────────────────
const TOP_NAV_H      = 56    // h-14 顶部导航栏高度（px）
const BTN_SIZE       = 48
const EDGE_PAD       = 8     // 距屏幕边缘最小间距
const SNAP_MS        = 580   // 吸附弹性动画时长
const IDLE_MS        = 5000 // 无操作提示气泡触发时间
const BUBBLE_W       = 186   // 气泡估算总宽（文字 + 内边距 + 箭头）
const DRAG_THRESHOLD = 5
const PANEL_MIN_W    = 240
const PANEL_MIN_H    = 300

const CONTEXT_LABELS = {
  faultTree:      '故障树助手',
  knowledgeGraph: '知识图谱助手',
}

// ─── 响应式面板初始尺寸 ──────────────────────────────────────────────
function getInitialPanelSize() {
  const maxW = Math.floor(window.innerWidth  / 3)
  const maxH = window.innerHeight - TOP_NAV_H - EDGE_PAD
  return {
    width:  Math.min(Math.max(PANEL_MIN_W, Math.round(window.innerWidth  * 0.22)), maxW),
    height: Math.min(Math.max(PANEL_MIN_H, Math.round(window.innerHeight * 0.55)), maxH),
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
  } catch {}
  return clampBtnPos(window.innerWidth - 96, window.innerHeight - 96)
}

// 计算对话面板位置（不盖导航栏）
function calcPanelPos(btnX, btnY, panelW, panelH) {
  let left = btnX - panelW - EDGE_PAD
  let top  = btnY - panelH + BTN_SIZE

  if (left < EDGE_PAD) left = btnX + BTN_SIZE + EDGE_PAD
  if (top  < TOP_NAV_H + EDGE_PAD) top = TOP_NAV_H + EDGE_PAD
  if (left + panelW > window.innerWidth  - EDGE_PAD) left = window.innerWidth  - panelW - EDGE_PAD
  if (top  + panelH > window.innerHeight - EDGE_PAD) top  = window.innerHeight - panelH - EDGE_PAD

  return { left, top }
}

// ─── 消息气泡 ────────────────────────────────────────────────────────
function MessageBubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg,#1677ff,#4096ff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginRight: 8, marginTop: 2,
        }}>
          <RobotOutlined style={{ color: '#fff', fontSize: 13 }} />
        </div>
      )}
      <div style={{
        maxWidth: '75%', padding: '8px 12px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser ? 'linear-gradient(135deg,#1677ff,#4096ff)' : '#f0f2f5',
        color: isUser ? '#fff' : '#1a1a1a',
        fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word',
        boxShadow: isUser ? '0 2px 8px rgba(22,119,255,0.25)' : '0 1px 4px rgba(0,0,0,0.08)',
      }}>
        {content}
      </div>
    </div>
  )
}

// ─── 主组件 ──────────────────────────────────────────────────────────
export default function AIAssistant({ contextType = 'faultTree', getContext }) {
  const [pos,        setPos]        = useState(() => getSavedPosition())
  const [isSnapping, setIsSnapping] = useState(false)
  const [isOpen,     setIsOpen]     = useState(false)
  const [messages,   setMessages]   = useState([])
  const [inputVal,   setInputVal]   = useState('')
  const [loading,    setLoading]    = useState(false)
  const [showBubble, setShowBubble] = useState(false)
  const [panelSize,  setPanelSize]  = useState(getInitialPanelSize)

  const quickQuestions = getQuickQuestions(contextType)
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  // 按钮拖拽状态（ref 保持引用稳定）
  const btnDrag = useRef({ active: false, startMX: 0, startMY: 0, startBX: 0, startBY: 0, moved: false })
  // 面板缩放状态
  const resizeRef = useRef({ active: false, edge: null, startMX: 0, startMY: 0, startW: 0, startH: 0 })

  // ── 自动滚动到底部 ─────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── 窗口缩放时重新定位（吸附到最近侧边）+ 约束面板尺寸 ────
  useEffect(() => {
    const onResize = () => {
      setPos(prev => {
        const raw = clampBtnPos(prev.x, prev.y)
        // 保持吸附方向：按钮中心在左半屏吸附左侧，否则吸附右侧
        const snapToX = raw.x + BTN_SIZE / 2 < window.innerWidth / 2
          ? EDGE_PAD
          : window.innerWidth - BTN_SIZE - EDGE_PAD
        const snapped = { x: snapToX, y: raw.y }
        try { localStorage.setItem('ai_assistant_position', JSON.stringify(snapped)) } catch {}
        return snapped
      })
      setPanelSize(sz => {
        const maxW = Math.floor(window.innerWidth  / 3)
        const maxH = window.innerHeight - TOP_NAV_H - EDGE_PAD
        return {
          width:  Math.min(Math.max(PANEL_MIN_W, sz.width),  maxW),
          height: Math.min(Math.max(PANEL_MIN_H, sz.height), maxH),
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

  // ── 按钮拖拽：mousemove ──────────────────────────────────────
  const onBtnMouseMove = useCallback((e) => {
    const d = btnDrag.current
    if (!d.active) return
    const dx = e.clientX - d.startMX
    const dy = e.clientY - d.startMY
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    d.moved = true
    setPos(clampBtnPos(d.startBX + dx, d.startBY + dy))
  }, [])

  // ── 按钮拖拽：mouseup → 吸附到左/右侧 ──────────────────────
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
    // 按钮中心在左半屏则吸附左侧，否则吸附右侧
    const snapToX = raw.x + BTN_SIZE / 2 < window.innerWidth / 2
      ? EDGE_PAD
      : window.innerWidth - BTN_SIZE - EDGE_PAD
    const snapped = { x: snapToX, y: raw.y }

    setIsSnapping(true)
    setPos(snapped)
    try { localStorage.setItem('ai_assistant_position', JSON.stringify(snapped)) } catch {}
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

  // ── 面板边缘缩放 ────────────────────────────────────────────
  const onResizeMouseMove = useCallback((e) => {
    const r = resizeRef.current
    if (!r.active) return
    const dx  = e.clientX - r.startMX
    const dy  = e.clientY - r.startMY
    const maxW = Math.floor(window.innerWidth  / 3)
    const maxH = window.innerHeight - TOP_NAV_H - EDGE_PAD
    setPanelSize(prev => ({
      width:  (r.edge === 'right'  || r.edge === 'corner')
        ? Math.min(maxW, Math.max(PANEL_MIN_W, r.startW + dx))
        : prev.width,
      height: (r.edge === 'bottom' || r.edge === 'corner')
        ? Math.min(maxH, Math.max(PANEL_MIN_H, r.startH + dy))
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

  // ── 发送消息 ────────────────────────────────────────────────
  const handleSend = useCallback(async (text) => {
    const msg = (text ?? inputVal).trim()
    if (!msg || loading) return
    setInputVal('')
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: msg }])
    setLoading(true)
    try {
      const ctx = getContext?.() ?? {}
      const { reply } = await chatWithAI(ctx, contextType, msg)
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', content: reply }])
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'ai',
        content: '抱歉，AI 助手暂时无法响应，请稍后重试。',
      }])
    } finally {
      setLoading(false)
    }
  }, [inputVal, loading, getContext, contextType])

  const handleClear = useCallback(() => { setMessages([]); setInputVal('') }, [])

  // ── 派生值 ──────────────────────────────────────────────────
  const panelPos    = calcPanelPos(pos.x, pos.y, panelSize.width, panelSize.height)
  // 气泡方向：按钮左侧空间不足时向右弹出
  const bubbleRight = pos.x < BUBBLE_W + EDGE_PAD * 2
  const bubbleTop   = pos.y + BTN_SIZE / 2 - 19

  return (
    <>
      {/* ── 对话面板 ───────────────────────────────────────── */}
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
            borderRadius: 16,
            background: '#fff',
            boxShadow: '0 12px 40px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            minWidth: PANEL_MIN_W, minHeight: PANEL_MIN_H,
          }}
        >
          {/* 标题栏 */}
          <div style={{
            padding: '12px 14px',
            background: 'linear-gradient(135deg,#1677ff 0%,#4096ff 100%)',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RobotOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>
                {CONTEXT_LABELS[contextType] ?? 'AI 助手'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 10 }}>
                基于当前图结构智能解答
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Tooltip title="清空对话">
                <button onClick={handleClear} style={TOOL_BTN}>
                  <ClearOutlined style={{ fontSize: 13 }} />
                </button>
              </Tooltip>
              <button onClick={() => setIsOpen(false)} style={TOOL_BTN}>
                <CloseOutlined style={{ fontSize: 13 }} />
              </button>
            </div>
          </div>

          {/* 快捷提问区 */}
          <div style={{ padding: '8px 12px 5px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 5 }}>快捷提问</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {quickQuestions.map(q => (
                <Tag
                  key={q.id}
                  onClick={() => !loading && handleSend(q.question)}
                  style={{
                    cursor: loading ? 'not-allowed' : 'pointer',
                    borderRadius: 20, padding: '1px 9px',
                    fontSize: 11, lineHeight: '20px',
                    userSelect: 'none', opacity: loading ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                    borderColor: '#d0e4ff', color: '#1677ff', background: '#f0f7ff',
                  }}
                >
                  {q.label}
                </Tag>
              ))}
            </div>
          </div>

          {/* 消息区 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column' }}>
            {messages.length === 0 && !loading && (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: '#bfbfbf', gap: 8, paddingBottom: 16,
              }}>
                <RobotOutlined style={{ fontSize: 36, color: '#d0e4ff' }} />
                <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.7 }}>
                  你好！我是 AI 助手<br />选择快捷提问或直接输入
                </div>
              </div>
            )}
            {messages.map(m => <MessageBubble key={m.id} role={m.role} content={m.content} />)}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#1677ff,#4096ff)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <RobotOutlined style={{ color: '#fff', fontSize: 12 }} />
                </div>
                <div style={{
                  padding: '8px 12px', background: '#f0f2f5',
                  borderRadius: '12px 12px 12px 4px',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  <Spin size="small" />
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>AI 正在思考中...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入区 */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid #f0f0f0', flexShrink: 0, background: '#fafafa' }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
              <Input.TextArea
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="输入问题，Enter 发送，Shift+Enter 换行"
                autoSize={{ minRows: 1, maxRows: 4 }}
                disabled={loading}
                style={{ flex: 1, borderRadius: 9, fontSize: 12, resize: 'none', background: '#fff' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!inputVal.trim() || loading}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none', flexShrink: 0,
                  background: inputVal.trim() && !loading
                    ? 'linear-gradient(135deg,#1677ff,#4096ff)' : '#e8e8e8',
                  cursor: inputVal.trim() && !loading ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.18s',
                }}
              >
                <SendOutlined style={{ fontSize: 13, color: inputVal.trim() && !loading ? '#fff' : '#bfbfbf' }} />
              </button>
            </div>
          </div>

          {/* ── 缩放把手 ─────────────────────────────────── */}
          {/* 右边缘 */}
          <div onMouseDown={startResize('right')}
            style={{ position: 'absolute', right: 0, top: 14, bottom: 14, width: 6, cursor: 'ew-resize', zIndex: 10 }} />
          {/* 下边缘 */}
          <div onMouseDown={startResize('bottom')}
            style={{ position: 'absolute', bottom: 0, left: 14, right: 14, height: 6, cursor: 'ns-resize', zIndex: 10 }} />
          {/* 右下角（带视觉标记） */}
          <div onMouseDown={startResize('corner')}
            style={{
              position: 'absolute', right: 0, bottom: 0, width: 16, height: 16,
              cursor: 'nwse-resize', zIndex: 11, borderBottomRightRadius: 16,
              background: 'linear-gradient(135deg,transparent 40%,rgba(22,119,255,0.22) 40%,rgba(22,119,255,0.22) 52%,transparent 52%,transparent 66%,rgba(22,119,255,0.22) 66%,rgba(22,119,255,0.22) 78%,transparent 78%)',
            }} />
        </div>
      )}

      {/* ── 闲置气泡提示（方向自适应） ───────────────────────── */}
      {showBubble && !isOpen && (
        bubbleRight ? (
          // 按钮偏左 → 气泡向右弹出，左箭头指向按钮
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
          // 按钮偏右 → 气泡向左弹出，右箭头指向按钮
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
          // 吸附时启用弹性过渡动画（仅 X 轴）
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
}

// ─── 共享样式对象 ────────────────────────────────────────────────────
const TOOL_BTN = {
  background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
  padding: '5px 5px', cursor: 'pointer', color: '#fff',
  display: 'flex', alignItems: 'center',
}

const BUBBLE_TEXT = {
  background: '#fff', borderRadius: 10,
  padding: '7px 13px', fontSize: 13, color: '#1a1a1a',
  whiteSpace: 'nowrap', lineHeight: 1.5, fontWeight: 500,
}

