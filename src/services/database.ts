import type {
  AuditEvent,
  DashboardData,
  FeatureFlag,
  ImpactIssue,
  ReviewPayload,
  ReviewVersion,
} from '@/types'
import {
  calculateChecksum,
  compareSnapshots,
  createSnapshot,
  getRuntimeVersion,
  protectedFields,
} from '@/services/releaseVersions'

const STORAGE_KEY = 'feature-flag-release-console-v1'

export interface Database {
  flags: FeatureFlag[]
  audit: AuditEvent[]
  issues: ImpactIssue[]
}

const nowIso = () => new Date().toISOString()
let auditSequence = 0
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${(auditSequence += 1)}`

const legacyFlags = [
  {
    id: 'flag-101',
    key: 'checkout.express-pay-v2',
    name: '极速支付流程 V2',
    description: '在结算页启用新的地址确认和支付聚合流程。',
    owner: '陈思远',
    team: '交易体验',
    status: 'review',
    environment: 'staging',
    enabled: false,
    rolloutPercentage: 20,
    audienceRules: [
      { id: 'r-101-1', attribute: 'user.tier', operator: 'in', value: 'gold,platinum', negate: false },
      { id: 'r-101-2', attribute: 'client.platform', operator: 'equals', value: 'ios', negate: false },
      { id: 'r-101-3', attribute: 'account.risk_score', operator: 'lte', value: '40', negate: false },
    ],
    regions: ['CN-EAST', 'CN-SOUTH'],
    minClientVersion: { dev: '8.18.0', staging: '8.18.0', production: '8.18.0' },
    dependencies: [
      { flagId: 'flag-104', type: 'requires', condition: '支付聚合服务已启用' },
      { flagId: 'flag-108', type: 'conflicts', condition: '旧版优惠券浮层不可同时启用' },
    ],
    rollbackConditions: ['支付成功率 5 分钟低于 96%', 'P95 延迟高于 2200ms', '错误率高于 1.2%'],
    metricNames: ['checkout_payment_success_rate', 'checkout_p95_latency'],
    deadCodeStatus: 'candidate',
    rolloutSteps: [
      { id: 's-1', percentage: 1, audience: '内部体验账号', startedAt: '2026-09-25T10:00:00+08:00', status: 'completed', guardrails: ['无阻断错误'] },
      { id: 's-2', percentage: 5, audience: '华东区金卡用户', startedAt: '2026-09-27T14:30:00+08:00', status: 'completed', guardrails: ['支付成功率 > 97%'] },
      { id: 's-3', percentage: 20, audience: 'iOS 金卡及铂金用户', startedAt: '2026-09-29T09:00:00+08:00', status: 'running', guardrails: ['错误率 < 1.2%', 'P95 < 2200ms'] },
      { id: 's-4', percentage: 50, audience: '全量高价值用户', startedAt: '2026-10-02T10:00:00+08:00', status: 'planned', guardrails: ['人工审批'] },
    ],
    createdAt: '2026-09-12T14:20:00+08:00',
    updatedAt: '2026-09-29T09:05:00+08:00',
    lastChangedBy: '陈思远',
  },
  {
    id: 'flag-102',
    key: 'catalog.smart-recommendation',
    name: '商品智能推荐位',
    description: '基于实时意图在商品列表插入推荐模块。',
    owner: '许薇',
    team: '增长算法',
    status: 'active',
    environment: 'production',
    enabled: true,
    rolloutPercentage: 35,
    audienceRules: [
      { id: 'r-102-1', attribute: 'app.version', operator: 'gte', value: '9.2.0', negate: false },
      { id: 'r-102-2', attribute: 'user.segment', operator: 'in', value: 'active,high_intent', negate: false },
    ],
    regions: ['CN-EAST', 'CN-NORTH', 'CN-SOUTH'],
    minClientVersion: { dev: '9.1.0', staging: '9.2.0', production: '9.2.0' },
    dependencies: [{ flagId: 'flag-105', type: 'requires', condition: '特征服务延迟稳定在 80ms 内' }],
    rollbackConditions: ['推荐模块点击率下降 15%', '接口超时率高于 2%'],
    metricNames: ['recommend_ctr', 'feature_service_timeout_rate'],
    deadCodeStatus: 'clean',
    rolloutSteps: [
      { id: 's-201', percentage: 10, audience: '活跃用户', startedAt: '2026-09-20T10:00:00+08:00', status: 'completed', guardrails: ['CTR 不低于对照 5%'] },
      { id: 's-202', percentage: 35, audience: '活跃及高意图用户', startedAt: '2026-09-27T10:00:00+08:00', status: 'running', guardrails: ['接口超时率 < 2%'] },
    ],
    createdAt: '2026-08-28T09:30:00+08:00',
    updatedAt: '2026-09-28T16:40:00+08:00',
    lastChangedBy: '周启',
  },
  {
    id: 'flag-103',
    key: 'console.billing-export-v3',
    name: '账单异步导出 V3',
    description: '把大账单导出切换至异步任务和对象存储下载。',
    owner: '周航',
    team: '云控制台',
    status: 'review',
    environment: 'dev',
    enabled: false,
    rolloutPercentage: 0,
    audienceRules: [
      { id: 'r-103-1', attribute: 'account.type', operator: 'equals', value: 'enterprise', negate: false },
    ],
    regions: ['CN-EAST'],
    minClientVersion: { dev: '5.10.0', staging: '5.10.0', production: '5.10.0' },
    dependencies: [{ flagId: 'flag-107', type: 'requires', condition: '异步任务队列容量已扩容' }],
    rollbackConditions: ['任务失败率高于 3%', '导出文件超过 24 小时未生成'],
    metricNames: [],
    deadCodeStatus: 'candidate',
    rolloutSteps: [
      { id: 's-301', percentage: 5, audience: '内部测试企业', startedAt: '2026-10-08T10:00:00+08:00', status: 'planned', guardrails: ['任务成功率 > 98%'] },
    ],
    createdAt: '2026-09-18T11:10:00+08:00',
    updatedAt: '2026-09-28T18:20:00+08:00',
    lastChangedBy: '周航',
  },
  {
    id: 'flag-104',
    key: 'payment.aggregate-router',
    name: '支付聚合路由',
    description: '统一收单渠道和支付降级策略。',
    owner: '韩秋',
    team: '支付平台',
    status: 'active',
    environment: 'production',
    enabled: true,
    rolloutPercentage: 100,
    audienceRules: [],
    regions: ['CN-EAST', 'CN-NORTH', 'CN-SOUTH', 'CN-WEST'],
    minClientVersion: { dev: '8.12.0', staging: '8.12.0', production: '8.12.0' },
    dependencies: [],
    rollbackConditions: ['任一收单渠道连续失败 20 次'],
    metricNames: ['payment_router_error_rate'],
    deadCodeStatus: 'clean',
    rolloutSteps: [{ id: 's-401', percentage: 100, audience: '全部用户', startedAt: '2026-07-01T00:00:00+08:00', status: 'completed', guardrails: [] }],
    createdAt: '2026-06-12T10:00:00+08:00',
    updatedAt: '2026-09-25T12:30:00+08:00',
    lastChangedBy: '韩秋',
  },
  {
    id: 'flag-105',
    key: 'feature.realtime-profile',
    name: '实时用户特征服务',
    description: '向推荐和搜索模块提供实时画像特征。',
    owner: '郭宁',
    team: '数据平台',
    status: 'frozen',
    environment: 'production',
    enabled: true,
    rolloutPercentage: 60,
    audienceRules: [],
    regions: ['CN-EAST', 'CN-SOUTH'],
    minClientVersion: { dev: '1.0.0', staging: '1.0.0', production: '1.0.0' },
    dependencies: [],
    rollbackConditions: ['P99 延迟高于 350ms'],
    metricNames: ['feature_service_latency', 'feature_cache_hit_rate'],
    deadCodeStatus: 'clean',
    rolloutSteps: [{ id: 's-501', percentage: 60, audience: '推荐服务流量', startedAt: '2026-09-28T09:00:00+08:00', status: 'paused', guardrails: ['观察缓存命中率'] }],
    createdAt: '2026-05-18T13:40:00+08:00',
    updatedAt: '2026-09-29T08:50:00+08:00',
    lastChangedBy: '郭宁',
  },
  {
    id: 'flag-106',
    key: 'campaign.new-editor',
    name: '活动配置新版编辑器',
    description: '提供拖拽式活动页面配置能力。',
    owner: '梁琪',
    team: '增长运营',
    status: 'rolled-back',
    environment: 'production',
    enabled: false,
    rolloutPercentage: 0,
    audienceRules: [{ id: 'r-106-1', attribute: 'operator.role', operator: 'equals', value: 'campaign_admin', negate: false }],
    regions: ['CN-EAST'],
    minClientVersion: { dev: '2.6.0', staging: '2.6.0', production: '2.6.0' },
    dependencies: [],
    rollbackConditions: ['配置保存失败率高于 2%'],
    metricNames: ['campaign_editor_save_success'],
    deadCodeStatus: 'confirmed',
    rolloutSteps: [{ id: 's-601', percentage: 20, audience: '华东运营团队', startedAt: '2026-09-27T14:00:00+08:00', status: 'paused', guardrails: [] }],
    createdAt: '2026-08-20T10:15:00+08:00',
    updatedAt: '2026-09-28T15:48:00+08:00',
    lastChangedBy: '梁琪',
  },
  {
    id: 'flag-107',
    key: 'infra.async-task-queue-v2',
    name: '异步任务队列 V2',
    description: '迁移长任务至高吞吐队列。',
    owner: '赵岚',
    team: '基础架构',
    status: 'active',
    environment: 'staging',
    enabled: true,
    rolloutPercentage: 100,
    audienceRules: [],
    regions: ['CN-EAST'],
    minClientVersion: { dev: '1.0.0', staging: '1.0.0', production: '1.0.0' },
    dependencies: [],
    rollbackConditions: ['队列积压超过 10 万'],
    metricNames: ['queue_backlog', 'task_failure_rate'],
    deadCodeStatus: 'clean',
    rolloutSteps: [{ id: 's-701', percentage: 100, audience: '预发长任务', startedAt: '2026-09-22T09:00:00+08:00', status: 'completed', guardrails: [] }],
    createdAt: '2026-08-10T16:20:00+08:00',
    updatedAt: '2026-09-27T11:12:00+08:00',
    lastChangedBy: '赵岚',
  },
  {
    id: 'flag-108',
    key: 'checkout.legacy-coupon-overlay',
    name: '旧版优惠券浮层',
    description: '结算页旧优惠券选择浮层，计划下版本下线。',
    owner: '沈宁',
    team: '交易体验',
    status: 'frozen',
    environment: 'production',
    enabled: true,
    rolloutPercentage: 12,
    audienceRules: [{ id: 'r-108-1', attribute: 'app.version', operator: 'lte', value: '8.17.9', negate: false }],
    regions: ['CN-EAST', 'CN-NORTH', 'CN-SOUTH'],
    minClientVersion: { dev: '8.10.0', staging: '8.10.0', production: '8.10.0' },
    dependencies: [{ flagId: 'flag-101', type: 'conflicts', condition: '新版支付流程不可同时启用' }],
    rollbackConditions: ['优惠券使用率下降 10%'],
    metricNames: ['coupon_apply_success_rate'],
    deadCodeStatus: 'confirmed',
    rolloutSteps: [{ id: 's-801', percentage: 12, audience: '低版本客户端', startedAt: '2026-09-20T09:00:00+08:00', status: 'paused', guardrails: [] }],
    createdAt: '2025-12-10T09:00:00+08:00',
    updatedAt: '2026-09-29T09:10:00+08:00',
    lastChangedBy: '沈宁',
  },
] as const

const issues: ImpactIssue[] = [
  {
    id: 'issue-1',
    flagId: 'flag-101',
    flagKey: 'checkout.express-pay-v2',
    category: 'overlap',
    severity: 'blocker',
    title: '与旧版优惠券实验组重叠',
    detail: '20% 灰度人群中有 3.8% 同时命中 checkout.legacy-coupon-overlay。',
    suggestion: '将 risk_score <= 40 与旧版浮层实验排除条件合并，或先将旧开关灰度降至 0。',
    resolved: false,
  },
  {
    id: 'issue-2',
    flagId: 'flag-101',
    flagKey: 'checkout.express-pay-v2',
    category: 'client-compatibility',
    severity: 'warning',
    title: '低版本客户端缺少聚合支付能力',
    detail: 'iOS 8.17.x 用户仍会命中新流程，但客户端未注册 pay.aggregate.v2。',
    suggestion: '把 app.version >= 8.18.0 加入受众前置条件。',
    resolved: false,
  },
  {
    id: 'issue-3',
    flagId: 'flag-103',
    flagKey: 'console.billing-export-v3',
    category: 'missing-metric',
    severity: 'blocker',
    title: '缺少下载完成率监控',
    detail: '当前仅配置任务创建指标，无法自动触发导出文件生成失败回滚。',
    suggestion: '接入 billing_export_download_success_rate 并配置 15 分钟窗口。',
    resolved: false,
  },
  {
    id: 'issue-4',
    flagId: 'flag-103',
    flagKey: 'console.billing-export-v3',
    category: 'dead-code',
    severity: 'warning',
    title: '旧同步导出入口仍可达',
    detail: '代码扫描发现 feature.billing_export_sync 分支仍被路由引用。',
    suggestion: '提供旧入口下线任务，并在新开关全量后移除分支。',
    resolved: false,
  },
  {
    id: 'issue-5',
    flagId: 'flag-106',
    flagKey: 'campaign.new-editor',
    category: 'rule-conflict',
    severity: 'warning',
    title: '保存权限中存在互斥角色条件',
    detail: '角色 equals campaign_admin 与后续 not-equals 临时审核员规则同时存在。',
    suggestion: '合并为明确的白名单，避免规则求值顺序变化。',
    resolved: true,
  },
  {
    id: 'issue-6',
    flagId: 'flag-108',
    flagKey: 'checkout.legacy-coupon-overlay',
    category: 'dead-code',
    severity: 'info',
    title: '开关已进入下线候选',
    detail: '最近 30 天没有新增代码引用，仅保留旧客户端兼容分支。',
    suggestion: '在最低客户端版本达到 8.18.0 后安排代码清理。',
    resolved: false,
  },
]

const audit: AuditEvent[] = [
  {
    id: 'audit-1',
    flagId: 'flag-101',
    flagKey: 'checkout.express-pay-v2',
    action: 'rollout-adjusted',
    actor: '陈思远',
    summary: '灰度比例由 5% 调整至 20%，仅覆盖 iOS 金卡及铂金用户。',
    before: '5%',
    after: '20%',
    affectedUsers: 48620,
    createdAt: '2026-09-29T09:05:00+08:00',
  },
  {
    id: 'audit-2',
    flagId: 'flag-105',
    flagKey: 'feature.realtime-profile',
    action: 'frozen',
    actor: '郭宁',
    summary: 'P99 延迟升高，冻结配置并暂停扩大流量。',
    before: 'active',
    after: 'frozen',
    affectedUsers: 1200000,
    createdAt: '2026-09-29T08:50:00+08:00',
  },
  {
    id: 'audit-3',
    flagId: 'flag-106',
    flagKey: 'campaign.new-editor',
    action: 'rolled-back',
    actor: '梁琪',
    summary: '配置保存失败率触发自动回滚条件。',
    before: '20%',
    after: '0%',
    affectedUsers: 638,
    createdAt: '2026-09-28T15:48:00+08:00',
  },
  {
    id: 'audit-4',
    flagId: 'flag-102',
    flagKey: 'catalog.smart-recommendation',
    action: 'rollout-adjusted',
    actor: '周启',
    summary: '灰度扩大到 35%，推荐接口错误率保持低于阈值。',
    before: '20%',
    after: '35%',
    affectedUsers: 812430,
    createdAt: '2026-09-28T16:40:00+08:00',
  },
  {
    id: 'audit-5',
    flagId: 'flag-103',
    flagKey: 'console.billing-export-v3',
    action: 'submitted',
    actor: '周航',
    summary: '提交发布评审，等待补齐导出完成率监控。',
    before: 'draft',
    after: 'draft',
    affectedUsers: 0,
    createdAt: '2026-09-28T18:20:00+08:00',
  },
  {
    id: 'audit-6',
    flagId: 'flag-104',
    flagKey: 'payment.aggregate-router',
    action: 'approved',
    actor: '林默',
    summary: '确认回滚条件和支付通道指标完整。',
    before: 'review',
    after: 'active',
    affectedUsers: 3200000,
    createdAt: '2026-09-25T12:30:00+08:00',
  },
]

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const makeLegacyVersion = (flag: FeatureFlag): ReviewVersion => {
  const snapshot = createSnapshot(flag)
  return {
    id: `version-${flag.id}-legacy-v1`,
    flagId: flag.id,
    versionNumber: 1,
    source: 'legacy-pending',
    status: 'pending',
    checksum: calculateChecksum(snapshot),
    snapshot,
    createdBy: flag.lastChangedBy,
    createdAt: flag.updatedAt,
    comment: '旧开关首次打开时生成的待确认版本；原有审计记录保持不变。',
  }
}

const normalizeLegacyFlag = (input: unknown): FeatureFlag => {
  const legacy = input as Omit<FeatureFlag, 'reviewVersions' | 'configurationState'> &
    Partial<Pick<FeatureFlag, 'reviewVersions' | 'configurationState'>>
  const flag: FeatureFlag = {
    ...clone(legacy),
    reviewVersions: clone(legacy.reviewVersions ?? []),
    configurationState: legacy.configurationState ?? 'current',
  }
  if (flag.reviewVersions.length === 0 && (flag.status !== 'draft' || flag.enabled || flag.rolloutPercentage > 0)) {
    const version = makeLegacyVersion(flag)
    flag.reviewVersions = [version]
    const hasRuntime = flag.enabled || flag.rolloutPercentage > 0 || flag.rolloutSteps.some((step) => step.status !== 'planned')
    if (hasRuntime) {
      flag.runtimeVersionId = version.id
      flag.runtimeStatus = flag.status
      flag.runtimePercentage = flag.rolloutPercentage
      flag.runtimeSteps = clone(flag.rolloutSteps)
      flag.configurationState = 'legacy-pending'
    }
  }
  return flag
}

const hydrateDatabase = (database: Partial<Database>): Database => ({
  flags: (database.flags ?? []).map(normalizeLegacyFlag),
  audit: database.audit ?? [],
  issues: database.issues ?? [],
})

export const seedDatabase = (): Database =>
  hydrateDatabase({
    flags: clone(legacyFlags) as unknown as FeatureFlag[],
    audit: clone(audit),
    issues: clone(issues),
  })

export const readDatabase = (): Database => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seed = seedDatabase()
    writeDatabase(seed)
    return seed
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Database>
    const database = hydrateDatabase(parsed)
    const needsMigration = JSON.stringify(database) !== raw
    if (needsMigration) writeDatabase(database)
    return database
  } catch {
    const seed = seedDatabase()
    writeDatabase(seed)
    return seed
  }
}

export const writeDatabase = (database: Database): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database))
}

const addAudit = (
  db: Database,
  event: Omit<AuditEvent, 'id' | 'createdAt'> & { createdAt?: string },
): void => {
  db.audit.unshift({
    ...event,
    id: nextId('audit'),
    createdAt: event.createdAt ?? nowIso(),
  })
}

const editableFields = {
  copy: (source: FeatureFlag, target: FeatureFlag): FeatureFlag => ({
    ...target,
    key: source.key,
    name: source.name,
    description: source.description,
    owner: source.owner,
    team: source.team,
    environment: source.environment,
    rolloutPercentage: source.rolloutPercentage,
    audienceRules: clone(source.audienceRules),
    regions: clone(source.regions),
    minClientVersion: clone(source.minClientVersion),
    dependencies: clone(source.dependencies),
    rollbackConditions: clone(source.rollbackConditions),
    metricNames: clone(source.metricNames),
    deadCodeStatus: source.deadCodeStatus,
    rolloutSteps: clone(source.rolloutSteps),
  }),
}

const runtimeStepsForSnapshot = (flag: FeatureFlag, runtimeStatus: FeatureFlag['status']) => {
  const percentage = flag.runtimePercentage ?? flag.rolloutPercentage
  const startedAt = nowIso()
  return flag.rolloutSteps.map((step) => ({
    ...step,
    startedAt: step.percentage <= percentage ? startedAt : '',
    status:
      step.percentage < percentage
        ? ('completed' as const)
        : step.percentage === percentage
          ? runtimeStatus === 'frozen'
            ? ('paused' as const)
            : ('running' as const)
          : ('planned' as const),
  }))
}

export const saveFlag = (input: FeatureFlag): FeatureFlag => {
  const db = readDatabase()
  const index = db.flags.findIndex((item) => item.id === input.id)
  const timestamp = nowIso()

  if (index < 0) {
    const flag: FeatureFlag = {
      ...editableFields.copy(input, input),
      id: input.id,
      status: 'draft',
      enabled: false,
      reviewVersions: [],
      configurationState: 'current',
      createdAt: timestamp,
      updatedAt: timestamp,
      lastChangedBy: input.lastChangedBy || '林默',
    }
    db.flags.unshift(flag)
    addAudit(db, {
      flagId: flag.id,
      flagKey: flag.key,
      action: 'created',
      actor: flag.lastChangedBy,
      summary: '创建功能开关草稿。',
      after: 'draft',
      affectedUsers: 0,
    })
    writeDatabase(db)
    return flag
  }

  const previous = db.flags[index]
  const next = editableFields.copy(input, {
    ...previous,
    reviewVersions: clone(previous.reviewVersions),
    approvedVersionId: previous.approvedVersionId,
    runtimeVersionId: previous.runtimeVersionId,
    configurationState: previous.configurationState,
    runtimeStatus: previous.runtimeStatus,
    runtimePercentage: previous.runtimePercentage,
    runtimeSteps: clone(previous.runtimeSteps),
    status: previous.status,
    enabled: previous.enabled,
    updatedAt: timestamp,
    lastChangedBy: input.lastChangedBy || previous.lastChangedBy,
  })

  const runtimeVersion = getRuntimeVersion(next)
  const latestVersion = next.reviewVersions.at(0)
  const pendingVersion = latestVersion?.status === 'pending' ? latestVersion : undefined
  const nextSnapshot = createSnapshot(next)
  let configChanged = false

  if (runtimeVersion && previous.configurationState !== 'drifted') {
    const runtimeChanges = compareSnapshots(runtimeVersion.snapshot, nextSnapshot, protectedFields)
    if (runtimeChanges.length > 0) {
      const wasApproved = runtimeVersion.status === 'approved' || runtimeVersion.status === 'restored'
      if (wasApproved) {
        runtimeVersion.status = 'invalidated'
        runtimeVersion.invalidatedAt = timestamp
        runtimeVersion.invalidatedBy = next.lastChangedBy
        runtimeVersion.changes = runtimeChanges
      } else if (pendingVersion?.id === runtimeVersion.id) {
        pendingVersion.status = 'superseded'
      }
      next.configurationState = 'drifted'
      next.status = 'review'
      next.enabled = false
      next.runtimeStatus = previous.runtimeStatus ?? previous.status
      next.runtimePercentage = previous.runtimePercentage ?? previous.rolloutPercentage
      next.runtimeSteps = clone(previous.runtimeSteps ?? previous.rolloutSteps)
      addAudit(db, {
        flagId: next.id,
        flagKey: next.key,
        action: wasApproved ? 'approval-invalidated' : 'updated',
        actor: next.lastChangedBy,
        summary: wasApproved
          ? `灰度开始后修改${runtimeChanges.map((change) => change.label).join('、')}，原批准立即失效并退回重审；运行流量保持 ${next.runtimePercentage}%。`
          : `旧开关待确认版本发生${runtimeChanges.map((change) => change.label).join('、')}变化，原待确认版本已替代；运行流量保持 ${next.runtimePercentage}%。`,
        before: wasApproved ? `v${runtimeVersion.versionNumber} 已批准` : `v${runtimeVersion.versionNumber} 待确认`,
        after: '待重审',
        versionId: runtimeVersion.id,
        versionNumber: runtimeVersion.versionNumber,
        affectedUsers: Math.round(900000 * ((next.runtimePercentage ?? 0) / 100)),
      })
      configChanged = true
    }
  }

  if (!configChanged && pendingVersion) {
    const pendingChanges = compareSnapshots(pendingVersion.snapshot, nextSnapshot, protectedFields)
    if (pendingChanges.length > 0) {
      pendingVersion.status = 'superseded'
      next.status = 'draft'
      next.enabled = false
      addAudit(db, {
        flagId: next.id,
        flagKey: next.key,
        action: 'updated',
        actor: next.lastChangedBy,
        summary: '送审版本保持不可变，草稿变化需重新提交评审。',
        before: `v${pendingVersion.versionNumber} 待评审`,
        after: '草稿',
        versionId: pendingVersion.id,
        versionNumber: pendingVersion.versionNumber,
        affectedUsers: 0,
      })
      configChanged = true
    }
  }

  if (!configChanged) {
    addAudit(db, {
      flagId: next.id,
      flagKey: next.key,
      action: 'updated',
      actor: next.lastChangedBy,
      summary: '更新开关草稿。',
      before: previous.status,
      after: next.status,
      affectedUsers: Math.round(900000 * ((next.runtimePercentage ?? next.rolloutPercentage) / 100)),
    })
  }

  db.flags[index] = next
  writeDatabase(db)
  return next
}

export const submitForReview = (flagId: string, actor: string): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')

  const timestamp = nowIso()
  const previousVersion = flag.reviewVersions.at(0)
  if (previousVersion?.status === 'pending') previousVersion.status = 'superseded'

  const snapshot = createSnapshot(flag)
  const versionNumber = flag.reviewVersions.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1
  const version: ReviewVersion = {
    id: `version-${flagId}-v${versionNumber}-${timestamp.slice(11, 19).replace(/:/g, '')}`,
    flagId,
    versionNumber,
    source: 'submission',
    status: 'pending',
    checksum: calculateChecksum(snapshot),
    snapshot,
    createdBy: actor,
    createdAt: timestamp,
  }
  flag.reviewVersions.unshift(version)
  flag.status = 'review'
  flag.enabled = false
  flag.updatedAt = timestamp
  flag.lastChangedBy = actor
  addAudit(db, {
    flagId,
    flagKey: flag.key,
    action: 'submitted',
    actor,
    summary: `固定送审版本 v${versionNumber}，记录受众、依赖与回滚边界。`,
    before: previousVersion ? `v${previousVersion.versionNumber}` : 'draft',
    after: `v${versionNumber} 待评审`,
    versionId: version.id,
    versionNumber,
    affectedUsers: Math.round(900000 * ((flag.runtimePercentage ?? flag.rolloutPercentage) / 100)),
  })
  writeDatabase(db)
  return flag
}

export const applyReview = (flagId: string, payload: ReviewPayload): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')
  const version = flag.reviewVersions.find((item) => item.id === payload.versionId)
  if (!version) throw new Error('送审版本不存在')
  if (flag.reviewVersions.at(0)?.id !== version.id) throw new Error('只能批准当前送审版本')
  if (version.status !== 'pending') throw new Error('该版本已处理，请查看最新版本')

  const timestamp = nowIso()
  version.reviewedAt = timestamp
  version.reviewer = payload.reviewer
  version.comment = payload.comment
  version.freezeUntil = payload.freezeUntil

  const hadRuntime = Boolean(flag.runtimeVersionId)
  const runtimeStatus: FeatureFlag['status'] = payload.freezeUntil ? 'frozen' : 'active'

  if (payload.decision === 'rejected') {
    version.status = 'rejected'
    if (hadRuntime) {
      flag.status = 'frozen'
      flag.runtimeStatus = 'frozen'
    } else {
      flag.status = 'draft'
      flag.enabled = false
    }
    flag.updatedAt = timestamp
    flag.lastChangedBy = payload.reviewer
    addAudit(db, {
      flagId,
      flagKey: flag.key,
      action: 'rejected',
      actor: payload.reviewer,
      summary: payload.comment,
      before: `v${version.versionNumber} 待评审`,
      after: hadRuntime ? '运行流量冻结，待处理' : 'draft',
      versionId: version.id,
      versionNumber: version.versionNumber,
      affectedUsers: Math.round(900000 * ((flag.runtimePercentage ?? 0) / 100)),
    })
    writeDatabase(db)
    return flag
  }

  version.status = 'approved'
  const previousPercentage = flag.runtimePercentage ?? version.snapshot.rolloutPercentage
  flag.approvedVersionId = version.id
  flag.runtimeVersionId = version.id
  flag.runtimeStatus = runtimeStatus
  flag.runtimePercentage = previousPercentage
  Object.assign(flag, clone(version.snapshot))
  flag.id = flagId
  flag.reviewVersions = db.flags.find((item) => item.id === flagId)?.reviewVersions ?? flag.reviewVersions
  flag.approvedVersionId = version.id
  flag.runtimeVersionId = version.id
  flag.runtimeStatus = runtimeStatus
  flag.runtimePercentage = previousPercentage
  flag.status = runtimeStatus
  flag.enabled = true
  flag.rolloutPercentage = previousPercentage
  flag.rolloutSteps = runtimeStepsForSnapshot(flag, runtimeStatus)
  flag.runtimeSteps = clone(flag.rolloutSteps)
  flag.configurationState = 'current'
  flag.updatedAt = timestamp
  flag.lastChangedBy = payload.reviewer

  addAudit(db, {
    flagId,
    flagKey: flag.key,
    action: 'approved',
    actor: payload.reviewer,
    summary: `批准的是评审人看到的 v${version.versionNumber}（${version.checksum}）。${payload.comment}`,
    before: hadRuntime ? `运行 ${previousPercentage}%` : 'review',
    after: `${runtimeStatus} / ${previousPercentage}%`,
    versionId: version.id,
    versionNumber: version.versionNumber,
    affectedUsers: Math.round(900000 * (previousPercentage / 100)),
  })
  writeDatabase(db)
  return flag
}

export const advanceRollout = (flagId: string, actor: string): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')
  if (flag.configurationState !== 'current') throw new Error('配置已变化，必须先完成重审或人工回滚')
  if (flag.runtimeStatus !== 'active') throw new Error('只有运行中的灰度可以推进')
  const runningIndex = (flag.runtimeSteps ?? []).findIndex((step) => step.status === 'running')
  const nextStepIndex = runningIndex >= 0 ? runningIndex + 1 : 0
  const nextStep = flag.runtimeSteps?.[nextStepIndex]
  if (!nextStep) throw new Error('已经是最后一个灰度阶段')

  const before = flag.rolloutPercentage
  const timestamp = nowIso()
  flag.runtimeSteps = (flag.runtimeSteps ?? []).map((step, index) => ({
    ...step,
    startedAt: index === nextStepIndex ? timestamp : step.startedAt,
    status:
      runningIndex >= 0 && index === runningIndex
        ? ('completed' as const)
        : index === nextStepIndex
          ? ('running' as const)
          : step.status,
  }))
  flag.rolloutSteps = clone(flag.runtimeSteps)
  flag.runtimePercentage = nextStep.percentage
  flag.rolloutPercentage = nextStep.percentage
  flag.status = 'active'
  flag.runtimeStatus = 'active'
  flag.updatedAt = timestamp
  flag.lastChangedBy = actor
  addAudit(db, {
    flagId,
    flagKey: flag.key,
    action: 'rollout-adjusted',
    actor,
    summary: `按已批准版本推进至 ${nextStep.percentage}%：${nextStep.audience}。`,
    before: `${before}%`,
    after: `${nextStep.percentage}%`,
    versionId: flag.runtimeVersionId,
    affectedUsers: Math.round(900000 * (nextStep.percentage / 100)),
  })
  writeDatabase(db)
  return flag
}

export const freezeRollout = (flagId: string, actor: string): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')
  if (flag.configurationState !== 'current') throw new Error('配置已变化，不能按新草稿冻结，请先重审或回滚')
  const before = flag.runtimeStatus
  flag.runtimeStatus = 'frozen'
  flag.status = 'frozen'
  flag.rolloutSteps = (flag.runtimeSteps ?? flag.rolloutSteps).map((step) =>
    step.status === 'running' ? { ...step, status: 'paused' } : step,
  )
  flag.runtimeSteps = clone(flag.rolloutSteps)
  flag.updatedAt = nowIso()
  flag.lastChangedBy = actor
  addAudit(db, {
    flagId,
    flagKey: flag.key,
    action: 'frozen',
    actor,
    summary: `冻结放量，运行流量停在 ${flag.runtimePercentage}%。`,
    before,
    after: 'frozen',
    versionId: flag.runtimeVersionId,
    affectedUsers: Math.round(900000 * ((flag.runtimePercentage ?? 0) / 100)),
  })
  writeDatabase(db)
  return flag
}

export const restoreApprovedVersion = (flagId: string, actor: string, reason: string): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')
  if (flag.configurationState !== 'drifted') throw new Error('当前配置未偏离已批准版本')
  const approved = flag.reviewVersions.find((version) => version.id === flag.approvedVersionId)
  if (!approved) throw new Error('没有可恢复的已批准版本')

  const timestamp = nowIso()
  const pending = flag.reviewVersions.find((version) => version.status === 'pending')
  if (pending) pending.status = 'superseded'
  approved.status = 'restored'
  approved.restoredAt = timestamp
  approved.restoredBy = actor

  const runtimePercentage = flag.runtimePercentage ?? approved.snapshot.rolloutPercentage
  const runtimeStatus = flag.runtimeStatus ?? 'active'
  Object.assign(flag, clone(approved.snapshot))
  flag.id = flagId
  flag.reviewVersions = db.flags.find((item) => item.id === flagId)?.reviewVersions ?? flag.reviewVersions
  flag.approvedVersionId = approved.id
  flag.runtimeVersionId = approved.id
  flag.runtimeStatus = runtimeStatus
  flag.runtimePercentage = runtimePercentage
  flag.configurationState = 'current'
  flag.status = runtimeStatus
  flag.enabled = true
  flag.rolloutPercentage = runtimePercentage
  flag.rolloutSteps = clone(flag.runtimeSteps ?? [])
  flag.updatedAt = timestamp
  flag.lastChangedBy = actor

  addAudit(db, {
    flagId,
    flagKey: flag.key,
    action: 'restored-approved',
    actor,
    summary: `人工回滚恢复已批准版本 v${approved.versionNumber}，流量保持 ${runtimePercentage}%。${reason}`,
    before: '配置漂移',
    after: `v${approved.versionNumber} / ${runtimePercentage}%`,
    versionId: approved.id,
    versionNumber: approved.versionNumber,
    affectedUsers: Math.round(900000 * (runtimePercentage / 100)),
  })
  writeDatabase(db)
  return flag
}

export const rollbackFlag = (flagId: string, actor: string, reason: string): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')
  const before = `${flag.status} / ${flag.runtimePercentage ?? flag.rolloutPercentage}%`
  const affectedUsers = Math.round(980000 * (((flag.runtimePercentage ?? flag.rolloutPercentage)) / 100))
  const timestamp = nowIso()
  flag.status = 'rolled-back'
  flag.runtimeStatus = 'rolled-back'
  flag.configurationState = 'current'
  flag.enabled = false
  flag.rolloutPercentage = 0
  flag.runtimePercentage = 0
  flag.updatedAt = timestamp
  flag.lastChangedBy = actor
  flag.rolloutSteps = (flag.runtimeSteps ?? flag.rolloutSteps).map((step) =>
    step.status === 'running' || step.status === 'paused' ? { ...step, status: 'paused' } : step,
  )
  flag.runtimeSteps = clone(flag.rolloutSteps)
  addAudit(db, {
    flagId,
    flagKey: flag.key,
    action: 'rolled-back',
    actor,
    summary: reason,
    before,
    after: 'rolled-back / 0%',
    versionId: flag.runtimeVersionId,
    affectedUsers,
  })
  writeDatabase(db)
  return flag
}

export const getDashboardStats = (): DashboardData => {
  const db = readDatabase()
  return {
    activeFlags: db.flags.filter((flag) => flag.runtimeStatus === 'active' || (!flag.runtimeStatus && flag.enabled)).length,
    pendingReview: db.flags.filter((flag) => {
      if (flag.configurationState === 'drifted') return true
      return flag.reviewVersions.at(0)?.status === 'pending'
    }).length,
    blockerIssues: db.issues.filter((issue) => issue.severity === 'blocker' && !issue.resolved).length,
    affectedUsers: 5246900,
    environmentDiff: [
      { flag: '极速支付流程 V2', dev: 100, staging: 20, production: 0 },
      { flag: '账单异步导出 V3', dev: 5, staging: 0, production: 0 },
      { flag: '商品智能推荐位', dev: 100, staging: 50, production: 35 },
      { flag: '实时用户特征服务', dev: 100, staging: 80, production: 60 },
    ],
    adoptionTrend: [
      { date: '09-23', flags: 18, rollbacks: 1 },
      { date: '09-24', flags: 21, rollbacks: 0 },
      { date: '09-25', flags: 19, rollbacks: 2 },
      { date: '09-26', flags: 24, rollbacks: 1 },
      { date: '09-27', flags: 27, rollbacks: 0 },
      { date: '09-28', flags: 31, rollbacks: 3 },
      { date: '09-29', flags: 29, rollbacks: 1 },
    ],
  }
}
