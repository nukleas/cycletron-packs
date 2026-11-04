/**
 * Sphere geometry for the tracker: the grid rings, coarse coastlines, the
 * cities Santa stops at, and the great-circle maths between them.
 *
 * Globe frame: y is north, z points at the viewer at longitude 0, x is east
 * there. A spin about y adds to every longitude; the tilt leans the north
 * pole toward the viewer and a little to the side.
 */

import {TAU} from '@cycletron/viz-sdk';

export const LAT_RINGS = 11;   // every 15 degrees, 75S to 75N
export const MERIDIANS = 12;   // great circles through the poles: 24 meridians
export const RING_STEPS = 48;
export const RING_STRIDE = RING_STEPS + 1;
export const GRID_VERTS = (LAT_RINGS + MERIDIANS) * RING_STRIDE;

const TILT_X = 0.38;   // lean the pole at the viewer
const TILT_Z = 0.22;   // and to the side
const RAD = Math.PI / 180;
/** Coastline segments are split so none spans more than this many degrees. */
const COAST_STEP = 4;

export interface City {
    name: string;
    lat: number;
    lon: number;
}

/** Unit vector of a lat/lon in degrees, written at `out[at..at+3]`. */
export function toVec(lat: number, lon: number, out: Float32Array, at: number): void {
    const p = lat * RAD, l = lon * RAD;
    const c = Math.cos(p);
    out[at] = c * Math.sin(l);
    out[at + 1] = Math.sin(p);
    out[at + 2] = c * Math.cos(l);
}

export function latOf(x: number, y: number, z: number): number {
    return Math.asin(Math.max(-1, Math.min(1, y / Math.hypot(x, y, z)))) / RAD;
}

export function lonOf(x: number, z: number): number {
    return Math.atan2(x, z) / RAD;
}

/** The grid as unit vectors: latitude rings first, then the meridian circles. */
export function gridVerts(): Float32Array {
    const out = new Float32Array(GRID_VERTS * 3);
    let at = 0;
    for (let k = 0; k < LAT_RINGS; k++) {
        const lat = -75 + 15 * k;
        for (let i = 0; i <= RING_STEPS; i++, at += 3) toVec(lat, (i / RING_STEPS) * 360, out, at);
    }
    for (let k = 0; k < MERIDIANS; k++) {
        const lon = (k / MERIDIANS) * Math.PI;
        for (let i = 0; i <= RING_STEPS; i++, at += 3) {
            const t = (i / RING_STEPS) * TAU;
            const c = Math.cos(t);
            out[at] = c * Math.sin(lon);
            out[at + 1] = Math.sin(t);
            out[at + 2] = c * Math.cos(lon);
        }
    }
    return out;
}

/** Row-major 3x3 view matrix for a spin angle: Rz(tilt) · Rx(tilt) · Ry(spin). */
export function viewMatrix(spin: number, m: Float32Array): void {
    const ca = Math.cos(spin), sa = Math.sin(spin);
    const cx = Math.cos(TILT_X), sx = Math.sin(TILT_X);
    const cz = Math.cos(TILT_Z), sz = Math.sin(TILT_Z);
    // Rx · Ry
    const a0 = ca, a1 = 0, a2 = sa;
    const a3 = sx * sa, a4 = cx, a5 = -sx * ca;
    const a6 = -cx * sa, a7 = sx, a8 = cx * ca;
    // Rz · (Rx · Ry)
    m[0] = cz * a0 - sz * a3; m[1] = cz * a1 - sz * a4; m[2] = cz * a2 - sz * a5;
    m[3] = sz * a0 + cz * a3; m[4] = sz * a1 + cz * a4; m[5] = sz * a2 + cz * a5;
    m[6] = a6; m[7] = a7; m[8] = a8;
}

