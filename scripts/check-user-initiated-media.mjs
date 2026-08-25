import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  'apps/angular/src/app/auction.component.ts',
  'apps/vue/src/App.vue',
  'apps/react-native/AuctionApp.js',
  'apps/expo/AuctionApp.js',
  'apps/flutter/lib/auction_app.dart',
  'apps/kotlin-android/app/src/main/java/com/mediasfu/auction/AuctionActivity.kt',
];

for (const path of files) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /validat(?:ed|ion)[\s\S]{0,320}(?:toggleMic|toggleCamera|toggleAudio|toggleVideo|clickAudio|clickVideo)/i,
    `${path} must not start microphone or camera when room validation changes`,
  );
  assert.match(
    source,
    /(?:toggleMic|toggleAudio|clickAudio)/,
    `${path} must retain an explicit microphone control`,
  );
  assert.match(
    source,
    /(?:toggleCamera|toggleVideo|clickVideo)/,
    `${path} must retain an explicit camera control`,
  );
}

console.log(`User-initiated media contract passed for ${files.length} platform apps.`);
