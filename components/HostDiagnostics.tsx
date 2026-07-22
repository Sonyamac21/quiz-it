"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stopAllShowAudio, getShowAudioState, subscribeShowAudio } from "@/lib/audio/showAudio";
import { diagnosticTimestamp } from "@/lib/diagnostics/time";
import { BUILD_INFO } from "@/lib/platform/buildInfo";
import { PLATFORM_CONFIG } from "@/lib/platform/config";
import { FEATURE_FLAGS } from "@/lib/platform/featureFlags";
import { createPlatformStatus, type HealthLevel } from "@/lib/platform/health";
import { platformLogger } from "@/lib/platform/logger";

type Health = HealthLevel;
type EventItem = { at: number; message: string; level: Health };

export type HostDiagnosticsProps = {
  open: boolean;
  onClose: () => void;
  session: {
    id: string | null;
    pin: string;
    eventName?: string | null;
    quizPlan?: string | null;
    venue?: string | null;
    host?: string | null;
    phase: string;
    roundName?: string | null;
    roundNumber: number;
    questionIndex: number;
    questionCount: number;
    status: string;
    connectedAt: number | null;
  };
  teams: Array<{ team_name: string; last_seen_at?: string | null }>;
  answers: Array<{ id?: string | number; team_name: string; submitted_at?: string }>;
  timer: { remaining: number; running: boolean; duration: number };
  realtime: { status: string; lastSync: number | null; lastReconnect: number | null; errors: number };
  onResyncSession: () => Promise<void> | void;
  onRestartSubscriptions: () => Promise<void> | void;
  onRefreshDisplay: () => void;
  onRefreshPlayers: () => Promise<void> | void;
};

