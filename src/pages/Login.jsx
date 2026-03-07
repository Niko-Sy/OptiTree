// 登录页面，包含登录表单和社交登录选项，处理用户输入和登录流程
import { useState } from 'react'
import { Form, Input, Button, Checkbox, Divider, message } from 'antd'
import {
  UserOutlined, LockOutlined, ApartmentOutlined, GithubOutlined,
  WechatOutlined, QqOutlined,
} from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../store/useAuthStore'

export default function Login() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(values) {
    setSubmitting(true)
    try {
      await login({
        username: values.username,
        password: values.password,
        remember: values.remember ?? false,
      })
      message.success('登录成功，欢迎回来！')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      message.error(err.message || '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-indigo-50  items-center justify-center px-4 flex">
      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-10">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-md mb-4">
              <ApartmentOutlined style={{ color: 'white', fontSize: 24 }} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">欢迎回来</h1>
            <p className="text-sm text-gray-500 mt-1">登录 OptiTree 故障树可视化系统</p>
          </div>

          {/* Form */}
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            initialValues={{ remember: true }}
            size="large"
            requiredMark={false}
          >
            <Form.Item
              name="username"
              label={<span className="text-gray-700 font-medium text-sm">用户名 / 邮箱</span>}
              rules={[{ required: true, message: '请输入用户名或邮箱' }]}
            >
              <Input
                prefix={<UserOutlined className="text-gray-400" />}
                placeholder="请输入用户名或邮箱"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span className="text-gray-700 font-medium text-sm">密码</span>}
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <div className="flex items-center justify-between -mt-2 mb-4">
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>
                  <span className="text-sm text-gray-600">记住我</span>
                </Checkbox>
              </Form.Item>
              {/* TODO: 接入后端后实现忘记密码流程 */}
              <button
                type="button"
                className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
                onClick={() => message.info('忘记密码功能即将上线')}
              >
                忘记密码？
              </button>
            </div>

            <Form.Item noStyle>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={submitting || loading}
                className="h-11 text-base font-medium"
              >
                登 录
              </Button>
            </Form.Item>
          </Form>

          <Divider className="my-6">
            <span className="text-xs text-gray-400">或通过以下方式登录</span>
          </Divider>

          {/* Social login — TODO: 接入后端 OAuth */}
          <div className="flex gap-3 justify-center mb-6">
            {[
              { icon: <GithubOutlined />, label: 'GitHub', onClick: () => message.info('GitHub 登录即将开放') },
              { icon: <WechatOutlined />, label: '微信', onClick: () => message.info('微信登录即将开放') },
              { icon: <QqOutlined />, label: 'QQ', onClick: () => message.info('QQ 登录即将开放') },
            ].map(({ icon, label, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className="flex items-center gap-2 flex-1 justify-center py-2 px-3 rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all text-sm"
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>

          <p className="text-center text-sm text-gray-500">
            还没有账号？{' '}
            <Link to="/register" className="text-blue-500 hover:text-blue-700 font-medium underline-offset-2 hover:underline">
              立即注册
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-400  mt-8 pb-2">
          OptiTree 故障树可视化编辑系统 
        </p>
      </div>
    </div>
  )
}
