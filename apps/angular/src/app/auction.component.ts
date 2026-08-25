import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AudioGrid, MediasfuGeneric, MediasfuHeadlessService } from 'mediasfu-angular';

type Role = 'host' | 'bidder' | 'viewer';

@Component({
  selector: 'auction-root',
  standalone: true,
  imports: [CommonModule, FormsModule, MediasfuGeneric, AudioGrid],
  providers: [MediasfuHeadlessService],
  template: `
    <main *ngIf="!launched" class="entry"><section>
      <b>MEDIASFU SOLUTION STARTER</b>
      <h1>{{ grant ? 'Enter the salesroom' : 'Run a live auction' }}</h1>
      <p>{{ grant ? 'Your private invitation decides whether you can bid or watch.' : 'Premium Angular media, authoritative bids, and secure room creation.' }}</p>
      <input [(ngModel)]="name" maxlength="10" aria-label="Display name">
      <button [disabled]="busy" (click)="enter()">{{ busy ? 'Opening…' : grant ? 'Enter auction →' : 'Open salesroom →' }}</button>
      <p *ngIf="notice" class="notice">{{ notice }}</p>
    </section></main>
    <main *ngIf="launched" class="shell">
      <div class="engine"><app-mediasfu-generic [connectMediaSFU]="true" [returnUI]="false"
        [sourceParameters]="room.sourceParameters" [updateSourceParameters]="updateSource"
        [noUIPreJoinOptions]="preJoin" [createMediaSFURoom]="createRoom"
        [joinMediaSFURoom]="joinRoom" (mediaChanged)="room.onMediaChanged($event)">
      </app-mediasfu-generic></div>
      <header><span><strong>◆ NORTHSTAR AUCTION HOUSE</strong><small>MediaSFU headless · {{ role }}</small></span>
        <span [class.live]="ready">● {{ ready ? 'LIVE' : 'SECURING' }}</span>
        <button *ngIf="isHost" [disabled]="busy || auction?.status === 'ended'" (click)="endAuction()">End auction</button>
      </header>
      <section class="grid">
        <article class="stage"><video *ngIf="primary" [srcObject]="primary" autoplay playsinline muted [class.screen]="screen"></video>
          <div *ngIf="!primary" class="identity"><i>{{ hostName[0] }}</i><strong>{{ hostName }}</strong><small>Camera and mic off</small></div>
          <footer>Auctioneer · {{ primary ? (screen ? 'Screen live' : 'Camera live') : 'Camera off' }}</footer>
        </article>
        <article class="lot"><div class="art">{{ lot?.art || '◆' }}</div><b>NOW BIDDING</b>
          <h2>{{ lot?.title || 'Preparing lot' }}</h2><strong>{{ money(lot?.highestBidCents || lot?.reserveCents) }}</strong>
          <small>{{ lot?.highestBidderName ? lot.highestBidderName + ' leads · ' + lot.bidCount + ' bids' : 'Reserve ' + money(lot?.reserveCents) }}</small>
          <div *ngIf="role === 'bidder'" class="quick"><button *ngFor="let increment of increments"
            [disabled]="busy || auction?.status !== 'open'" (click)="bid(increment)">Bid {{ money(nextBid(increment)) }}</button></div>
          <button *ngIf="isHost" [disabled]="busy || auction?.status !== 'open'" (click)="settle()">🔨 Close lot and advance</button>
          <p *ngIf="role === 'viewer'" class="viewer">View-only invitation · bidding and publishing are disabled.</p>
        </article>
      </section>
      <nav *ngIf="role !== 'viewer'"><button [disabled]="!ready" (click)="run(room.controls.toggleMic)">{{ micOn ? 'Mute' : 'Unmute' }}</button>
        <button [disabled]="!ready" (click)="run(room.controls.toggleCamera)">{{ cameraOn ? 'Camera off' : 'Camera on' }}</button>
        <button [disabled]="!ready" (click)="run(room.controls.toggleScreenShare)">Share screen</button></nav>
      <section class="lower"><section class="floor"><b>BIDDING FLOOR</b><h2>Every participant keeps a card</h2>
        <div *ngFor="let person of participants" class="seat"><video *ngIf="participantStream(person) as participantVideo" [srcObject]="participantVideo" autoplay playsinline></video><i *ngIf="!participantStream(person)">{{ person.name[0] }}</i>
          <span><strong>{{ person.name }}</strong><small>{{ person.hasVideo ? 'Camera live' : person.hasAudio ? 'Mic live · camera off' : 'Camera and mic off' }}</small></span>
          <span *ngIf="isHost && canModerate" class="moderate"><button (click)="moderate('mute', person)">Mute</button><button (click)="moderate('remove', person)">Remove</button></span>
        </div><p *ngIf="!participants.length" class="empty">No bidders on camera yet. Connected people still receive a visible identity card.</p>
      </section><section class="chat"><b>SALESROOM CHAT</b><h2>{{ role === 'viewer' ? 'Read-only room feed' : 'Room conversation' }}</h2>
        <ol><li *ngFor="let message of messages"><strong>{{ message.mine ? 'You' : message.sender }}</strong><span>{{ message.message }}</span></li>
          <li *ngIf="!messages.length">Messages from the live room appear here.</li></ol>
        <form *ngIf="role !== 'viewer'" (ngSubmit)="sendChat()"><input [(ngModel)]="chatDraft" name="chat" maxlength="240" placeholder="Message the salesroom"><button [disabled]="!ready || busy">Send</button></form>
      </section></section>
      <section *ngIf="isHost && auction?.id" class="invites"><div><b>PRIVATE SINGLE-USE INVITES</b><h2>Bring people in safely</h2>
        <p>Bidder links can bid and publish. Viewer links join WebRTC read-only.</p></div>
        <button (click)="createInvite('bidder')">Create bidder link</button><button (click)="createInvite('viewer')">Create viewer link</button>
        <ol><li *ngFor="let invite of invites"><span><strong>{{ invite.role }} link ready</strong><small>Expires in one hour · single use</small></span><button (click)="copy(invite.url)">Copy</button></li></ol>
      </section>
      <p *ngIf="notice" class="notice">{{ notice }}</p>
      <div class="audio"><app-audio-grid [componentsToRender]="audioComponents"></app-audio-grid></div>
    </main>`,
  styles: [`
    :host{font-family:Inter,system-ui;color:#f8fbff}.entry{min-height:100vh;display:grid;place-items:center;background:#070d1c}.entry section{max-width:520px;padding:36px;border:1px solid #53491f;border-radius:24px;background:#101b2a}.entry b,.lot>b,.floor>b,.chat>b,.invites b,header strong{color:#ffd60a}.entry h1{font-size:48px}.entry p,small,.viewer,.empty{color:#91a4b7}.entry input,.entry button,.lot button,nav button,.invites button,.chat input,.chat button,.moderate button{padding:12px;border:1px solid #315267;border-radius:10px;color:#fff;background:#0a1724}.entry input,.entry button{width:100%;margin-top:10px}.entry button,.lot>button,.quick button,.invites>button{color:#08121b;background:#ffd60a;font-weight:900}.shell{min-height:100vh;background:#070d1c;padding:14px}.engine,.audio{position:fixed;width:1px;height:1px;overflow:hidden}header{display:flex;gap:14px;align-items:center;justify-content:space-between;padding:16px;border-radius:14px;background:#101b2a}header>span:first-child{display:grid}header span.live{color:#5ce0d3}header button{padding:9px 13px;border:1px solid #6b3340;border-radius:9px;color:#ffdfe4;background:#401521}.grid{display:grid;grid-template-columns:1.4fr .6fr;gap:14px;margin-top:14px}.stage,.lot,.floor,.chat,.invites{overflow:hidden;border:1px solid #284455;border-radius:18px;background:#101927}.stage{position:relative;min-height:480px}.stage video{width:100%;height:480px;object-fit:cover}.stage video.screen{object-fit:contain;transform:none}.identity{height:480px;display:grid;place-content:center;justify-items:center;gap:8px}.identity i,.seat i{display:grid;place-items:center;border:1px solid #35bcb1;border-radius:50%;color:#ffd60a;background:#153441}.identity i{width:110px;height:110px;font-size:48px}.stage footer{position:absolute;bottom:12px;left:12px;padding:8px 12px;border-radius:99px;background:#060c16dd}.lot,.floor,.chat,.invites{padding:18px}.art{font-size:100px;text-align:center}.lot>strong{display:block;color:#ffd60a;font-size:42px}.lot small,.seat small{display:block}.lot button{margin-top:10px}.quick{display:grid;gap:8px}nav{display:flex;justify-content:center;gap:10px;margin:10px}.lower{display:grid;grid-template-columns:1fr 1fr;gap:14px}.seat{display:flex;gap:10px;align-items:center;margin-top:8px;padding:10px;border-radius:10px;background:#0a1622}.seat i,.seat video{width:42px;height:42px;border-radius:50%;object-fit:cover}.seat>span:nth-child(2){flex:1}.moderate{display:flex;gap:6px}.chat ol,.invites ol{list-style:none;padding:0}.chat li,.invites li{display:flex;justify-content:space-between;gap:10px;padding:9px;border-bottom:1px solid #203747}.chat li span{flex:1}.chat form{display:flex;gap:8px}.chat input{flex:1}.invites{margin-top:14px}.invites>button{margin:0 8px 8px 0}.notice{padding:10px;color:#ffdfe4;background:#401521}@media(max-width:800px){.grid,.lower{grid-template-columns:1fr}.stage,.stage video,.identity{min-height:320px;height:320px}header{flex-wrap:wrap}}
  `],
})
export class AuctionComponent implements OnDestroy {
  name = new URLSearchParams(location.search).get('invite') ? 'Bidder1' : 'Auctioneer';
  readonly grant = new URLSearchParams(location.search).get('invite') || '';
  readonly increments = [2500, 10000, 50000];
  launched = false; role: Role = this.grant ? 'bidder' : 'host'; auction: any; token = '';
  roomData: any; meetingId = ''; notice = ''; busy = false; ready = false; micOn = false; cameraOn = false;
  primary: MediaStream | null = null; screen = false; participants: any[] = []; remoteVideos: any[] = []; audioComponents: any[] = [];
  messages: any[] = []; chatDraft = ''; invites: Array<{ role: Role; url: string }> = []; canModerate = false;
  private subscriptions = new Subscription(); private request?: Promise<any>;
  private roleApplied = false; private poll?: number;

