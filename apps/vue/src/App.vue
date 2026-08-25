<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { AudioGrid, ModernMediasfuGeneric, useMediasfuHeadless } from 'mediasfu-vue';

type Role = 'host' | 'bidder' | 'viewer';
const room = useMediasfuHeadless();
const grant = new URLSearchParams(location.search).get('invite') || '';
const name = ref(grant ? 'Bidder1' : 'Auctioneer');
const launched = ref(false);
const role = ref<Role>(grant ? 'bidder' : 'host');
const auction = ref<any>(null);
const token = ref('');
const roomData = ref<any>(null);
const meetingId = ref('');
const notice = ref('');
const busy = ref(false);
const roleSet = ref(false);
const invites = ref<Array<{ role: 'bidder' | 'viewer'; url: string }>>([]);
const chatDraft = ref('');
let roomRequest: Promise<any> | null = null;
let poll: number | undefined;

const preJoin = computed(() => role.value === 'host'
  ? { action: 'create', userName: name.value, duration: 120, capacity: 8, eventType: 'conference' }
  : { action: 'join', userName: name.value, meetingID: meetingId.value });
const lot = computed(() => auction.value?.lots?.find((item: any) => item.state === 'open') || auction.value?.lots?.at(-1));
const hasLiveVideo = (stream: MediaStream | null | undefined) => {
  try { return Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live')); }
  catch { return false; }
};
const liveRemoteVideos = computed(() => room.remoteVideos.value.filter((item: any) => hasLiveVideo(item.stream)));
const primary = computed(() => {
  const screen = room.screenShare.value.stream;
  if (screen && hasLiveVideo(screen)) return screen;
  if (role.value === 'host' && hasLiveVideo(room.localVideo.value)) return room.localVideo.value;
  return liveRemoteVideos.value[0]?.stream || null;
});
const messages = computed(() => {
  const parameters = room.parameters.value as any;
  return (Array.isArray(parameters?.messages) ? parameters.messages : [])
    .filter((item: any) => !item.receivers?.length).slice(-8)
    .map((item: any) => ({ ...item, mine: item.sender === parameters?.member }));
});
const canBid = computed(() => role.value === 'bidder' && auction.value?.status === 'open');
const nextBid = computed(() => Math.max(Number(lot.value?.reserveCents || 0), Number(lot.value?.highestBidCents || 0) + 2500));

async function api(path: string, options: any = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) } });
  const value = await response.json();
  if (!response.ok || value.success === false) throw new Error(value.error || 'Request failed');
  return value;
}
function startPolling() {
  if (poll) clearInterval(poll);
  poll = window.setInterval(async () => {
    if (!auction.value) return;
    try { auction.value = (await api(`/api/auctions/${auction.value.id}`, { token: token.value })).auction; }
    catch (error: any) { notice.value = error.message; }
  }, 1500);
}
async function enter() {
  busy.value = true; notice.value = '';
  try {
    if (grant) {
      const value = await api('/api/invites/redeem', { method: 'POST', body: JSON.stringify({ grant, displayName: name.value }) });
      role.value = value.role; auction.value = value.auction; token.value = value.participantToken;
      roomData.value = value.data; meetingId.value = value.meetingId;
    }
    launched.value = true; startPolling();
  } catch (error: any) { notice.value = error.message; }
  finally { busy.value = false; }
}
async function createRoom() {
  try {
    roomRequest ??= api('/api/auctions', { method: 'POST', body: JSON.stringify({ hostName: name.value }) });
    const value = await roomRequest; auction.value = value.auction; token.value = value.hostToken; roomData.value = value.data;
    startPolling(); return { success: true, data: value.data };
  } catch (error: any) { notice.value = error.message; return { success: false, data: { error: error.message } }; }
}
async function joinRoom() { return { success: true, data: roomData.value }; }
function published(parameters: any) {
  room.updateSourceParameters(parameters || {});
  if (!roleSet.value && parameters?.updateIslevel) { parameters.updateIslevel(role.value === 'host' ? '2' : role.value === 'bidder' ? '1' : '0'); roleSet.value = true; }
}
async function act(work: () => Promise<any>) { busy.value = true; notice.value = ''; try { await work(); } catch (error: any) { notice.value = error.message; } finally { busy.value = false; } }
async function createInvite(inviteRole: 'bidder' | 'viewer') { await act(async () => { const value = await api(`/api/auctions/${auction.value.id}/invites`, { method: 'POST', token: token.value, body: JSON.stringify({ role: inviteRole }) }); invites.value.push({ role: inviteRole, url: `${location.origin}${location.pathname}?invite=${encodeURIComponent(value.grant)}` }); }); }
async function bid() { await act(async () => { const value = await api(`/api/auctions/${auction.value.id}/bids`, { method: 'POST', token: token.value, body: JSON.stringify({ amountCents: nextBid.value, idempotencyKey: `bid_${crypto.randomUUID().replaceAll('-', '')}` }) }); auction.value = value.state; }); }
async function settle() { await act(async () => { auction.value = (await api(`/api/auctions/${auction.value.id}/settle`, { method: 'POST', token: token.value, body: '{}' })).auction; }); }
async function sendChat() { const message = chatDraft.value.trim(); if (!message || role.value === 'viewer') return; await act(async () => { const result = await room.controls.sendChat(message, { group: true }); if (!result.ok) throw new Error(result.error || 'Message could not be sent.'); chatDraft.value = ''; }); }
async function moderate(kind: 'mute' | 'remove', participant: any) { await act(async () => { const result = kind === 'mute' ? await room.moderation.muteParticipant(participant.name) : await room.moderation.removeParticipant(participant.name); if (!result.ok) throw new Error(result.error || 'Moderation failed.'); }); }
function remoteFor(participant: any) { return liveRemoteVideos.value.find((item: any) => item.producerId === participant.videoProducerId); }
function copyInvite(url: string) { void window.navigator.clipboard.writeText(url); }
async function endAuction() { await act(async () => { const value = await api(`/api/auctions/${auction.value.id}/end`, { method: 'POST', token: token.value, body: '{}' }); if (value.data?.outcome !== 'ended' || value.data?.residue !== 'clear') throw new Error('Room teardown was not confirmed.'); await room.controls.leave(false, true).catch(() => undefined); auction.value = value.auction; }); }
onUnmounted(() => { if (poll) clearInterval(poll); });
</script>

