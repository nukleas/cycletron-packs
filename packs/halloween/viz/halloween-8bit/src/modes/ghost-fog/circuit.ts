/** Fixed PCB routes: one per register / pitch class, shared by copper and haps. */
export type Point = readonly [number, number];
export interface Trace { points: readonly Point[]; lengths: readonly number[]; length: number }

export function makeTraces(): Trace[] {
    return Array.from({length: 36}, (_, address) => {
        const bank = 2 - Math.floor(address / 12);
        const pitch = address % 12;
        const side = pitch < 6 ? -1 : 1;
        const lane = pitch % 6;
        const mirror = (x: number) => side < 0 ? x : 640 - x;
        const y = 61 + bank * 86 + lane * 6;
        const endY = 75 + bank * 78 + lane * 5;
        const points: Point[] = [[mirror(0), y + 16], [mirror(38 + lane * 4), y + 16],
            [mirror(54 + lane * 4), y], [mirror(126), y],
            [mirror(144 + lane * 5), y + 18 + lane * 2],
            [mirror(172 + lane * 5), y + 18 + lane * 2], [mirror(198 + lane * 3), endY]];
        const lengths = points.map((point, i) => i === 0 ? 0 : Math.hypot(point[0] - points[i - 1][0], point[1] - points[i - 1][1]));
        return {points, lengths, length: lengths.reduce((sum, length) => sum + length, 0)};
    });
}

/** Constant-distance travel along the copper, then across the gap to the live face. */
export function tracePoint(trace: Trace, target: Point, progress: number): Point {
    if (progress <= 0) return trace.points[0];
    if (progress >= 1) return target;
    const last = trace.points[trace.points.length - 1];
    const gap = Math.hypot(target[0] - last[0], target[1] - last[1]);
    let distance = progress * (trace.length + gap);
    for (let i = 1; i < trace.points.length; i++) {
        const length = trace.lengths[i];
        if (distance <= length) {
            const t = length ? distance / length : 0;
            const a = trace.points[i - 1];
            const b = trace.points[i];
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        }
        distance -= length;
    }
    const t = gap ? Math.min(1, distance / gap) : 1;
    return [last[0] + (target[0] - last[0]) * t, last[1] + (target[1] - last[1]) * t];
}
