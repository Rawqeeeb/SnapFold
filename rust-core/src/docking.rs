use glam::{EulerRot, Quat, Vec3};
use serde::{Deserialize, Serialize};
use std::f32::consts::PI;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SubunitTransform {
    pub position: [f32; 3],      // [x, y, z] relative offset from target centroid
    pub rotation: [f32; 4],      // [x, y, z, w] quaternion
    pub euler_deg: [f32; 3],     // [rx, ry, rz] in degrees
    pub is_locked: bool,
    pub score: f32,              // 0.0 to 1.0
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DockingHint {
    pub action: String,
    pub axis: String,
    pub direction: f32,
    pub angle_deg: f32,
    pub description: String,
    pub potential_score: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DockingState {
    pub total_alignment: f32,    // 0.0 to 1.0
    pub is_solved: bool,
    pub transforms: Vec<SubunitTransform>,
}

#[derive(Clone, Debug)]
pub struct SubunitSlot {
    pub initial_offset: Vec3,
    pub initial_euler_deg: [f32; 3],
    pub current_offset: Vec3,
    pub current_euler_deg: [f32; 3],
    pub is_locked: bool,
}

fn normalize_deg(deg: f32) -> f32 {
    let mut d = deg % 360.0;
    if d > 180.0 {
        d -= 360.0;
    } else if d <= -180.0 {
        d += 360.0;
    }
    if d.abs() < 0.01 {
        0.0
    } else {
        d.round()
    }
}

fn shortest_angle_deg(deg: f32) -> f32 {
    normalize_deg(deg).abs()
}

pub struct DockingEngineCore {
    pub slots: Vec<SubunitSlot>,
    pub translation_step: f32,
    pub rotation_step_deg: f32,
}

impl DockingEngineCore {
    pub fn new(subunit_count: usize) -> Self {
        let mut slots = Vec::with_capacity(subunit_count);
        for _ in 0..subunit_count {
            slots.push(SubunitSlot {
                initial_offset: Vec3::ZERO,
                initial_euler_deg: [0.0, 0.0, 0.0],
                current_offset: Vec3::ZERO,
                current_euler_deg: [0.0, 0.0, 0.0],
                is_locked: false,
            });
        }
        Self {
            slots,
            translation_step: 3.0,
            rotation_step_deg: 45.0,
        }
    }

    pub fn set_scramble(&mut self, slot_idx: usize, offset: [f32; 3], euler_deg: [f32; 3]) {
        if slot_idx < self.slots.len() {
            let off = Vec3::new(offset[0].round(), offset[1].round(), offset[2].round());
            let eul = [
                normalize_deg(euler_deg[0]),
                normalize_deg(euler_deg[1]),
                normalize_deg(euler_deg[2]),
            ];
            let already_solved = off.length() < 0.05
                && shortest_angle_deg(eul[0]) < 0.5
                && shortest_angle_deg(eul[1]) < 0.5
                && shortest_angle_deg(eul[2]) < 0.5;

            self.slots[slot_idx].initial_offset = off;
            self.slots[slot_idx].initial_euler_deg = eul;
            self.slots[slot_idx].current_offset = off;
            self.slots[slot_idx].current_euler_deg = eul;
            self.slots[slot_idx].is_locked = already_solved;
        }
    }

    pub fn reset_slot(&mut self, slot_idx: usize) {
        if slot_idx < self.slots.len() {
            let off = self.slots[slot_idx].initial_offset;
            let eul = self.slots[slot_idx].initial_euler_deg;
            let already_solved = off.length() < 0.05
                && shortest_angle_deg(eul[0]) < 0.5
                && shortest_angle_deg(eul[1]) < 0.5
                && shortest_angle_deg(eul[2]) < 0.5;
            self.slots[slot_idx].current_offset = off;
            self.slots[slot_idx].current_euler_deg = eul;
            self.slots[slot_idx].is_locked = already_solved;
        }
    }

    pub fn reset_all(&mut self) {
        for i in 0..self.slots.len() {
            self.reset_slot(i);
        }
    }

    pub fn apply_action(&mut self, slot_idx: usize, action: &str) -> bool {
        if slot_idx >= self.slots.len() {
            return false;
        }

        if action == "Reset" {
            self.reset_slot(slot_idx);
            return true;
        }

        if action == "SnapLock" {
            let score = self.calculate_slot_score(&self.slots[slot_idx]);
            // Only allow Snap if the subunit is at least 85% aligned
            if score < 0.85 {
                return false;
            }
            let slot = &mut self.slots[slot_idx];
            slot.current_offset = Vec3::ZERO;
            slot.current_euler_deg = [0.0, 0.0, 0.0];
            slot.is_locked = true;
            return true;
        }

        let slot = &mut self.slots[slot_idx];
        if slot.is_locked {
            return false;
        }

        let step = self.translation_step;
        let rot_step = self.rotation_step_deg;

        match action {
            "SlideLeft" => slot.current_offset.x = (slot.current_offset.x - step).round(),
            "SlideRight" => slot.current_offset.x = (slot.current_offset.x + step).round(),
            "SlideUp" => slot.current_offset.y = (slot.current_offset.y + step).round(),
            "SlideDown" => slot.current_offset.y = (slot.current_offset.y - step).round(),
            "SlideForward" => slot.current_offset.z = (slot.current_offset.z + step).round(),
            "SlideBack" => slot.current_offset.z = (slot.current_offset.z - step).round(),

            "RotateXPos" => {
                slot.current_euler_deg[0] = normalize_deg(slot.current_euler_deg[0] + rot_step);
            }
            "RotateXNeg" => {
                slot.current_euler_deg[0] = normalize_deg(slot.current_euler_deg[0] - rot_step);
            }
            "RotateYPos" => {
                slot.current_euler_deg[1] = normalize_deg(slot.current_euler_deg[1] + rot_step);
            }
            "RotateYNeg" => {
                slot.current_euler_deg[1] = normalize_deg(slot.current_euler_deg[1] - rot_step);
            }
            "RotateZPos" => {
                slot.current_euler_deg[2] = normalize_deg(slot.current_euler_deg[2] + rot_step);
            }
            "RotateZNeg" => {
                slot.current_euler_deg[2] = normalize_deg(slot.current_euler_deg[2] - rot_step);
            }
            _ => return false,
        }

        // Check if manually aligned to exact 100%
        if self.calculate_slot_score(&self.slots[slot_idx]) >= 0.999 {
            self.slots[slot_idx].current_offset = Vec3::ZERO;
            self.slots[slot_idx].current_euler_deg = [0.0, 0.0, 0.0];
        }

        true
    }

    pub fn calculate_slot_score(&self, slot: &SubunitSlot) -> f32 {
        if slot.is_locked {
            return 1.0;
        }

        let dist = slot.current_offset.length();
        let err_x = shortest_angle_deg(slot.current_euler_deg[0]);
        let err_y = shortest_angle_deg(slot.current_euler_deg[1]);
        let err_z = shortest_angle_deg(slot.current_euler_deg[2]);
        let total_angle_err = err_x + err_y + err_z;

        if dist < 0.05 && total_angle_err < 0.5 {
            return 1.0;
        }

        let pos_score = (-dist / 12.0).exp();
        let rot_score = (-total_angle_err / 150.0).exp();

        let combined = 0.5 * pos_score + 0.5 * rot_score;
        combined.clamp(0.0, 0.995)
    }

    pub fn get_slot_score(&self, slot_idx: usize) -> f32 {
        if let Some(slot) = self.slots.get(slot_idx) {
            self.calculate_slot_score(slot)
        } else {
            0.0
        }
    }

    pub fn get_total_alignment(&self) -> f32 {
        if self.slots.is_empty() {
            return 1.0;
        }
        let sum: f32 = self.slots.iter().map(|s| self.calculate_slot_score(s)).sum();
        sum / (self.slots.len() as f32)
    }

    pub fn get_state(&self) -> DockingState {
        let total_alignment = self.get_total_alignment();
        let is_solved = self
            .slots
            .iter()
            .all(|s| self.calculate_slot_score(s) >= 0.999);

        let transforms = self
            .slots
            .iter()
            .map(|s| {
                let score = self.calculate_slot_score(s);
                let [rx, ry, rz] = s.current_euler_deg;
                let q = Quat::from_euler(
                    EulerRot::XYZ,
                    rx * PI / 180.0,
                    ry * PI / 180.0,
                    rz * PI / 180.0,
                );
                SubunitTransform {
                    position: [s.current_offset.x, s.current_offset.y, s.current_offset.z],
                    rotation: [q.x, q.y, q.z, q.w],
                    euler_deg: [rx, ry, rz],
                    is_locked: s.is_locked || score >= 0.999,
                    score,
                }
            })
            .collect();

        DockingState {
            total_alignment: if is_solved { 1.0 } else { total_alignment },
            is_solved,
            transforms,
        }
    }

    pub fn get_next_hint(&self, slot_idx: usize) -> Option<DockingHint> {
        if slot_idx >= self.slots.len() {
            return None;
        }
        let current_slot = &self.slots[slot_idx];
        let current_score = self.calculate_slot_score(current_slot);
        if current_score >= 0.999 {
            return Some(DockingHint {
                action: "Lock".to_string(),
                axis: "None".to_string(),
                direction: 0.0,
                angle_deg: 0.0,
                description: "Subunit is 100% aligned!".to_string(),
                potential_score: 1.0,
            });
        }

        let actions = [
            ("SlideLeft", "X", -1.0, 0.0, "Slide Left (-X)"),
            ("SlideRight", "X", 1.0, 0.0, "Slide Right (+X)"),
            ("SlideDown", "Y", -1.0, 0.0, "Slide Down (-Y)"),
            ("SlideUp", "Y", 1.0, 0.0, "Slide Up (+Y)"),
            ("SlideBack", "Z", -1.0, 0.0, "Slide Back (-Z)"),
            ("SlideForward", "Z", 1.0, 0.0, "Slide Forward (+Z)"),
            ("RotateXPos", "X", 1.0, 45.0, "Rotate +45° on X axis"),
            ("RotateXNeg", "X", -1.0, -45.0, "Rotate -45° on X axis"),
            ("RotateYPos", "Y", 1.0, 45.0, "Rotate +45° on Y axis"),
            ("RotateYNeg", "Y", -1.0, -45.0, "Rotate -45° on Y axis"),
            ("RotateZPos", "Z", 1.0, 45.0, "Rotate +45° on Z axis"),
            ("RotateZNeg", "Z", -1.0, -45.0, "Rotate -45° on Z axis"),
        ];

        let mut best_action = None;
        let mut best_score = current_score;

        for (action, axis, dir, angle, desc) in actions {
            let mut test_engine = self.clone_for_test();
            test_engine.apply_action(slot_idx, action);
            let score = test_engine.get_slot_score(slot_idx);
            if score > best_score {
                best_score = score;
                best_action = Some(DockingHint {
                    action: action.to_string(),
                    axis: axis.to_string(),
                    direction: dir,
                    angle_deg: angle,
                    description: desc.to_string(),
                    potential_score: score,
                });
            }
        }

        best_action
    }

    fn clone_for_test(&self) -> Self {
        Self {
            slots: self.slots.clone(),
            translation_step: self.translation_step,
            rotation_step_deg: self.rotation_step_deg,
        }
    }
}
