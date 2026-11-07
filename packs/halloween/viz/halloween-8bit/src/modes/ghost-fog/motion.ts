import {held, strike, windup} from '@naderlabs/kit/timing';
import type {Role} from '@naderlabs/kit/roles';

export const RELEASE = 0.125;
export const FLIGHT = 0.5;
export interface NoteMotion {
    begin: number;
    end: number;
    note: number;
    role: Role;
    seen: boolean;
}
export interface Pose {
    kick: number;
    ready: number;
    split: number;
    hat: number;
    jaw: number;
    yaw: number;
    gaze: number;
    crown: number;
    chord: number;
    active: number;
}

/** A sampled pose, never integrated: seeking and different frame rates agree. */
export function poseAt(notes: readonly NoteMotion[], cycle: number): Pose {
    const pose: Pose = {kick: 0, ready: 0, split: 0, hat: 0, jaw: 0, yaw: 0, gaze: 0, crown: 0, chord: 0, active: 0};
    let pitchSum = 0;
    let weight = 0;
    for (const h of notes) {
        if (!h.seen) continue;
        const hit = strike(cycle, h.begin, 1 / 24);
        const hold = held(cycle, h.begin, h.end, RELEASE);
        switch (h.role) {
            case 'kick':
                pose.kick = Math.max(pose.kick, hit);
                pose.ready = Math.max(pose.ready, windup(cycle, h.begin));
                break;
            case 'snare':
            case 'crash': pose.split = Math.max(pose.split, strike(cycle, h.begin, 1 / 16)); break;
            case 'hat': pose.hat = Math.max(pose.hat, hit); break;
            case 'bass': pose.jaw = Math.max(pose.jaw, 0.65 * hold + 0.35 * hit); break;
            case 'mid':
            case 'lead': {
                // Register-normalized pitch steers the head; a chord finds its centroid.
                const pitch = Math.max(-1, Math.min(1, (h.note - (h.role === 'mid' ? 60 : 84)) / 12));
                pitchSum += pitch * hold;
                weight += hold;
                pose.chord += hold;
                if (h.role === 'lead') pose.crown = Math.max(pose.crown, hold * 0.65 + hit * 0.35);
                break;
            }
            default: break;
        }
        if (cycle >= h.begin && cycle < h.end) pose.active++;
    }
    pose.gaze = weight ? pitchSum / weight : 0;
    pose.yaw = pose.gaze * 0.42;
    pose.chord = Math.min(1, pose.chord / 4);
    return pose;
}

/** Signed flight: -1 at approach start, 0 on onset, 1 after release. */
export function flightAt(cycle: number, begin: number, end: number): number {
    if (cycle < begin) return Math.max(-1, (cycle - begin) / FLIGHT);
    if (cycle <= end) return 0;
    return Math.min(1, (cycle - end) / FLIGHT);
}
