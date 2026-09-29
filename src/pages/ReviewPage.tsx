import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined'
import SendOutlinedIcon from '@mui/icons-material/SendOutlined'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { clearReviewSelection, toggleReviewSelection } from '@/app/uiSlice'
import {
  useGetFlagsQuery,
  useGetIssuesQuery,
  useReviewFlagMutation,
  useSubmitForReviewMutation,
} from '@/services/flagApi'
import { FlagStatusChip } from '@/components/FlagStatusChip'
import { ConfigurationStateChip } from '@/components/ConfigurationStateChip'
import { VersionSnapshotPanel } from '@/components/VersionSnapshotPanel'
import { createSnapshot, getLatestVersion, getRuntimeVersion, getSnapshotChanges, needsReview } from '@/services/releaseVersions'
import type { FeatureFlag, IssueSeverity } from '@/types'

const severityLabel: Record<IssueSeverity, string> = {
  blocker: '阻断',
  warning: '警告',
  info: '提示',
}

export function ReviewPage() {
  const dispatch = useAppDispatch()
  const selectedIds = useAppSelector((state) => state.ui.reviewSelection)
  const { data: allFlags = [], isLoading } = useGetFlagsQuery({})
  const flags = allFlags.filter(needsReview)
  const { data: issues = [] } = useGetIssuesQuery({ resolved: false })
  const [reviewFlag, reviewState] = useReviewFlagMutation()
  const [submitReview, submitState] = useSubmitForReviewMutation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [comment, setComment] = useState('')
  const [freezeUntil, setFreezeUntil] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (flags.length > 0 && selectedIds.length === 0) dispatch(toggleReviewSelection(flags[0].id))
  }, [dispatch, flags, selectedIds.length])

  const activeFlag = flags.find((flag) => flag.id === selectedIds.at(-1)) ?? flags[0]
  const latestVersion = activeFlag ? getLatestVersion(activeFlag) : undefined
  const runtimeVersion = activeFlag ? getRuntimeVersion(activeFlag) : undefined
  const snapshotVersion = latestVersion ?? runtimeVersion
  const changes = activeFlag
    ? getSnapshotChanges(runtimeVersion, createSnapshot(activeFlag))
    : []
  const activeIssues = activeFlag ? issues.filter((issue) => issue.flagId === activeFlag.id) : []
  const blockerCount = activeIssues.filter((issue) => issue.severity === 'blocker').length
  const canReview = Boolean(activeFlag && latestVersion?.status === 'pending' && blockerCount === 0)
  const needsResubmission = Boolean(activeFlag && activeFlag.configurationState === 'drifted' && latestVersion?.status !== 'pending')

  const openDecision = (value: 'approved' | 'rejected') => {
    if (!activeFlag) return
    setDecision(value)
    setComment(value === 'approved' ? '规则、依赖、指标与回滚条件均已核对。' : '存在未解决的影响问题，请修改后重新提交。')
    setDialogOpen(true)
  }

  const submitDecision = async () => {
    if (!activeFlag || !latestVersion || comment.trim().length < 8) {
      setMessage('评审意见至少 8 个字符')
      return
    }
    if (decision === 'approved' && blockerCount > 0) {
      setMessage('阻断问题未清零，不能批准发布')
      return
    }
    if (latestVersion.status !== 'pending') {
      setMessage('只能处理当前待确认版本')
      return
    }
    try {
      await reviewFlag({
        id: activeFlag.id,
        payload: {
          reviewer: '林默',
          decision,
          comment,
          versionId: latestVersion.id,
          freezeUntil: freezeUntil || undefined,
        },
      }).unwrap()
      setDialogOpen(false)
      dispatch(clearReviewSelection())
      setMessage(decision === 'approved' ? '已按所选不可变版本批准，审批和校验和已写入审计' : '已驳回该送审版本')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '审批提交失败，请重试')
    }
  }

  const resubmitCurrentDraft = async () => {
    if (!activeFlag) return
    try {
      await submitReview({ id: activeFlag.id, actor: activeFlag.lastChangedBy }).unwrap()
      setMessage('已将当前草稿固定为新的不可变送审版本')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '重新送审失败')
    }
  }

  const issueCount = (flag: FeatureFlag) =>
    issues.filter((issue) => issue.flagId === flag.id && !issue.resolved).length

  return (
    <Box>
      <Box className="page-heading">
        <Box>
          <Typography variant="h2">发布影响评审</Typography>
          <Typography color="text.secondary">
            审批对象是送审时固定的受众、依赖、灰度和回滚边界快照；灰度后改动会使旧批准立即失效。
          </Typography>
        </Box>
        <Chip label={`${flags.length} 项待确认`} color="warning" variant="outlined" />
      </Box>

      {message && (
        <Alert severity={message.includes('失败') || message.includes('不能') || message.includes('只能') ? 'error' : 'success'} onClose={() => setMessage('')} sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      <Box className="review-layout">
        <Card>
          <Box className="card-header-block">
            <Typography variant="h3">评审队列</Typography>
            <Typography variant="caption" color="text.secondary">包含待评审新版本、旧开关待确认版本和已失效待重审项</Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>功能开关 / 版本</TableCell>
                  <TableCell>运行流量</TableCell>
                  <TableCell>阻塞问题</TableCell>
                  <TableCell>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {flags.map((flag) => {
                  const version = getLatestVersion(flag) ?? getRuntimeVersion(flag)
                  return (
                    <TableRow
                      key={flag.id}
                      hover
                      selected={activeFlag?.id === flag.id}
                      onClick={() => {
                        if (!selectedIds.includes(flag.id)) dispatch(toggleReviewSelection(flag.id))
                      }}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox checked={selectedIds.includes(flag.id)} onChange={() => dispatch(toggleReviewSelection(flag.id))} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>{flag.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {flag.owner} · v{version?.versionNumber ?? '-'} · {version?.checksum}
                        </Typography>
                      </TableCell>
                      <TableCell>{flag.runtimePercentage ?? flag.rolloutPercentage}%</TableCell>
                      <TableCell>
                        <Chip size="small" color={issueCount(flag) > 0 ? 'error' : 'success'} label={`${issueCount(flag)} 项`} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.5} alignItems="flex-start">
                          <FlagStatusChip status={flag.status} />
                          <ConfigurationStateChip state={flag.configurationState} />
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!isLoading && flags.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 5 }} color="text.secondary">
                      当前没有待评审或待确认开关
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        {activeFlag && snapshotVersion && (
          <Card className="review-detail">
            <CardContent>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                <Box>
                  <Typography variant="h3">{activeFlag.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{activeFlag.key}</Typography>
                </Box>
                <Stack spacing={0.5} alignItems="flex-end">
                  <FlagStatusChip status={activeFlag.status} />
                  <ConfigurationStateChip state={activeFlag.configurationState} />
                </Stack>
              </Stack>

              <Box className="review-facts">
                <Box><Typography variant="caption">目标环境</Typography><Typography fontWeight={700}>{snapshotVersion.snapshot.environment.toUpperCase()}</Typography></Box>
                <Box><Typography variant="caption">快照初始流量</Typography><Typography fontWeight={700}>{snapshotVersion.snapshot.rolloutPercentage}%</Typography></Box>
                <Box><Typography variant="caption">实际运行流量</Typography><Typography fontWeight={700} color={activeFlag.configurationState === 'drifted' ? 'error.main' : undefined}>{activeFlag.runtimePercentage ?? activeFlag.rolloutPercentage}%</Typography></Box>
                <Box><Typography variant="caption">监控指标</Typography><Typography fontWeight={700}>{snapshotVersion.snapshot.metricNames.length} 个</Typography></Box>
              </Box>

              {activeFlag.configurationState === 'drifted' && (
                <Alert
                  severity="error"
                  sx={{ mt: 2 }}
                  action={
                    latestVersion?.status !== 'pending' ? (
                      <Button color="inherit" size="small" startIcon={<SendOutlinedIcon />} loading={submitState.isLoading} onClick={() => void resubmitCurrentDraft()}>
                        重新送审
                      </Button>
                    ) : undefined
                  }
                >
                  {latestVersion?.status === 'pending'
                    ? '当前为新送审版本；下列变化是相对已失效批准，审批只绑定新版本。'
                    : '原批准已失效，运行阶段停在原流量；请将当前草稿重新固定送审，或人工回滚。'}
                </Alert>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="h3" sx={{ mb: 1 }}>发布条件检查</Typography>
              <Stack spacing={1}>
                {activeIssues.map((issue) => (
                  <Box key={issue.id} className={`issue-item ${issue.severity}`}>
                    <WarningAmberOutlinedIcon fontSize="small" />
                    <Box>
                      <Stack direction="row" spacing={0.7} alignItems="center">
                        <Chip size="small" label={severityLabel[issue.severity]} color={issue.severity === 'blocker' ? 'error' : issue.severity === 'warning' ? 'warning' : 'default'} />
                        <Typography variant="body2" fontWeight={700}>{issue.title}</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{issue.detail}</Typography>
                      <Typography variant="caption" color="primary.main">{issue.suggestion}</Typography>
                    </Box>
                  </Box>
                ))}
                {activeIssues.length === 0 && <Alert severity="success">未发现配置影响问题，可核对不可变快照后审批。</Alert>}
              </Stack>

              <Divider sx={{ my: 2 }} />
              <VersionSnapshotPanel version={snapshotVersion} changes={changes} flags={allFlags} />

              <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleOutlineIcon />}
                  disabled={!canReview}
                  onClick={() => openDecision('approved')}
                >
                  批准此版本
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CancelOutlinedIcon />}
                  disabled={latestVersion?.status !== 'pending'}
                  onClick={() => openDecision('rejected')}
                >
                  驳回此版本
                </Button>
                {needsResubmission && (
                  <Button variant="outlined" startIcon={<SendOutlinedIcon />} loading={submitState.isLoading} onClick={() => void resubmitCurrentDraft()}>
                    固定当前草稿并重审
                  </Button>
                )}
              </Stack>
              {!canReview && latestVersion?.status === 'pending' && blockerCount > 0 && (
                <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 1 }}>
                  阻断问题未清零，不能批准。
                </Typography>
              )}
            </CardContent>
          </Card>
        )}
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{decision === 'approved' ? `批准 v${latestVersion?.versionNumber} 快照` : `驳回 v${latestVersion?.versionNumber} 快照`}</DialogTitle>
        <DialogContent dividers>
          <TextField
            label="评审意见"
            multiline
            minRows={3}
            fullWidth
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          {decision === 'approved' && (
            <>
              <TextField select label="审批冻结策略" fullWidth sx={{ mt: 2 }} value={freezeUntil} onChange={(event) => setFreezeUntil(event.target.value)}>
                <MenuItem value="">不冻结扩大流量</MenuItem>
                <MenuItem value="2026-10-01 09:00">冻结至 10 月 1 日 09:00</MenuItem>
                <MenuItem value="2026-10-03 09:00">冻结至 10 月 3 日 09:00</MenuItem>
              </TextField>
              <Alert severity="info" sx={{ mt: 2 }}>
                批准记录版本号、校验和、审批人与当时看到的受众、依赖和回滚边界。
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            color={decision === 'approved' ? 'success' : 'error'}
            disabled={reviewState.isLoading}
            onClick={() => void submitDecision()}
          >
            {decision === 'approved' ? '确认批准' : '确认驳回'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
