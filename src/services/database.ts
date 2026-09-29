import type {
  AuditEvent,
  ConfigChange,
  DashboardData,
  FeatureFlag,
  ImpactIssue,
  ReleaseRevision,
  ReviewPayload,
} from '@/types'
import { boundaryFingerprint, diffBoundaries, takeSnapshot } from '@/services/revisions'

const STORAGE_KEY = 'feature-flag-release-console-v1'

export interface Database {
  flags: FeatureFlag[]
  audit: AuditEvent[]
  issues: ImpactIssue[]
}

const flags: FeatureFlag[] = [
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
    revisions: [],
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
    revisions: [],
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
    revisions: [],
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
    revisions: [],
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
    revisions: [],
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
    revisions: [],
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
    revisions: [],
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
    revisions: [],
  },
]

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

export const seedDatabase = (): Database => ({ flags, audit, issues })

let auditSequence = 0
const nextAuditId = () => `audit-${Date.now()}-${(auditSequence += 1)}`
const nextRevisionId = () => `rev-${Date.now()}-${(auditSequence += 1)}`

const estimateUsers = (percentage: number) => Math.round(900000 * (percentage / 100))

/**
 * 旧开关（版本功能上线前已经启用、没有任何送审版本）首次打开时，
 * 按当前运行配置生成一个「待确认版本」；原审计记录原样保留、不改动。
 */
const buildLegacyRevision = (flag: FeatureFlag, at: string): ReleaseRevision => ({
  id: nextRevisionId(),
  flagId: flag.id,
  version: 1,
  status: 'pending-confirmation',
  boundaryHash: boundaryFingerprint(flag),
  submittedBy: flag.lastChangedBy,
  submittedAt: at,
  changes: [],
  snapshot: takeSnapshot(flag),
})

/** 老数据迁移：运行中的旧开关补待确认版本；已在评审队列的开关补待评审版本 */
const migrate = (database: Database): Database => {
  const at = new Date().toISOString()
  let changed = false
  for (const flag of database.flags) {
    if (!Array.isArray(flag.revisions)) {
      flag.revisions = []
      changed = true
    }
    if (flag.enabled && flag.revisions.length === 0) {
      flag.revisions.push(buildLegacyRevision(flag, flag.updatedAt || at))
      changed = true
    } else if (flag.status === 'review' && flag.revisions.length === 0) {
      flag.revisions.push({
        ...buildLegacyRevision(flag, flag.updatedAt || at),
        status: 'pending',
      })
      changed = true
    }
  }
  if (changed) writeDatabase(database)
  return database
}

export const readDatabase = (): Database => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seed = seedDatabase()
    writeDatabase(seed)
    return migrate(seed)
  }
  try {
    return migrate(JSON.parse(raw) as Database)
  } catch {
    const seed = seedDatabase()
    writeDatabase(seed)
    return seed
  }
}

export const writeDatabase = (database: Database): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database))
}

const latestRevision = (flag: FeatureFlag): ReleaseRevision | undefined =>
  flag.revisions.at(-1)

const actionableRevision = (flag: FeatureFlag): ReleaseRevision | undefined =>
  [...flag.revisions]
    .reverse()
    .find((revision) => revision.status === 'pending' || revision.status === 'pending-confirmation')

const approvedRevision = (flag: FeatureFlag): ReleaseRevision | undefined =>
  [...flag.revisions].reverse().find((revision) => revision.status === 'approved')

/** 最近一次曾被批准的版本（含批准后被改失效的版本），人工回滚按它恢复 */
const lastApprovedRevision = (flag: FeatureFlag): ReleaseRevision | undefined =>
  [...flag.revisions]
    .reverse()
    .find((revision) => revision.status === 'approved' || revision.status === 'invalidated')

const hasLiveTraffic = (flag: FeatureFlag): boolean =>
  flag.rolloutPercentage > 0 || flag.rolloutSteps.some((step) => step.status === 'running' || step.status === 'completed')

const pushAudit = (
  db: Database,
  event: Omit<AuditEvent, 'id' | 'createdAt' | 'affectedUsers'> & { affectedUsers?: number },
) => {
  db.audit.unshift({
    id: nextAuditId(),
    createdAt: new Date().toISOString(),
    affectedUsers: 0,
    ...event,
  })
}

