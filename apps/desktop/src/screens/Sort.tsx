import { AiModeSchema, buildSortCommand, type AiMode, type CategoryId, type ClassifyOutcome, type ImageInput, type SortExecutionResult } from "@sorte/core";
import { CountUp, RevealText, categoryColor } from "@sorte/ui";
import { useEffect, useRef, useState } from "react";
import { Chutes } from "../components/Chutes";
import { categoryLabel } from "../components/common";
import { prepareImageSource } from "../platform";
import { MODE_META, useApp } from "../state/store";

type Phase = { kind: "idle" } | { kind: "running"; location: string } | { kind: "done"; outcome: ClassifyOutcome };

export function Sort() {
  const app = useApp();
  const { settings, engine, updateSettings, addRecord, updateRecord, device, deviceStatus, refreshDevice } = app;
  const [image, setImage] = useState<{ input: ImageInput; previewUrl: string } | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [inputError, setInputError] = useState<string | null>(null);
  const [userCategory, setUserCategory] = useState<CategoryId | null>(null);
  const [execution, setExecution] = useState<SortExecutionResult | null>(null);
  const [camera, setCamera] = useState(false);
  const [why, setWhy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.previewUrl);
  }, [image]);

  const accept = async (source: Blob) => {
    setInputError(null);
    setPhase({ kind: "idle" });
    setUserCategory(null);
    setExecution(null);
    setWhy(false);
    try {
      setImage(await prepareImageSource(source, settings.imageMaxEdge));
    } catch (e) {
      setInputError((e as Error).message || "Unreadable image");
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setInputError("JPEG, PNG or WebP only");
    void accept(f);
  };

  const run = async () => {
    if (!image || phase.kind === "running") return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setUserCategory(null);
    setExecution(null);
    setWhy(false);
    const first = engine.plan(settings).providers[0];
    setPhase({ kind: "running", location: first?.location ?? "local" });
    const outcome = await engine.classify(image.input, ac.signal);
    app.bumpStats();
    if (ac.signal.aborted) return setPhase({ kind: "idle" });
    setPhase({ kind: "done", outcome });
    if (outcome.ok) addRecord({ id: outcome.result.id, result: outcome.result, userCategory: null, correctedAt: null, imageSha256: image.input.sha256 });
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase({ kind: "idle" });
  };

  const result = phase.kind === "done" && phase.outcome.ok ? phase.outcome.result : null;
  const failure = phase.kind === "done" && !phase.outcome.ok ? phase.outcome : null;
  const hazardous = !!result && (result.flags.includes("hazardous") || result.flags.includes("electronic"));
  const review = !!result && result.requiresReview && !userCategory;
  const finalCategory = userCategory ?? (result && !result.requiresReview ? result.category : null);
  const command = result && device ? buildSortCommand(result, { userCategory, confidenceThreshold: settings.confidenceThreshold }) : null;

  const pick = (c: CategoryId) => {
    if (!result) return;
    setUserCategory(c);
    setExecution(null);
    updateRecord(result.id, { userCategory: c, correctedAt: new Date().toISOString() });
  };

  const sendToDevice = async () => {
    if (!device || !command?.ok) return;
    setExecution(await device.executeSort(command.command));
    await refreshDevice();
  };

  const loc = phase.kind === "running" ? phase.location : result?.location;
  const tint = loc === "cloud" ? "var(--lavender)" : loc === "demo" ? "var(--ivory-3)" : "var(--sage)";

  return (
    <div className="sort">
      <div className="sort__top">
        <div
          className="well"
          data-state={phase.kind}
          data-drag={dragging}
          style={{ "--tint": tint, "--hit": finalCategory ? categoryColor(finalCategory) : "var(--amber)" } as React.CSSProperties}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files[0]);
          }}
        >
          {camera ? (
            <CameraCapture
              onCapture={(b) => {
                void accept(b);
                setCamera(false);
              }}
              onClose={() => setCamera(false)}
            />
          ) : image ? (
            <img key={image.previewUrl} src={image.previewUrl} alt="Item" className="well__img well__img--reveal" />
          ) : (
            <button className="well__empty" onClick={() => fileRef.current?.click()}>
              <span className="well__plus" aria-hidden />
              <span>Drop an item</span>
            </button>
          )}
          {phase.kind === "running" && (
            <>
              <span className="well__scan" aria-hidden />
              <span className="well__pulse" aria-hidden />
              <span className="well__pulse well__pulse--2" aria-hidden />
            </>
          )}
          {result && <span key={result.id} className="well__flash" aria-hidden />}
          <div className="well__bar">
            <IconBtn label="Choose image" onClick={() => fileRef.current?.click()} d="M4 16l4-4 3 3 5-6 4 5M4 5h16v14H4z" />
            {"mediaDevices" in navigator && <IconBtn label="Camera" onClick={() => setCamera(true)} d="M4 8h3l2-2h6l2 2h3v11H4zM12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />}
            <span className="well__sep" />
            <select
              className="mode-select"
              value={settings.mode}
              aria-label="AI mode"
              title={MODE_META[settings.mode].description}
              onChange={(e) => updateSettings((s) => ({ ...s, mode: AiModeSchema.parse(e.target.value) as AiMode }))}
            >
              {(Object.keys(MODE_META) as AiMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_META[m].label}
                </option>
              ))}
            </select>
            {phase.kind === "running" ? (
              <button className="go go--stop" onClick={cancel} aria-label="Cancel">
                <span />
              </button>
            ) : (
              <button className="go" onClick={run} disabled={!image} aria-label="Classify">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M7 4l13 8-13 8z" />
                </svg>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>

        <div className="verdict" aria-live="polite">
          {phase.kind === "idle" && !inputError && <p className="verdict__ghost">—</p>}
          {inputError && <p className="verdict__err">{inputError}</p>}
          {phase.kind === "running" && <p className="verdict__ghost verdict__pulse">{phase.location === "cloud" ? "Cloud" : phase.location === "demo" ? "Demo" : "Local"}…</p>}
          {failure && (
            <>
              <p className="verdict__err">{failure.error.message}</p>
              <p className="verdict__meta">{failure.dataSent ? "Image was sent to the cloud" : "Nothing left this device"}</p>
              {["config", "auth", "capability"].includes(failure.error.kind) && (
                <button className="link" onClick={() => app.go(failure.error.kind === "capability" ? "local" : "providers")}>
                  Fix provider →
                </button>
              )}
            </>
          )}
          {result && (
            <>
              <h2 className="verdict__word" style={{ color: hazardous && !userCategory ? "var(--danger)" : finalCategory ? categoryColor(finalCategory) : "var(--amber)" }}>
                <RevealText text={hazardous && !userCategory ? "Special drop-off" : review ? "Pick a chute" : categoryLabel(finalCategory)} />
              </h2>
              <p className="verdict__num">
                <CountUp value={result.confidence * 100} ms={1100} />
                <small>%</small>
                {result.inference === "mock" && <span className="tag">simulated</span>}
                {userCategory && <span className="tag tag--sage">confirmed</span>}
              </p>
              <p className="verdict__meta verdict__late">
                {result.material} · {result.location} · {result.cacheHit ? "cached" : `${result.latencyMs} ms`}
              </p>
              <button className="link verdict__late" onClick={() => setWhy((w) => !w)} aria-expanded={why}>
                {why ? "Hide" : "Why?"}
              </button>
              <div className="collapse" data-open={why} aria-hidden={!why}>
                <div className="collapse__in">
                  <div className="why">
                    <p>{result.reasoning}</p>
                    {[...result.reviewReasons, ...result.warnings].map((w) => (
                      <p key={w} className="why__warn">
                        {w}
                      </p>
                    ))}
                    <p className="why__note">
                      Self-reported by {result.model}, not calibrated. Threshold {Math.round(settings.confidenceThreshold * 100)}%.
                    </p>
                  </div>
                </div>
              </div>
              {device && deviceStatus && (
                <div className="send">
                  <button className="pill-btn" disabled={!command?.ok || deviceStatus.state !== "ready"} onClick={sendToDevice} title={command && !command.ok ? command.reason : undefined}>
                    Send to bin{deviceStatus.simulated ? " (sim)" : ""} ↓
                  </button>
                  {execution && <ExecutionDots r={execution} />}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Chutes active={finalCategory} dropKey={`${result?.id}-${finalCategory}`} pickable={!!result && !hazardous} locked={hazardous && !userCategory} onPick={pick} />
    </div>
  );
}

function IconBtn({ label, d, onClick }: { label: string; d: string; onClick(): void }) {
  return (
    <button className="icon-btn" onClick={onClick} aria-label={label} title={label}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
        <path d={d} />
      </svg>
    </button>
  );
}

/** Three separate facts: accepted · acknowledged · physically verified. */
function ExecutionDots({ r }: { r: SortExecutionResult }) {
  const verified = r.physicalVerification === "verified" ? "ok" : r.physicalVerification === "not-supported" ? "na" : "fail";
  const steps: [string, string][] = [
    ["Accepted", r.commandAccepted ? "ok" : "fail"],
    ["Acknowledged", r.deviceAcknowledged ? "ok" : "fail"],
    [r.physicalVerification === "not-supported" ? "Not verifiable" : "Verified", verified],
  ];
  return (
    <ol className="dots" title={r.error ?? undefined}>
      {steps.map(([label, s]) => (
        <li key={label} data-state={s}>
          {label}
        </li>
      ))}
    </ol>
  );
}

function CameraCapture({ onCapture, onClose }: { onCapture(b: Blob): void; onClose(): void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((e: Error) => setError(e.name === "NotAllowedError" ? "Camera blocked" : "No camera"));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  return (
    <div className="camera">
      {error ? <p className="verdict__err">{error}</p> : <video ref={videoRef} autoPlay playsInline muted className="well__img" />}
      <div className="camera__bar">
        <button className="pill-btn" onClick={onClose}>
          Close
        </button>
        {!error && (
          <button className="go" aria-label="Capture" onClick={() => grabFrame(videoRef.current).then(onCapture, (e: Error) => setError(e.message))}>
            <span className="go__dot" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Copy the current video frame synchronously, so stopping the stream afterwards is safe. */
function grabFrame(video: HTMLVideoElement | null): Promise<Blob> {
  if (!video || !video.videoWidth) return Promise.reject(new Error("Camera not ready"));
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext("2d")!.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Capture failed"))), "image/jpeg", 0.92));
}
