import { CATEGORIES, type MockDeviceScenario } from "@sorte/core";
import { Button, StatusPill, categoryColor } from "@sorte/ui";
import { useState } from "react";
import { Empty, Field, Section } from "../components/common";
import { useApp } from "../state/store";

const SCENARIOS: { id: MockDeviceScenario; label: string; hint: string }[] = [
  { id: "nominal", label: "Nominal", hint: "Accepts, acknowledges and verifies." },
  { id: "no-verification-sensor", label: "No verification sensor", hint: "Acknowledges, but cannot confirm the item arrived." },
  { id: "jam", label: "Jam", hint: "Acknowledges, then fails and enters safe stop." },
  { id: "unreachable", label: "Unreachable", hint: "Connection fails." },
];

export function Devices() {
  const { device, deviceStatus, connectSimulator, disconnectDevice, refreshDevice } = useApp();
  const [scenario, setScenario] = useState<MockDeviceScenario>("nominal");
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    await connectSimulator(scenario);
    setBusy(false);
  };

  return (
    <div className="grid grid--split">
      <Section title="Hardware">
        <Empty title="No hardware adapter installed">
          <p>Waiting for your bin's protocol. Nothing here claims to control real hardware.</p>
        </Empty>

      </Section>

      <Section title="Simulator" aside={<StatusPill tone="amber">Simulated device</StatusPill>}>
        {!device ? (
          <div className="form">
            <Field label="Scenario" hint={SCENARIOS.find((s) => s.id === scenario)?.hint}>
              <select className="s-select" value={scenario} onChange={(e) => setScenario(e.target.value as MockDeviceScenario)}>
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="row">
              <Button variant="primary" onClick={connect} disabled={busy}>
                Connect simulator
              </Button>
            </div>
          </div>
        ) : (
          deviceStatus && (
            <div className="form">
              <div className="row">
                <StatusPill tone={deviceStatus.state === "ready" ? "sage" : deviceStatus.state === "busy" || deviceStatus.state === "connecting" ? "lavender" : "danger"}>
                  {deviceStatus.state}
                </StatusPill>
                <span className="muted">
                  {deviceStatus.name} · {deviceStatus.transport} · firmware {deviceStatus.firmware ?? "unknown"}
                </span>
              </div>
              {deviceStatus.lastError && <p className="field-error">{deviceStatus.lastError}</p>}

              {deviceStatus.fillLevels && (
                <ul className="dist">
                  {CATEGORIES.map((c) => (
                    <li key={c.id}>
                      <span>{c.short}</span>
                      <div className="dist__track">
                        <div className="dist__fill" style={{ width: `${(deviceStatus.fillLevels?.[c.id] ?? 0) * 100}%`, background: categoryColor(c.id) }} />
                      </div>
                      <span className="s-mono">{Math.round((deviceStatus.fillLevels?.[c.id] ?? 0) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="row">
                <Button onClick={refreshDevice}>Refresh status</Button>
                <Button onClick={() => device.safeStop().then(refreshDevice)}>Safe stop</Button>
                <Button variant="danger" onClick={disconnectDevice}>
                  Disconnect
                </Button>
              </div>
            </div>
          )
        )}
      </Section>
    </div>
  );
}
