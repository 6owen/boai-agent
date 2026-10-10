/*
 * [INPUT]: Lody固定源码 packages/shared/src/session-comment-types.ts; ai.ts; code-collab.ts；类型声明原段提取 @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-comment-types.ts; ai.ts; code-collab.ts；类型声明原段提取；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
export type CommentAnchorType = 'diff' | 'file';

export type DiffCommentSide = 'additions' | 'deletions';

export interface CommentAnchor {
  anchorType: CommentAnchorType;
  path: string;
  lineNumber: number;
  lineContent?: string;
  side?: DiffCommentSide;
  turnId?: string;
  mode?: 'conversation' | 'base';
}

export interface GitHubUser {
  login: string;
  id: number;
  avatarUrl: string;
  htmlUrl: string;
}

export type GitHubAuthorAssociation =
  | 'COLLABORATOR'
  | 'CONTRIBUTOR'
  | 'FIRST_TIMER'
  | 'FIRST_TIME_CONTRIBUTOR'
  | 'MANNEQUIN'
  | 'MEMBER'
  | 'NONE'
  | 'OWNER';

export interface GitHubReactionRollup {
  totalCount: number;
  '+1': number;
  '-1': number;
  laugh: number;
  hooray: number;
  confused: number;
  heart: number;
  rocket: number;
  eyes: number;
}

export interface GitHubReviewComment {
  id: number;
  nodeId: string;
  pullRequestReviewId: number | null;
  body: string;
  path: string;
  commitId: string;
  originalCommitId: string;
  diffHunk: string;
  inReplyToId?: number;
  subjectType: 'line' | 'file';
  user: GitHubUser | null;
  authorAssociation: GitHubAuthorAssociation;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  line: number | null;
  originalLine: number | null;
  side: 'LEFT' | 'RIGHT';
  startLine: number | null;
  originalStartLine: number | null;
  startSide: 'LEFT' | 'RIGHT' | null;
  reactions?: GitHubReactionRollup;
}

export interface GitHubIssueComment {
  id: number;
  nodeId: string;
  body: string;
  user: GitHubUser | null;
  authorAssociation: GitHubAuthorAssociation;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  issueUrl: string;
  reactions?: GitHubReactionRollup;
}

export interface GitHubReviewThread {
  id: number;
  anchor: {
    path: string;
    line: number;
    side: 'LEFT' | 'RIGHT';
    startLine?: number | null;
    startSide?: 'LEFT' | 'RIGHT' | null;
  };
  comments: GitHubReviewComment[];
  outdated: boolean;
  diffHunk: string;
  subjectType: 'line' | 'file';
}

export type GitHubReviewState =
  | 'approved'
  | 'changes_requested'
  | 'commented'
  | 'dismissed'
  | 'pending';

/**
 * A PR review submission — the summary/body written when a reviewer submits a
 * review via `POST /reviews`. Line-anchored comments that belong to the same
 * review are modeled separately as `GitHubReviewThread`.
 */
export interface GitHubReview {
  id: number;
  nodeId: string;
  body: string;
  state: GitHubReviewState;
  user: GitHubUser | null;
  authorAssociation: GitHubAuthorAssociation;
  commitId: string | null;
  submittedAt: string | null;
  htmlUrl: string;
}

export type GitHubPullRequestState = 'open' | 'closed';

/**
 * GitHub's `mergeable_state` values. Upstream docs are partially undocumented;
 * the set below is what GitHub has been observed to return.
 */
export type GitHubMergeableState =
  | 'clean'
  | 'dirty'
  | 'blocked'
  | 'behind'
  | 'unstable'
  | 'has_hooks'
  | 'draft'
  | 'unknown';

export type GitHubMergeMethod = 'merge' | 'squash' | 'rebase';

