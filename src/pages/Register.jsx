import { useState } from 'react'
import { Form, Input, Button, Checkbox, Divider, message, Steps } from 'antd'
import {
  UserOutlined, LockOutlined, MailOutlined, ApartmentOutlined,
  SafetyOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../store/useAuthStore'

export default function Register() {
  const { register, loading } = useAuth()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(values) {
    setSubmitting(true)
    try {
      await register({
        username: values.username,
        email: values.email,
        password: values.password,
      })
      setDone(true)
      setTimeout(() => {
        navigate('/dashboard', { replace: true })
      }, 1800)
    } catch (err) {
      message.error(err.message || '注册失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-12 w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a' }} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">注册成功！</h2>
          <p className="text-gray-500 text-sm">正在跳转到工作台…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4">
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-md mb-2">
              <ApartmentOutlined style={{ color: 'white', fontSize: 24 }} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">创建账号</h1>
            <p className="text-sm text-gray-500 mt-1">加入 OptiTree，开始故障树分析</p>
          </div>

          {/* Progress steps */}
          <Steps
            current={0}
            size="small"
            className="mb-3"
            items={[
              { title: '基本信息', icon: <UserOutlined /> },
              { title: '安全设置', icon: <SafetyOutlined /> },
              { title: '完成', icon: <CheckCircleOutlined /> },
            ]}
          />

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            size="large"
            requiredMark={false}
          >
            <Form.Item
              name="username"
              label={<span className="text-gray-700 font-medium text-sm h-2">用户名</span>}
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, max: 20, message: '用户名长度 3–20 个字符' },
                { pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, message: '只允许字母、数字、下划线或中文' },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                prefix={<UserOutlined className="text-gray-400" />}
                placeholder="3–20 个字符"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="email"
              label={<span className="text-gray-700 font-medium text-sm h-2">邮箱</span>}
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '邮箱格式不正确' },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                prefix={<MailOutlined className="text-gray-400" />}
                placeholder="example@domain.com"
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span className="text-gray-700 font-medium text-sm h-2">密码</span>}
              rules={[
                { required: true, message: '请输入密码' },
                { min: 8, message: '密码至少 8 个字符' },
                {
                  pattern: /^(?=.*[A-Za-z])(?=.*\d)/,
                  message: '密码须包含字母和数字',
                },
              ]}
              hasFeedback
              style={{ marginBottom: 0 }}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="至少 8 位，包含字母和数字"
                autoComplete="new-password"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label={<span className="text-gray-700 font-medium text-sm h-2">确认密码</span>}
              dependencies={['password']}
              rules={[
                { required: true, message: '请再次输入密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve()
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  },
                }),
              ]}
              hasFeedback
              style={{ marginBottom: 4 }}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="再次输入密码"
                autoComplete="new-password"
              />
            </Form.Item>

            {/* TODO: 后端接入后可增加邮箱验证码 / 短信验证字段 */}

            <Form.Item
              name="agree"
              valuePropName="checked"
              rules={[
                {
                  validator: (_, value) =>
                    value ? Promise.resolve() : Promise.reject(new Error('请阅读并同意用户协议')),
                },
              ]}
              style={{ marginBottom: 4 }}
            >
              <Checkbox>
                <span className="text-sm text-gray-600">
                  我已阅读并同意{' '}
                  <button
                    type="button"
                    className="text-blue-500 hover:underline"
                    onClick={() => message.info('用户协议即将上线')}
                  >
                    用户协议
                  </button>
                  {' '}和{' '}
                  <button
                    type="button"
                    className="text-blue-500 hover:underline"
                    onClick={() => message.info('隐私政策即将上线')}
                  >
                    隐私政策
                  </button>
                </span>
              </Checkbox>
            </Form.Item>

            <Form.Item noStyle>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={submitting || loading}
                className="h-11 text-base font-medium"
              >
                注 册
              </Button>
            </Form.Item>
          </Form>

          <Divider />

          <p className="text-center text-sm text-gray-500">
            已有账号？{' '}
            <Link to="/login" className="text-blue-500 hover:text-blue-700 font-medium underline-offset-2 hover:underline">
              返回登录
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-400  py-2">
          OptiTree 故障树可视化编辑系统
        </p>
      </div>
    </div>
  )
}