/** Project `n` unit vectors to screen (x, y) and depth (z toward the viewer). */
export function project(
    verts: Float32Array, n: number, m: Float32Array, cx: number, cy: number, r: number, out: Float32Array,
): void {
    for (let i = 0, at = 0; i < n; i++, at += 3) {
        const x = verts[at], y = verts[at + 1], z = verts[at + 2];
        out[at] = cx + r * (m[0] * x + m[1] * y + m[2] * z);
        out[at + 1] = cy - r * (m[3] * x + m[4] * y + m[5] * z);
        out[at + 2] = m[6] * x + m[7] * y + m[8] * z;
    }
}

/** Point on the great circle from `a` to `b` at fraction `t`, into `out[at..]`. */
export function slerp(a: Float32Array, ai: number, b: Float32Array, bi: number, t: number, out: Float32Array, at: number): void {
    const ax = a[ai], ay = a[ai + 1], az = a[ai + 2];
    const bx = b[bi], by = b[bi + 1], bz = b[bi + 2];
    const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz));
    const w = Math.acos(dot);
    let ka: number, kb: number;
    if (w < 1e-4) {
        ka = 1 - t;
        kb = t;
    } else {
        const s = Math.sin(w);
        ka = Math.sin((1 - t) * w) / s;
        kb = Math.sin(t * w) / s;
    }
    const x = ka * ax + kb * bx, y = ka * ay + kb * by, z = ka * az + kb * bz;
    const len = Math.hypot(x, y, z) || 1;
    out[at] = x / len;
    out[at + 1] = y / len;
    out[at + 2] = z / len;
}

/** Angle in radians between two unit vectors. */
export function arcAngle(a: Float32Array, ai: number, b: Float32Array, bi: number): number {
    const dot = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
    return Math.acos(Math.max(-1, Math.min(1, dot)));
}

export const CITIES: readonly City[] = [
    {name: 'NORTH POLE', lat: 90, lon: 0},
    {name: 'ROVANIEMI', lat: 66.5, lon: 25.7},
    {name: 'REYKJAVIK', lat: 64.1, lon: -21.9},
    {name: 'NUUK', lat: 64.2, lon: -51.7},
    {name: 'ANCHORAGE', lat: 61.2, lon: -149.9},
    {name: 'OSLO', lat: 59.9, lon: 10.8},
    {name: 'STOCKHOLM', lat: 59.3, lon: 18.1},
    {name: 'HELSINKI', lat: 60.2, lon: 24.9},
    {name: 'MOSCOW', lat: 55.8, lon: 37.6},
    {name: 'NOVOSIBIRSK', lat: 55.0, lon: 82.9},
    {name: 'BERLIN', lat: 52.5, lon: 13.4},
    {name: 'LONDON', lat: 51.5, lon: -0.1},
    {name: 'VANCOUVER', lat: 49.3, lon: -123.1},
    {name: 'PARIS', lat: 48.9, lon: 2.4},
    {name: 'ULAANBAATAR', lat: 47.9, lon: 106.9},
    {name: 'TORONTO', lat: 43.7, lon: -79.4},
    {name: 'CHICAGO', lat: 41.9, lon: -87.6},
    {name: 'ROME', lat: 41.9, lon: 12.5},
    {name: 'ISTANBUL', lat: 41.0, lon: 29.0},
    {name: 'NEW YORK', lat: 40.7, lon: -74.0},
    {name: 'MADRID', lat: 40.4, lon: -3.7},
    {name: 'BEIJING', lat: 39.9, lon: 116.4},
    {name: 'DENVER', lat: 39.7, lon: -105.0},
    {name: 'SEOUL', lat: 37.6, lon: 127.0},
    {name: 'TOKYO', lat: 35.7, lon: 139.7},
    {name: 'TEHRAN', lat: 35.7, lon: 51.4},
    {name: 'LOS ANGELES', lat: 34.1, lon: -118.2},
    {name: 'CASABLANCA', lat: 33.6, lon: -7.6},
    {name: 'SHANGHAI', lat: 31.2, lon: 121.5},
    {name: 'CAIRO', lat: 30.0, lon: 31.2},
    {name: 'DELHI', lat: 28.6, lon: 77.2},
    {name: 'MIAMI', lat: 25.8, lon: -80.2},
    {name: 'DUBAI', lat: 25.2, lon: 55.3},
    {name: 'KARACHI', lat: 24.9, lon: 67.0},
    {name: 'HAVANA', lat: 23.1, lon: -82.4},
    {name: 'HONG KONG', lat: 22.3, lon: 114.2},
    {name: 'HONOLULU', lat: 21.3, lon: -157.9},
    {name: 'MEXICO CITY', lat: 19.4, lon: -99.1},
    {name: 'MUMBAI', lat: 19.1, lon: 72.9},
    {name: 'MANILA', lat: 14.6, lon: 121.0},
    {name: 'BANGKOK', lat: 13.8, lon: 100.5},
    {name: 'ADDIS ABABA', lat: 9.0, lon: 38.7},
    {name: 'LAGOS', lat: 6.5, lon: 3.4},
    {name: 'BOGOTA', lat: 4.7, lon: -74.1},
    {name: 'SINGAPORE', lat: 1.3, lon: 103.8},
    {name: 'NAIROBI', lat: -1.3, lon: 36.8},
    {name: 'JAKARTA', lat: -6.2, lon: 106.8},
    {name: 'LIMA', lat: -12.0, lon: -77.0},
    {name: 'SAO PAULO', lat: -23.5, lon: -46.6},
    {name: 'RIO', lat: -22.9, lon: -43.2},
    {name: 'JOHANNESBURG', lat: -26.2, lon: 28.0},
    {name: 'PERTH', lat: -31.9, lon: 115.9},
    {name: 'SANTIAGO', lat: -33.4, lon: -70.7},
    {name: 'CAPE TOWN', lat: -33.9, lon: 18.4},
    {name: 'SYDNEY', lat: -33.9, lon: 151.2},
    {name: 'BUENOS AIRES', lat: -34.6, lon: -58.4},
    {name: 'AUCKLAND', lat: -36.8, lon: 174.8},
    {name: 'MELBOURNE', lat: -37.8, lon: 145.0},
];

