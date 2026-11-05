import {type VizPack, validatePack} from '@cycletron/viz-sdk';
import manifest from '../pack.json';
import {auroraDef} from './modes/aurora/index.js';
import {iceCaveDef} from './modes/ice-cave/index.js';

export const winter3d: VizPack = validatePack({
    manifest,
    modes: [iceCaveDef, auroraDef],
    palettes: {
        glacier: {bg: '#040a14', neon: '#6fe3ff', secondary: '#9b7bff', active: '#eef8ff', violet: '#2b4c7e', red: '#ff5d8f',
            more: ['#5cffb0', '#a9c6ff', '#ffc98a']},
    },
});

export default winter3d;
