import { useEditorStore } from '../../store/useEditorStore'
import { CheckCircleOutlined, WarningOutlined } from '@ant-design/icons'

export default function StatusBar() {
  const { state } = useEditorStore()

  const errors   = state.aiIssues.filter(i => i.level === 'error').length
  const warnings = state.aiIssues.filter(i => i.level === 'warning').length
  const hasIssues = state.aiIssues.length > 0

  return (
    <div className="h-7 shrink-0 bg-gray-100 border-t border-gray-200 flex items-center justify-between px-4 text-xs text-gray-500">
      <div className="flex items-center gap-4">
        <span>节点: <strong className="text-gray-700">{state.nodes.length}</strong></span>
        <span>连接: <strong className="text-gray-700">{state.edges.length}</strong></span>
        <span>历史: {state.historyIndex + 1} / {state.history.length}</span>
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
        ) : state.aiIssues.length === 0 && state.history.length > 0 ? (
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
