/* tslint:disable */
/* eslint-disable */

export class WasmDockingEngine {
    free(): void;
    [Symbol.dispose](): void;
    apply_action(slot_idx: number, action: string): boolean;
    configure_subunit(idx: number, ox: number, oy: number, oz: number, rx_deg: number, ry_deg: number, rz_deg: number): void;
    get_alignment_score(): number;
    get_hint_json(slot_idx: number): string;
    get_slot_score(slot_idx: number): number;
    get_state_json(): string;
    constructor(subunit_count: number);
    reset_all(): void;
    reset_slot(slot_idx: number): void;
}

export function parse_pdb(pdb_str: string): string;

export function sonify(seq: string, algorithm: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmdockingengine_free: (a: number, b: number) => void;
    readonly parse_pdb: (a: number, b: number) => [number, number];
    readonly sonify: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmdockingengine_apply_action: (a: number, b: number, c: number, d: number) => number;
    readonly wasmdockingengine_configure_subunit: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly wasmdockingengine_get_alignment_score: (a: number) => number;
    readonly wasmdockingengine_get_hint_json: (a: number, b: number) => [number, number];
    readonly wasmdockingengine_get_slot_score: (a: number, b: number) => number;
    readonly wasmdockingengine_get_state_json: (a: number) => [number, number];
    readonly wasmdockingengine_new: (a: number) => number;
    readonly wasmdockingengine_reset_all: (a: number) => void;
    readonly wasmdockingengine_reset_slot: (a: number, b: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
