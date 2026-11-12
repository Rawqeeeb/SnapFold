use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NoteEvent {
    pub amino_acid: String,
    pub pitch: u8,
    pub time: f32,
    pub duration: f32,
    pub velocity: u8,
    pub hand: String,
    pub chord_pitches: Vec<u8>,
    pub residue_index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secondary_structure: Option<String>,
}

pub fn get_engelmann_pitch(aa: char) -> u8 {
    match aa.to_ascii_uppercase() {
        'F' => 50,
        'M' => 51,
        'I' => 52,
        'L' => 53,
        'V' => 54,
        'C' => 55,
        'W' => 56,
        'A' => 57,
        'T' => 58,
        'G' => 59,
        'S' => 60,
        'P' => 61,
        'Y' => 62,
        'H' => 65,
        'Q' => 66,
        'N' => 67,
        'E' => 71,
        'K' => 72,
        'D' => 73,
        'R' => 77,
        _ => 60,
    }
}

pub fn get_reduced_pitch(aa: char) -> u8 {
    match aa.to_ascii_uppercase() {
        'D' | 'E' | 'H' | 'N' | 'R' => 60,
        'K' | 'Q' | 'S' | 'T' => 62,
        'A' | 'C' | 'G' | 'M' | 'P' => 64,
        'F' | 'I' | 'L' | 'V' | 'W' | 'Y' => 67,
        _ => 60,
    }
}

fn clamp_pitch(p: i32) -> u8 {
    p.clamp(21, 108) as u8
}

pub fn sonify_sequence(seq: &str, algorithm: &str) -> Vec<NoteEvent> {
    let clean_seq: Vec<char> = seq.chars().filter(|c| c.is_alphabetic()).collect();
    let n = clean_seq.len();
    if n == 0 {
        return Vec::new();
    }

    let mut events = Vec::new();
    let tempo_factor = 0.25; // 16th notes approx

    // Precalculate entropy if Algo-IV
    let mut entropy_pitches = HashMap::new();
    if algorithm == "Algo-IV" {
        let window = 4i32;
        let mut entropies = Vec::with_capacity(n);
        for i in 0..n {
            let start = (i as i32 - window).max(0) as usize;
            let end = (i as i32 + window).min(n as i32 - 1) as usize;
            let slice = &clean_seq[start..=end];
            let mut counts = HashMap::new();
            for &c in slice {
                *counts.entry(c.to_ascii_uppercase()).or_insert(0usize) += 1;
            }
            let len = slice.len() as f32;
            let mut ent = 0.0f32;
            for &cnt in counts.values() {
                let p = cnt as f32 / len;
                if p > 0.0 {
                    ent -= p * p.log2();
                }
            }
            entropies.push(ent);
        }
        let e_min = entropies.iter().copied().fold(f32::INFINITY, f32::min);
        let e_max = entropies.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let range = if (e_max - e_min).abs() < 1e-4 { 1.0 } else { e_max - e_min };
        for (i, &ent) in entropies.iter().enumerate() {
            let pitch = (50.0 + ((ent - e_min) / range) * 24.0).round() as u8;
            entropy_pitches.insert(i, pitch);
        }
    }

    for (i, &aa) in clean_seq.iter().enumerate() {
        let time = i as f32 * tempo_factor;
        let duration = 0.22;
        let velocity = 88;
        let aa_upper = aa.to_ascii_uppercase();

        let (pitch, chords) = match algorithm {
            "Algo-I" => (get_engelmann_pitch(aa), vec![]),
            "Algo-II" => (get_reduced_pitch(aa), vec![]),
            "Algo-III" => {
                let p = get_engelmann_pitch(aa);
                let chord_p = get_reduced_pitch(aa);
                let chords = if p != chord_p { vec![chord_p] } else { vec![] };
                (p, chords)
            }
            "Algo-IV" => {
                let p = *entropy_pitches.get(&i).unwrap_or(&60);
                (p, vec![])
            }
            "Algo-V" => {
                let p = get_engelmann_pitch(aa);
                let mut chords = Vec::new();
                if p >= 33 { chords.push(p - 12); }
                if p <= 96 { chords.push(p + 12); }
                (p, chords)
            }
            // Fantaisie-Impromptu / Default
            _ => {
                // Map based on molecular weight / index
                let base = match aa_upper {
                    'G' => 48, 'A' => 50, 'S' => 52, 'P' => 53, 'V' => 55,
                    'T' => 57, 'C' => 59, 'I' => 60, 'L' => 62, 'N' => 64,
                    'D' => 65, 'Q' => 67, 'K' => 69, 'E' => 71, 'M' => 72,
                    'H' => 74, 'F' => 76, 'R' => 77, 'Y' => 79, 'W' => 81,
                    _ => 60,
                };
                let chord = if i % 4 == 0 {
                    vec![clamp_pitch(base as i32 - 12)]
                } else {
                    vec![]
                };
                (base, chord)
            }
        };

        events.push(NoteEvent {
            amino_acid: aa_upper.to_string(),
            pitch,
            time,
            duration,
            velocity,
            hand: if i % 2 == 0 { "right".to_string() } else { "left".to_string() },
            chord_pitches: chords,
            residue_index: i,
            secondary_structure: None,
        });
    }

    events
}
