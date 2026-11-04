import {type VizPack, validatePack} from '@cycletron/viz-sdk';
import manifest from '../pack.json';
import {christmasBandDef} from './christmas-band.js';
import {santaTrackerDef} from './santa-tracker.js';
import {workshopDef} from './workshop.js';
import {snowfallDef} from './snowfall.js';
import {snowglobeDef} from './snowglobe.js';
import {sleighRoadDef} from './sleigh-road.js';
import {christmasHouseDef} from './christmas-house.js';

export const christmas: VizPack = validatePack({
    manifest,
    modes: [snowfallDef, christmasBandDef, workshopDef, santaTrackerDef, snowglobeDef, sleighRoadDef, christmasHouseDef],
    palettes: {
        evergreen: {bg: '#06110c', neon: '#e63946', secondary: '#3ddc84', active: '#ffd166', violet: '#1b4332', red: '#c1121f',
            more: ['#f1faee', '#a8dadc', '#e9c46a']},
        norad: {bg: '#020a08', neon: '#39ff88', secondary: '#ffb000', active: '#e8fff1', violet: '#0e3b2e', red: '#ff3b3b',
            more: ['#1fb36b', '#4dd9ff', '#7a8c85']},
    },
});

export default christmas;
