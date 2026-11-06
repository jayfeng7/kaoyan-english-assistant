import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Config } from 'tailwindcss';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { ZodType, ZodTypeDef } from 'zod';
import type OpenAI from 'openai';
import type { Metadata } from 'next';

export type TailwindConfig = Config;
export type { ReactNode };
export type NextMetadata = Metadata;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  provider?: ProviderId;
}

export interface ChildrenProps { children: ReactNode }
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
}
export interface CardProps extends HTMLAttributes<HTMLElement> { as?: 'section' | 'article' | 'div' }
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
  characterLimit?: number;
}
export interface BadgeProps { children: ReactNode; tone?: 'neutral' | 'accent' | 'warning' }
export interface SkeletonProps { className?: string; label?: string }
export interface MarkdownProps { content: string; className?: string }
export interface TabItem { id: string; label: string; disabled?: boolean }
export interface TabsProps {
  label: string;
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  children?: ReactNode;
}
export interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}
export interface ToastMessage { id: string; text: string; tone: 'info' | 'success' | 'error' }
export interface ToastContextValue { notify: (text: string, tone?: ToastMessage['tone']) => void }
export interface NavigationItem { href: string; label: string; icon: LucideIcon }
export interface PageContainerProps { children: ReactNode; className?: string; width?: 'wide' | 'reading' }
export interface PageIntroProps { eyebrow: string; title: string; description: string; children?: ReactNode; compact?: boolean }
export interface ErrorPageProps { error: Error & { digest?: string }; reset: () => void }

export type ExamType = 'english1' | 'english2';
export type CompositionType = 'big' | 'small';
export type ExamSource = 'bank' | 'paste' | 'pdf';
export type HistoryType = 'essay' | 'sentence' | 'exam' | 'chat';
export type Timestamp = number;
export type ProviderId = 'deepseek' | 'siliconflow' | 'openrouter';
export type ErrorCode = 'ESSAY_REVIEW_REQUIRED' | 'INVALID_INPUT' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_FILE_TYPE' | 'RATE_LIMITED' | 'PDF_PARSE_FAILED' | 'OCR_FAILED' | 'ALL_PROVIDERS_FAILED' | 'JSON_PARSE_FAILED' | 'EXAM_BANK_NOT_FOUND' | 'INTERNAL_ERROR';
export type Schema<T> = ZodType<T, ZodTypeDef, unknown>;
export interface TextFallback { text: string }
export type FeatureResult<T> = T | TextFallback;

export interface LowConfidenceWord { word: string; confidence: number; start: number; end: number }
export interface OcrResult { text: string; confidence: number; lowConfidenceWords: LowConfidenceWord[]; body?: EssayBodySelection }
export interface SentenceAnnotation {
  index: number; original: string; type: 'problem' | 'highlight' | 'neutral';
  comment: string; correction?: string; grammarPoint?: string;
}
export interface ScoreCard {
  band: { level: 0 | 1 | 2 | 3 | 4 | 5; name: string; range: string };
  score: number; bandReason: string;
  breakdown: { content: number; language: number; structure: number };
}
export interface Expression { expression: string; meaning: string; example: string }
export interface EssayResult {
  scoreCard: ScoreCard; overallComment: string; sentenceAnnotations: SentenceAnnotation[];
  improvedEssay: string; modelEssay: string; expressions: Expression[]; suggestions: string[];
}
export interface EssayReferenceResult { improvedEssay: string; modelEssay: string; expressions: Expression[] }
export interface EssayCoreResult { kind: 'core'; scoreCard: ScoreCard; overallComment: string; sentenceAnnotations: SentenceAnnotation[]; suggestions: string[]; reference?: EssayReferenceResult }
export type EssayReport = EssayResult | EssayCoreResult;
export type EssayPreviewField = 'overallComment' | 'improvedEssay' | 'modelEssay';
export interface EssayStreamPreview { overallComment: string; improvedEssay: string; modelEssay: string; sentenceAnnotations: SentenceAnnotation[]; scoreCard?: ScoreCard }
export type EssayStreamEvent =
  | { type: 'status'; stage: 'generating' }
  | { type: 'score'; scoreCard: ScoreCard }
  | { type: 'preview'; field: EssayPreviewField; text: string } // text is an append-only delta, never a score.
  | { type: 'annotation'; annotation: SentenceAnnotation }
  | { type: 'done'; data: FeatureResult<EssayReport>; provider: ProviderId }
  | { type: 'error'; message: string; code: ErrorCode };
