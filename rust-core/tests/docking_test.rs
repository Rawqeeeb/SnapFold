use rust_core::docking::DockingEngineCore;
use rust_core::pdb_parser::parse_pdb_to_subunits;
use rust_core::sonification::sonify_sequence;

#[test]
fn test_docking_alignment_and_hints() {
    let mut engine = DockingEngineCore::new(2);
    // Subunit 0 is already aligned
    engine.set_scramble(0, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]);
    // Subunit 1 is offset by +6.0 along X and rotated +45 on X and -45 on Y
    engine.set_scramble(1, [6.0, 0.0, 0.0], [45.0, -45.0, 0.0]);

    let initial_score = engine.get_total_alignment();
    assert!(initial_score < 1.0);

    // Cannot snap when far away (< 85% score)
    engine.set_scramble(1, [15.0, 12.0, -9.0], [180.0, 90.0, 45.0]);
    assert!(!engine.apply_action(1, "SnapLock"));

    // Reset to [6.0, 0.0, 0.0], [45.0, -45.0, 0.0] and solve step-by-step using hints
    engine.set_scramble(1, [6.0, 0.0, 0.0], [45.0, -45.0, 0.0]);
    for _ in 0..4 {
        let hint = engine.get_next_hint(1).expect("Should produce hint");
        if hint.action == "Lock" {
            break;
        }
        assert!(engine.apply_action(1, &hint.action));
    }

    let final_score = engine.get_total_alignment();
    assert_eq!(final_score, 1.0);
    assert!(engine.get_state().is_solved);
}

#[test]
fn test_sonification_algorithms() {
    let seq = "GIVEQCCTSICSLYQLENYCN";
    let algos = ["Fantaisie-Impromptu", "Algo-I", "Algo-II", "Algo-III", "Algo-IV", "Algo-V"];
    for algo in algos {
        let events = sonify_sequence(seq, algo);
        assert_eq!(events.len(), seq.len(), "Events count mismatch for {}", algo);
    }
}

#[test]
fn test_pdb_parser() {
    let mock_pdb = r#"
ATOM      1  CA  GLY A   1       0.000   0.000   0.000  1.00 20.00           C
ATOM      2  CA  ILE A   2       3.800   0.000   0.000  1.00 20.00           C
ATOM      3  CA  VAL B   1      10.000  10.000  10.000  1.00 20.00           C
ATOM      4  CA  GLU B   2      13.800  10.000  10.000  1.00 20.00           C
"#;
    let subunits = parse_pdb_to_subunits(mock_pdb);
    assert_eq!(subunits.len(), 2);
    assert_eq!(subunits[0].chain_id, "A");
    assert_eq!(subunits[1].chain_id, "B");
}