  constructor(public room: MediasfuHeadlessService) {
    this.subscriptions.add(room.ready$.subscribe(value => { this.ready = value; }));
    this.subscriptions.add(room.localVideo$.subscribe(value => { if (!this.screen && this.role === 'host') this.primary = value; }));
    this.subscriptions.add(room.remoteVideos$.subscribe(value => { this.remoteVideos = value; if (!this.screen && this.role !== 'host') this.primary = value.find((entry: any) => entry?.stream)?.stream || null; }));
    this.subscriptions.add(room.screenShare$.subscribe(value => { this.screen = Boolean(value.stream); if (value.stream) this.primary = value.stream; }));
    this.subscriptions.add(room.micOn$.subscribe(value => this.micOn = value));
    this.subscriptions.add(room.cameraOn$.subscribe(value => this.cameraOn = value));
    this.subscriptions.add(room.participants$.subscribe(value => this.participants = value.filter((p: any) => !p.isSelf && !p.isHost)));
    this.subscriptions.add(room.audioComponents$.subscribe(value => this.audioComponents = value));
    this.subscriptions.add(room.permissions$.subscribe(value => this.canModerate = Boolean(value.canManageParticipants)));
    this.subscriptions.add(room.parameters$.subscribe(value => this.messages = (Array.isArray((value as any).messages) ? (value as any).messages : []).filter((item: any) => !item.receivers?.length).slice(-8).map((item: any) => ({ ...item, mine: item.sender === (value as any).member }))));
  }

