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
import HistoryToggleOffOutlinedIcon from '@mui/icons-material/HistoryToggleOffOutlined'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { clearReviewSelection, toggleReviewSelection } from '@/app/uiSlice'
import { useGetFlagsQuery, useGetIssuesQuery, useReviewFlagMutation } from '@/services/flagApi'
import { FlagStatusChip } from '@/components/FlagStatusChip'
import { RevisionBadge } from '@/components/RevisionBadge'
import { BoundaryDiff, RevisionSnapshotView } from '@/components/RevisionDiff'
import { actionableRevision, formatRevisionTime, reviewableRevision } from '@/services/revisionUtils'
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
  const { data: issues = [] } = useGetIssuesQuery({ resolved: false })
  // 评审队列：有待评审/待确认版本，或已因配置变化退回重审的开关
  const flags = allFlags.filter((flag) => flag.status === 'review' || actionableRevision(flag))
  const [reviewFlag, reviewState] = useReviewFlagMutation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [comment, setComment] = useState('')
  const [freezeUntil, setFreezeUntil] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (flags.length > 0 && selectedIds.length === 0) dispatch(toggleReviewSelection(flags[0].id))
  }, [dispatch, flags, selectedIds.length])

  const activeFlag = flags.find((flag) => flag.id === selectedIds.at(-1)) ?? flags[0]
  const activeRevision = reviewableRevision(activeFlag)
  const pendingRevision = actionableRevision(activeFlag)
  const flagNameById = new Map(allFlags.map((flag) => [flag.id, `${flag.name} · ${flag.key}`]))
  const activeIssues = issues.filter((issue) => issue.flagId === activeFlag?.id)
  const blockerCount = activeIssues.filter((issue) => issue.severity === 'blocker').length
  const isLegacy = pendingRevision?.status === 'pending-confirmation'
  const drifted =
    activeRevision?.status === 'invalidated' ||
    (pendingRevision !== undefined && activeRevision !== undefined && pendingRevision.id !== activeRevision.id)

  const openDecision = (value: 'approved' | 'rejected') => {
    if (!activeFlag || !pendingRevision) return
    setDecision(value)
    setComment(value === 'approved' ? '规则、依赖、指标与回滚条件均已核对。' : '存在未解决的影响问题，请修改后重新送审。')
    setDialogOpen(true)
  }

  const submitDecision = async () => {
    if (!activeFlag || !pendingRevision || comment.trim().length < 8) {
      setMessage('评审意见至少 8 个字符')
      return
    }
    if (decision === 'approved' && blockerCount > 0) {
      setMessage('阻断问题未清零，不能批准发布')
      return
    }
    try {
      await reviewFlag({
        id: activeFlag.id,
        payload: {
          reviewer: '林默',
          decision,
          comment,
          freezeUntil: freezeUntil || undefined,
          revisionId: pendingRevision.id,
        },
      }).unwrap()
      setDialogOpen(false)
      dispatch(clearReviewSelection())
      setFreezeUntil('')
      setMessage(
        decision === 'approved'
          ? `已批准 v${pendingRevision.version}，生效配置与该版本快照一致`
          : `已驳回 v${pendingRevision.version}，开关退回草稿`,
      )
    } catch (error) {
      const detail = error && typeof error === 'object' && 'data' in error
        ? ((error as { data?: { message?: string } }).data?.message ?? '审批提交失败，请重试')
        : '审批提交失败，请重试'
      setMessage(detail)
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
            每次送审都固化为不可变版本，记录当时的受众、依赖和回滚边界；批准只对所看到的那一版生效。
          </Typography>
        </Box>
        <Chip label={`${flags.length} 项待评审`} color="warning" variant="outlined" />
      </Box>

      {message && (
        <Alert severity={message.includes('失败') || message.includes('不能') ? 'error' : 'success'} onClose={() => setMessage('')} sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      <Box className="review-layout">
        <Card>
          <Box className="card-header-block">
            <Typography variant="h3">评审队列</Typography>
            <Typography variant="caption" color="text.secondary">选择开关查看送审版本、边界变化并给出决定</Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>功能开关</TableCell>
                  <TableCell>送审版本</TableCell>
                  <TableCell>灰度</TableCell>
                  <TableCell>阻塞问题</TableCell>
                  <TableCell>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {flags.map((flag) => {
                  const revision = reviewableRevision(flag)
                  const pending = actionableRevision(flag)
                  const stale = revision?.status === 'invalidated' || (pending === undefined && revision !== undefined)
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
                        <Typography variant="caption" color="text.secondary">{flag.owner} · {flag.team}</Typography>
                      </TableCell>
                      <TableCell>
                        {revision ? <RevisionBadge revision={revision} /> : <Typography variant="caption">无版本</Typography>}
                        {stale && (
                          <Typography variant="caption" color="error.main" display="block" sx={{ mt: 0.3 }}>
                            配置已变 · 需重审
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{flag.rolloutPercentage}%</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={issueCount(flag) > 0 ? 'error' : 'success'}
                          label={`${issueCount(flag)} 项`}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell><FlagStatusChip status={flag.status} /></TableCell>
                    </TableRow>
                  )
                })}
                {!isLoading && flags.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 5 }} color="text.secondary">
                      当前没有待评审开关
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        {activeFlag && activeRevision && (
          <Card className="review-detail">
            <CardContent>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                <Box>
                  <Typography variant="h3">{activeFlag.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{activeFlag.key}</Typography>
                </Box>
                <FlagStatusChip status={activeFlag.status} />
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                <RevisionBadge revision={activeRevision} showHash={Boolean(pendingRevision && pendingRevision.id === activeRevision.id)} />
                <Chip size="small" variant="outlined" label={`送审人 ${activeRevision.submittedBy}`} />
                <Chip size="small" variant="outlined" label={`送审时间 ${formatRevisionTime(activeRevision.submittedAt)}`} />
              </Stack>

              {isLegacy && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  这是旧开关首次启用时按运行中配置生成的待确认版本；版本固化前的原审计记录已完整保留，请核对后补确认。
                </Alert>
              )}

              {activeRevision.status === 'invalidated' && (
                <Alert severity="error" sx={{ mt: 2 }} icon={<WarningAmberOutlinedIcon fontSize="inherit" />}>
                  该批准已因配置变化立即失效，灰度停在 {activeFlag.rolloutPercentage}%，以下标出与已批准版本的差异，需工程师重新送审。
                </Alert>
              )}
              {activeRevision.status === 'superseded' && (
                <Alert severity="warning" sx={{ mt: 2 }} icon={<WarningAmberOutlinedIcon fontSize="inherit" />}>
                  工程师在送审后继续修改了配置，该送审版本已被新草稿取代，不能批准此版本。
                </Alert>
              )}
              {activeRevision.status === 'rejected' && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  该版本此前已被驳回，等待工程师修改后重新送审。
                </Alert>
              )}

              <Box className="review-facts">
                <Box><Typography variant="caption">目标环境</Typography><Typography fontWeight={700}>{activeFlag.environment.toUpperCase()}</Typography></Box>
                <Box><Typography variant="caption">固化灰度</Typography><Typography fontWeight={700}>{activeRevision.snapshot.rolloutPercentage}%</Typography></Box>
                <Box><Typography variant="caption">受众规则</Typography><Typography fontWeight={700}>{activeRevision.snapshot.audienceRules.length} 条</Typography></Box>
                <Box><Typography variant="caption">监控指标</Typography><Typography fontWeight={700}>{activeRevision.snapshot.metricNames.length} 个</Typography></Box>
              </Box>

              {(activeRevision.status === 'invalidated' || activeRevision.status === 'superseded') && activeRevision.changes.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h3" sx={{ mb: 1 }}>
                    {activeRevision.status === 'invalidated' ? '批准后变化（导致旧批准失效）' : '送审后变化（导致版本作废）'}
                  </Typography>
                  <BoundaryDiff changes={activeRevision.changes} flagNameById={flagNameById} />
                </>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="h3" sx={{ mb: 1.5 }}>
                送审版本 v{activeRevision.version} 固化内容
              </Typography>
              <RevisionSnapshotView revision={activeRevision} flagNameById={flagNameById} />

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
                {activeIssues.length === 0 && (
                  <Alert severity="success">未发现配置影响问题，可对该送审版本给出人工审批。</Alert>
                )}
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleOutlineIcon />}
                  disabled={!pendingRevision || blockerCount > 0 || drifted}
                  onClick={() => openDecision('approved')}
                >
                  {isLegacy ? '确认旧开关版本' : '批准该版本发布'}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CancelOutlinedIcon />}
                  disabled={!pendingRevision}
                  onClick={() => openDecision('rejected')}
                >
                  驳回该版本
                </Button>
                {!pendingRevision && (
                  <Alert severity="warning" icon={<HistoryToggleOffOutlinedIcon fontSize="inherit" />}>
                    当前没有可批准的送审版本，等待工程师重新送审；运行流量维持在 {activeFlag.rolloutPercentage}%。
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {decision === 'approved'
            ? isLegacy
              ? `确认旧开关版本 v${pendingRevision?.version}`
              : `批准送审版本 v${pendingRevision?.version}`
            : `驳回送审版本 v${pendingRevision?.version}`}
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            指纹 {pendingRevision?.boundaryHash}：批准只绑定该版本固化的受众、依赖与回滚边界；灰度开始后这些内容再变，批准立即失效。
          </Alert>
          <TextField
            label="评审意见"
            multiline
            minRows={3}
            fullWidth
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          {decision === 'approved' && (
            <TextField
              select
              label="审批冻结策略"
              fullWidth
              sx={{ mt: 2 }}
              value={freezeUntil}
              onChange={(event) => setFreezeUntil(event.target.value)}
            >
              <MenuItem value="">不冻结扩大流量</MenuItem>
              <MenuItem value="2026-10-01 09:00">冻结至 10 月 1 日 09:00</MenuItem>
              <MenuItem value="2026-10-03 09:00">冻结至 10 月 3 日 09:00</MenuItem>
            </TextField>
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
