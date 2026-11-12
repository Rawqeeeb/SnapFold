use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BlockMeshPoint {
    pub position: [f32; 3],
    pub size: [f32; 3],
    pub residue_index: usize,
    pub amino_acid: String,
    pub b_factor: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SubunitData {
    pub chain_id: String,
    pub name: String,
    pub centroid: [f32; 3],
    pub blocks: Vec<BlockMeshPoint>,
    pub sequence: String,
    pub color_hint: String,
}

fn aa_3to1(three: &str) -> char {
    match three.trim().to_ascii_uppercase().as_str() {
        "ALA" => 'A', "CYS" => 'C', "ASP" => 'D', "GLU" => 'E',
        "PHE" => 'F', "GLY" => 'G', "HIS" => 'H', "ILE" => 'I',
        "LYS" => 'K', "LEU" => 'L', "MET" => 'M', "ASN" => 'N',
        "PRO" => 'P', "GLN" => 'Q', "ARG" => 'R', "SER" => 'S',
        "THR" => 'T', "VAL" => 'V', "TRP" => 'W', "TYR" => 'Y',
        _ => 'X',
    }
}

const CHAIN_COLORS: &[&str] = &[
    "#00F5D4", // Electric Cyan / Mint
    "#FF5500", // Bioluminescent Amber / Coral
    "#7928CA", // Ultraviolet / Purple
    "#0070F3", // Sapphire Blue
    "#F5A623", // Gold
    "#50E3C2", // Bright Teal
];

pub fn parse_pdb_to_subunits(pdb_text: &str) -> Vec<SubunitData> {
    struct AtomRecord {
        chain_id: char,
        res_name: String,
        res_seq: i32,
        x: f32,
        y: f32,
        z: f32,
        b_factor: f32,
    }

    let mut atoms_by_chain: HashMap<char, Vec<AtomRecord>> = HashMap::new();

    for line in pdb_text.lines() {
        if line.starts_with("ATOM") || line.starts_with("HETATM") {
            if line.len() < 54 {
                continue;
            }
            let atom_name = line.get(12..16).unwrap_or("").trim();
            // We focus on Alpha-Carbons (CA) or main backbone for clean subunit block meshes
            let is_ca = atom_name == "CA";
            let chain_char = line.chars().nth(21).unwrap_or('A');
            let res_name = line.get(17..20).unwrap_or("UNK").trim().to_string();
            let res_seq = line.get(22..26).unwrap_or("0").trim().parse::<i32>().unwrap_or(0);

            let x = line.get(30..38).unwrap_or("0").trim().parse::<f32>().unwrap_or(0.0);
            let y = line.get(38..46).unwrap_or("0").trim().parse::<f32>().unwrap_or(0.0);
            let z = line.get(46..54).unwrap_or("0").trim().parse::<f32>().unwrap_or(0.0);
            let b_factor = if line.len() >= 66 {
                line.get(60..66).unwrap_or("0").trim().parse::<f32>().unwrap_or(50.0)
            } else {
                50.0
            };

            if is_ca || (!is_ca && atoms_by_chain.get(&chain_char).map_or(true, |v| v.is_empty())) {
                atoms_by_chain.entry(chain_char).or_default().push(AtomRecord {
                    chain_id: chain_char,
                    res_name,
                    res_seq,
                    x,
                    y,
                    z,
                    b_factor,
                });
            }
        }
    }

    let mut subunits = Vec::new();
    let mut chain_keys: Vec<char> = atoms_by_chain.keys().copied().collect();
    chain_keys.sort();

    for (color_idx, &chain) in chain_keys.iter().enumerate() {
        let atoms = &atoms_by_chain[&chain];
        if atoms.is_empty() {
            continue;
        }

        // Calculate centroid
        let count = atoms.len() as f32;
        let cx: f32 = atoms.iter().map(|a| a.x).sum::<f32>() / count;
        let cy: f32 = atoms.iter().map(|a| a.y).sum::<f32>() / count;
        let cz: f32 = atoms.iter().map(|a| a.z).sum::<f32>() / count;

        let mut seq_chars = Vec::new();
        let mut blocks = Vec::new();

        for (idx, atom) in atoms.iter().enumerate() {
            let aa_char = aa_3to1(&atom.res_name);
            seq_chars.push(aa_char);

            // Position relative to subunit centroid (so subunit can be translated/rotated around its own center)
            blocks.push(BlockMeshPoint {
                position: [atom.x - cx, atom.y - cy, atom.z - cz],
                size: [1.8, 1.8, 1.8], // standardized voxel block size
                residue_index: idx,
                amino_acid: aa_char.to_string(),
                b_factor: atom.b_factor,
            });
        }

        let seq_str: String = seq_chars.into_iter().collect();
        let color = CHAIN_COLORS[color_idx % CHAIN_COLORS.len()].to_string();

        subunits.push(SubunitData {
            chain_id: chain.to_string(),
            name: format!("Subunit {}", chain),
            centroid: [cx, cy, cz],
            blocks,
            sequence: seq_str,
            color_hint: color,
        });
    }

    subunits
}
