/**
 * DocumentUploadModal — 文档上传 + AI 生成流程模态框
 * Props:
 *   open     — 是否显示
 *   target   — 'faultTree' | 'knowledge'  生成类型
 *   onComplete(result) — 生成完成回调，result: { projectId?, kgId? }
 *   onCancel — 取消回调
 */
import { useState, useRef, useEffect } from 'react'
import {
  Modal, Upload, Form, Input, Steps,
  Button, Alert, Progress, Typography, Space, message,
} from 'antd'
const { TextArea } = Input
import {
  InboxOutlined, FileTextOutlined, ThunderboltOutlined,
  CheckCircleOutlined, LoadingOutlined,
} from '@ant-design/icons'
import { uploadDocuments, generateFaultTree, generateKnowledgeGraph } from '../../services/aiService'

const { Dragger } = Upload
const { Text } = Typography

const STEP_CONFIG = {
  faultTree: [
    { title: '文档上传', description: '上传文档至服务器' },
    { title: '提交任务', description: '创建后台 AI 生成任务' },
    { title: '任务已创建', description: '后台异步生成中' },
  ],
  knowledge: [
    { title: '文档上传', description: '上传文档至服务器' },
    { title: '提交任务', description: '创建后台 AI 生成任务' },
    { title: '任务已创建', description: '后台异步生成中' },
  ],
}

