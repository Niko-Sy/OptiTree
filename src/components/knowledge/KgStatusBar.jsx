/**
 * KgStatusBar — 知识图谱编辑器底部状态栏
 * 样式与 StatusBar.jsx 保持一致（h-7，灰色底栏）
 */
import { useKnowledgeStore } from '../../store/useKnowledgeStore'

export default function KgStatusBar() {
  const { rfNodes, rfEdges, historyIndex, history, aiIssues } = useKnowledgeStore()

  const errorCount   = aiIssues.filter(i => i.level === 'error').length
  const warningCount = aiIssues.filter(i => i.level === 'warning').length

  return (
    <div className="h-7 bg-gray-100 border-t border-gray-200 flex items-center justify-between px-3 text-xs text-gray-500 shrink-0">
      <div className="flex items-center gap-3">
        <span>实体：{rfNodes.length}</span>
        <span className="text-gray-300">|</span>
        <span>关系：{rfEdges.length}</span>
        <span className="text-gray-300">|</span>
        <span>历史：{historyIndex + 1}/{history.length}</span>
      </div>
      <div className="flex items-center gap-2">
        {aiIssues.length === 0 ? (
          <span className="text-green-600 font-medium">✓ 就绪</span>
        ) : (
          <>
            {errorCount > 0 && (
              <span className="text-red-500 font-medium">{errorCount} 错误</span>
            )}
            {warningCount > 0 && (
              <span className="text-yellow-600 font-medium">{warningCount} 警告</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
