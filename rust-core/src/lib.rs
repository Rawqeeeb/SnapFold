pub mod docking;
pub mod pdb_parser;
pub mod sonification;

use docking::DockingEngineCore;
use pdb_parser::parse_pdb_to_subunits;
use sonification::sonify_sequence;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmDockingEngine {
    engine: DockingEngineCore,
}

#[wasm_bindgen]
impl WasmDockingEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(subunit_count: usize) -> Self {
        Self {
            engine: DockingEngineCore::new(subunit_count),
        }
    }

    #[wasm_bindgen]
    pub fn configure_subunit(
        &mut self,
        idx: usize,
        ox: f32,
        oy: f32,
        oz: f32,
        rx_deg: f32,
        ry_deg: f32,
        rz_deg: f32,
    ) {
        self.engine.set_scramble(idx, [ox, oy, oz], [rx_deg, ry_deg, rz_deg]);
    }

    #[wasm_bindgen]
    pub fn apply_action(&mut self, slot_idx: usize, action: &str) -> bool {
        self.engine.apply_action(slot_idx, action)
    }

    #[wasm_bindgen]
    pub fn get_alignment_score(&self) -> f32 {
        self.engine.get_total_alignment()
    }

    #[wasm_bindgen]
    pub fn get_slot_score(&self, slot_idx: usize) -> f32 {
        self.engine.get_slot_score(slot_idx)
    }

    #[wasm_bindgen]
    pub fn reset_all(&mut self) {
        self.engine.reset_all();
    }

    #[wasm_bindgen]
    pub fn reset_slot(&mut self, slot_idx: usize) {
        self.engine.reset_slot(slot_idx);
    }

    #[wasm_bindgen]
    pub fn get_state_json(&self) -> String {
        let state = self.engine.get_state();
        serde_json::to_string(&state).unwrap_or_else(|_| "{}".to_string())
    }

    #[wasm_bindgen]
    pub fn get_hint_json(&self, slot_idx: usize) -> String {
        let hint = self.engine.get_next_hint(slot_idx);
        serde_json::to_string(&hint).unwrap_or_else(|_| "null".to_string())
    }
}

#[wasm_bindgen]
pub fn parse_pdb(pdb_str: &str) -> String {
    let subunits = parse_pdb_to_subunits(pdb_str);
    serde_json::to_string(&subunits).unwrap_or_else(|_| "[]".to_string())
}

#[wasm_bindgen]
pub fn sonify(seq: &str, algorithm: &str) -> String {
    let events = sonify_sequence(seq, algorithm);
    serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_string())
}
