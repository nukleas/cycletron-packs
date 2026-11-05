import {type VizPack, validatePack} from '@cycletron/viz-sdk';
import manifest from '../pack.json';
import {ballDropDef} from './modes/ball-drop/index.js';
import {fireworksDef} from './modes/fireworks/index.js';

export const newYear3d: VizPack = validatePack({
    manifest,
    modes: [fireworksDef, ballDropDef],
    palettes: {
        midnight: {bg: '#04050f', neon: '#ffc94d', secondary: '#4fd6ff', active: '#fff1c9', violet: '#2b2466', red: '#ff3d7f',
            more: ['#ff4fd8', '#ff8a3d', '#7dffa8']},
    },
});

export default newYear3d;