export interface GitHubPullRequestDetails {
  number: number;
  /** GitHub GraphQL global node id (e.g. `PR_kwDO...`). Required by the
   *  `markPullRequestReadyForReview` GraphQL mutation, which has no REST
   *  equivalent. */
  nodeId: string;
  title: string;
  body: string;
  state: GitHubPullRequestState;
  merged: boolean;
  draft: boolean;
  htmlUrl: string;
  baseRef: string;
  /** The immutable base commit used to open this pull request, when GitHub provides it. */
  baseSha?: string;
  headRef: string;
  headSha: string;
  user: GitHubUser | null;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  /** `null` while GitHub is still computing the merge status. */
  mergeable: boolean | null;
  /** See `GitHubMergeableState`. Normalized to `'unknown'` when absent. */
  mergeableState: GitHubMergeableState;
}

/** A commit exposed by the pull request commits endpoint. */
export interface GitHubPullRequestCommit {
  sha: string;
  message: string;
  authorLogin: string | null;
  authoredAt: string | null;
  htmlUrl: string | null;
  parentSha: string | null;
}

/** A file returned by GitHub's compare endpoint. */
export interface GitHubPullRequestFile {
  path: string;
  previousPath: string | null;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed';
  additions: number;
  deletions: number;
  changes: number;
  sha: string | null;
  blobUrl: string | null;
  rawUrl: string | null;
  patch: string | null;
}

/** Compare response metadata used to locate the actual left side of the diff. */
export interface GitHubCommitComparison {
  mergeBaseSha: string | null;
  files: GitHubPullRequestFile[];
}

export type GitHubCheckRunStatus = 'queued' | 'in_progress' | 'completed';

export type GitHubCheckRunConclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'timed_out'
  | 'action_required'
  | 'stale'
  | 'skipped'
  | null;

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: GitHubCheckRunStatus;
  conclusion: GitHubCheckRunConclusion;
  htmlUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  appName: string | null;
}

export interface GitHubCheckRunsSummary {
  status: GitHubCheckRunStatus | 'none';
  conclusion: GitHubCheckRunConclusion;
  total: number;
  runs: GitHubCheckRun[];
}

export interface CommentAnnotationMeta {
  key: string;
  threadId?: string;
  kind: 'github-thread' | 'draft';
  source: 'github';
}

export interface CommentUser {
  id: string;
  name: string;
  image?: string | null;
}

export interface DiffViewerCommentCallbacks {
  onReplyGitHubThread?: (input: { githubCommentId: number; body: string }) => void | Promise<void>;
  onCreateThreadToGitHub?: (input: { anchor: CommentAnchor; body: string }) => void | Promise<void>;
  onSendToChat?: (reference: CommentReferencePayload) => boolean | void;
}

export type CommentReferenceReply = {
  authorName: string;
  body: string;
};

export type CommentReferencePayload = {
  /** Source: Lody internal comment or GitHub review comment */
  source: 'lody' | 'github';
  /** Relative file path */
  path: string;
  /** Line number */
  lineNumber: number;
  /** Diff side */
  side: 'additions' | 'deletions';
  /** Root comment body (Markdown) */
  commentBody: string;
  /** Root comment author name */
  authorName: string;
  /** Root comment author avatar URL */
  authorImage?: string;
  /** Thread replies (chronological order) */
  replies?: CommentReferenceReply[];
  /** Turn ID for conversation-mode diffs */
  turnId?: string;
  /** Diff mode */
  mode?: 'conversation' | 'base';
  /** Lody thread ID (for navigation) */
  threadId?: string;
  /** GitHub thread ID (for navigation) */
  githubThreadId?: number;
};


export type CodeCollabContentUnavailableReason = 'permission-denied' | 'locked' | 'transient-io' | 'text-too-large' | 'line-too-long' | 'unsupported-encoding' | 'unsupported-special' | 'blob-too-large' | 'path-collision' | 'unknown' | 'deleted' | 'metadata-only' | 'missing-text-frontiers' | 'missing-blob-digest' | 'blob-expired';
export interface CommentReferenceChipItem { localId: string; reference: CommentReferencePayload }