/** Unit vectors of the cities, in CITIES order. */
export const CITY_VERTS = (() => {
    const out = new Float32Array(CITIES.length * 3);
    CITIES.forEach((c, i) => toVec(c.lat, c.lon, out, i * 3));
    return out;
})();

/** Index of the city closest to a lat/lon. */
export function nearestCity(lat: number, lon: number): number {
    const v = new Float32Array(3);
    toVec(lat, lon, v, 0);
    let best = 0, bestDot = -2;
    for (let i = 0; i < CITIES.length; i++) {
        const d = v[0] * CITY_VERTS[i * 3] + v[1] * CITY_VERTS[i * 3 + 1] + v[2] * CITY_VERTS[i * 3 + 2];
        if (d > bestDot) {
            bestDot = d;
            best = i;
        }
    }
    return best;
}

/** Degrees as a tracker prints them: 51.5N 000.1W. */
export function fmtLat(lat: number): string {
    return Math.abs(lat).toFixed(1).padStart(4, '0') + (lat < 0 ? 'S' : 'N');
}

export function fmtLon(lon: number): string {
    let l = ((lon + 180) % 360 + 360) % 360 - 180;
    if (l === -180) l = 180;
    return Math.abs(l).toFixed(1).padStart(5, '0') + (l < 0 ? 'W' : 'E');
}

