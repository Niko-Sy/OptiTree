import { useState, useEffect } from 'react'
import { Button, Input, Empty, Statistic, Row, Col, Divider } from 'antd'
import {
  PlusOutlined, SearchOutlined, ApartmentOutlined,
  ProjectOutlined, FundOutlined,
} from '@ant-design/icons'
import ProjectCard from '../components/dashboard/ProjectCard'
import NewProjectModal from '../components/dashboard/NewProjectModal'
import UserAvatar from '../components/common/UserAvatar'

const STORAGE_KEY = 'optitree_projects'

// ─── Template preset graphs ───────────────────────────────────────
const TEMPLATES = {
  power: {
    nodes: [
      { id: 'root',   type: 'topEvent',   name: '电源系统失效' },
      { id: 'gate1',  type: 'gate',       name: 'OR' },
      { id: 'mid1',   type: 'midEvent',   name: '主供电故障' },
      { id: 'mid2',   type: 'midEvent',   name: '备用电源故障' },
      { id: 'gate2',  type: 'gate',       name: 'AND' },
      { id: 'b1',     type: 'basicEvent', name: '电池耗尽',   probability: 0.02 },
      { id: 'b2',     type: 'basicEvent', name: '线路短路',   probability: 0.005 },
      { id: 'b3',     type: 'basicEvent', name: '变压器故障', probability: 0.01 },
      { id: 'b4',     type: 'basicEvent', name: '充电器失效', probability: 0.008 },
    ],
    edges: [
      { id: 'e1', from: 'root',  to: 'gate1' },
      { id: 'e2', from: 'gate1', to: 'mid1' },
      { id: 'e3', from: 'gate1', to: 'mid2' },
      { id: 'e4', from: 'mid1',  to: 'gate2' },
      { id: 'e5', from: 'gate2', to: 'b1' },
      { id: 'e6', from: 'gate2', to: 'b2' },
      { id: 'e7', from: 'mid2',  to: 'b3' },
      { id: 'e8', from: 'mid2',  to: 'b4' },
    ],
    tags: ['电源', '硬件'],
  },
  software: {
    nodes: [
      { id: 'root',  type: 'topEvent',   name: '软件系统崩溃' },
      { id: 'gate1', type: 'gate',       name: 'OR' },
      { id: 'mid1',  type: 'midEvent',   name: '内存溢出' },
      { id: 'mid2',  type: 'midEvent',   name: '进程死锁' },
      { id: 'gate2', type: 'gate',       name: 'AND' },
      { id: 'b1',    type: 'basicEvent', name: '内存泄漏',   probability: 0.03 },
      { id: 'b2',    type: 'basicEvent', name: '大数据量输入', probability: 0.05 },
      { id: 'b3',    type: 'basicEvent', name: '资源竞争',   probability: 0.02 },
      { id: 'b4',    type: 'basicEvent', name: '锁未释放',   probability: 0.01 },
    ],
    edges: [
      { id: 'e1', from: 'root',  to: 'gate1' },
      { id: 'e2', from: 'gate1', to: 'mid1' },
      { id: 'e3', from: 'gate1', to: 'mid2' },
      { id: 'e4', from: 'mid1',  to: 'gate2' },
      { id: 'e5', from: 'gate2', to: 'b1' },
      { id: 'e6', from: 'gate2', to: 'b2' },
      { id: 'e7', from: 'mid2',  to: 'b3' },
      { id: 'e8', from: 'mid2',  to: 'b4' },
    ],
    tags: ['软件', '进程'],
  },
}

function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveProjects(projects) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