export interface EssayStreamingReportProps { preview: EssayStreamPreview; busy: boolean; stopped: boolean; startedAt: number; error?: string; max?: number; onStop: () => void }
export interface EssayData {
  id: string; type: ExamType; composition: CompositionType; title: string; prompt: string;
  essay: string; wordCount: number; ocrResult?: OcrResult; createdAt: Timestamp;
  result?: FeatureResult<EssayReport>; provider?: ProviderId; followUps?: ChatMessage[];
  source?: EssaySource; bankId?: string; year?: number; sourceLabel?: string;
}
export type EssaySource = 'custom' | 'bank';
export interface EssayBankItem {
  id: string; type: ExamType; composition: CompositionType; year: number; title: string;
  directions: string; materialDescription: string; materialImage?: string; source: string; reviewed: boolean;
}
export type EssayBankMeta = Pick<EssayBankItem, 'id' | 'type' | 'composition' | 'year' | 'title'>;
export interface EssayBankFilter { type?: ExamType; composition?: CompositionType; year?: number }
export interface EssayBankList { items: EssayBankMeta[]; total: number }
export interface EssayBankReader { list: (filter?: EssayBankFilter) => Promise<EssayBankList>; get: (id: string) => Promise<EssayBankItem> }
export interface EssayPdfPage { number: number; method: 'text' | 'ocr'; text: string; ocr?: OcrResult }
export interface EssayPdfResult { pages: EssayPdfPage[]; total: number }
export interface EssayPdfExtractPage { number: number; text: string; image?: string }
export interface EssayPdfExtractResult { pages: EssayPdfExtractPage[]; total: number }
export interface EssayBodySelection { text: string; status: 'ready' | 'review'; excludedLines: number }
export interface EssayBodyRequest { text: string }
export interface EssayBodyRanges { ranges: { from: number; to: number }[]; uncertain: boolean }
export interface EssayUploadReview { pageCompleteness?: 'unknown' | 'full' | 'partial'; pages: EssayPdfPage[]; confirmed: boolean; body?: EssayBodySelection }
export type PdfUploadProgress = (label: string) => void;
export interface EssayBankPickerProps { draft: EssayDraft; onSelect: (item: EssayBankItem) => void; onClear: () => void; disabled: boolean }
export interface EssayUploadProps { label: string; review?: EssayUploadReview; disabled: boolean; characterLimit: number; onBusyChange: (busy: boolean) => void; onChange: (review: EssayUploadReview | undefined) => void }
export interface Clause { type: string; text: string; function: string }
export interface SentenceResult {
  segments: string[]; trunk: string; clauses: Clause[]; modifiers: string[];
  translation: string; grammarPoints: string[]; imitation: string;
}
export interface SentenceData {
  id: string; sentence: string; createdAt: Timestamp;
  result?: FeatureResult<SentenceResult>; provider?: ProviderId; followUps?: ChatMessage[];
}
export interface ParagraphAnalysis { index: number; summary: string; keySentences: string[] }
export interface Vocabulary { word: string; meaning: string; note?: string }
export interface QuestionAnalysis { questionType: string; answer: string; locating: string; reasoning: string }
export interface DistractorAnalysis { option: string; text: string; reason: string }
export interface ExamResult {
  passageAnalysis: { paragraphs: ParagraphAnalysis[]; vocabulary: Vocabulary[] };
  questionAnalysis: QuestionAnalysis; distractorAnalysis: DistractorAnalysis[]; fullTranslation: string | null;
}
export interface ExamData {
  id: string; type: ExamType; source: ExamSource; bankId?: string; passage: string;
  questionId?: string; question?: string; options?: string[]; userAnswer?: string; sourceLabel?: string; createdAt: Timestamp;
  result?: FeatureResult<ExamResult>; provider?: ProviderId; followUps?: ChatMessage[];
}
export interface ExamBankQuestion { id: string; question: string; options: string[]; answer: string; analysis?: string }
export interface ExamBankItem { id: string; type: ExamType; year: number; section: string; title?: string; passage: string; questions: ExamBankQuestion[] }
export type ExamBankMeta = Pick<ExamBankItem, 'id' | 'type' | 'year' | 'section' | 'title'>;
export interface ExamBankFilter { type?: ExamType; year?: number; q?: string }
export interface ExamBankList { items: ExamBankMeta[]; total: number }
export interface ChatMessage {
  id: string; role: 'user' | 'assistant'; content: string; createdAt: Timestamp;
  status: 'streaming' | 'done' | 'error'; provider?: string; citations?: EssayCitation[];
}
export interface EssayCitation { label: number; id: string; title: string; excerpt: string; example: string }
export interface ChatData { id: string; title: string; messages: ChatMessage[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface FollowUpContext { kind: HistoryType; summary: string; dataRef?: string }
export interface HistoryRecord {
  id: string; type: HistoryType; title: string; preview: string;
  createdAt: Timestamp; updatedAt: Timestamp; data: EssayData | SentenceData | ExamData | ChatData;
}
export interface AppSettings {
  provider: 'auto' | ProviderId; essayType: ExamType; composition: CompositionType;
  defaultFullTranslation: boolean; fontSize: number;
}
export interface RagItem { text: string; source: string; score: number }
export interface RagContext { items: RagItem[]; source: string }
export interface RouterResult { agent: HistoryType; confidence: number; reason: string }

export interface EssayInputEvidence { origin: 'ocr'; reviewed: boolean; pageCompleteness: 'unknown' | 'full' | 'partial'; bodyStatus: 'ready' | 'review'; confidence: number; uncertainSegments: number }
export interface EssayCorrectRequest { inputEvidence?: EssayInputEvidence; type: ExamType; composition: CompositionType; prompt: string; essay: string; wordCount?: number; source?: EssaySource; bankId?: string; report?: 'core' | 'full' }
export interface SentenceAnalyzeRequest { sentence: string }
export interface ExamAnalyzeRequest {
  type: ExamType; source: ExamSource; bankId?: string; passage?: string;
  questionId?: string; question?: string; options?: string[]; userAnswer?: string; translate?: boolean;
}
export interface ChatRequestMessage { role: 'user' | 'assistant'; content: string }
export interface ChatRequest { messages: ChatRequestMessage[]; historyId?: string; followUp?: FollowUpContext }
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export interface OcrRequest { image: string; mime: ImageMime; selectBody?: boolean }
export type ChatStreamEvent = { type: 'delta'; content: string } | { type: 'done'; provider: ProviderId; citations?: EssayCitation[] } | { type: 'error'; message: string; code: ErrorCode };
export interface HealthData { status: 'ok'; providers: ProviderId[]; ocr: boolean; examBankCount: number; time: Timestamp }

export type ServerEnvironment = Record<string, string | undefined>;
export interface ProviderConfig { id: ProviderId; apiKey: string; baseURL: string; model: string }
export interface LlmParams { system: string; user: string; temperature?: number; json?: boolean; signal?: AbortSignal; maxTokens?: number }
export interface LlmResult { content: string; provider: ProviderId }
export type ProviderCall = (provider: ProviderConfig, params: LlmParams) => Promise<string>;
export interface FallbackOptions { providers?: ProviderConfig[]; call?: ProviderCall }
export type StructuredStreamCall = (provider: ProviderConfig, params: LlmParams) => AsyncIterable<string>;
export interface StructuredStreamOptions { providers?: ProviderConfig[]; call?: StructuredStreamCall; scoreSchema?: Schema<ScoreCard> }
export type OpenAIClient = OpenAI;
export type ProviderChatRequest = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & { thinking?: { type: 'disabled' } };
export type FailureKind = 'timeout' | 'rate_limit' | 'server_error' | 'empty' | 'json_parse';
export type JsonRepairResult = { success: true; data: unknown } | { success: false; text: string };
export interface ProviderFailureDetails { kind: FailureKind }
export type RateLimitKind = 'llm' | 'ocr';
export interface RateLimitConfig { max: number; windowMs: number }
export interface DailyBudgetConfig { max: number; windowMs: number }
export interface RateLimitBucket { count: number; resetAt: number }
export interface RateLimitResult { allowed: boolean; remaining: number; resetAt: number; retryAfter: number }
export interface RequestLog { id: string; durationMs: number; provider?: ProviderId; wordCount?: number; code?: ErrorCode; formatFailure?: 'json' | 'schema'; formatIssueCount?: number }

export interface SettingsRow extends AppSettings { id: 'app' }
export interface AssistantDatabase extends DBSchema {
  history: { key: string; value: HistoryRecord; indexes: { type: HistoryType; createdAt: number } };
  settings: { key: string; value: SettingsRow };
}
export type BrowserDatabase = IDBPDatabase<AssistantDatabase>;
export interface StorageStatus { mode: 'checking' | 'persistent' | 'memory' }
export interface HistoryFilter { type?: HistoryType; q?: string }
export interface HistorySelection { id?: string; type?: HistoryType }
export interface BackupData { history: HistoryRecord[]; settings: AppSettings }
export interface ExamBankReader {
  getBankList: (filter?: ExamBankFilter) => Promise<ExamBankList>;
  getBankItem: (id: string) => Promise<ExamBankItem>;
  getBankCount: () => Promise<number>;
}

export interface ApiContext { id: string; startedAt: number; provider?: ProviderId; wordCount?: number; retryAfter?: number; formatFailure?: 'json' | 'schema'; formatIssueCount?: number }
export interface ApiData<T> { data: T; provider?: ProviderId }
export type ApiHandler<T> = (context: ApiContext) => Promise<ApiData<T>>;
export interface BankRouteContext { params: Promise<{ id: string }> }
export interface ExamPromptInput extends ExamAnalyzeRequest { passage: string; referenceAnswer?: string; referenceAnalysis?: string }
export interface ChatStreamParams { system: string; messages: ChatRequestMessage[]; signal?: AbortSignal }
export type ProviderStreamCall = (provider: ProviderConfig, params: ChatStreamParams) => AsyncIterable<string>;
export interface StreamFallbackOptions { providers?: ProviderConfig[]; call?: ProviderStreamCall; onProvider?: (provider: ProviderId) => void }
export interface BaiduToken { access_token: string; expires_in: number }
export interface BaiduOcrResponse { words_result: { words: string; probability: { average: number } }[] }
export interface CachedOcrToken { value: string; refreshAt: number }

export interface RouteRequest { input: string }
export interface PdfTextResult { text: string }
export interface FeaturePageProps { searchParams: Promise<{ history?: string }> }
export interface HistoryFormProps { historyId?: string }
export type FeatureData = EssayData | SentenceData | ExamData;
export interface EssayDraft { type: ExamType; composition: CompositionType; prompt: string; essay: string; ocrResult?: OcrResult; ocrText: string; ocrConfirmed: boolean; ocrPageCompleteness?: 'unknown' | 'full' | 'partial'; record?: EssayData; source?: EssaySource; bankItem?: EssayBankItem; year?: number; bankId?: string; customPrompt?: string; promptReview?: EssayUploadReview; essayReview?: EssayUploadReview }
export interface SentenceDraft { sentence: string; record?: SentenceData }
export interface ExamDraft { type: ExamType; source: ExamSource; bankId: string; questionId: string; passage: string; pdfPassage: string; question: string; optionsText: string; userAnswer: string; translate: boolean; bankItem?: ExamBankItem; record?: ExamData }
export interface WorkspaceState {
  ready: boolean; settings: AppSettings; homeInput: string; essay: EssayDraft; sentence: SentenceDraft; exam: ExamDraft; chat: ChatData | undefined; chatInput: string;
}
export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> { label: string; children: ReactNode }
export interface ResultSectionProps { title: string; children: ReactNode }
export interface ScoreCardProps { value: ScoreCard; max: number; expanded?: boolean; provisional?: boolean }
export interface AnnotationListProps { items: SentenceAnnotation[]; embedded?: boolean }
export interface ExpressionListProps { items: Expression[] }
export interface TextResultProps { text: string }
export interface SentenceResultViewProps { result: SentenceResult }
export interface PassageAnalysisProps { value: ExamResult['passageAnalysis'] }
export interface QuestionAnalysisProps { value: QuestionAnalysis }
export interface DistractorListProps { items: DistractorAnalysis[] }
export interface ChatWindowProps { messages: ChatMessage[]; loading?: boolean; emptyTitle?: string; emptyDescription?: string }
export interface ChatScrollState { following: boolean; reviewMoved: boolean; top: number }
export interface ChatInputProps { value: string; onChange: (value: string) => void; onSend: () => void; loading: boolean; disabled?: boolean; onStop: () => void; label?: string; placeholder?: string }
export interface ConversationPanelProps extends ChatWindowProps { title: string; description?: string; input: ChatInputProps; error?: string; onRetry?: () => void; actions?: ReactNode; compact?: boolean; workspace?: boolean }
export interface MessageBubbleProps { message: ChatMessage }
export interface ConversationFailure { historyId?: string; message: string; retryText: string }
export interface ConversationOptions { getMessages: () => ChatMessage[]; onMessages: (messages: ChatMessage[]) => void; onSettled: (messages: ChatMessage[]) => Promise<void>; onStarted?: (messages: ChatMessage[]) => Promise<void>; followUp?: FollowUpContext; historyId?: string }
export interface FeatureFollowUpProps<T extends FeatureData> { record?: T; onChange: (record: T) => void; disabled?: boolean; onSettled?: (record: T) => Promise<void> }
export interface OcrReviewProps { result: OcrResult; text: string; onChange: (value: string) => void; onConfirm: () => void; busy: boolean; valid: boolean; confirmed: boolean; heading?: string; textLabel?: string; characterLimit?: number; showConfirm?: boolean; confirmLabel?: string; automatic?: boolean }
export interface ExamBankPickerProps { draft: ExamDraft; onChange: (patch: Partial<ExamDraft>) => void; disabled: boolean }
export interface HistoryFilterProps { type: HistoryType | ''; query: string; onType: (type: HistoryType | '') => void; onQuery: (query: string) => void }
export interface HistoryItemProps { record: HistoryRecord; onDelete: (record: HistoryRecord) => void }
export type TaskOperation<T = unknown> = (signal: AbortSignal) => Promise<T>;
export interface TaskFeedbackProps { error?: string; onRetry?: () => void; disabled?: boolean }
export interface AnalysisLoadingProps { label: string }
export interface EssayPdfOptions { mode: 'auto' | 'scan'; recognize: 'true' | 'false' }
export interface ApiUploadOptions { signal: AbortSignal; onProgress: (loaded: number, total: number) => void; onUploaded: () => void }
export interface OcrScheduleEntry { resolve: () => void; reject: (error: unknown) => void; signal?: AbortSignal; cancel: () => void }
export interface OcrScheduleState { nextStartAt: number; queue: OcrScheduleEntry[]; timer?: ReturnType<typeof setTimeout> }
export interface OcrScheduleRuntime { __kaoyanOcrSchedule?: OcrScheduleState }
export interface EssayReportProps { record: EssayData; expanded?: boolean; part?: 'all' | 'summary' | 'details' }
export interface EssayDetailProps { title: string; description?: string; children: ReactNode; onOpen?: () => void }
export interface EssayReferenceProps { record: EssayData; onChange: (record: EssayData) => Promise<void> }
// Offline acceptance reports contain metadata only, never input or model text.
export interface VerificationCheck { name: string; ok: boolean; status: number; ms: number; detail?: Record<string, unknown> }
export interface VerificationReport { base: string; mode: 'readonly' | 'full'; total: number; passed: number; failed: number; elapsedMs: number; at: string; results: VerificationCheck[] }
export type EvalVerdict = 'pass' | 'fail' | 'uncertain';
export type EvalCriterion = 'task_alignment' | 'feedback_correctness' | 'revision_consistency';
export interface EvalJudgment { criterion: EvalCriterion; verdict: EvalVerdict }
export interface EvalJudgeOutput { judgments: EvalJudgment[] }
export interface EssayEvalCase { id: string; input: EssayCorrectRequest; synthetic: boolean }
export interface EvalJudgeInput { input: EssayCorrectRequest; result: EssayResult }
export type EvalJudgeCall = (input: EvalJudgeInput, signal: AbortSignal) => Promise<{ output: unknown; provider: ProviderId }>;
export interface EssayEvalRecord {
  caseId: string; attempt: number; synthetic: boolean; status: 'structured' | 'text_fallback' | 'invalid_schema' | 'http_error' | 'transport_error';
  httpStatus: number; durationMs: number; provider?: ProviderId; score?: number; band?: number; apiCode?: ErrorCode;
  schemaValid: boolean; originalReferencesValid: boolean; commentReferencesValid: boolean;
  referenceIssues: { index: number; kind: 'missing_quote' | 'non_verbatim' | 'case_only' | 'ellipsis' }[];
  issueCodes: ('response_schema' | 'result_schema' | 'original_reference' | 'comment_reference' | 'http_error' | 'request_failed')[];
  judge: { status: 'completed' | 'invalid' | 'failed' | 'skipped'; provider?: ProviderId; failureKind?: FailureKind | 'unknown'; sameModel: true; judgments: EvalJudgment[] };
  teacherStatus: 'pending';
}
export interface EssayEvalReport { at: string; codeCommit: string; sourceFingerprint: string; workingTreeDirty: boolean; base: string; model: string; records: EssayEvalRecord[]; teacherStatus: 'pending'; allDeterministicPassed: boolean; teacherQualityPassed: false }
export type EvalHttpCall = (input: EssayCorrectRequest, signal: AbortSignal) => Promise<{ status: number; body: unknown }>;
export interface PublicEvalMaterial { id: string; file: string; url: string; source: string; author: string; license: string; sha256: string; mime: ImageMime | 'application/pdf'; referenceStatus: 'ai_visual_checked' | 'pending'; reference?: string; expectedPages?: number }
export interface CharacterErrorMetric { referenceCharacters: number; hypothesisCharacters: number; edits: number; cer: number }
export interface PublicFileEvalRecord { caseId: string; protocolStatus: 'pass' | 'fail'; shaValid: boolean; pages?: number; textPages?: number; imagePages?: number; ocrCharacters?: number; cer?: CharacterErrorMetric; normalizedCer?: CharacterErrorMetric; referenceStatus: 'ai_visual_checked' | 'pending'; accuracyAccepted: false; issueCodes: ('hash_mismatch' | 'file_or_api_failed')[] }
