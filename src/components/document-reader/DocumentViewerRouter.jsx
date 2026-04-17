import { Empty, Result, Spin } from 'antd'
import { FileUnknownOutlined } from '@ant-design/icons'
import PdfReader from './viewers/PdfReader'
import TabularReader from './viewers/TabularReader'
import TextReader from './viewers/TextReader'

function DocumentStatusFallback({ status }) {
  if (status === 'processing') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-gray-500">
          <Spin />
          <p className="mt-3 text-sm">文档预览正在准备中</p>
        </div>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="flex h-full items-center justify-center">
        <Result
          status="warning"
          title="暂时无法预览此文档"
          subTitle="该文档的预览文件生成失败，你仍然可以下载原文件。"
        />
      </div>
    )
  }

  return null
}

export default function DocumentViewerRouter(props) {
  const { documentMeta, activeLocator } = props

  if (!documentMeta) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="text-sm text-gray-500">从左侧选择一个文档开始阅读</span>}
        />
      </div>
    )
  }

  if (documentMeta.previewStatus !== 'ready') {
    return <DocumentStatusFallback status={documentMeta.previewStatus} />
  }

  if (documentMeta.readerKind === 'pdf') return <PdfReader {...props} />
  if (documentMeta.readerKind === 'tabular') return <TabularReader {...props} />
  if (documentMeta.readerKind === 'text') return <TextReader {...props} />

  return (
    <div className="flex h-full items-center justify-center">
      <Result
        icon={<FileUnknownOutlined />}
        title="暂不支持此格式预览"
        subTitle={activeLocator?.keyword ? '你仍然可以下载原文件，后续可继续扩展该格式适配。' : '当前阅读器还没有对应的格式适配器。'}
      />
    </div>
  )
}
