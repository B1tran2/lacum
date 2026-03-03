"""Harmonic progression MIDI generator for orchestral rap styles.

Generates chord progressions with cadences per section and exports a MIDI file.
"""

from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from typing import List, Sequence, Tuple

TICKS_PER_QUARTER = 480

MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]

STYLE_NAMES = {"barroco", "clasico", "romantico"}


@dataclass(frozen=True)
class Section:
    name: str
    bars: int


@dataclass(frozen=True)
class Chord:
    notes: Tuple[int, ...]
    degree: int
    label: str
    section: str


@dataclass(frozen=True)
class SectionRules:
    name: str
    cadence: Tuple[int, int]
    secondary_prob: float
    inversion_choices: Tuple[int, ...]


def parse_key(key: str) -> Tuple[int, str]:
    normalized = key.strip().lower()
    is_minor = "minor" in normalized or normalized.endswith("m")
    base = normalized.replace("minor", "").replace("major", "").strip()
    if base.endswith("m"):
        base = base[:-1]
    pitch_map = {
        "c": 0,
        "c#": 1,
        "db": 1,
        "d": 2,
        "d#": 3,
        "eb": 3,
        "e": 4,
        "f": 5,
        "f#": 6,
        "gb": 6,
        "g": 7,
        "g#": 8,
        "ab": 8,
        "a": 9,
        "a#": 10,
        "bb": 10,
        "b": 11,
    }
    if base not in pitch_map:
        raise ValueError(f"Unsupported key: {key}")
    return pitch_map[base], "minor" if is_minor else "major"