/** Coarse coastlines as lat/lon pairs. Longitudes run past 180 where a line crosses the dateline. */
const COASTS: readonly (readonly number[])[] = [
    // North America
    [60, -165, 66, -164, 71, -157, 70, -141, 69, -134, 68, -120, 68, -108, 66, -95, 64, -95, 59, -94, 56, -88,
        52, -80, 55, -78, 58, -78, 61, -78, 62, -72, 60, -65, 55, -58, 52, -56, 47, -53, 45, -61, 44, -66, 42, -70,
        40, -74, 37, -76, 35, -76, 32, -81, 30, -81, 25, -80, 27, -83, 30, -84, 29, -90, 28, -97, 22, -98, 19, -96,
        18, -92, 21, -90, 21, -87, 18, -88, 15, -84, 12, -83, 9, -80, 8, -82, 10, -86, 13, -91, 16, -98, 19, -105,
        23, -110, 28, -114, 32, -117, 34, -120, 37, -122, 40, -124, 46, -124, 48, -125, 51, -128, 54, -131, 58, -137,
        60, -147, 57, -155, 55, -163, 59, -162, 62, -166, 65, -168, 60, -165],
    // Greenland
    [83, -35, 81, -20, 76, -18, 70, -22, 66, -35, 60, -43, 64, -52, 69, -53, 72, -56, 76, -70, 79, -70, 82, -50, 83, -35],
    // Baffin Island
    [73, -80, 70, -68, 66, -62, 64, -66, 66, -72, 70, -80, 73, -80],
    // South America
    [9, -77, 11, -74, 12, -72, 11, -64, 8, -60, 6, -55, 4, -52, 0, -50, -2, -44, -5, -35, -8, -35, -13, -38, -20, -40,
        -23, -43, -25, -48, -30, -50, -34, -54, -38, -57, -41, -63, -47, -66, -52, -69, -55, -68, -53, -73, -47, -75,
        -40, -73, -33, -72, -23, -70, -18, -71, -12, -77, -5, -81, -1, -80, 2, -78, 7, -78, 9, -77],
    // Africa
    [35, -6, 37, 10, 33, 11, 31, 20, 31, 25, 31, 32, 31, 34, 28, 34, 22, 37, 15, 40, 12, 43, 11, 51, 2, 45, -2, 41,
        -4, 39, -7, 39, -15, 40, -20, 35, -26, 33, -30, 31, -34, 26, -34, 18, -30, 17, -23, 14, -17, 12, -9, 13, -5, 12,
        -1, 9, 4, 8, 6, 3, 5, -2, 5, -8, 7, -13, 12, -17, 15, -17, 21, -17, 28, -13, 33, -9, 35, -6],
    // Madagascar
    [-12, 49, -16, 50, -25, 47, -25, 44, -20, 44, -16, 46, -12, 49],
    // Eurasia
    [36, -6, 37, -9, 39, -9, 43, -9, 43, -2, 46, -1, 48, -5, 49, -2, 51, 2, 52, 4, 53, 7, 55, 8, 57, 10, 56, 12, 58, 11,
        59, 10, 60, 5, 62, 5, 64, 10, 68, 15, 70, 20, 71, 26, 70, 30, 69, 33, 66, 41, 65, 40, 67, 44, 68, 54, 69, 60,
        72, 70, 71, 73, 73, 80, 76, 98, 77, 104, 75, 113, 72, 128, 71, 138, 70, 150, 69, 160, 65, 172, 67, 180, 66, 190,
        64, 187, 62, 180, 60, 170, 56, 163, 51, 157, 58, 157, 60, 151, 59, 142, 54, 137, 52, 141, 46, 138, 43, 132,
        40, 129, 35, 129, 34, 126, 37, 126, 39, 124, 41, 122, 39, 118, 37, 120, 35, 119, 31, 121, 28, 121, 24, 118,
        22, 114, 21, 110, 22, 108, 20, 106, 16, 108, 10, 107, 9, 105, 13, 100, 8, 100, 1, 104, 6, 100, 13, 98, 16, 94,
        22, 91, 20, 87, 16, 82, 13, 80, 8, 77, 13, 75, 19, 73, 23, 69, 25, 66, 25, 61, 26, 57, 27, 53, 30, 49, 29, 48,
        26, 51, 24, 52, 26, 56, 23, 59, 18, 57, 17, 55, 14, 49, 13, 45, 16, 42, 21, 39, 26, 36, 28, 34, 30, 32, 31, 34,
        34, 36, 36, 36, 37, 31, 37, 28, 39, 26, 40, 26, 41, 29, 41, 27, 40, 23, 37, 23, 38, 21, 41, 19, 43, 17, 45, 14,
        45, 12, 42, 15, 40, 18, 38, 16, 40, 15, 42, 12, 44, 9, 43, 5, 43, 3, 41, 2, 38, 0, 37, -2, 36, -6],
    // Black Sea, Caspian Sea
    [41, 29, 42, 28, 44, 29, 46, 31, 45, 34, 45, 37, 44, 40, 41, 41, 41, 37, 42, 35, 41, 31, 41, 29],
    [47, 48, 45, 47, 42, 48, 39, 49, 37, 50, 37, 53, 40, 53, 42, 52, 44, 51, 46, 50, 47, 48],
    // Britain, Ireland, Iceland
    [59, -3, 58, -5, 55, -6, 53, -4, 51, -5, 50, -4, 51, 1, 53, 0, 55, -1, 57, -2, 59, -3],
    [55, -7, 52, -10, 52, -6, 55, -6, 55, -7],
    [66, -23, 64, -22, 63, -18, 65, -14, 66, -16, 66, -23],
    // Svalbard, Novaya Zemlya
    [80, 15, 78, 22, 77, 15, 80, 15],
    [77, 68, 72, 56, 71, 52, 74, 58, 77, 68],
    // Japan, Philippines
    [45, 142, 43, 145, 41, 141, 38, 141, 35, 140, 34, 136, 33, 131, 31, 131, 34, 131, 36, 136, 38, 139, 41, 140,
        43, 141, 45, 142],
    [18, 121, 14, 124, 7, 126, 6, 122, 13, 121, 18, 121],
    // Sumatra, Borneo, Java, New Guinea
    [6, 95, 2, 99, -3, 104, -6, 106, -4, 102, 0, 99, 6, 95],
    [7, 117, 5, 119, 1, 119, -3, 116, -4, 110, 1, 109, 5, 115, 7, 117],
    [-6, 106, -7, 112, -8, 114, -8, 106, -6, 106],
    [-1, 131, -3, 141, -8, 144, -10, 148, -6, 147, -4, 145, -2, 141, -3, 136, -1, 131],
    // Australia, New Zealand
    [-12, 131, -11, 136, -16, 138, -13, 142, -19, 146, -24, 152, -28, 153, -34, 151, -38, 146, -38, 141, -35, 137,
        -32, 134, -34, 123, -35, 117, -32, 115, -26, 113, -22, 114, -18, 122, -15, 126, -12, 131],
    [-35, 173, -37, 176, -41, 175, -46, 167, -44, 170, -41, 172, -39, 174, -35, 173],
    // Antarctica, as a wobbling coast
    [-70, -180, -72, -150, -75, -120, -73, -90, -70, -60, -72, -30, -70, 0, -69, 30, -67, 60, -66, 90, -68, 120, -66, 150,
        -70, 180],
];

