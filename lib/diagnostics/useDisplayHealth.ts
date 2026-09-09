"use client";
import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { assessDisplayHealth, displaySnapshot, parseDisplayReply, DISPLAY_PROBE_MS, DISPLAY_STALE_MS, type DisplaySnapshot, type DisplayObservation } from './displayHealth';

const topic = (pin: string) => `display-health-v1:${pin}`;

// Replies only from a committed React effect, after applySession has completed.
// No question text, answers, player tokens or score data are broadcast.
export function useDisplayResponder(pin: string, connected: boolean, snapshot: DisplaySnapshot | null) {
  const committed = useRef<DisplaySnapshot | null>(null);
  useEffect(() => { committed.current = snapshot; }, [snapshot]);
  useEffect(() => {
    if (!pin || !connected) return;
    const client = createSupabaseBrowserClient();
    const displayId = crypto.randomUUID();
    const channel = client.channel(topic(pin));
    channel.on('broadcast', { event: 'probe' }, ({ payload }) => {
      if (typeof payload?.probe !== 'string' || payload.probe.length > 80 || !committed.current) return;
      void channel.send({ type: 'broadcast', event: 'reply', payload: {
        ...committed.current, probe: payload.probe, displayId, visible: document.visibilityState === 'visible',
      } });
    }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [pin, connected]);
}

export function useDisplayHealth(pin: string, enabled: boolean) {
  const [state, setState] = useState<{ pin: string; expected: DisplaySnapshot | null; observations: DisplayObservation[]; now: number; status: string; error: string | null }>({ pin: '', expected: null, observations: [], now: 0, status: 'CLOSED', error: null });
  useEffect(() => {
    if (!enabled || !pin) return;
    const client = createSupabaseBrowserClient();
    let active = true;
    let pending = false;
    let status = 'CONNECTING';
    const probes = new Map<string, number>();
    const observations = new Map<string, DisplayObservation>();
    // A display may reply out of order; retain the newest probe per browser.
    const newestProbe = new Map<string, number>();
    let firstStatus = true;
    const channel = client.channel(topic(pin));
    channel.on('broadcast', { event: 'reply' }, ({ payload }) => {
      if (!active) return;
      const now = Date.now();
      const reply = parseDisplayReply(payload, probes, now);
      if (!reply) return;
      const sent = probes.get(reply.probe)!;
      if (sent <= (newestProbe.get(reply.displayId) ?? -1)) return;
      newestProbe.set(reply.displayId, sent);
      observations.set(reply.displayId, reply);
      // Bound advisory telemetry, even if unknown clients send replies.
      if (observations.size > 16) {
        const oldest = observations.keys().next().value!;
        observations.delete(oldest); newestProbe.delete(oldest);
      }
      setState(s => ({ ...s, pin, observations: [...observations.values()], now, status }));
    }).subscribe(next => {
      status = next;
      if (active) {
        if (firstStatus) {
          firstStatus = false;
          setState({ pin, expected: null, observations: [], status: next, now: Date.now(), error: null });
        } else setState(s => ({ ...s, pin, status: next, now: Date.now() }));
      }
    });
    const sample = async () => {
      if (!active || pending) return;
      pending = true;
      try {
        const { data, error } = await client.from('sessions').select('updated_at,phase,round_number,current_question_index').eq('pin', pin).single();
        if (!active) return;
        const now = Date.now();
        const expected = data ? displaySnapshot(data) : null;
        setState(s => ({ ...s, pin, expected, now, status, error: error?.message ?? (!expected ? 'Session version unavailable' : null) }));
        for (const [key, sent] of probes) if (now - sent > DISPLAY_STALE_MS) probes.delete(key);
        if (status === 'SUBSCRIBED') {
          const probe = crypto.randomUUID();
          probes.set(probe, now);
          await channel.send({ type: 'broadcast', event: 'probe', payload: { probe } });
        }
      } catch (error) {
        if (active) setState(s => ({ ...s, pin, error: String(error), now: Date.now() }));
      } finally { pending = false; }
    };
    void sample();
    const interval = window.setInterval(() => { if (active) setState(s => ({ ...s, now: Date.now() })); void sample(); }, DISPLAY_PROBE_MS);
    return () => { active = false; window.clearInterval(interval); void client.removeChannel(channel); };
  }, [pin, enabled]);
  const current = enabled && state.pin === pin ? state : { expected: null, observations: [], now: 0, status: 'CLOSED', error: null };
  return { ...current, health: assessDisplayHealth(current.expected, current.observations, current.now, current.status, current.error) };
}
