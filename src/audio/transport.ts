const LOOKAHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;

const CLICK_DURATION_SECONDS = 0.03;
const ACCENT_FREQUENCY_HZ = 1760;
const BEAT_FREQUENCY_HZ = 880;

const SYNTH_ATTACK_SECONDS = 0.005;
const SYNTH_DECAY_SECONDS = 0.04;
const SYNTH_SUSTAIN_LEVEL = 0.6;
const SYNTH_RELEASE_SECONDS = 0.02;

export interface ProjectNoteEvent {
  trackId: string;
  pitch: number;
  startBeats: number;
  durationBeats: number;
  velocity: number;
}

export interface TrackPlaybackConfig {
  trackId: string;
  gain: number;
  muted: boolean;
}

let audioContext: AudioContext | null = null;
let schedulerTimerId: number | null = null;
let transportStartTime = 0;
let nextBeatTime = 0;
let beatNumber = 0;
let currentBpm = 120;
let playing = false;

let projectNotesProvider: (() => ProjectNoteEvent[]) | null = null;
let scheduledProjectNoteIndex = 0;

const trackPlaybackConfigMap = new Map<string, TrackPlaybackConfig>();
const trackGainNodes = new Map<string, GainNode>();

let masterGainNode: GainNode | null = null;

const activeOscillators = new Set<OscillatorNode>();

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (!masterGainNode) {
    masterGainNode = audioContext.createGain();
    masterGainNode.gain.setValueAtTime(1, audioContext.currentTime);
    masterGainNode.connect(audioContext.destination);
  }

  return audioContext;
}

function midiToFrequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (60 / bpm) * beats;
}

function currentTransportBeat(context: AudioContext): number {
  const elapsedSeconds = context.currentTime - transportStartTime;
  return elapsedSeconds / beatsToSeconds(1, currentBpm);
}

function getTrackPlaybackConfig(trackId: string): TrackPlaybackConfig {
  return trackPlaybackConfigMap.get(trackId) ?? { trackId, gain: 1, muted: false };
}

function applyTrackGain(trackId: string): GainNode {
  const context = getAudioContext();

  let trackGainNode = trackGainNodes.get(trackId);
  if (!trackGainNode) {
    trackGainNode = context.createGain();
    trackGainNodes.set(trackId, trackGainNode);
    trackGainNode.connect(masterGainNode!);
  }

  const config = getTrackPlaybackConfig(trackId);
  const normalizedGain = Math.min(Math.max(config.gain, 0), 1);
  const effectiveGain = config.muted ? 0 : normalizedGain;
  trackGainNode.gain.setValueAtTime(effectiveGain, context.currentTime);

  return trackGainNode;
}

function scheduleClick(time: number, accent: boolean): void {
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(accent ? ACCENT_FREQUENCY_HZ : BEAT_FREQUENCY_HZ, time);

  gainNode.gain.setValueAtTime(0.0001, time);
  gainNode.gain.exponentialRampToValueAtTime(accent ? 0.2 : 0.1, time + 0.003);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_DURATION_SECONDS);

  oscillator.connect(gainNode);
  gainNode.connect(masterGainNode!);

  oscillator.start(time);
  oscillator.stop(time + CLICK_DURATION_SECONDS + 0.01);

  activeOscillators.add(oscillator);
  oscillator.onended = () => {
    activeOscillators.delete(oscillator);
    oscillator.disconnect();
    gainNode.disconnect();
  };
}

function scheduleSynthNote(time: number, note: ProjectNoteEvent): void {
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const trackGainNode = applyTrackGain(note.trackId);

  const noteDurationSeconds = Math.max(beatsToSeconds(note.durationBeats, currentBpm), 0.01);
  const velocityGain = Math.min(Math.max(note.velocity / 127, 0.05), 1);
  const sustainGain = velocityGain * SYNTH_SUSTAIN_LEVEL;
  const attackEnd = time + SYNTH_ATTACK_SECONDS;
  const decayEnd = attackEnd + SYNTH_DECAY_SECONDS;
  const noteEnd = time + noteDurationSeconds;
  const releaseEnd = noteEnd + SYNTH_RELEASE_SECONDS;

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(midiToFrequency(note.pitch), time);

  gainNode.gain.setValueAtTime(0.0001, time);
  gainNode.gain.linearRampToValueAtTime(velocityGain, attackEnd);
  gainNode.gain.linearRampToValueAtTime(sustainGain, decayEnd);
  gainNode.gain.setValueAtTime(sustainGain, noteEnd);
  gainNode.gain.linearRampToValueAtTime(0.0001, releaseEnd);

  oscillator.connect(gainNode);
  gainNode.connect(trackGainNode);

  oscillator.start(time);
  oscillator.stop(releaseEnd + 0.005);

  activeOscillators.add(oscillator);
  oscillator.onended = () => {
    activeOscillators.delete(oscillator);
    oscillator.disconnect();
    gainNode.disconnect();
  };
}