/**
 * 保存草稿 / 推进灰度。revisions 永远以存储中的为准，客户端无法改写历史版本。
 * 受保护边界（受众、依赖、回滚条件）一旦在送审后被改：
 * - 批准前：送审版本作废（superseded）；
 * - 批准且灰度开始后：旧批准失效（invalidated），退回重审，运行阶段停在原流量。
 */
export const persistFlag = (incoming: FeatureFlag): FeatureFlag => {
  const db = readDatabase()
  const index = db.flags.findIndex((item) => item.id === incoming.id)
  if (index < 0) {
    const created: FeatureFlag = {
      ...incoming,
      revisions: [],
      updatedAt: new Date().toISOString(),
    }
    db.flags.unshift(created)
    pushAudit(db, {
      flagId: created.id,
      flagKey: created.key,
      action: 'created',
      actor: created.lastChangedBy,
      summary: '创建功能开关草稿。',
      after: created.status,
    })
    writeDatabase(db)
    return created
  }

  const stored = db.flags[index]
  const beforeStatus = stored.status
  const beforePercentage = stored.rolloutPercentage
  const next: FeatureFlag = {
    ...incoming,
    revisions: stored.revisions,
    updatedAt: new Date().toISOString(),
  }

  const boundaryMoved = boundaryFingerprint(stored) !== boundaryFingerprint(next)

  // 旧开关首次打开：冻结当前配置为待确认版本，原审计保留
  if (!stored.enabled && next.enabled && !approvedRevision(next) && !actionableRevision(next)) {
    const revision = buildLegacyRevision(next, next.updatedAt)
    next.revisions = [...stored.revisions, revision]
    next.status = 'review'
    pushAudit(db, {
      flagId: next.id,
      flagKey: next.key,
      action: 'revision-confirmed',
      actor: next.lastChangedBy,
      summary: '旧开关首次打开，按当前受众、依赖与回滚边界生成待确认版本 v1，原审计记录保留。',
      after: `v${revision.version} 待确认`,
      revisionId: revision.id,
      revisionVersion: revision.version,
    })
  } else if (boundaryMoved) {
    const open = latestRevision(stored)
    const live = approvedRevision(stored)
    if (live && hasLiveTraffic(stored)) {
      // 灰度开始后改了受保护边界：旧批准立即失效，页面标出变化并退回重审
      const invalid = live
      invalid.status = 'invalidated'
      invalid.changes = diffBoundaries(invalid.snapshot, next)
      next.status = 'review'
      // 运行阶段停在原流量：保留 stored 的开关状态、比例与阶段，不采用草稿里的运行态
      next.enabled = stored.enabled
      next.rolloutPercentage = beforePercentage
      next.rolloutSteps = stored.rolloutSteps
      pushAudit(db, {
        flagId: next.id,
        flagKey: next.key,
        action: 'approval-invalidated',
        actor: next.lastChangedBy,
        summary: `灰度运行中修改${describeChangedBoundaries(invalid.changes)}，已批准的 v${invalid.version} 立即失效，退回重审，流量停在 ${beforePercentage}%。`,
        before: `v${invalid.version} 已批准`,
        after: '退回重审',
        affectedUsers: estimateUsers(beforePercentage),
        revisionId: invalid.id,
        revisionVersion: invalid.version,
      })
    } else if (open && (open.status === 'pending' || open.status === 'pending-confirmation')) {
      // 批准前就改了：送审版本作废，工程师需重新送审
      const superseded = open
      superseded.status = 'superseded'
      superseded.changes = diffBoundaries(superseded.snapshot, next)
      next.status = 'draft'
      pushAudit(db, {
        flagId: next.id,
        flagKey: next.key,
        action: 'superseded',
        actor: next.lastChangedBy,
        summary: `送审后修改${describeChangedBoundaries(superseded.changes)}，送审版本 v${superseded.version} 已被新草稿取代，需重新送审。`,
        before: `v${superseded.version} 待评审`,
        after: '草稿',
        revisionId: superseded.id,
        revisionVersion: superseded.version,
      })
    } else if (open && open.status === 'invalidated') {
      // 失效后、重新送审前继续改：变化清单始终相对原已批准版本，状态保持退回重审
      open.changes = diffBoundaries(open.snapshot, next)
      next.status = 'review'
      next.enabled = stored.enabled
      next.rolloutPercentage = beforePercentage
      next.rolloutSteps = stored.rolloutSteps
    } else if (live) {
      // 已批准但灰度尚未真正开始：同样不能带着旧批准走，标记失效后重审
      const invalid = live
      invalid.status = 'invalidated'
      invalid.changes = diffBoundaries(invalid.snapshot, next)
      next.status = 'review'
      next.enabled = stored.enabled
      next.rolloutPercentage = beforePercentage
      pushAudit(db, {
        flagId: next.id,
        flagKey: next.key,
        action: 'approval-invalidated',
        actor: next.lastChangedBy,
        summary: `修改${describeChangedBoundaries(invalid.changes)}，已批准的 v${invalid.version} 与最新配置不一致，退回重审。`,
        before: `v${invalid.version} 已批准`,
        after: '退回重审',
        affectedUsers: estimateUsers(beforePercentage),
        revisionId: invalid.id,
        revisionVersion: invalid.version,
      })
    }
  } else if (next.status === 'review' && !actionableRevision(next) && latestRevision(stored)?.status !== 'invalidated') {
    // 非边界保存但已无待评审版本（例如上一版被驳回），不能停在 review；
    // 若最近版本是「批准失效」，必须保留在评审队列等待重新送审
    next.status = 'draft'
  }

  const isRolloutAction =
    beforeStatus !== 'draft' && beforeStatus !== 'review' && beforePercentage !== next.rolloutPercentage

  pushAudit(db, {
    flagId: next.id,
    flagKey: next.key,
    action: isRolloutAction ? 'rollout-adjusted' : 'updated',
    actor: next.lastChangedBy,
    summary: isRolloutAction
      ? `灰度比例由 ${beforePercentage}% 调整至 ${next.rolloutPercentage}%（按已批准版本推进）。`
      : '更新开关配置。',
    before: isRolloutAction ? `${beforePercentage}%` : beforeStatus,
    after: isRolloutAction ? `${next.rolloutPercentage}%` : next.status,
    affectedUsers: estimateUsers(next.rolloutPercentage),
  })

  db.flags[index] = next
  writeDatabase(db)
  return next
}

