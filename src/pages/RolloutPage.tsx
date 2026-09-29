import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined'
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline'
import RestoreOutlinedIcon from '@mui/icons-material/RestoreOutlined'
import { Link } from 'react-router-dom'
import {
  useAdvanceRolloutMutation,
  useFreezeRolloutMutation,
  useGetFlagsQuery,
  useRestoreApprovedVersionMutation,
  useRollbackFlagMutation,
} from '@/services/flagApi'
import { FlagStatusChip } from '@/components/FlagStatusChip'
import { ConfigurationStateChip } from '@/components/ConfigurationStateChip'
import { getEffectiveFlag, getRuntimeVersion, getSnapshotChanges } from '@/services/releaseVersions'

export function RolloutPage() {
  const { data: flags = [], isLoading } = useGetFlagsQuery({})
  const [selectedId, setSelectedId] = useState('')
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [advanceRollout, advanceState] = useAdvanceRolloutMutation()
  const [freezeRollout, freezeState] = useFreezeRolloutMutation()
  const [restoreVersion, restoreState] = useRestoreApprovedVersionMutation()
  const [rollbackFlag, rollbackState] = useRollbackFlagMutation()

  useEffect(() => {
    if (!selectedId && flags.length > 0) setSelectedId(flags[0].id)
  }, [flags, selectedId])

  const flag = flags.find((item) => item.id === selectedId)
  const runtimeFlag = flag ? getEffectiveFlag(flag) : undefined
  const currentStepIndex = runtimeFlag?.rolloutSteps.findIndex((step) => step.status === 'running') ?? -1
  const nextStepIndex = currentStepIndex >= 0 ? currentStepIndex + 1 : 0
  const hasNextStep = Boolean(runtimeFlag && nextStepIndex < runtimeFlag.rolloutSteps.length)
  const runtimeVersion = flag ? getRuntimeVersion(flag) : undefined
  const changes = flag && runtimeVersion
    ? getSnapshotChanges(runtimeVersion, {
        key: flag.key,
        name: flag.name,
        description: flag.description,
        owner: flag.owner,
        team: flag.team,
        environment: flag.environment,
        enabled: flag.enabled,
        rolloutPercentage: flag.rolloutPercentage,
        audienceRules: flag.audienceRules,
        regions: flag.regions,
        minClientVersion: flag.minClientVersion,
        dependencies: flag.dependencies,
        rollbackConditions: flag.rollbackConditions,
        metricNames: flag.metricNames,
        deadCodeStatus: flag.deadCodeStatus,
        rolloutSteps: flag.rolloutSteps,
      })
    : []
  const actionLoading = advanceState.isLoading || freezeState.isLoading || restoreState.isLoading || rollbackState.isLoading
  const canOperate = Boolean(
    flag &&
      flag.configurationState === 'current' &&
      flag.approvedVersionId &&
      (flag.runtimeStatus === 'active' || flag.runtimeStatus === 'frozen'),
  )

  const handleAdvance = async () => {
    if (!flag) return
    try {
      await advanceRollout({ id: flag.id, actor: '林默' }).unwrap()
      setMessage('已按已批准版本推进下一阶段')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '推进失败，请检查配置后重试')
    }
  }

  const handleFreeze = async () => {
    if (!flag) return
    try {
      await freezeRollout({ id: flag.id, actor: '林默' }).unwrap()
      setMessage(`灰度流量已冻结在 ${flag.runtimePercentage}%`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '冻结失败，请重试')
    }
  }

  const submitRestore = async () => {
    if (!flag || reason.trim().length < 8) {
      setMessage('人工回滚原因至少 8 个字符')
      return
    }
    try {
      await restoreVersion({ id: flag.id, actor: '林默', reason }).unwrap()
      setRestoreOpen(false)
      setReason('')
      setMessage(`已恢复已批准版本，运行流量保持 ${flag.runtimePercentage}%`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '恢复失败，请重试')
    }
  }

  const submitEmergencyRollback = async () => {
    if (!flag || reason.trim().length < 8) {
      setMessage('回滚原因至少 8 个字符')
      return
    }
    try {
      await rollbackFlag({ id: flag.id, actor: '林默', reason }).unwrap()
      setRollbackOpen(false)
      setReason('')
      setMessage('已执行紧急回滚，开关关闭并写入审计日志')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '回滚失败，请重试')
    }
  }

  const openActionDialog = (type: 'restore' | 'rollback') => {
    setReason(type === 'restore' ? '配置偏离已批准边界，人工恢复已批准版本。' : '生产异常触发人工紧急回滚，停止继续放量。')
    if (type === 'restore') setRestoreOpen(true)
    else setRollbackOpen(true)
  }

  return (
    <Box>
      <Box className="page-heading">
        <Box>
          <Typography variant="h2">灰度发布时间线</Typography>
          <Typography color="text.secondary">
            放量操作只按已批准版本执行；配置漂移时旧批准失效，运行阶段停在原流量。
          </Typography>
        </Box>
        <TextField
          select
          label="发布目标"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          sx={{ width: 320 }}
        >
          {flags.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
        </TextField>
      </Box>

      {message && <Alert severity={message.includes('失败') ? 'error' : 'success'} onClose={() => setMessage('')} sx={{ mb: 2 }}>{message}</Alert>}
      {isLoading && <LinearProgress sx={{ mb: 2 }} />}

      {flag && runtimeFlag && (
        <>
          {flag.configurationState === 'drifted' && (
            <Alert severity="error" sx={{ mb: 2 }} action={<Button component={Link} to={`/flags/${flag.id}`} color="inherit" size="small">查看变化</Button>}>
              配置已相对 v{runtimeVersion?.versionNumber} 批准版本改变，旧批准立即失效；运行流量仍停在 {flag.runtimePercentage}%，不得按新草稿放量。
            </Alert>
          )}
          {flag.configurationState === 'legacy-pending' && (
            <Alert severity="warning" sx={{ mb: 2 }} action={<Button component={Link} to="/review" color="inherit" size="small">去确认</Button>}>
              旧开关首次打开生成的 v1 尚未确认，当前只能观察，不能继续推进流量。
            </Alert>
          )}

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h3">{flag.name}</Typography>
                    <FlagStatusChip status={flag.status} />
                    <ConfigurationStateChip state={flag.configurationState} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {flag.key} · 运行 {flag.runtimePercentage ?? flag.rolloutPercentage}%
                    {runtimeVersion && ` · 已批准 v${runtimeVersion.versionNumber} / ${runtimeVersion.checksum}`}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    startIcon={<PauseCircleOutlineIcon />}
                    onClick={() => void handleFreeze()}
                    disabled={actionLoading || !canOperate || flag.runtimeStatus === 'frozen'}
                  >
                    冻结流量
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<PlayArrowOutlinedIcon />}
                    onClick={() => void handleAdvance()}
                    disabled={actionLoading || !canOperate || flag.runtimeStatus !== 'active' || !hasNextStep}
                  >
                    推进下一阶段
                  </Button>
                  <Button
                    color="warning"
                    variant="outlined"
                    startIcon={<RestoreOutlinedIcon />}
                    onClick={() => openActionDialog('restore')}
                    disabled={flag.configurationState !== 'drifted'}
                  >
                    回滚到批准版
                  </Button>
                  <Button color="error" variant="outlined" startIcon={<UndoOutlinedIcon />} onClick={() => openActionDialog('rollback')}>
                    紧急回滚
                  </Button>
                </Stack>
              </Stack>
              <Stepper activeStep={Math.max(currentStepIndex, 0)} alternativeLabel>
                {runtimeFlag.rolloutSteps.map((step) => (
                  <Step key={step.id} completed={step.status === 'completed'}>
                    <StepLabel
                      error={flag.configurationState === 'drifted'}
                      optional={<Typography variant="caption" color={step.status === 'paused' ? 'warning.main' : 'text.secondary'}>{step.audience}</Typography>}
                    >
                      {step.percentage}% · {step.status === 'completed' ? '已完成' : step.status === 'running' ? '进行中' : step.status === 'paused' ? '已暂停' : '计划中'}
                    </StepLabel>
                  </Step>
                ))}
              </Stepper>
            </CardContent>
          </Card>

          <Box className="rollout-grid">
            <Card>
              <CardContent>
                <Typography variant="h3" sx={{ mb: 1.5 }}>
                  {flag.configurationState === 'drifted' ? '运行中阶段（已批准版本）' : '阶段守护指标'}
                </Typography>
                {runtimeFlag.rolloutSteps.map((step) => (
                  <Box key={step.id} className="guardrail-row">
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{step.percentage}% · {step.audience}</Typography>
                      <Stack direction="row" spacing={0.7} sx={{ mt: 0.7 }} flexWrap="wrap" useFlexGap>
                        {step.guardrails.map((guardrail) => <Chip key={guardrail} size="small" variant="outlined" label={guardrail} />)}
                      </Stack>
                    </Box>
                    <Chip
                      size="small"
                      label={step.status === 'completed' ? '已通过' : step.status === 'running' ? '观察中' : step.status === 'paused' ? '已暂停' : '待执行'}
                      color={step.status === 'completed' ? 'success' : step.status === 'running' ? 'primary' : step.status === 'paused' ? 'warning' : 'default'}
                    />
                  </Box>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h3" sx={{ mb: 1.5 }}>
                  {flag.configurationState === 'drifted' ? '运行中回滚边界' : '环境差异与客户端约束'}
                </Typography>
                <Box className="environment-compare">
                  {(['dev', 'staging', 'production'] as const).map((environment, index) => (
                    <Box key={environment}>
                      <Typography variant="caption" color="text.secondary">{environment.toUpperCase()}</Typography>
                      <Typography className="summary-value">{index === 0 ? 100 : index === 1 ? runtimeFlag.rolloutPercentage : Math.max(runtimeFlag.rolloutPercentage - 20, 0)}%</Typography>
                      <Typography variant="caption">最低 {runtimeFlag.minClientVersion[environment]}</Typography>
                    </Box>
                  ))}
                </Box>
                <Alert severity={flag.configurationState === 'drifted' ? 'error' : 'warning'} sx={{ mt: 2 }}>
                  {flag.configurationState === 'drifted'
                    ? '页面以下展示运行中的旧批准边界；新草稿边界必须重审通过后才会生效。'
                    : '生产环境低于最低版本的用户会走降级路径，不会命中新逻辑。'}
                </Alert>
                <Typography variant="h3" sx={{ mt: 2.5, mb: 1 }}>回滚条件</Typography>
                {runtimeFlag.rollbackConditions.map((condition) => <Typography key={condition} variant="body2">• {condition}</Typography>)}
              </CardContent>
            </Card>
          </Box>

          {changes.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h3" sx={{ mb: 1.5 }}>草稿相对批准版的变化</Typography>
                {changes.map((change) => (
                  <Box key={change.field} className="issue-item blocker">
                    <WarningDot />
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{change.label}</Typography>
                      <Typography variant="caption" color="text.secondary">批准版：{change.before}</Typography>
                      <Typography variant="caption" display="block" color="error.main">草稿：{change.after}</Typography>
                    </Box>
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ConfirmDialog
        open={restoreOpen}
        title="人工回滚到已批准版本"
        severity="warning"
        description={`会用 v${runtimeVersion?.versionNumber} 的不可变快照覆盖当前草稿，运行流量保持 ${flag?.runtimePercentage}%；原失效和恢复审计均保留。`}
        reason={reason}
        setReason={setReason}
        loading={restoreState.isLoading}
        confirmLabel="恢复批准版本"
        onCancel={() => setRestoreOpen(false)}
        onConfirm={() => void submitRestore()}
      />

      <ConfirmDialog
        open={rollbackOpen}
        title="确认紧急回滚"
        severity="error"
        description="紧急回滚会立即关闭开关并将灰度降至 0；若配置已漂移，可先选择“回滚到批准版”保留原流量。"
        reason={reason}
        setReason={setReason}
        loading={rollbackState.isLoading}
        confirmLabel="执行紧急回滚"
        onCancel={() => setRollbackOpen(false)}
        onConfirm={() => void submitEmergencyRollback()}
      />
    </Box>
  )
}

function WarningDot() {
  return <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main', mt: 0.8 }} />
}

function ConfirmDialog({
  open,
  title,
  severity,
  description,
  reason,
  setReason,
  loading,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  severity: 'error' | 'warning'
  description: string
  reason: string
  setReason: (value: string) => void
  loading: boolean
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Alert severity={severity} sx={{ mb: 2 }}>{description}</Alert>
        <TextField
          label="回滚原因与异常证据"
          multiline
          minRows={3}
          fullWidth
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>取消</Button>
        <Button color={severity === 'error' ? 'error' : 'warning'} variant="contained" loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