export default function Dashboard() {
  const [projects, setProjects] = useState(loadProjects)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    saveProjects(projects)
  }, [projects])

  function handleCreateProject({ name, template }) {
    const id = `proj_${Date.now()}`
    const tpl = TEMPLATES[template]
    const newProject = {
      id,
      name,
      createdAt: new Date().toISOString(),
      nodeCount: tpl ? tpl.nodes.length : 0,
      edgeCount: tpl ? tpl.edges.length : 0,
      tags: tpl ? tpl.tags : [],
    }
    if (tpl) {
      // Pre-populate localStorage with template graph (layout applied in editor on first open)
      const nodes = tpl.nodes.map(n => ({ width: 120, height: 60, x: 0, y: 0, ...n }))
      localStorage.setItem(`optitree_data_${id}`, JSON.stringify({ nodes, edges: tpl.edges }))
    }
    setProjects(prev => [newProject, ...prev])
    setShowModal(false)
  }

  function handleDeleteProject(id) {
    setProjects(prev => prev.filter(p => p.id !== id))
    // Also remove project data
    localStorage.removeItem(`optitree_data_${id}`)
  }

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalNodes = projects.reduce((s, p) => s + (p.nodeCount || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="24.000000pt" height="24.000000pt" viewBox="0 0 726.000000 726.000000" preserveAspectRatio="xMidYMid meet"><g transform="translate(0.000000,726.000000) scale(0.100000,-0.100000)" fill="#ffffff" stroke="none"><path d="M3468 6090 c-132 -24 -269 -91 -385 -189 -109 -94 -153 -156 -234 -336 -36 -81 -50 -253 -29 -378 12 -75 66 -205 118 -287 l41 -65 -72 -65 c-40 -36 -122 -112 -182 -170 -61 -58 -162 -152 -225 -210 -150 -138 -252 -233 -505 -476 -116 -110 -240 -227 -276 -260 -90 -81 -293 -271 -543 -510 -116 -110 -247 -233 -291 -274 -44 -40 -118 -110 -165 -154 -137 -130 -201 -188 -269 -246 -86 -74 -283 -247 -349 -307 l-52 -48 -3 -370 c-2 -426 -8 -398 96 -477 150 -113 606 -398 636 -398 18 0 102 37 111 48 6 8 32 25 205 135 249 158 402 265 420 295 11 19 17 580 8 705 l-6 77 -91 72 c-50 40 -134 106 -186 147 -182 143 -210 166 -210 172 0 3 21 21 47 40 26 18 104 88 173 154 69 66 182 172 250 235 69 63 148 138 176 167 l51 54 89 -89 c125 -123 510 -490 562 -533 40 -34 54 -59 32 -59 -22 0 -425 -323 -461 -368 -19 -25 -20 -40 -17 -398 l3 -373 30 -32 c29 -30 203 -148 465 -316 190 -121 197 -124 242 -126 38 -2 57 7 151 68 59 39 122 79 140 89 81 49 375 249 404 275 17 16 36 38 42 49 12 23 16 675 5 731 -4 18 -20 45 -36 61 -33 33 -248 208 -358 292 -41 32 -89 70 -105 85 -96 88 -205 191 -320 303 -155 150 -452 430 -550 517 -66 60 -69 64 -51 78 26 20 192 172 306 280 178 168 725 681 795 745 39 35 89 84 112 109 l42 45 38 -18 c88 -42 158 -58 284 -63 140 -6 231 8 347 54 l64 25 97 -93 c169 -164 568 -536 705 -658 39 -35 118 -109 176 -165 58 -56 149 -143 203 -192 l99 -91 -144 -133 c-317 -296 -408 -381 -551 -518 -135 -129 -324 -296 -592 -522 -55 -47 -108 -94 -117 -105 -16 -18 -17 -54 -18 -376 0 -227 4 -367 11 -385 13 -38 76 -88 294 -235 269 -182 398 -259 432 -259 33 0 243 122 403 235 36 25 103 71 150 102 114 76 159 113 176 145 11 22 14 99 14 388 0 216 -4 369 -10 380 -11 20 -99 95 -315 264 -82 65 -150 121 -150 126 0 12 404 400 501 481 47 39 102 93 122 120 20 26 42 48 47 48 6 1 51 -40 100 -90 50 -50 126 -123 170 -162 44 -39 139 -125 210 -193 72 -67 151 -139 177 -160 26 -22 47 -42 47 -45 1 -3 -7 -10 -18 -15 -10 -5 -40 -28 -67 -51 -27 -23 -95 -77 -150 -120 -56 -43 -136 -106 -178 -141 l-76 -62 0 -379 c0 -439 -12 -392 122 -488 187 -132 450 -305 537 -353 90 -50 71 -57 426 171 238 153 332 222 362 268 23 34 23 36 23 402 l0 369 -42 42 c-24 24 -128 115 -233 203 -104 88 -230 198 -280 245 -49 47 -117 110 -150 140 -33 30 -100 93 -150 140 -109 103 -210 197 -290 269 -33 29 -105 97 -160 150 -55 53 -156 148 -225 211 -69 63 -170 158 -225 211 -55 53 -135 127 -177 165 -42 38 -141 129 -220 203 -79 74 -177 166 -218 204 -41 39 -129 122 -195 186 -66 64 -167 159 -225 211 -57 52 -116 106 -131 119 l-27 25 28 35 c40 51 96 165 115 236 9 33 19 106 22 161 11 200 -39 357 -170 529 -67 88 -159 163 -264 214 -144 71 -193 83 -338 87 -71 1 -151 -1 -177 -6z m210 -340 c237 -34 411 -249 387 -479 -14 -148 -78 -248 -210 -330 -128 -80 -294 -92 -423 -30 -58 29 -144 100 -186 155 -100 130 -99 355 0 497 52 73 158 148 249 175 81 24 98 25 183 12z m972 -3550 c213 -151 319 -238 326 -265 3 -12 2 -112 -3 -221 l-8 -197 -69 -53 c-87 -67 -285 -184 -310 -184 -34 0 -317 172 -369 224 l-27 27 2 216 3 217 148 111 c81 61 164 128 184 148 20 20 41 33 47 29 6 -3 40 -27 76 -52z m1841 44 c7 -9 76 -63 154 -121 77 -58 157 -121 178 -141 l37 -36 0 -212 0 -213 -42 -34 c-24 -18 -88 -63 -143 -98 -193 -125 -187 -123 -258 -88 -75 38 -287 173 -318 203 l-29 28 0 208 0 208 158 120 c86 66 175 136 197 156 46 41 48 41 66 20z m-5551 -109 c85 -64 176 -132 201 -151 l47 -34 -1 -208 c0 -176 -2 -210 -16 -225 -20 -23 -261 -187 -318 -216 -23 -11 -53 -21 -66 -21 -24 0 -218 111 -311 177 -88 63 -84 48 -82 292 l1 215 85 65 c47 35 128 99 180 142 52 43 102 78 110 78 8 1 85 -51 170 -114z m1803 72 c29 -24 106 -85 172 -134 66 -50 128 -100 138 -111 17 -18 19 -42 20 -227 l2 -207 -40 -34 c-22 -18 -64 -48 -93 -66 -29 -18 -93 -59 -142 -90 -53 -35 -99 -58 -116 -58 -30 0 -146 64 -274 151 -143 97 -130 67 -130 307 0 152 3 212 13 224 6 8 34 30 60 48 27 17 109 79 184 136 74 57 139 104 145 104 5 0 33 -20 61 -43z"/></g></svg>
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">OptiTree</span>
            <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">故障树可视化系统</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setShowModal(true)}
            >
              新建项目
            </Button>
            <UserAvatar size={34} />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {/* Stats */}
        <Row gutter={16} className="mb-8">
          <Col span={8}>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <Statistic
                title={<span className="text-gray-500 text-sm">项目总数</span>}
                value={projects.length}
                prefix={<ProjectOutlined className="text-blue-500" />}
                valueStyle={{ color: '#1677ff', fontSize: 28 }}
              />
            </div>
          </Col>
          <Col span={8}>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <Statistic
                title={<span className="text-gray-500 text-sm">节点总数</span>}
                value={totalNodes}
                prefix={<ApartmentOutlined className="text-green-500" />}
                valueStyle={{ color: '#52c41a', fontSize: 28 }}
              />
            </div>
          </Col>
          <Col span={8}>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <Statistic
                title={<span className="text-gray-500 text-sm">最近更新</span>}
                value={projects.length > 0
                  ? new Date(projects[0].createdAt).toLocaleDateString('zh-CN')
                  : '—'
                }
                prefix={<FundOutlined className="text-orange-400" />}
                valueStyle={{ color: '#fa8c16', fontSize: 20 }}
              />
            </div>
          </Col>
        </Row>

        {/* Project List Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">我的项目</h2>
          <Input
            prefix={<SearchOutlined className="text-gray-400" />}
            placeholder="搜索项目名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />
        </div>

        <Divider style={{ margin: '0 0 16px' }} />

        {/* Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => (
              <ProjectCard key={p.id} project={p} onDelete={handleDeleteProject} />
            ))}
            {/* New Project Quick Card */}
            <div
              onClick={() => setShowModal(true)}
              className="border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all text-gray-400 hover:text-blue-500"
            >
              <PlusOutlined style={{ fontSize: 28 }} />
              <p className="mt-2 text-sm font-medium">新建项目</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 py-16">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div className="text-center">
                  <p className="text-gray-500 mb-3">
                    {search ? `未找到与 "${search}" 匹配的项目` : '还没有项目，点击右上角新建一个'}
                  </p>
                  {!search && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setShowModal(true)}
                    >
                      新建第一个项目
                    </Button>
                  )}
                </div>
              }
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-gray-400 border-t border-gray-100">
        OptiTree 故障树可视化编辑系统 
      </footer>

      <NewProjectModal
        open={showModal}
        onConfirm={handleCreateProject}
        onCancel={() => setShowModal(false)}
      />
    </div>
  )
}