export default function DocumentUploadModal({ open, target = 'faultTree', onComplete, onCancel }) {
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState([])
  const [step, setStep] = useState(-1)      // -1: 未开始  0/1/2: 步骤
  const [stepStatus, setStepStatus] = useState('process')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const progressTimer = useRef(null)

  // 组件卸载时清除可能仍在运行的进度模拟定时器
  useEffect(() => () => clearInterval(progressTimer.current), [])

  const isFaultTree = target === 'faultTree'
  const title = isFaultTree ? '📤 文档 → 故障树（AI 生成）' : '🗺️ 文档 → 知识图谱（AI 生成）'
  const steps = STEP_CONFIG[target]

  function resetState() {
    setStep(-1)
    setStepStatus('process')
    setProgress(0)
    setResult(null)
    setErrorMsg('')
    setFileList([])
    form.resetFields()
    clearInterval(progressTimer.current)
  }

  function handleClose() {
    resetState()
    onCancel?.()
  }

  function simulateProgress(from, to, duration, onDone) {
    let cur = from
    const step = (to - from) / (duration / 100)
    clearInterval(progressTimer.current)
    progressTimer.current = setInterval(() => {
      cur = Math.min(cur + step + Math.random() * 2, to)
      setProgress(Math.round(cur))
      if (cur >= to) {
        clearInterval(progressTimer.current)
        onDone?.()
      }
    }, 100)
  }

  async function handleSubmit() {
    try {
      const values = await form.validateFields()
      if (fileList.length === 0) {
        message.error('请先上传至少一份文档')
        return
      }

      setErrorMsg('')

      // ── Step 0: 文档上传/解析 ──────────────────────────────
      setStep(0)
      setProgress(0)
      simulateProgress(0, 35, 500, null)

      const files = fileList.map(f => f.originFileObj ?? f)
      const { docIds } = await uploadDocuments(files)
      if (!Array.isArray(docIds) || docIds.length === 0) {
        throw new Error('文档上传成功但未返回可用文档 ID，请稍后重试')
      }

      simulateProgress(35, 70, 350, null)

      // ── Step 1: AI 生成 ────────────────────────────────────
      setStep(1)

      let genResult
      let retryPayload
      if (isFaultTree) {
        const userRequirements = values.userRequirements || ''
        retryPayload = { docIds, topEvent: values.topEvent, userRequirements, type: 'ft' }
        genResult = await generateFaultTree(docIds, values.topEvent, undefined, userRequirements)
      } else {
        retryPayload = { docIds, type: 'kg' }
        genResult = await generateKnowledgeGraph(docIds)
      }

      simulateProgress(70, 100, 300, null)
      setProgress(100)

      // ── Step 2: 已提交后台任务 ───────────────────────────────
      setStep(2)
      setStepStatus('finish')
      setResult({
        target,
        projectId: genResult?.projectId,
        taskId: genResult?.taskId,
        status: genResult?.status,
        retryPayload,
      })

    } catch (err) {
      setStepStatus('error')
      setErrorMsg(err?.message || '生成失败，请重试')
    }
  }

  function handleNavigate() {
    if (!result) return
    onComplete?.(result)
    resetState()
  }

  const isRunning = step >= 0 && step < 2 && stepStatus !== 'error'
  const isDone = step === 2 && stepStatus === 'finish'

  const uploadProps = {
    multiple: true,
    accept: '.pdf,.doc,.docx,.xlsx,.txt',
    fileList,
    beforeUpload: () => false,
    onChange: ({ fileList: fl }) => setFileList(fl),
  }

  return (
    <Modal
      open={open}
      title={<span className="font-semibold">{title}</span>}
      onCancel={handleClose}
      width={560}
      footer={null}
      destroyOnHidden
    >
      {/* ── 未开始：表单区域 ── */}
      {step === -1 && (
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item label="上传文档（支持 PDF / Word / Excel / TXT）" required>
            <Dragger {...uploadProps} className="bg-blue-50/40">
              <p className="ant-upload-drag-icon">
                <InboxOutlined className="text-blue-400 text-4xl" />
              </p>
              <p className="ant-upload-text text-gray-700">点击或将文件拖拽至此处上传</p>
              <p className="ant-upload-hint text-gray-400 text-xs">
                同时支持多份文档，将合并用于生成
              </p>
            </Dragger>
          </Form.Item>

          {isFaultTree && (
            <>
              <Form.Item
                name="topEvent"
                label="项目名称"
                rules={[{ required: true, message: '请输入项目名称' }]}
              >
                <Input
                  prefix={<FileTextOutlined className="text-gray-400" />}
                  placeholder="例：锅炉房故障树项目"
                  maxLength={60}
                  showCount
                />
              </Form.Item>

              <Form.Item
                name="userRequirements"
                label="AI 生成补充说明（可选）"
                rules={[{ max: 100, message: '最多 100 个字符' }]}
              >
                <TextArea
                  placeholder="例：希望重点分析电气系统和液压系统的失效模式..."
                  rows={3}
                  maxLength={100}
                  showCount
                />
              </Form.Item>
            </>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleSubmit}
              disabled={fileList.length === 0}
            >
              开始生成
            </Button>
          </div>
        </Form>
      )}

      {/* ── 进行中/完成：进度展示 ── */}
      {step >= 0 && (
        <div className="py-4">
          <Steps
            current={step}
            status={stepStatus}
            items={steps.map((s, i) => ({
              ...s,
              icon: i < step ? <CheckCircleOutlined /> :
                    i === step && !isDone ? <LoadingOutlined spin /> : undefined,
            }))}
            className="mb-6"
          />

          {!isDone && stepStatus !== 'error' && (
            <Progress
              percent={progress}
              status="active"
              strokeColor={{ from: '#1677ff', to: '#52c41a' }}
              className="mb-4"
            />
          )}

          {stepStatus === 'error' && (
            <Alert
              type="error"
              message="生成失败"
              description={errorMsg}
              showIcon
              className="mb-4"
              action={
                <Button size="small" onClick={resetState}>重试</Button>
              }
            />
          )}

          {isDone && result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <Space direction="vertical" className="w-full">
                <Text className="text-green-700 font-medium flex items-center gap-1">
                  <CheckCircleOutlined /> 任务已提交，后台生成中
                </Text>
                <Text className="text-gray-600 text-sm">
                  任务 ID：{result.taskId}
                </Text>
                <Text className="text-gray-500 text-xs">
                  项目 ID：{result.projectId}，AI 正在后台处理，请在项目卡片中查看实时进度。
                </Text>
              </Space>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {!isDone && (
              <Button onClick={handleClose} disabled={isRunning}>取消</Button>
            )}
            {isDone && (
              <>
                <Button onClick={handleClose}>关闭</Button>
                <Button type="primary" onClick={handleNavigate}>
                  返回项目列表
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
