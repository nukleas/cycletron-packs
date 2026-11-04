import {type VizPack, validatePack} from '@cycletron/viz-sdk';
import manifest from '../pack.json';
import {ghostFogDef} from './modes/ghost-fog/index.js';
import {graveyardDef} from './modes/graveyard/index.js';
import {hauntedHouseDef} from './modes/haunted-house/index.js';
import {monsterBandDef} from './modes/monster-band/index.js';

export const halloween8bit: VizPack = validatePack({
    manifest,
    modes: [graveyardDef, hauntedHouseDef, monsterBandDef, ghostFogDef],
    palettes: {
        pumpkin: {bg: '#0b0514', neon: '#ff7a1a', secondary: '#8a3cff', active: '#fff3b0', violet: '#5a2a9a', red: '#ff2e4d',
            more: ['#7cff3f', '#e6f0ff', '#e8dcc0']},
    },
});

export default halloween8bit;
