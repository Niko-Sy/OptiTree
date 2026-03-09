// 状态栏组件，显示节点数、连接数、历史记录位置，以及 AI 校验结果
import { useEditorStore as _useRawStore } from '../../store/editorStore'
import { CheckCircleOutlined, WarningOutlined } from '@ant-design/icons'

export default function StatusBar() {
  const nodeCount    = _useRawStore(s => s.nodes.length)
  const edgeCount    = _useRawStore(s => s.edges.length)
  const historyIndex = _useRawStore(s => s.historyIndex)
  const historyLen   = _useRawStore(s => s.history.length)
  const aiIssues     = _useRawStore(s => s.aiIssues)

  const errors   = aiIssues.filter(i => i.level === 'error').length
  const warnings = aiIssues.filter(i => i.level === 'warning').length
  const hasIssues = aiIssues.length > 0

  return (
    <div className="h-7 shrink-0 bg-gray-100 border-t border-gray-200 flex items-center justify-between px-4 text-xs text-gray-500">
      <div className="flex items-center gap-4">
        <span>节点: <strong className="text-gray-700">{nodeCount}</strong></span>
        <span>连接: <strong className="text-gray-700">{edgeCount}</strong></span>
        <span>历史: {historyIndex + 1} / {historyLen}</span>
      </div>

      <div className="flex items-center gap-1">
        {hasIssues ? (
          <>
            <WarningOutlined className="text-yellow-500" />
            <span className="text-yellow-600">
              AI 校验：{errors > 0 ? `${errors} 个错误` : ''}
              {errors > 0 && warnings > 0 ? '，' : ''}
              {warnings > 0 ? `${warnings} 个警告` : ''}
            </span>
          </>
        ) : !hasIssues && historyLen > 0 ? (
          <>
            <CheckCircleOutlined className="text-green-500" />
            <span className="text-green-600">就绪</span>
          </>
        ) : (
          <span>就绪</span>
        )}
      </div>
    </div>
  )
}
