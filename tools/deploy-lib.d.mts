// Types for tools/deploy-lib.mjs, for the tests that import it.
export interface BuildJson { v: number; configHash: string; files: Record<string, string> }
export interface FetchAnswer { status: number; ok: boolean; redirected: boolean; arrayBuffer(): Promise<ArrayBuffer> }
export type FetchLike = (url: string, init?: RequestInit) => Promise<FetchAnswer>;
export interface Timing { sleep: (ms: number) => Promise<void>; now?: () => number; deadlineMs?: number; intervalMs?: number }
export interface CheckResult { ok: boolean; problems: string[]; note?: string; reportError?: string }
export interface DeploymentRow {
  id?: string;
  source?: string;
  strategy?: string;
  author_email?: string;
  created_on: string;
  annotations?: Record<string, string>;
  versions: Array<{ version_id: string; percentage: number }>;
}
export type Gh = (args: string[]) => Promise<string>;

export const ISSUE_LABEL: string;
export const SWITCH_TAG: string;
export const ROLLBACK_MESSAGE: string;
export const REHEARSAL_WORKER: string;
export function rollbackSummary(version: string): string;
export function switchSummary(options: { kind: string; commit: string }): string;
export function emergencyFailureSummary(action: string, acted: boolean): string;
export function staleReason(options: { sha: string; head: string; approvedAttempt: string; thisAttempt: string }): string;
export function hasRequiredReviewer(environment: unknown): boolean;
export function commitOfVersion(details: unknown): string;
export function switchGuard(local: BuildJson, live: BuildJson | null, options: { alsoRelease: boolean }): { go: boolean; kind?: string; summary: string };
export function readLiveList(origin: string, options: { fetch: FetchLike }): Promise<string | null>;
export function formatRows(deployments: unknown, versions?: Record<string, { annotations?: Record<string, string> }>): string;
export function afterDeployCheck(options: { build: BuildJson | null; origin: string; uploadOutcome?: string; before?: string; live?: string; report?: boolean; gh?: Gh; runUrl?: string; fetch: FetchLike } & Timing): Promise<CheckResult>;

export function isStale(sha: string, head: string): boolean;
export function compareBuild(local: BuildJson, live: BuildJson | null): { same: boolean; changed: string[] };
export function fetchLiveBuild(origin: string, options: { fetch: FetchLike }): Promise<BuildJson | null>;
export function checkLive(buildJson: BuildJson, origin: string, options: { fetch: FetchLike } & Timing): Promise<CheckResult>;
export function checkSelf(origin: string, options: { fetch: FetchLike; changedFrom?: string } & Timing): Promise<CheckResult>;
export function decide(local: BuildJson, config: { deployEnabled?: unknown; deployWithoutReviewer?: unknown }, origin: string, options: { fetch: FetchLike; readApprovalEnv?: () => Promise<unknown> }): Promise<{ changed: boolean; check: boolean; summary: string }>;
export function uploadNeverArrived(options: { outcome: string; before: string; after: string }): boolean;
export function reportIssue(result: CheckResult, options: { gh: Gh; liveVersion: string; lastDeployActive: boolean; runUrl?: string }): Promise<void>;
export function liveVersionOf(deployments: unknown): string;
export function rollbackCandidates(deployments: unknown): string[];
export function pickRollback(deployments: unknown, options?: { named?: string; versions?: Record<string, { annotations?: Record<string, string> }> }): { versionId: string } | { refuse: string };
export function checkEmergencyWorker(source: string | null | undefined, buildJson: BuildJson): string[];