function getProjectNotes(): ProjectNoteEvent[] {
  if (!projectNotesProvider) {
    return [];
  }

  const notes = projectNotesProvider();
  return [...notes].sort((a, b) => a.startBeats - b.startBeats);
}

function scheduleProjectNotes(context: AudioContext): void {
  const projectNotes = getProjectNotes();

  if (projectNotes.length === 0) {
    scheduledProjectNoteIndex = 0;
    return;
  }

  const lookaheadBeat = currentTransportBeat(context) + LOOKAHEAD_SECONDS / beatsToSeconds(1, currentBpm);

  while (scheduledProjectNoteIndex < projectNotes.length) {
    const note = projectNotes[scheduledProjectNoteIndex];

    if (note.startBeats > lookaheadBeat) {
      break;
    }

    const trackConfig = getTrackPlaybackConfig(note.trackId);
    const noteTime = transportStartTime + beatsToSeconds(note.startBeats, currentBpm);

    if (!trackConfig.muted && noteTime >= context.currentTime - 0.01) {
      scheduleSynthNote(noteTime, note);
    }

    scheduledProjectNoteIndex += 1;
  }
}

function scheduleAhead(): void {
  const context = getAudioContext();
  const secondsPerBeat = beatsToSeconds(1, currentBpm);

  while (nextBeatTime < context.currentTime + LOOKAHEAD_SECONDS) {
    const accent = beatNumber % 4 === 0;
    scheduleClick(nextBeatTime, accent);
    beatNumber += 1;
    nextBeatTime += secondsPerBeat;
  }

  scheduleProjectNotes(context);
}

export function setProjectScheduler(getNotes: () => ProjectNoteEvent[]): void {
  projectNotesProvider = getNotes;

  if (!playing) {
    scheduledProjectNoteIndex = 0;
    return;
  }

  const context = getAudioContext();
  const beatNow = currentTransportBeat(context);
  const projectNotes = getProjectNotes();
  scheduledProjectNoteIndex = projectNotes.findIndex((note) => note.startBeats >= beatNow);

  if (scheduledProjectNoteIndex === -1) {
    scheduledProjectNoteIndex = projectNotes.length;
  }
}

export function clearProjectScheduler(): void {
  projectNotesProvider = null;
  scheduledProjectNoteIndex = 0;
}

export function setTrackPlaybackConfig(configs: TrackPlaybackConfig[]): void {
  trackPlaybackConfigMap.clear();

  for (const config of configs) {
    const normalizedGain = Math.min(Math.max(config.gain, 0), 1);
    trackPlaybackConfigMap.set(config.trackId, {
      trackId: config.trackId,
      gain: normalizedGain,
      muted: config.muted,
    });
  }

  for (const trackId of trackGainNodes.keys()) {
    applyTrackGain(trackId);
  }
}

export function clearTrackPlaybackConfig(): void {
  trackPlaybackConfigMap.clear();

  const context = getAudioContext();
  for (const trackGainNode of trackGainNodes.values()) {
    trackGainNode.gain.setValueAtTime(1, context.currentTime);
  }
}

export function isPlaying(): boolean {
  return playing;
}

export function startTransport(bpm: number): void {
  if (playing) {
    return;
  }

  const normalizedBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
  const context = getAudioContext();
  void context.resume();

  currentBpm = normalizedBpm;
  playing = true;
  transportStartTime = context.currentTime;
  nextBeatTime = transportStartTime;
  beatNumber = 0;
  scheduledProjectNoteIndex = 0;

  scheduleAhead();
  schedulerTimerId = window.setInterval(scheduleAhead, SCHEDULER_INTERVAL_MS);
}

export function stopTransport(): void {
  if (schedulerTimerId !== null) {
    window.clearInterval(schedulerTimerId);
    schedulerTimerId = null;
  }

  for (const oscillator of activeOscillators) {
    try {
      oscillator.stop();
    } catch {
      // Oscillator may already be stopped.
    }
  }

  activeOscillators.clear();
  playing = false;
  scheduledProjectNoteIndex = 0;
}