const describeChangedBoundaries = (changes: ConfigChange[]): string =>
  changes.map((change) => change.label).join('、') || '受保护边界'

/** 每次送审固化一个全新的不可变版本 */
export const submitRevision = (flagId: string, actor: string): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')

  const open = actionableRevision(flag)
  if (open) throw new Error(`v${open.version} 仍在评审队列中，请先处理后再重新送审`)

  const previous = latestRevision(flag)
  const revision: ReleaseRevision = {
    id: nextRevisionId(),
    flagId,
    version: (previous?.version ?? 0) + 1,
    status: 'pending',
    boundaryHash: boundaryFingerprint(flag),
    submittedBy: actor,
    submittedAt: new Date().toISOString(),
    // 首个版本是基线，没有相对变化；之后的版本才逐项标出边界差异
    changes: previous ? diffBoundaries(previous.snapshot, flag) : [],
    snapshot: takeSnapshot(flag),
  }
  flag.revisions.push(revision)
  flag.status = 'review'
  flag.updatedAt = revision.submittedAt
  flag.lastChangedBy = actor

  pushAudit(db, {
    flagId,
    flagKey: flag.key,
    action: 'submitted',
    actor,
    summary: `固化送审版本 v${revision.version}（边界指纹 ${revision.boundaryHash}），批准仅对该版本生效。`,
    before: 'draft',
    after: 'review',
    affectedUsers: estimateUsers(flag.rolloutPercentage),
    revisionId: revision.id,
    revisionVersion: revision.version,
  })
  writeDatabase(db)
  return flag
}

/** 把开关配置恢复为某个不可变版本的快照（批准 / 回滚时使用） */
const restoreSnapshot = (flag: FeatureFlag, revision: ReleaseRevision): void => {
  flag.enabled = revision.snapshot.enabled
  flag.rolloutPercentage = revision.snapshot.rolloutPercentage
  flag.audienceRules = revision.snapshot.audienceRules.map((rule) => ({ ...rule }))
  flag.regions = [...revision.snapshot.regions]
  flag.minClientVersion = { ...revision.snapshot.minClientVersion }
  flag.dependencies = revision.snapshot.dependencies.map((dependency) => ({ ...dependency }))
  flag.rollbackConditions = [...revision.snapshot.rollbackConditions]
  flag.metricNames = [...revision.snapshot.metricNames]
  flag.deadCodeStatus = revision.snapshot.deadCodeStatus
  flag.rolloutSteps = revision.snapshot.rolloutSteps.map((step) => ({
    ...step,
    guardrails: [...step.guardrails],
  }))
}