export interface Coast {
    /** Unit vectors of every densified point, polyline after polyline. */
    verts: Float32Array;
    start: Int32Array;
    len: Int32Array;
    count: number;
}

/** The coastlines densified to COAST_STEP degrees, as unit vectors. */
export function coastVerts(): Coast {
    const pts: number[] = [];
    const start: number[] = [];
    const len: number[] = [];
    for (const line of COASTS) {
        const first = pts.length / 2;
        for (let i = 0; i + 3 < line.length; i += 2) {
            const la0 = line[i], lo0 = line[i + 1], la1 = line[i + 2], lo1 = line[i + 3];
            const steps = Math.max(1, Math.ceil(Math.max(Math.abs(la1 - la0), Math.abs(lo1 - lo0)) / COAST_STEP));
            for (let k = 0; k < steps; k++) {
                const t = k / steps;
                pts.push(la0 + (la1 - la0) * t, lo0 + (lo1 - lo0) * t);
            }
        }
        pts.push(line[line.length - 2], line[line.length - 1]);
        start.push(first);
        len.push(pts.length / 2 - first);
    }
    const n = pts.length / 2;
    const verts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) toVec(pts[i * 2], pts[i * 2 + 1], verts, i * 3);
    return {verts, start: Int32Array.from(start), len: Int32Array.from(len), count: n};
}
