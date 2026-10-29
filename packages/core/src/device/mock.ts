import { CATEGORY_IDS, type CategoryId } from "../categories";
import { abortableDelay } from "../providers/mock";
import { validateCommand } from "./command";
import type { DeviceStatus, SortCommand, SortExecutionResult, SortingDevice } from "./types";

export type MockDeviceScenario = "nominal" | "no-verification-sensor" | "jam" | "unreachable";

/**
 * Simulated sorting bin for development and demos. Every status it returns
 * carries `simulated: true`; the UI must show that label.
 */
export class MockSortingDevice implements SortingDevice {
  readonly id: string;
  readonly simulated = true;
  private status: DeviceStatus;
  private fill: Record<CategoryId, number>;

  constructor(
    private scenario: MockDeviceScenario = "nominal",
    private latencyMs = 300,
    private now: () => Date = () => new Date(),
  ) {
    this.id = `mock-${scenario}`;
    this.fill = Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0])) as Record<CategoryId, number>;
    this.status = this.makeStatus("disconnected", null);
  }

  private makeStatus(state: DeviceStatus["state"], lastError: string | null): DeviceStatus {
    return {
      deviceId: this.id,
      name: "Simulated SORTÉ bin",
      transport: "mock",
      simulated: true,
      state,
      firmware: "sim-0.1",
      fillLevels: state === "disconnected" ? null : { ...this.fill },
      hasVerificationSensor: this.scenario !== "no-verification-sensor",
      lastError,
      updatedAt: this.now().toISOString(),
    };
  }

  async connect(signal?: AbortSignal) {
    this.status = this.makeStatus("connecting", null);
    await abortableDelay(this.latencyMs, signal);
    this.status = this.scenario === "unreachable" ? this.makeStatus("error", "Simulated device unreachable.") : this.makeStatus("ready", null);
    return this.status;
  }

  async disconnect() {
    this.status = this.makeStatus("disconnected", null);
  }

  async getStatus() {
    return this.status;
  }

  async safeStop() {
    this.status = this.makeStatus("safe-stop", this.status.lastError);
    return this.status;
  }

  async executeSort(command: SortCommand, signal?: AbortSignal): Promise<SortExecutionResult> {
    const done = (r: Omit<SortExecutionResult, "commandId" | "completedAt">): SortExecutionResult => ({ ...r, commandId: command.commandId, completedAt: this.now().toISOString() });
    if (this.status.state !== "ready") {
      return done({ commandAccepted: false, deviceAcknowledged: false, physicalVerification: "not-supported", error: `Device is ${this.status.state}.` });
    }
    const invalid = validateCommand(command, this.now());
    if (invalid) return done({ commandAccepted: false, deviceAcknowledged: false, physicalVerification: "not-supported", error: invalid });

    this.status = this.makeStatus("busy", null);
    try {
      await abortableDelay(this.latencyMs, signal);
      if (this.scenario === "jam") {
        this.status = this.makeStatus("safe-stop", "Simulated jam in routing flap.");
        return done({ commandAccepted: true, deviceAcknowledged: true, physicalVerification: "failed", error: "Simulated jam — device entered safe stop." });
      }
      this.fill[command.category] = Math.min(1, this.fill[command.category] + 0.04);
      this.status = this.makeStatus("ready", null);
      return done({
        commandAccepted: true,
        deviceAcknowledged: true,
        physicalVerification: this.scenario === "no-verification-sensor" ? "not-supported" : "verified",
        error: null,
      });
    } catch {
      this.status = this.makeStatus("ready", null);
      return done({ commandAccepted: true, deviceAcknowledged: false, physicalVerification: "timeout", error: "Cancelled before acknowledgement." });
    }
  }
}