def section_plan(total_bars: int) -> List[Section]:
    if total_bars < 12:
        raise ValueError("Number of bars should be at least 12.")
    intro = max(2, total_bars // 8)
    outro = max(2, total_bars // 10)
    bridge = max(4, total_bars // 6)
    chorus = max(8, total_bars // 4)
    verse = total_bars - (intro + outro + bridge + chorus)
    if verse < 4:
        verse = 4
        chorus = max(4, chorus - 2)
        bridge = max(4, bridge - 2)
    sections = [
        Section("intro", intro),
        Section("verso", verse),
        Section("coro", chorus),
        Section("puente", bridge),
        Section("outro", outro),
    ]
    return sections


def scale_degree_to_pitch(tonic: int, mode: str, degree: int) -> int:
    scale = MAJOR_SCALE if mode == "major" else MINOR_SCALE
    index = (degree - 1) % 7
    return tonic + scale[index]


def build_triad(tonic: int, mode: str, degree: int) -> List[int]:
    scale = MAJOR_SCALE if mode == "major" else MINOR_SCALE
    root = scale_degree_to_pitch(tonic, mode, degree)
    third = tonic + scale[(degree + 1) % 7]
    fifth = tonic + scale[(degree + 3) % 7]
    return [root, third, fifth]


def invert_chord(notes: List[int], inversion: int) -> List[int]:
    inverted = notes[:]
    for _ in range(inversion):
        note = inverted.pop(0)
        inverted.append(note + 12)
    return inverted


def apply_secondary_dominant(tonic: int, mode: str, degree: int) -> List[int]:
    target = scale_degree_to_pitch(tonic, mode, degree)
    root = target + 7
    return [root, root + 4, root + 7]


def choose_progression(style: str, bars: int) -> List[int]:
    templates = {
        "barroco": [1, 4, 7, 3, 6, 2, 5, 1],
        "clasico": [1, 6, 2, 5, 1, 4, 2, 5],
        "romantico": [1, 3, 6, 4, 2, 5, 1, 6],
    }
    template = templates[style]
    progression = []
    while len(progression) < bars:
        progression.extend(template)
    return progression[:bars]


def apply_cadence(progression: List[int], cadence: Tuple[int, int]) -> List[int]:
    if len(progression) < 2:
        return progression
    progression[-2:] = list(cadence)
    return progression


def avoid_generic_progression(progression: List[int]) -> List[int]:
    generic = [1, 5, 6, 4]
    for i in range(len(progression) - 3):
        if progression[i : i + 4] == generic:
            progression[i + 2] = 2
    return progression


def vary_progression(
    tonic: int,
    mode: str,
    progression: Sequence[int],
    seed: int | None,
    section_rules: SectionRules,
) -> List[Chord]:
    rng = random.Random(seed)
    chords: List[Chord] = []
    for degree in progression:
        use_secondary = (
            rng.random() < section_rules.secondary_prob and degree in {2, 4, 5, 6}
        )
        if use_secondary:
            notes = apply_secondary_dominant(tonic, mode, degree)
            label = f"V/{degree}"
        else:
            notes = build_triad(tonic, mode, degree)
            label = f"{degree}"
        inversion = rng.choice(section_rules.inversion_choices)
        notes = invert_chord(notes, inversion)
        chords.append(Chord(tuple(notes), degree, label, section_rules.name))
    return chords


def build_section_rules() -> dict[str, SectionRules]:
    return {
        "intro": SectionRules(
            name="intro", cadence=(4, 1), secondary_prob=0.1, inversion_choices=(0, 1)
        ),
        "verso": SectionRules(
            name="verso", cadence=(2, 5), secondary_prob=0.2, inversion_choices=(0, 1)
        ),
        "coro": SectionRules(
            name="coro", cadence=(5, 1), secondary_prob=0.35, inversion_choices=(0, 1, 2)
        ),
        "puente": SectionRules(
            name="puente", cadence=(5, 6), secondary_prob=0.3, inversion_choices=(0, 1, 2)
        ),
        "outro": SectionRules(
            name="outro", cadence=(4, 1), secondary_prob=0.15, inversion_choices=(0, 1)
        ),
    }


def build_sections(
    tonic: int, mode: str, style: str, total_bars: int, seed: int | None
) -> List[Chord]:
    sections = section_plan(total_bars)
    section_rules_map = build_section_rules()
    all_chords: List[Chord] = []
    for section in sections:
        rules = section_rules_map[section.name]
        progression = choose_progression(style, section.bars)
        progression = apply_cadence(progression, rules.cadence)
        progression = avoid_generic_progression(progression)
        chords = vary_progression(tonic, mode, progression, seed, rules)
        all_chords.extend(chords)
    return all_chords


def write_midi(
    chords: Sequence[Chord], bpm: int, output_path: str, channel: int = 0
) -> None:
    tempo = int(60_000_000 / bpm)
    header = b"MThd" + (6).to_bytes(4, "big") + (0).to_bytes(2, "big")
    header += (1).to_bytes(2, "big") + TICKS_PER_QUARTER.to_bytes(2, "big")

    events = bytearray()
    events.extend(b"\x00\xff\x51\x03" + tempo.to_bytes(3, "big"))
    events.extend(b"\x00\xff\x58\x04\x04\x02\x18\x08")

    ticks_per_bar = TICKS_PER_QUARTER * 4
    current_section = None
    for chord in chords:
        if chord.section != current_section:
            current_section = chord.section
            events.extend(encode_text_event(f"section:{current_section}"))
        events.extend(encode_text_event(f"{chord.section}:{chord.label}"))
        for note in chord.notes:
            events.extend(encode_var_len(0))
            events.extend(bytes([0x90 | channel, note + 60, 90]))
        events.extend(encode_var_len(ticks_per_bar))
        for idx, note in enumerate(chord.notes):
            if idx > 0:
                events.extend(encode_var_len(0))
            events.extend(bytes([0x80 | channel, note + 60, 64]))

    events.extend(b"\x00\xff\x2f\x00")
    track = b"MTrk" + len(events).to_bytes(4, "big") + bytes(events)

    with open(output_path, "wb") as handle:
        handle.write(header + track)


def encode_var_len(value: int) -> bytes:
    buffer = value & 0x7F
    bytes_out = []
    while value > 0x7F:
        value >>= 7
        buffer <<= 8
        buffer |= ((value & 0x7F) | 0x80)
    while True:
        bytes_out.append(buffer & 0xFF)
        if buffer & 0x80:
            buffer >>= 8
        else:
            break
    return bytes(reversed(bytes_out))


def encode_text_event(text: str) -> bytes:
    payload = text.encode("utf-8")
    return encode_var_len(0) + b"\xff\x01" + encode_var_len(len(payload)) + payload


def validate_style(style: str) -> str:
    normalized = style.strip().lower()
    if normalized not in STYLE_NAMES:
        raise ValueError(f"Style must be one of: {', '.join(sorted(STYLE_NAMES))}")
    return normalized


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate harmonic MIDI progressions.")
    parser.add_argument("--key", required=True, help="Tonalidad, e.g. C, Am, D minor")
    parser.add_argument("--bpm", type=int, required=True)
    parser.add_argument("--style", required=True, help="barroco, clasico, romantico")
    parser.add_argument("--bars", type=int, required=True)
    parser.add_argument("--out", required=True, help="Output MIDI file path")
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args()

    tonic, mode = parse_key(args.key)
    style = validate_style(args.style)
    chords = build_sections(tonic, mode, style, args.bars, args.seed)
    write_midi(chords, args.bpm, args.out)


if __name__ == "__main__":
    main()
