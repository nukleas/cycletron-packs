import {type VizPack, validatePack} from '@cycletron/viz-sdk';
import manifest from '../pack.json';
import {autumnForestDef} from './modes/autumn-forest/index.js';
import {cornfieldDef} from './modes/cornfield/index.js';
import {harvestMoonDef} from './modes/harvest-moon/index.js';
import {paradeDef} from './modes/parade/index.js';

export const harvest3d: VizPack = validatePack({
    manifest,
    modes: [autumnForestDef, paradeDef, cornfieldDef, harvestMoonDef],
    palettes: {
        harvest: {bg: '#170d12', neon: '#ff7f24', secondary: '#c8322a', active: '#fff0c2', violet: '#4a2c5e', red: '#8c2f1b',
            more: ['#e8b33c', '#8fa33a', '#6b4226']},
    },
});

export default harvest3d;
