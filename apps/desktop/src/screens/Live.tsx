import { SceneDetector, buildSortCommand, type CategoryId, type ClassifyOutcome, type ScenePhase, type SortExecutionResult } from "@sorte/core";
import { CountUp, categoryColor } from "@sorte/ui";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Chutes } from "../components/Chutes";
import { Dialog, categoryLabel } from "../components/common";
import { cssColor, glass } from "../gl/glass";
import { prepareImageSource } from "../platform";
import { MODE_META, useApp } from "../state/store";

type Phase = { kind: "idle" } | { kind: "running"; location: string } | { kind: "done"; outcome: ClassifyOutcome };
type CameraStatus = "off" | "starting" | "on" | "denied" | "none" | "error";

const SAMPLE_W = 48;
const SAMPLE_H = 36;
const SAMPLE_MS = 200;
const CLEAR_AFTER_EMPTY_MS = 1500;

function grabFrame(video: HTMLVideoElement): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext("2d")!.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Capture failed"))), "image/jpeg", 0.92));
}

export function Live() {
  const app = useApp();
  const { settings, engine, updateSettings, addRecord, updateRecord, device, deviceStatus, refreshDevice, go, startupChecked } = app;
  const live = settings.live;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraStatus>("off");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [still, setStill] = useState<{ url: string; blob: Blob } | null>(null);
  const [scene, setScene] = useState<ScenePhase>("calibrating");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [userCategory, setUserCategory] = useState<CategoryId | null>(null);
  const [execution, setExecution] = useState<SortExecutionResult | null>(null);
  const [why, setWhy] = useState(false);
  const [askCloud, setAskCloud] = useState(false);
  const [budgetHit, setBudgetHit] = useState(false);
  const [session, setSession] = useState<Record<string, CategoryId>>({});
  const [orb, setOrb] = useState<{ key: string; dx: number; dy: number; color: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const detector = useRef(new SceneDetector());
  const fileRef = useRef<HTMLInputElement>(null);

  const plan = engine.plan(settings);
  const usesCloud = plan.providers.some((p) => p.location === "cloud");
  const needsCloudOk = usesCloud && !live.cloudAcknowledgedAt;
  const autoOn = live.autoScan && !needsCloudOk && !budgetHit;
  const noBackend = plan.providers.length === 0;

  const result = phase.kind === "done" && phase.outcome.ok ? phase.outcome.result : null;
  const failure = phase.kind === "done" && !phase.outcome.ok ? phase.outcome : null;
  const hazardous = !!result && (result.flags.includes("hazardous") || result.flags.includes("electronic"));
  const review = !!result && result.requiresReview && !userCategory;
  const finalCategory = userCategory ?? (result && !result.requiresReview ? result.category : null);
  const command = result && device ? buildSortCommand(result, { userCategory, confidenceThreshold: settings.confidenceThreshold }) : null;

  // ── Camera ──
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("off");
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string | null) => {
      if (!navigator.mediaDevices?.getUserMedia) return setCamera("none");
      setCamera("starting");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
      try {
        const stream = await navigator.mediaDevices
          .getUserMedia({ audio: false, video: deviceId ? { ...size, deviceId: { exact: deviceId } } : size })
          // A remembered camera may be gone; fall back to any camera.
          .catch((e: Error) => {
            if (deviceId && e.name === "OverconstrainedError") return navigator.mediaDevices.getUserMedia({ audio: false, video: size });
            throw e;
          });
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setCamera("on");
        detector.current.reset();
        setScene("calibrating");
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "videoinput"));
        updateSettings((s) => (s.live.autoStart ? s : { ...s, live: { ...s.live, autoStart: true } }));
      } catch (e) {
        const name = (e as Error).name;
        setCamera(name === "NotAllowedError" ? "denied" : name === "NotFoundError" ? "none" : "error");
      }
    },
    [updateSettings],
  );

  // The launch update check goes first, then the camera.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!startupChecked || autoStarted.current) return;
    autoStarted.current = true;
    if (settings.live.autoStart) void startCamera(settings.live.cameraId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startupChecked]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      glass.setSource(null);
      glass.setAnalysing(false);
    };
    // Mount and unmount only: the camera never runs outside this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What the glass shows: a still photo wins over the live picture.
  const stillRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (still && stillRef.current) glass.setSource(stillRef.current, false);
    else if (camera === "on" && videoRef.current) glass.setSource(videoRef.current, live.mirror);
    else glass.setSource(null);
  }, [camera, still, live.mirror]);

  // ── Classification ──
  const analyse = useCallback(
    async (blob: Blob) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      busyRef.current = true;
      setUserCategory(null);
      setExecution(null);
      setWhy(false);
      setNotice(null);
      setPhase({ kind: "running", location: engine.plan(settings).providers[0]?.location ?? "local" });
      glass.setAnalysing(true);
      try {
        const { input, previewUrl } = await prepareImageSource(blob, settings.imageMaxEdge);
        URL.revokeObjectURL(previewUrl);
        const outcome = await engine.classify(input, ac.signal);
        app.bumpStats();
        if (ac.signal.aborted) return;
        setPhase({ kind: "done", outcome });
        if (outcome.ok) {
          const r = outcome.result;
          addRecord({ id: r.id, result: r, userCategory: null, correctedAt: null, imageSha256: input.sha256 });
          if (!r.requiresReview && r.category) setSession((s) => ({ ...s, [r.id]: r.category! }));
        } else if (outcome.error.kind === "budget") {
          setBudgetHit(true);
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          setNotice((e as Error).message || "Couldn't read that image");
          setPhase({ kind: "idle" });
        }
      } finally {
        if (abortRef.current === ac) {
          busyRef.current = false;
          glass.setAnalysing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, engine, addRecord],
  );
  const analyseRef = useRef(analyse);
  analyseRef.current = analyse;
  const hasResultRef = useRef(false);
  hasResultRef.current = phase.kind === "done";

  // Watch small grayscale frames on the device. A model only runs when an item settles.
  useEffect(() => {
    if (camera !== "on" || still || !autoOn || noBackend) return;
    const video = videoRef.current!;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    let emptySince = 0;
    const t = setInterval(() => {
      if (video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      const rgba = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
      const gray = new Uint8Array(SAMPLE_W * SAMPLE_H);
      for (let i = 0; i < gray.length; i++) gray[i] = (rgba[i * 4]! * 77 + rgba[i * 4 + 1]! * 150 + rgba[i * 4 + 2]! * 29) >> 8;
      const now = performance.now();
      const update = detector.current.push(gray, now);
      setScene(update.phase);
      if (update.phase === "empty") {
        emptySince ||= now;
        if (hasResultRef.current && !busyRef.current && now - emptySince > CLEAR_AFTER_EMPTY_MS) setPhase({ kind: "idle" });
      } else {
        emptySince = 0;
      }
      if (!update.scan) return;
      if (busyRef.current) detector.current.forgetScan();
      else void grabFrame(video).then((b) => analyseRef.current(b));
    }, SAMPLE_MS);
    return () => clearInterval(t);
  }, [camera, still, autoOn, noBackend]);

  const shutter = () => {
    if (still) return void analyse(still.blob);
    if (camera === "on" && videoRef.current) void grabFrame(videoRef.current).then(analyse);
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setNotice("JPEG, PNG or WebP only");
    setStill((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url: URL.createObjectURL(f), blob: f };
    });
    void analyse(f);
  };

  const clearStill = () => {
    setStill((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setPhase({ kind: "idle" });
    detector.current.reset();
  };
  useEffect(() => () => void (still && URL.revokeObjectURL(still.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (c: CategoryId) => {
    if (!result) return;
    setUserCategory(c);
    setExecution(null);
    updateRecord(result.id, { userCategory: c, correctedAt: new Date().toISOString() });
    setSession((s) => ({ ...s, [result.id]: c }));
  };

  const toggleAuto = () => {
    if (needsCloudOk) return setAskCloud(true);
    setBudgetHit(false);
    updateSettings((s) => ({ ...s, live: { ...s.live, autoScan: !s.live.autoScan || budgetHit } }));
  };

  // A result lands: light travels from the lens into its tube.
  useEffect(() => {
    if (!result || !finalCategory) return;
    const color = categoryColor(finalCategory);
    glass.firePulse(cssColor(color));
    const el = document.querySelector(`[data-chute="${finalCategory}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setOrb({ key: `${result.id}-${finalCategory}`, dx: r.left + r.width / 2 - window.innerWidth / 2, dy: r.top + 18 - window.innerHeight / 2, color });
  }, [result?.id, finalCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (result && !finalCategory) glass.firePulse(cssColor(hazardous ? "var(--danger)" : "var(--amber)"));
  }, [result?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts: Partial<Record<CategoryId, number>> = {};
  for (const c of Object.values(session)) counts[c] = (counts[c] ?? 0) + 1;
  const max = Math.max(1, ...Object.values(counts));
  const levels = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v / max) * 0.45]));

  const showIntro = camera !== "on" && !still && phase.kind === "idle";
  const running = phase.kind === "running";

  // ── Status capsule ──
  let word = "";
  let tone = "var(--ivory)";
  if (running) word = phase.location === "cloud" ? "Analysing in the cloud" : phase.location === "demo" ? "Simulating" : "Analysing on this Mac";
  else if (result) {
    word = hazardous && !userCategory ? "Special drop-off" : review ? "Which stream?" : categoryLabel(finalCategory);
    tone = hazardous && !userCategory ? "var(--danger)" : finalCategory ? categoryColor(finalCategory) : "var(--amber)";
  } else if (failure) {
    word = "Couldn't classify";
    tone = "var(--danger)";
  } else if (noBackend) word = "Connect an AI first";
  else if (budgetHit) word = "Cloud budget reached";
  else if (!autoOn) word = "Press the shutter";
  else word = { calibrating: "Looking at the scene", empty: "Show an item", moving: "Hold still", settling: "Hold still", ready: "Hold still", holding: "Got it" }[scene];

  return (
    <div className="live" data-phase={phase.kind} data-scene={scene}>
      <video ref={videoRef} className="live__video" data-mirror={live.mirror} playsInline muted aria-hidden />
      {still && <img ref={stillRef} src={still.url} alt="" className="live__still" onLoad={(e) => glass.setSource(e.currentTarget, false)} />}

      {!showIntro && (
        <div className="reticle" data-state={running ? "busy" : result ? "done" : !autoOn ? "idle" : scene} style={{ "--hit": tone } as React.CSSProperties} aria-hidden>
          <i /><i /><i /><i />
          <span className="reticle__ring" />
        </div>
      )}

      {showIntro ? (
        <div className="intro">
          <h2 className="intro__title">Show it. Know it.</h2>
          {camera === "denied" && <p className="intro__note">Camera access is off. Allow it in System Settings → Privacy &amp; Security → Camera.</p>}
          {camera === "none" && <p className="intro__note">No camera found. You can still use a photo.</p>}
          {camera === "error" && <p className="intro__note">The camera couldn't start. Is another app using it?</p>}
          <div className="intro__actions">
            <button className="pill pill--primary pill--lg" data-glass="clear" disabled={camera === "starting"} onClick={() => void startCamera(live.cameraId)}>
              {camera === "starting" ? "Starting…" : "Start camera"}
            </button>
            <button className="pill pill--lg" data-glass="clear" onClick={() => fileRef.current?.click()}>
              Use a photo
            </button>
          </div>
        </div>
      ) : (
        <div className="live__top">
          <Capsule>
            <div className="capsule__row">
              {running && <span className="spinner" aria-hidden />}
              <h2 className="capsule__word" key={word} style={{ color: tone }}>
                {word}
              </h2>
              {result && (
                <span className="capsule__num">
                  <CountUp value={result.confidence * 100} ms={1000} />
                  <small>%</small>
                </span>
              )}
              {result?.inference === "mock" && <span className="tag">Simulated</span>}
              {userCategory && <span className="tag tag--ok">Confirmed</span>}
              {(result || failure) && (
                <button className="capsule__more" onClick={() => setWhy((w) => !w)} aria-expanded={why} aria-label="Details">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" data-open={why} aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              )}
              {noBackend && (
                <button className="capsule__link" onClick={() => go("providers")}>
                  Set up
                </button>
              )}
            </div>
          </Capsule>
          <div className="collapse" data-glass="frost" data-open={why && (!!result || !!failure)} aria-hidden={!why}>
            <div className="collapse__in">
              <div className="why">
                {result && (
                  <>
                    <p className="why__material">{result.material}</p>
                    <p>{result.reasoning}</p>
                    {[...result.reviewReasons, ...result.warnings].map((w) => (
                      <p key={w} className="why__warn">
                        {w}
                      </p>
                    ))}
                    <p className="why__note">
                      {result.location === "demo" ? "Simulated, not AI" : `${result.model} · ${result.location}`} · {result.cacheHit ? "cached" : `${result.latencyMs} ms`} · confidence is self-reported, not calibrated
                    </p>
                  </>
                )}
                {failure && (
                  <>
                    <p>{failure.error.message}</p>
                    <p className="why__note">{failure.dataSent ? "The image was sent before this failed." : "Nothing left this device."}</p>
                    {["config", "auth", "capability"].includes(failure.error.kind) && (
                      <button className="capsule__link" onClick={() => go(failure.error.kind === "capability" ? "local" : "providers")}>
                        Fix provider
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          {notice && <p className="live__notice">{notice}</p>}
          {device && deviceStatus && result && (
            <div className="send" data-glass="clear">
              <button className="send__btn" disabled={!command?.ok || deviceStatus.state !== "ready"} title={command && !command.ok ? command.reason : undefined} onClick={async () => {
                if (!device || !command?.ok) return;
                setExecution(await device.executeSort(command.command));
                await refreshDevice();
              }}>
                Send to bin{deviceStatus.simulated ? " (sim)" : ""}
              </button>
              {execution && <ExecutionDots r={execution} />}
            </div>
          )}
        </div>
      )}

      {orb && (
        <span key={orb.key} className="orb-x" style={{ "--dx": `${orb.dx}px`, "--c": orb.color } as React.CSSProperties} onAnimationEnd={() => setOrb(null)} aria-hidden>
          <span className="orb-y" style={{ "--dy": `${orb.dy}px` } as React.CSSProperties} />
        </span>
      )}

      <div className="live__bottom">
        <Chutes size="dock" active={finalCategory} levels={levels} values={counts} pickable={!!result && !hazardous} locked={hazardous && !userCategory} onPick={pick} />
        <div className="controls">
          <div className="controls__side">
            <IconBtn label="Choose a photo" onClick={() => fileRef.current?.click()} d="M4 16l4-4 3 3 5-6 4 5M4 5h16v14H4z" />
            {still ? (
              <IconBtn label="Back to camera" onClick={clearStill} d="M6 6l12 12M18 6L6 18" />
            ) : camera === "on" ? (
              <>
                <IconBtn label="Mirror" active={live.mirror} onClick={() => updateSettings((s) => ({ ...s, live: { ...s.live, mirror: !s.live.mirror } }))} d="M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z" />
                <IconBtn label="Turn camera off" onClick={stopCamera} d="M4 8h3l2-2h6l2 2h3v11H4zM3 3l18 18" />
              </>
            ) : null}
            {camera === "on" && !still && devices.length > 1 && (
              <div className="pill pill--select" data-glass="clear">
                <select
                  aria-label="Camera"
                  value={live.cameraId ?? devices[0]?.deviceId}
                  onChange={(e) => {
                    const id = e.target.value;
                    updateSettings((s) => ({ ...s, live: { ...s.live, cameraId: id } }));
                    void startCamera(id);
                  }}
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button className="shutter" data-glass="clear" data-busy={running} disabled={(camera !== "on" && !still) || running} onClick={shutter} aria-label="Classify now">
            <span />
          </button>

          <div className="controls__side controls__side--end">
            {camera === "on" && !still && (
              <button className="pill" data-glass="clear" data-on={autoOn} aria-pressed={autoOn} onClick={toggleAuto} title="Classify automatically when an item holds still">
                <span className="led-dot" /> Auto
              </button>
            )}
          </div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => {
        onFile(e.target.files?.[0]);
        e.target.value = "";
      }} />

      <Dialog open={askCloud} title="Send images automatically?" onClose={() => setAskCloud(false)}>
        <div className="dialog__body">
          <p>With Auto on, SORTÉ sends a photo to your cloud provider each time a new item holds still in view.</p>
          <p className="dialog__provider">{plan.providers.filter((p) => p.location === "cloud").map((p) => p.name).join(", ")}</p>
          <p>
            Sent: the frame ({settings.imageMaxEdge}px) and a short prompt. It can capture anything in view. Limit: {settings.budget.maxCloudRequestsPerSession} requests per session. The shutter works without this.
          </p>
        </div>
        <div className="row row--end">
          <button className="s-btn" onClick={() => setAskCloud(false)}>
            Keep manual
          </button>
          <button
            className="s-btn s-btn--primary"
            onClick={() => {
              updateSettings((s) => ({ ...s, live: { ...s.live, autoScan: true, cloudAcknowledgedAt: new Date().toISOString() } }));
              setAskCloud(false);
            }}
          >
            Allow
          </button>
        </div>
      </Dialog>
    </div>
  );
}

/** Glass that morphs to fit its content instead of snapping. */
function Capsule({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | undefined>();
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="capsule" data-glass="frost" style={{ width }} role="status" aria-live="polite">
      <div className="capsule__in" ref={inner}>
        {children}
      </div>
    </div>
  );
}

function IconBtn({ label, d, onClick, active }: { label: string; d: string; onClick(): void; active?: boolean }) {
  return (
    <button className="icon-btn" data-glass="clear" data-on={active} onClick={onClick} aria-label={label} title={label}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
        <path d={d} />
      </svg>
    </button>
  );
}

/** Three separate facts: accepted, acknowledged, physically verified. */
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
