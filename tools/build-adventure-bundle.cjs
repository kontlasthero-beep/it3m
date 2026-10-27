'use strict';
const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../adventure/stage-01.json');
const target = path.resolve(__dirname, '../adventure/stage-01-bundle.js');
const stage = JSON.parse(fs.readFileSync(source, 'utf8'));
fs.writeFileSync(target,
  `/* Generated from stage-01.json for file:// previews. Run node tools/build-adventure-bundle.cjs after editing the stage. */\nwindow.SecondChanceAdventureStage01 = ${JSON.stringify(stage)};\n`,
  'utf8');
console.log(`Updated ${path.relative(path.dirname(source), target)}`);