export const applyReview = (flagId: string, payload: ReviewPayload): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')

  const target =
    flag.revisions.find((revision) => revision.id === payload.revisionId) ?? actionableRevision(flag)
  if (!target) throw new Error('没有可评审的送审版本，请先重新送审')
  if (target.status !== 'pending' && target.status !== 'pending-confirmation') {
    throw new Error(`v${target.version} 已失效，工程师已提交更新草稿，请刷新后评审最新送审版本`)
  }
  // 批准的只能是自己看到的那一版：当前边界必须与送审指纹一致
  if (boundaryFingerprint(flag) !== target.boundaryHash) {
    throw new Error(`v${target.version} 的受众、依赖或回滚边界已变化，不能批准该版本`)
  }

  const before = flag.status
  const at = new Date().toISOString()
  const isLegacy = target.status === 'pending-confirmation'

  if (payload.decision === 'rejected') {
    target.status = 'rejected'
    target.reviewedBy = payload.reviewer
    target.reviewedAt = at
    target.reviewComment = payload.comment
    flag.status = 'draft'
    flag.updatedAt = at
    flag.lastChangedBy = payload.reviewer
    pushAudit(db, {
      flagId,
      flagKey: flag.key,
      action: 'rejected',
      actor: payload.reviewer,
      summary: `驳回送审版本 v${target.version}：${payload.comment}`,
      before,
      after: 'draft',
      revisionId: target.id,
      revisionVersion: target.version,
    })
    writeDatabase(db)
    return flag
  }

  target.status = 'approved'
  target.reviewedBy = payload.reviewer
  target.reviewedAt = at
  target.reviewComment = payload.comment
  if (payload.freezeUntil) target.freezeUntil = payload.freezeUntil

  restoreSnapshot(flag, target)
  flag.enabled = true
  flag.status = 'active'
  flag.updatedAt = at
  flag.lastChangedBy = payload.reviewer

  pushAudit(db, {
    flagId,
    flagKey: flag.key,
    action: 'approved',
    actor: payload.reviewer,
    summary: isLegacy
      ? `确认旧开关运行版本 v${target.version}：${payload.comment}`
      : `批准送审版本 v${target.version}（边界指纹 ${target.boundaryHash}）：${payload.comment}`,
    before,
    after: `active / ${flag.rolloutPercentage}%`,
    affectedUsers: estimateUsers(flag.rolloutPercentage),
    revisionId: target.id,
    revisionVersion: target.version,
  })
  writeDatabase(db)
  return flag
}

/** 人工回滚：关闭开关并恢复为最近一次已批准版本的配置快照 */
export const rollbackFlag = (flagId: string, actor: string, reason: string): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')

  const approved = lastApprovedRevision(flag)
  const before = `${flag.status} / ${flag.rolloutPercentage}%`
  if (approved) restoreSnapshot(flag, approved)
  flag.status = 'rolled-back'
  flag.enabled = false
  flag.rolloutPercentage = 0
  flag.rolloutSteps = flag.rolloutSteps.map((step) =>
    step.status === 'running' ? { ...step, status: 'paused' } : step,
  )
  flag.updatedAt = new Date().toISOString()
  flag.lastChangedBy = actor

  pushAudit(db, {
    flagId,
    flagKey: flag.key,
    action: 'rolled-back',
    actor,
    summary: approved
      ? `${reason}；已恢复已批准版本 v${approved.version} 的受众、依赖与回滚边界，灰度归零。`
      : reason,
    before,
    after: 'rolled-back / 0%',
    affectedUsers: estimateUsers(Number(before.match(/(\d+)%/)?.[1] ?? 0)),
    revisionId: approved?.id,
    revisionVersion: approved?.version,
  })
  writeDatabase(db)
  return flag
}

export const getDashboardStats = (): DashboardData => {
  const db = readDatabase()
  const pendingReview = db.flags.filter((flag) =>
    flag.revisions?.some(
      (revision) => revision.status === 'pending' || revision.status === 'pending-confirmation',
    ),
  ).length
  return {
    activeFlags: db.flags.filter((flag) => flag.enabled).length,
    pendingReview,
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