function ageLabel(from: number | null, now: number) {
  if (!from) return "Not connected";
  const seconds = Math.max(0, Math.floor((now - from) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`;
}

function timeLabel(value: number | null) {
  return value ? new Date(value).toLocaleTimeString([], { hour12: false }) : "Not recorded";
}

function HealthPill({ value, children }: { value: Health; children: React.ReactNode }) {
  return <span className={`qi-health-pill qi-health-pill--${value}`}><i />{children}</span>;
}

function Metric({ label, value, health = "unknown" }: { label: string; value: React.ReactNode; health?: Health }) {
  return <div className="qi-health-metric"><span>{label}</span><strong className={`is-${health}`}>{value}</strong></div>;
}

function Card({ title, health, children }: { title: string; health: Health; children: React.ReactNode }) {
  return <section className="qi-health-card"><header><h3>{title}</h3><HealthPill value={health}>{health === "healthy" ? "Healthy" : health === "warning" ? "Warning" : health === "problem" ? "Problem" : "Unavailable"}</HealthPill></header><div className="qi-health-card__body">{children}</div></section>;
}

export function HostDiagnostics(props: HostDiagnosticsProps) {
  const { open, onClose, session, teams, answers, timer, realtime } = props;
  const [now, setNow] = useState(session.connectedAt || 0);
  const [audio, setAudio] = useState(getShowAudioState());
  const [events, setEvents] = useState<EventItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [longTasks, setLongTasks] = useState(0);
  const [teamSort, setTeamSort] = useState<"name" | "activity">("name");
  const previousRef = useRef({ phase: session.phase, answers: answers.length, realtime: realtime.status });

  const addEvent = (message: string, level: Health = "healthy") => {
    setEvents(current => [{ at: diagnosticTimestamp(), message, level }, ...current].slice(0, PLATFORM_CONFIG.diagnostics.recentEventLimit));
  };

  useEffect(() => subscribeShowAudio(setAudio), []);

  useEffect(() => platformLogger.subscribe(entry => {
    const level: Health = entry.level === "ERROR" ? "problem" : entry.level === "WARN" ? "warning" : "healthy";
    setEvents(current => [{ at: entry.at, message: `${entry.scope}: ${entry.message}`, level }, ...current].slice(0, PLATFORM_CONFIG.diagnostics.recentEventLimit));
  }), []);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(diagnosticTimestamp()), PLATFORM_CONFIG.diagnostics.sampleMilliseconds);
    let frames = 0;
    let started = performance.now();
    let raf = 0;
    const sample = (stamp: number) => {
      frames += 1;
      if (stamp - started >= PLATFORM_CONFIG.diagnostics.sampleMilliseconds) {
        setFps(Math.round((frames * 1000) / (stamp - started)));
        frames = 0;
        started = stamp;
      }
      raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver(list => setLongTasks(value => value + list.getEntries().length));
      observer.observe({ type: "longtask", buffered: true });
    } catch {}
    return () => { clearInterval(id); cancelAnimationFrame(raf); observer?.disconnect(); };
  }, [open]);

  useEffect(() => {
    const previous = previousRef.current;
    if (previous.phase !== session.phase) addEvent(`Phase changed: ${previous.phase} → ${session.phase}`);
    if (answers.length > previous.answers) {
      const count = answers.length - previous.answers;
      const latest = answers[answers.length - 1]?.team_name;
      addEvent(count === 1 && latest ? `${latest} submitted` : `${count} submissions received`);
    }
    if (previous.realtime !== realtime.status) addEvent(`Realtime: ${realtime.status}`, realtime.status === "SUBSCRIBED" ? "healthy" : "warning");
    previousRef.current = { phase: session.phase, answers: answers.length, realtime: realtime.status };
  }, [answers, realtime.status, session.phase]);

  const submittedTeams = useMemo(() => new Set(answers.map(answer => answer.team_name)), [answers]);
  const lastActivityByTeam = useMemo(() => new Map(answers.map(answer => [answer.team_name, answer.submitted_at ? new Date(answer.submitted_at).getTime() : 0])), [answers]);
  const sortedTeams = useMemo(() => [...teams].sort((a,b) => teamSort === "name" ? a.team_name.localeCompare(b.team_name) : (lastActivityByTeam.get(b.team_name) || 0) - (lastActivityByTeam.get(a.team_name) || 0)), [lastActivityByTeam, teamSort, teams]);
  const missing = teams.filter(team => !submittedTeams.has(team.team_name));
  const isTeamConnected = (team: { last_seen_at?: string | null }) => {
    if (!team.last_seen_at) return false;
    return now - new Date(team.last_seen_at).getTime() < PLATFORM_CONFIG.diagnostics.staleHeartbeatMilliseconds;
  };
  const connectedTeams = useMemo(() => teams.filter(isTeamConnected), [teams, now]);
  const disconnectedTeams = teams.length - connectedTeams.length;
  const duplicates = Math.max(0, answers.length - submittedTeams.size);
  const realtimeAge = realtime.lastSync ? now - realtime.lastSync : Infinity;
  const platformStatus = createPlatformStatus({
    now,
    sessionId: session.id,
    realtimeStatus: realtime.status,
    realtimeLastSync: realtime.lastSync,
    realtimeStaleAfter: PLATFORM_CONFIG.diagnostics.staleRealtimeMilliseconds,
    audio,
    timerRunning: timer.running,
    timerRemaining: timer.remaining,
    displayKnown: false,
    diagnosticsEnabled: FEATURE_FLAGS.diagnostics,
  });
  const realtimeHealth = platformStatus.realtime.level;
  const memory = typeof performance !== "undefined" && "memory" in performance
    ? Math.round(((performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1024 / 1024)) + " MB"
    : "Unsupported";

  async function recover(label: string, action: () => Promise<void> | void) {
    setBusy(label);
    try { await action(); addEvent(label); }
    catch (error) {
      platformLogger.error("recovery", `${label} failed`, { error });
      addEvent(`${label} failed`, "problem");
    }
    finally { setBusy(null); }
  }

  async function copyDiagnostics() {
    const report = {
      capturedAt: new Date().toISOString(),
      build: BUILD_INFO,
      featureFlags: FEATURE_FLAGS,
      platformStatus,
      browser: navigator.userAgent,
      session,
      teams: { registered: teams.length, submitted: submittedTeams.size, missing: missing.map(team => team.team_name) },
      realtime,
      timer,
      audio,
      performance: { fps, memory, longTasks, visibility: document.visibilityState },
      errors: events.filter(event => event.level === "problem"),
      recentEvents: events,
    };
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    addEvent("Diagnostics copied");
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!open) return null;
  return (
    <div className="qi-health-overlay" role="dialog" aria-modal="true" aria-label="Host Diagnostics and Live Health Centre">
      <div className="qi-health-centre">
        <header className="qi-health-header">
          <div><p className="qi-eyebrow">Host only · Live operations</p><h2>Diagnostics &amp; Live Health</h2><p>Observational status. No scoring or gameplay controls.</p></div>
          <div className="qi-health-header__actions"><button className="qi-button qi-button--secondary" onClick={copyDiagnostics}>{copied ? "Copied" : "Copy Diagnostics"}</button><button className="qi-button qi-button--icon" aria-label="Close diagnostics" onClick={props.onClose}>×</button></div>
        </header>

        <div className="qi-health-summary">
          <HealthPill value={platformStatus.overall}>Platform {platformStatus.overall}</HealthPill>
          <HealthPill value={realtimeHealth}>Realtime {realtime.status.toLowerCase()}</HealthPill>
          <HealthPill value={timer.running ? "healthy" : "unknown"}>Timer {timer.running ? "running" : "stopped"}</HealthPill>
          <HealthPill value={audio.overlap ? "problem" : "healthy"}>{audio.active.length} audio channel{audio.active.length === 1 ? "" : "s"}</HealthPill>
          <HealthPill value={!teams.length ? "warning" : disconnectedTeams ? "warning" : "healthy"}>{connectedTeams.length}/{teams.length} handsets connected</HealthPill>
        </div>

        <main className="qi-health-grid">
          <Card title="Platform" health={platformStatus.overall}>
            <Metric label="Version" value={BUILD_INFO.version} health="healthy" />
            <Metric label="Git commit" value={BUILD_INFO.commit} />
            <Metric label="Build date" value={BUILD_INFO.builtAt === "unknown" ? "Unknown" : new Date(BUILD_INFO.builtAt).toLocaleString()} />
            <Metric label="Environment" value={BUILD_INFO.environment} />
            <Metric label="Database schema" value={BUILD_INFO.schemaVersion} />
            <Metric label="Feature flags" value={Object.entries(FEATURE_FLAGS).map(([name, enabled]) => `${name}: ${enabled ? "on" : "off"}`).join(" · ")} />
          </Card>
          <Card title="Session" health={session.id ? "healthy" : "problem"}>
            <Metric label="Session ID" value={session.id || "Missing"} health={session.id ? "healthy" : "problem"} />
            <Metric label="Event" value={session.eventName || "Not recorded"} /><Metric label="Quiz Plan" value={session.quizPlan || "Not recorded"} />
            <Metric label="Venue" value={session.venue || "Not recorded"} /><Metric label="Host" value={session.host || "Authenticated host"} />
            <Metric label="Phase" value={session.phase} health="healthy" /><Metric label="Round" value={`${session.roundNumber} · ${session.roundName || "Not selected"}`} />
            <Metric label="Question" value={`${session.questionCount ? session.questionIndex + 1 : 0} / ${session.questionCount}`} /><Metric label="Session age" value={ageLabel(session.connectedAt, now)} />
            <Metric label="Status" value={session.status} health={session.status === "active" ? "healthy" : "warning"} />
          </Card>

          <Card title="Connections & Players" health={!teams.length ? "warning" : disconnectedTeams ? "warning" : "healthy"}>
            <Metric label="Registered teams" value={teams.length} health={teams.length ? "healthy" : "warning"} />
            <Metric label="Connected / disconnected" value={`${connectedTeams.length} connected · ${disconnectedTeams} disconnected`} health={!teams.length ? "warning" : disconnectedTeams ? "warning" : "healthy"} />
            <Metric label="Reconnecting / failed reconnects" value="Not tracked (heartbeat only reports last-seen, not reconnect attempts)" />
            <Metric label="Last player activity" value={answers[answers.length - 1]?.submitted_at ? new Date(answers[answers.length - 1].submitted_at!).toLocaleTimeString() : "No activity"} />
            <Metric label="Last answer" value={answers[answers.length - 1]?.team_name || "None"} />
            <div className="qi-health-sort"><span>Sort teams</span><button className={teamSort === "name" ? "is-active" : ""} onClick={() => setTeamSort("name")}>Name</button><button className={teamSort === "activity" ? "is-active" : ""} onClick={() => setTeamSort("activity")}>Activity</button></div>
            <div className="qi-health-team-list">{sortedTeams.map(team => {
              const connected = isTeamConnected(team);
              const lastSeenLabel = team.last_seen_at ? `Last seen ${ageLabel(new Date(team.last_seen_at).getTime(), now)} ago` : "Never checked in";
              return <span key={team.team_name} title={`${connected ? "Connected" : "Disconnected"} · ${lastSeenLabel}`}>{team.team_name}<i className={submittedTeams.has(team.team_name) ? "is-active" : ""} />{!connected && <i style={{ background: "#ff8290" }} />}</span>;
            })}</div>
          </Card>

          <Card title="Realtime" health={realtimeHealth}>
            <Metric label="Supabase state" value={realtime.status} health={realtimeHealth} /><Metric label="Subscription" value={realtime.status === "SUBSCRIBED" ? "Active" : "Not active"} />
            <Metric label="Last reconnect" value={timeLabel(realtime.lastReconnect)} /><Metric label="Subscription errors" value={realtime.errors} health={realtime.errors ? "warning" : "healthy"} />
            <Metric label="Last successful sync" value={timeLabel(realtime.lastSync)} /><Metric label="Observed sync age" value={Number.isFinite(realtimeAge) ? `${Math.round(realtimeAge)} ms` : "Unavailable"} />
            <Metric label="Pending / failed writes" value="Not instrumented" health="warning" />
          </Card>

          <Card title="Display" health="warning">
            <Metric label="Display connected" value="Heartbeat data unavailable" health="warning" /><Metric label="Last heartbeat / refresh" value="Not recorded" />
            <Metric label="Expected phase" value={session.phase} /><Metric label="Expected route" value={`/host/display?pin=${session.pin || "----"}`} />
            <Metric label="Last state update" value={timeLabel(realtime.lastSync)} />
          </Card>

          <Card title="Audio" health={audio.overlap ? "problem" : "healthy"}>
            <Metric label="Current sound" value={audio.active.map(item => item.file).join(", ") || "None"} /><Metric label="Active channels" value={audio.active.map(item => item.channel).join(", ") || "None"} />
            <Metric label="Timer / music / voice" value={`${audio.active.some(a => a.channel === "timer") ? "Timer active" : "Timer idle"} · ${audio.active.some(a => a.channel === "music") ? "Music active" : "Music idle"} · Voice unavailable`} />
            <Metric label="Unexpected overlap" value={audio.overlap ? "Detected" : "None"} health={audio.overlap ? "problem" : "healthy"} />
            <Metric label="Muted / queue" value="No global mute · no queue" />
          </Card>

          <Card title="Timers & Submissions" health={duplicates ? "warning" : "healthy"}>
            <Metric label="Current timer" value={`${timer.remaining}s / ${timer.duration}s`} health={timer.running ? "healthy" : "unknown"} /><Metric label="State / owner" value={`${timer.running ? "Running" : "Stopped"} · Host`} />
            <Metric label="Expected submissions" value={teams.length} /><Metric label="Received" value={submittedTeams.size} health="healthy" /><Metric label="Missing" value={missing.length} health={missing.length ? "warning" : "healthy"} />
            <Metric label="Duplicate submissions" value={duplicates} health={duplicates ? "warning" : "healthy"} /><Metric label="Late submissions" value="Not classified by current schema" />
          </Card>

          <Card title="Performance" health={fps !== null && fps < 45 ? "warning" : "healthy"}>
            <Metric label="FPS while panel open" value={fps ?? "Sampling"} health={fps !== null && fps < 45 ? "warning" : "healthy"} /><Metric label="JS heap" value={memory} />
            <Metric label="Long tasks observed" value={longTasks} health={longTasks ? "warning" : "healthy"} /><Metric label="Visibility" value={document.visibilityState} />
          </Card>

          <Card title="Recovery" health="healthy"><div className="qi-health-actions">
            <button onClick={() => recover("Display opened/refreshed", props.onRefreshDisplay)}>Refresh display</button>
            <button onClick={() => recover("Player state refreshed", props.onRefreshPlayers)}>Refresh player state</button>
            <button onClick={() => recover("Subscriptions restarted", props.onRestartSubscriptions)}>Restart subscriptions</button>
            <button onClick={() => recover("Realtime reconnected", props.onRestartSubscriptions)}>Reconnect realtime</button>
            <button onClick={() => recover("Audio cleaned", () => stopAllShowAudio())}>Clear stale audio</button>
            <button onClick={() => recover("Session resynced", props.onResyncSession)}>Resync session</button>
          </div>{busy && <p className="qi-health-busy">Running: {busy}</p>}</Card>

          <Card title="Recent Events" health={events.some(event => event.level === "problem") ? "problem" : "healthy"}>
            <div className="qi-health-log" aria-live="polite">{events.length ? events.map((event,index) => <div key={`${event.at}-${index}`} className={`is-${event.level}`}><time>{timeLabel(event.at)}</time><span>{event.message}</span></div>) : <p>No diagnostic events yet.</p>}</div>
          </Card>
        </main>
      </div>
    </div>
  );
}