<template>
  <main v-if="!launched" class="entry"><section><b>MEDIASFU SOLUTION STARTER</b><h1>{{ grant ? 'Enter the salesroom' : 'Run a live auction' }}</h1><p>{{ grant ? 'This single-use invitation decides whether you can bid or watch.' : 'Premium Vue media, authoritative bids, and secure room creation.' }}</p><input v-model="name" maxlength="10"><button :disabled="busy" @click="enter">{{ busy ? 'Opening…' : grant ? 'Enter auction →' : 'Open salesroom →' }}</button><p v-if="notice" class="notice">{{ notice }}</p></section></main>
  <main v-else class="shell">
    <div class="engine"><ModernMediasfuGeneric :connectMediaSFU="true" :returnUI="false" :noUIPreJoinOptions="preJoin" :createMediaSFURoom="createRoom" :joinMediaSFURoom="joinRoom" :sourceParameters="room.sourceParameters" :updateSourceParameters="published" :onMediaChanged="room.onMediaChanged"/></div>
    <header><strong>◆ NORTHSTAR AUCTION HOUSE</strong><span :class="{live:room.ready.value}">● {{ room.ready.value ? 'LIVE' : 'SECURING' }} · {{ role.toUpperCase() }}</span><button v-if="role==='host'" :disabled="busy || auction?.status==='ended'" @click="endAuction">End auction</button></header>
    <section class="grid"><article class="stage"><video v-if="primary" :srcObject.prop="primary" autoplay playsinline muted :class="{screen:room.screenShare.value.stream}"/><div v-else class="identity"><i>{{ (role==='host'?name:auction?.hostName||'A')[0] }}</i><strong>{{ role==='host'?name:auction?.hostName||'Auctioneer' }}</strong><small>Camera and mic off</small></div><footer>Auctioneer · {{ primary ? (room.screenShare.value.stream?'Screen live':'Camera live') : 'Camera off' }}</footer></article><article class="lot"><div class="art">{{ lot?.art||'◆' }}</div><b>NOW BIDDING</b><h2>{{ lot?.title||'Preparing lot' }}</h2><strong>${{ ((lot?.highestBidCents||lot?.reserveCents||0)/100).toLocaleString() }}</strong><small>{{ lot?.bidCount||0 }} bids</small><button v-if="role==='host'" :disabled="busy" @click="settle">Close lot and advance</button><button v-if="canBid" :disabled="busy" @click="bid">Bid ${{ (nextBid/100).toLocaleString() }}</button><p v-if="role==='viewer'" class="viewer">View-only invitation · bidding and publishing are disabled.</p></article></section>
    <nav v-if="role!=='viewer'"><button :disabled="!room.ready.value" @click="room.controls.toggleMic()">{{room.micOn.value?'Mute':'Unmute'}}</button><button :disabled="!room.ready.value" @click="room.controls.toggleCamera()">{{room.cameraOn.value?'Camera off':'Camera on'}}</button><button :disabled="!room.ready.value" @click="room.controls.toggleScreenShare()">Share</button></nav>
    <section class="lower"><section class="floor"><b>BIDDING FLOOR</b><h2>Every participant keeps a card</h2><div v-for="person in room.participants.value.filter((p:any)=>!p.isSelf&&!p.isHost)" :key="person.name" class="seat"><video v-if="remoteFor(person)?.stream && person.hasVideo" :srcObject.prop="remoteFor(person)?.stream" autoplay playsinline/><i v-else>{{person.name[0]}}</i><span><strong>{{person.name}}</strong><small>{{person.hasVideo?'Camera live':person.hasAudio?'Mic live · camera off':'Camera and mic off'}}</small></span><span v-if="role==='host' && room.moderation.permissions.value.canModerate" class="moderate"><button @click="moderate('mute',person)">Mute</button><button @click="moderate('remove',person)">Remove</button></span></div><p v-if="!room.participants.value.some((p:any)=>!p.isSelf&&!p.isHost)" class="viewer">No bidders on camera yet. Every connected person retains an identity card.</p></section>
    <section class="chat"><b>SALESROOM CHAT</b><h2>{{role==='viewer'?'Read-only room feed':'Room conversation'}}</h2><ol><li v-for="(message,index) in messages" :key="`${message.timestamp}-${index}`"><strong>{{message.mine?'You':message.sender}}</strong><span>{{message.message}}</span></li><li v-if="!messages.length" class="viewer">Messages from the live room appear here.</li></ol><form v-if="role!=='viewer'" @submit.prevent="sendChat"><input v-model="chatDraft" maxlength="240" placeholder="Message the salesroom"><button :disabled="!room.ready.value||busy">Send</button></form></section></section>
    <section v-if="role==='host'" class="invites"><div><b>PRIVATE SINGLE-USE INVITES</b><p>Bidder links can bid and publish; viewer links are read-only WebRTC.</p></div><button @click="createInvite('bidder')">Create bidder link</button><button @click="createInvite('viewer')">Create viewer link</button><ol><li v-for="item in invites" :key="item.url"><strong>{{item.role}} link</strong><button @click="copyInvite(item.url)">Copy</button></li></ol></section>
    <p v-if="notice" class="notice">{{notice}}</p>
    <div class="engine"><AudioGrid :componentsToRender="room.audioComponents.value"/></div>
  </main>
</template>
