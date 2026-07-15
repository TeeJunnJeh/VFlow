export type AgentImageEditScope = 'local' | 'global';

export interface AgentImageEditSource {
  messageId: string;
  url: string;
  name?: string;
  role?: string;
  derivedFrom?: string;
  versionKind?: 'original' | 'edited';
  versionNumber?: number;
}

export interface AgentImageEditSubmission {
  source: AgentImageEditSource;
  scope: AgentImageEditScope;
  prompt: string;
  maskBlob?: Blob;
}

export type AgentImageEditQueueStatus =
  | 'arranging'
  | 'queued'
  | 'uploading'
  | 'submitting'
  | 'processing'
  | 'completed'
  | 'failed';

export interface AgentImageEditSubmissionRecord {
  client_submission_id: string;
  run_id: string;
  status: AgentImageEditQueueStatus;
  run_status: string;
  source_message_id: string;
  source_image_url: string;
  edit_scope: AgentImageEditScope;
  prompt: string;
  mask_url?: string;
  error?: string;
  accepted: boolean;
  retry_after_ms?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AgentImageEditQueueJob {
  clientSubmissionId: string;
  conversationId: string;
  runId?: string;
  existingRunId?: string;
  source: AgentImageEditSource;
  scope: AgentImageEditScope;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  maskBlob?: Blob;
  maskUrl?: string;
  resultSource?: AgentImageEditSource;
  status: AgentImageEditQueueStatus;
  error?: string;
  retryRequested?: boolean;
  createdAt: number;
  updatedAt: number;
}
