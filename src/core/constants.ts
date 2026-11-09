/** Fixed design constants from SPEC.md section 5.3. All millimeters. */
export const CLEARANCE = {
  /** Gap between part and pocket wall on the sides, ends, and top. Zero at the bottom bearing. */
  g_c: 3,
  /** Solid wood between pockets and at both ends of a cradle board; also part-to-side-skin distance. */
  web: 50,
  /** Floor panel top to the lowest point of the part. */
  c_floor: 25,
  /** Highest point of the part to the lid underside. */
  c_top: 25,
  /** Maximum spacing between cradle stations along X. */
  maxStationSpacing: 600,
  /** Minimum spacing between cradle stations along X. */
  minStationSpacing: 100,
  /** Gap above which the builder adds a wood shim (2 × g_c). */
  shimThreshold: 6,
} as const;

/** Cradle-span width above which the structure moves up one tier (SPEC R13). */
export const PROMOTE_WIDTH = 1200;
/** Net load above which the app refuses to design (SPEC R14, ASTM D6039 limit 1814 kg). */
export const MAX_NET_KG = 1800;
