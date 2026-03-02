const LOOKAHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
const OFFLINE_RENDER_TAIL_SECONDS = 0.5;

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

function normalizeTrackConfig(config: TrackPlaybackConfig): TrackPlaybackConfig {
  return {
    trackId: config.trackId,
    gain: Math.min(Math.max(config.gain, 0), 1),
    muted: config.muted,
  };
}

function createTrackConfigMap(configs: TrackPlaybackConfig[]): Map<string, TrackPlaybackConfig> {
  const map = new Map<string, TrackPlaybackConfig>();
  for (const config of configs) {
    map.set(config.trackId, normalizeTrackConfig(config));
  }
  return map;
}

function getTrackPlaybackConfig(trackId: string): TrackPlaybackConfig {
  return trackPlaybackConfigMap.get(trackId) ?? { trackId, gain: 1, muted: false };
}

function applyEnvelope(
  gainParam: AudioParam,
  startTime: number,
  durationSeconds: number,
  velocity: number,
): number {
  const velocityGain = Math.min(Math.max(velocity / 127, 0.05), 1);
  const sustainGain = velocityGain * SYNTH_SUSTAIN_LEVEL;
  const attackEnd = startTime + SYNTH_ATTACK_SECONDS;
  const decayEnd = attackEnd + SYNTH_DECAY_SECONDS;
  const noteEnd = startTime + durationSeconds;
  const releaseEnd = noteEnd + SYNTH_RELEASE_SECONDS;

  gainParam.setValueAtTime(0.0001, startTime);
  gainParam.linearRampToValueAtTime(velocityGain, attackEnd);
  gainParam.linearRampToValueAtTime(sustainGain, decayEnd);
  gainParam.setValueAtTime(sustainGain, noteEnd);
  gainParam.linearRampToValueAtTime(0.0001, releaseEnd);

  return releaseEnd;
}

function scheduleSynthVoice(
  context: BaseAudioContext,
  destination: AudioNode,
  note: ProjectNoteEvent,
  startTimeSeconds: number,
  bpm: number,
  activeSet?: Set<OscillatorNode>,
): void {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  const noteDurationSeconds = Math.max(beatsToSeconds(note.durationBeats, bpm), 0.01);
  const releaseEnd = applyEnvelope(gainNode.gain, startTimeSeconds, noteDurationSeconds, note.velocity);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(midiToFrequency(note.pitch), startTimeSeconds);

  oscillator.connect(gainNode);
  gainNode.connect(destination);

  oscillator.start(startTimeSeconds);
  oscillator.stop(releaseEnd + 0.005);

  if (activeSet) {
    activeSet.add(oscillator);
    oscillator.onended = () => {
      activeSet.delete(oscillator);
      oscillator.disconnect();
      gainNode.disconnect();
    };
  }
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const channelCount = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frameCount = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame]));
      const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, Math.round(pcm), true);
      offset += bytesPerSample;
    }
  }

  return wavBuffer;
}

export async function renderProjectToWav(
  notes: ProjectNoteEvent[],
  bpm: number,
  trackConfigs: TrackPlaybackConfig[],
): Promise<Blob> {
  const normalizedBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
  const sortedNotes = [...notes].sort((a, b) => a.startBeats - b.startBeats);
  const maxNoteBeat = sortedNotes.reduce(
    (maxBeat, note) => Math.max(maxBeat, note.startBeats + note.durationBeats),
    0,
  );
  const totalSeconds = Math.max(
    beatsToSeconds(maxNoteBeat, normalizedBpm) + OFFLINE_RENDER_TAIL_SECONDS,
    0.5,
  );

  const sampleRate = 44100;
  const frameCount = Math.ceil(totalSeconds * sampleRate);
  const offlineContext = new OfflineAudioContext(2, frameCount, sampleRate);

  const master = offlineContext.createGain();
  master.gain.setValueAtTime(1, 0);
  master.connect(offlineContext.destination);

  const trackConfigMap = createTrackConfigMap(trackConfigs);
  const offlineTrackGains = new Map<string, GainNode>();

  for (const note of sortedNotes) {
    const trackConfig = trackConfigMap.get(note.trackId) ?? {
      trackId: note.trackId,
      gain: 1,
      muted: false,
    };

    if (trackConfig.muted || trackConfig.gain <= 0) {
      continue;
    }

    let trackGain = offlineTrackGains.get(note.trackId);
    if (!trackGain) {
      trackGain = offlineContext.createGain();
      trackGain.gain.setValueAtTime(trackConfig.gain, 0);
      trackGain.connect(master);
      offlineTrackGains.set(note.trackId, trackGain);
    }

    const noteTime = beatsToSeconds(note.startBeats, normalizedBpm);
    if (noteTime > totalSeconds) {
      continue;
    }

    scheduleSynthVoice(offlineContext, trackGain, note, noteTime, normalizedBpm);
  }

  const renderedBuffer = await offlineContext.startRendering();

  for (const gainNode of offlineTrackGains.values()) {
    gainNode.disconnect();
  }
  master.disconnect();

  const wavData = audioBufferToWav(renderedBuffer);
  return new Blob([wavData], { type: 'audio/wav' });
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (60 / bpm) * beats;
}

function currentTransportBeat(context: AudioContext): number {
  const elapsedSeconds = context.currentTime - transportStartTime;
  return elapsedSeconds / beatsToSeconds(1, currentBpm);
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
  const effectiveGain = config.muted ? 0 : config.gain;
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
  scheduleSynthVoice(getAudioContext(), applyTrackGain(note.trackId), note, time, currentBpm, activeOscillators);
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
    const normalizedConfig = normalizeTrackConfig(config);
    trackPlaybackConfigMap.set(config.trackId, normalizedConfig);
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
