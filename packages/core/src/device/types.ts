import type { CategoryId } from "../categories";

export type DeviceState = "disconnected" | "connecting" | "ready" | "busy" | "error" | "safe-stop";

export interface DeviceStatus {
  deviceId: string;
  name: string;
  transport: "mock" | "http" | "websocket" | "serial" | "mqtt";
  /** True for the demo adapter. UI must label simulated devices. */
  simulated: boolean;
  state: DeviceState;
  firmware: string | null;
  /** Fill level per stream, 0-1, only if the device reports it. */
  fillLevels: Partial<Record<CategoryId, number>> | null;
  /** Whether the device has a sensor that can confirm an item reached its bin. */
  hasVerificationSensor: boolean;
  lastError: string | null;
  updatedAt: string;
}

export interface SortCommand {
  commandId: string;
  category: CategoryId;
  issuedAt: string;
  timeoutMs: number;
  classificationId: string;
  /** "model" if the AI result passed all checks; "user" if a person chose/confirmed the stream. */
  decidedBy: "model" | "user";
}

/**
 * The four stages are deliberately separate. A successful classification is
 * not proof that anything moved.
 */
export interface SortExecutionResult {
  commandId: string;
  commandAccepted: boolean;
  deviceAcknowledged: boolean;
  physicalVerification: "verified" | "failed" | "not-supported" | "timeout";
  error: string | null;
  completedAt: string;
}

export interface SortingDevice {
  readonly id: string;
  readonly simulated: boolean;
  connect(signal?: AbortSignal): Promise<DeviceStatus>;
  disconnect(): Promise<void>;
  getStatus(): Promise<DeviceStatus>;
  executeSort(command: SortCommand, signal?: AbortSignal): Promise<SortExecutionResult>;
  /** Return to a safe state (e.g. close flaps, stop motors). */
  safeStop(): Promise<DeviceStatus>;
}
