import { Button, Result } from 'antd'
import { WarningOutlined } from '@ant-design/icons'

export default function RequestErrorState({
  title = '加载失败',
  message = '请求失败，请稍后重试',
  attempts = 0,
  retryLabel = '重试',
  compact = false,
  onRetry,
}) {
  const detail = attempts > 0 ? `${message}（已尝试 ${attempts} 次）` : message

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-4 text-center">
        <WarningOutlined className="text-xl text-amber-500" />
        <p className="m-0 mt-2 text-sm font-medium text-gray-700">{title}</p>
        <p className="m-0 mt-1 text-xs leading-5 text-gray-500">{detail}</p>
        {onRetry && (
          <Button type="default" size="small" className="mt-3" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      <Result
        status="warning"
        title={title}
        subTitle={detail}
        extra={onRetry ? <Button onClick={onRetry}>{retryLabel}</Button> : null}
      />
    </div>
  )
}
