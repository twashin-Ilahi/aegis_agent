import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const audioFiles = [
  path.resolve('audio/uploaded_media_1_1792411375427.m4a'), // Act 1 (41.62s)
  path.resolve('audio/uploaded_media_2_1792411375427.m4a'), // Act 2 (39.89s)
  path.resolve('audio/uploaded_media_3_1792411375427.m4a'), // Act 3 (61.72s)
  path.resolve('audio/uploaded_media_4_1792411375427.m4a'), // Act 4 (74.96s)
  path.resolve('audio/uploaded_media_0_1792411375427.m4a'), // Act 5+6 (72.43s)
];

const listFile = path.resolve('audio/concat_list.txt');
const listContent = audioFiles.map((f) => `file '${f}'`).join('\n');
fs.writeFileSync(listFile, listContent);

const outputFile = path.resolve('audio/master-voiceover.m4a');
if (fs.existsSync(outputFile)) {
  fs.unlinkSync(outputFile);
}

console.log('Concatenating audio files with ffmpeg...');
execFileSync(ffmpegPath, [
  '-f', 'concat',
  '-safe', '0',
  '-i', listFile,
  '-c', 'copy',
  outputFile,
], { stdio: 'inherit' });

console.log('Master voiceover successfully created at:', outputFile);
