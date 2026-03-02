const LOOKAHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
const CLICK_DURATION_SECONDS = 0.03;
const ACCENT_FREQUENCY_HZ = 1760;
const BEAT_FREQUENCY_HZ = 880;

let audioContext: AudioContext | null = null;
let schedulerTimerId: number | null = null;
let transportStartTime = 0;
let nextBeatTime = 0;
let beatNumber = 0;
let currentBpm = 120;
let playing = false;

const activeOscillators = new Set<OscillatorNode>();

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  return audioContext;
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
  gainNode.connect(context.destination);

  oscillator.start(time);
  oscillator.stop(time + CLICK_DURATION_SECONDS + 0.01);

  activeOscillators.add(oscillator);
  oscillator.onended = () => {
    activeOscillators.delete(oscillator);
    oscillator.disconnect();
    gainNode.disconnect();
  };
}

function scheduleAhead(): void {
  const context = getAudioContext();
  const secondsPerBeat = 60 / currentBpm;

  while (nextBeatTime < context.currentTime + LOOKAHEAD_SECONDS) {
    const accent = beatNumber % 4 === 0;
    scheduleClick(nextBeatTime, accent);
    beatNumber += 1;
    nextBeatTime += secondsPerBeat;
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
}