  get isHost() { return this.role === 'host'; }
  get hostName() { return this.isHost ? this.name : this.auction?.hostName || 'Auctioneer'; }
  get preJoin(): any { return this.isHost ? { action: 'create', userName: this.name, duration: 120, capacity: 8, eventType: 'conference' } : { action: 'join', userName: this.name, meetingID: this.meetingId }; }
  get lot() { return this.auction?.lots?.find((item: any) => item.state === 'open') || this.auction?.lots?.at(-1); }
  participantStream(person: any): MediaStream | null { return this.remoteVideos.find(entry => entry?.name === person.name || entry?.producerId === person.videoID)?.stream || null; }
  money(cents: number) { return '$' + (Number(cents || 0) / 100).toLocaleString(); }
  nextBid(increment: number) { return Math.max(this.lot?.reserveCents || 0, (this.lot?.highestBidCents || 0) + increment); }

  async api(path: string, options: any = {}) {
    const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.token ? { authorization: 'Bearer ' + options.token } : {}) } });
    const value = await response.json(); if (!response.ok || value.success === false) throw new Error(value.error || 'Request failed'); return value;
  }
  async enter() {
    this.busy = true; this.notice = '';
    try {
      if (this.grant) {
        const value = await this.api('/api/invites/redeem', { method: 'POST', body: JSON.stringify({ grant: this.grant, displayName: this.name }) });
        this.role = value.role; this.auction = value.auction; this.token = value.participantToken;
        this.roomData = value.data; this.meetingId = value.meetingId;
      }
      this.launched = true; this.startPolling();
    } catch (error: any) { this.notice = error.message; } finally { this.busy = false; }
  }
  createRoom = async () => {
    try {
      this.request ??= this.api('/api/auctions', { method: 'POST', body: JSON.stringify({ hostName: this.name }) });
      const value = await this.request; this.auction = value.auction; this.token = value.hostToken; this.roomData = value.data;
      this.startPolling(); return { success: true, data: value.data };
    } catch (error: any) { this.notice = error.message; return { success: false, data: { error: error.message } }; }
  };
  joinRoom = async () => ({ success: true, data: this.roomData });
  updateSource = (parameters: any) => {
    this.room.updateSourceParameters(parameters || {});
    if (!this.roleApplied && parameters?.updateIslevel) { parameters.updateIslevel(this.role === 'host' ? '2' : this.role === 'bidder' ? '1' : '0'); this.roleApplied = true; }
  };
  startPolling() { if (this.poll) clearInterval(this.poll); this.poll = window.setInterval(() => void this.refresh(), 1500); }
  async refresh() { if (!this.auction?.id || !this.token) return; try { this.auction = (await this.api('/api/auctions/' + this.auction.id, { token: this.token })).auction; } catch (error: any) { this.notice = error.message; } }
  async action(work: () => Promise<any>) { this.busy = true; this.notice = ''; try { await work(); } catch (error: any) { this.notice = error.message; } finally { this.busy = false; } }
  async run(work: () => Promise<any>) { await this.action(async () => { const result = await work(); if (!result.ok) throw new Error(result.error || 'Media action failed'); }); }
  async bid(increment: number) { await this.action(async () => { const value = await this.api('/api/auctions/' + this.auction.id + '/bids', { method: 'POST', token: this.token, body: JSON.stringify({ amountCents: this.nextBid(increment), idempotencyKey: 'bid_' + crypto.randomUUID().replaceAll('-', '') }) }); this.auction = value.state; }); }
  async settle() { await this.action(async () => { this.auction = (await this.api('/api/auctions/' + this.auction.id + '/settle', { method: 'POST', token: this.token, body: '{}' })).auction; }); }
  async createInvite(role: 'bidder' | 'viewer') { await this.action(async () => { const value = await this.api('/api/auctions/' + this.auction.id + '/invites', { method: 'POST', token: this.token, body: JSON.stringify({ role }) }); this.invites.push({ role, url: location.origin + location.pathname + '?invite=' + encodeURIComponent(value.grant) }); }); }
  copy(value: string) { void navigator.clipboard.writeText(value); }
  async sendChat() { const message = this.chatDraft.trim(); if (!message || this.role === 'viewer') return; await this.run(() => this.room.controls.sendChat(message, { group: true })); this.chatDraft = ''; }
  async moderate(kind: 'mute' | 'remove', participant: any) { await this.run(() => kind === 'mute' ? this.room.moderation.muteParticipant(participant.name) : this.room.moderation.removeParticipant(participant.name)); }
  async endAuction() { await this.action(async () => { const value = await this.api('/api/auctions/' + this.auction.id + '/end', { method: 'POST', token: this.token, body: '{}' }); if (value.data?.outcome !== 'ended' || value.data?.residue !== 'clear') throw new Error('Room teardown was not confirmed.'); await this.room.controls.leave(false, true).catch(() => undefined); this.auction = value.auction; }); }
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); this.subscriptions.unsubscribe(); }
}
