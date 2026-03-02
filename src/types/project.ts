export interface ProjectDocument {
  schemaVersion: string;
  projectId: string;
  revision: number;
  updatedAt: string;
  global: GlobalConfig;
  structure: Structure;
  harmony: Harmony;
  midi: Midi;
  aiMeta: AiMeta;
}

export interface GlobalConfig {
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  key: MusicalKey;
  style: string;
  totalBars: number;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface MusicalKey {
  tonic: string;
  mode: 'major' | 'minor';
}

export interface Structure {
  sectionOrder: string[];
  sections: Section[];
}

export interface Section {
  sectionId: string;
  type: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro';
  startBar: number;
  barLength: number;
}

export interface Harmony {
  sectionProgressions: SectionProgression[];
}

export interface SectionProgression {
  sectionId: string;
  cadenceType: string;
  tensionLevel: number;
  chords: Chord[];
}

export interface Chord {
  chordId: string;
  bar: number;
  beat: number;
  durationBeats: number;
  romanDegree: string;
  inversion: string;
  extensions?: string[];
}

export interface Midi {
  tracks: Track[];
  clips: Clip[];
  notes: Note[];
}

export interface Track {
  trackId: string;
  name: string;
  midiChannel: number;
}

export interface Clip {
  clipId: string;
  trackId: string;
  sectionId: string;
  startBar: number;
  barLength: number;
}

export interface Note {
  noteId: string;
  trackId: string;
  clipId: string;
  sectionId: string;
  chordId: string;
  pitch: number;
  startTicks: number;
  durationTicks: number;
  velocity: number;
}

export interface AiMeta {
  changeHistory: unknown[];
  editOwnership: unknown[];
}
