using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using MediaSFU.Unity;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace MediaSFU.LiveAuction
{
    public sealed class AuctionApp : MonoBehaviour
    {
        [SerializeField] private string backendBaseUrl = "http://127.0.0.1:8791";
        [SerializeField] private string displayName = "Auctioneer";
        [SerializeField] private string invitationGrant = "";
        private MediaSfuClient client;
        private string role = "host", auctionId = "", auctionToken = "", meetingId = "";
        private string status = "Ready to open a secure salesroom", lotTitle = "Studio microphone", currentBid = "$85";
        private string chatDraft = "", bidderInvite = "", viewerInvite = "";
        private bool entered, connected, microphoneOn, cameraOn, screenOn, busy;
        private float nextPoll;
        private readonly List<string> chat = new List<string>();

        private bool IsHost => role == "host";
        private JObject Auction { get; set; }
        private JObject Lot => (Auction?["lots"] as JArray)?.OfType<JObject>().FirstOrDefault(item => item.Value<string>("state") == "open")
            ?? (Auction?["lots"] as JArray)?.OfType<JObject>().LastOrDefault();

        private void Awake()
        {
            if (!string.IsNullOrWhiteSpace(invitationGrant)) { role = "bidder"; displayName = "Bidder1"; }
            client = new MediaSfuClient(new MediaSfuClientOptions { ConnectionMode = MediaSfuConnectionMode.Cloud });
            client.ConnectionStateChanged += state => status = state.ToString();
            client.ErrorOccurred += error => status = error ?? "MediaSFU error";
            client.TrackAdded += track => status = track?.Track?.Kind == MediaSfuTrackKind.Screen ? "Screen share live" : "Remote media received";
            client.TrackRemoved += _ => status = "Remote media changed";
            client.MessageReceived += message => { if (message != null) chat.Add((message.Sender ?? "Room") + ": " + message.Message); };
        }

        private async void Update()
        {
            if (!entered || string.IsNullOrWhiteSpace(auctionId) || string.IsNullOrWhiteSpace(auctionToken) || Time.unscaledTime < nextPoll) return;
            nextPoll = Time.unscaledTime + 1.5f;
            try { Auction = (await RequestAsync("/api/auctions/" + auctionId, "GET", null, auctionToken))["auction"] as JObject; ReadLot(); }
            catch (Exception error) { status = error.Message; }
        }

        private async void OnDestroy()
        {
            if (client == null) return;
            await client.LeaveRoomAsync(endRoomOnHostExit: false);
            client.Dispose();
        }

        public async void EnterSalesroom() => await RunAsync(EnterSalesroomAsync);
        private async Task EnterSalesroomAsync()
        {
            JObject response;
            if (string.IsNullOrWhiteSpace(invitationGrant))
                response = await RequestAsync("/api/auctions", "POST", new JObject { ["hostName"] = displayName });
            else
                response = await RequestAsync("/api/invites/redeem", "POST", new JObject { ["grant"] = invitationGrant, ["displayName"] = displayName });
            role = response.Value<string>("role") ?? "host";
            Auction = response["auction"] as JObject; auctionId = Auction?.Value<string>("id") ?? "";
            auctionToken = response.Value<string>(IsHost ? "hostToken" : "participantToken") ?? "";
            meetingId = response.Value<string>("meetingId") ?? MeetingId(response["data"] as JObject);
            await JoinMediaAsync(response["data"] as JObject);
            entered = true; ReadLot(); nextPoll = 0;
        }

        private async Task JoinMediaAsync(JObject data)
        {
            var passcode = data?.Value<string>("secureCode") ?? data?.Value<string>("secret");
            meetingId = string.IsNullOrWhiteSpace(meetingId) ? MeetingId(data) : meetingId;
            if (string.IsNullOrWhiteSpace(meetingId)) throw new InvalidOperationException("Room response was incomplete.");
            var joined = await client.JoinRoomAsync(new MediaSfuJoinRoomRequest { MeetingId = meetingId, UserName = displayName, AdminPasscode = passcode, IsLevel = IsHost ? "2" : role == "bidder" ? "1" : "0" });
            if (!joined.Success) throw new InvalidOperationException(string.IsNullOrWhiteSpace(joined.Error) ? "Unity could not join the auction." : joined.Error);
            var media = await client.ConnectMediaAsync();
            connected = media.Success; if (!connected) throw new InvalidOperationException(string.IsNullOrWhiteSpace(media.Error) ? "Media connection failed." : media.Error);
            if (role != "viewer")
            {
                var audio = await client.SetMicrophoneEnabledAsync(true); microphoneOn = audio.Success;
                var video = await client.SetCameraEnabledAsync(true); cameraOn = video.Success;
            }
            status = "LIVE SALESROOM";
        }

        public async void ToggleMicrophone() => await RunAsync(async () => { var result = await client.SetMicrophoneEnabledAsync(!microphoneOn); Require(result); microphoneOn = !microphoneOn; });
        public async void ToggleCamera() => await RunAsync(async () => { var result = await client.SetCameraEnabledAsync(!cameraOn); Require(result); cameraOn = !cameraOn; });
        public async void ToggleScreen() => await RunAsync(async () => { var result = await client.SetScreenShareEnabledAsync(!screenOn); Require(result); screenOn = !screenOn; });
        public async void SendChat() => await RunAsync(async () => { var result = await client.SendChatMessageAsync(chatDraft); Require(result); chat.Add("You: " + chatDraft.Trim()); chatDraft = ""; });
        public async void Bid(int incrementCents) => await RunAsync(async () =>
        {
            var reserve = Lot?.Value<int?>("reserveCents") ?? 0; var high = Lot?.Value<int?>("highestBidCents") ?? 0;
            var amount = Math.Max(reserve, high + incrementCents);
            var value = await RequestAsync("/api/auctions/" + auctionId + "/bids", "POST", new JObject { ["amountCents"] = amount, ["idempotencyKey"] = "bid_" + Guid.NewGuid().ToString("N") }, auctionToken);
            Auction = value["state"] as JObject; ReadLot();
        });
        public async void SettleLot() => await RunAsync(async () => { Auction = (await RequestAsync("/api/auctions/" + auctionId + "/settle", "POST", new JObject(), auctionToken))["auction"] as JObject; ReadLot(); });
        public async void CreateInvite(string inviteRole) => await RunAsync(async () =>
        {
            var value = await RequestAsync("/api/auctions/" + auctionId + "/invites", "POST", new JObject { ["role"] = inviteRole }, auctionToken);
            var url = "mediasfu-auction://join?invite=" + UnityWebRequest.EscapeURL(value.Value<string>("grant") ?? "");
            if (inviteRole == "bidder") bidderInvite = url; else viewerInvite = url;
        });
        public async void EndAuction() => await RunAsync(async () =>
        {
            var value = await RequestAsync("/api/auctions/" + auctionId + "/end", "POST", new JObject(), auctionToken);
            if (value["data"]?.Value<string>("outcome") != "ended" || value["data"]?.Value<string>("residue") != "clear") throw new InvalidOperationException("Room cleanup was not confirmed.");
            await client.LeaveRoomAsync(endRoomOnHostExit: true); entered = connected = false; Auction = null; auctionId = auctionToken = ""; status = "Auction ended cleanly";
        });
        public async void MuteParticipant(MediaSfuParticipant participant) => await RunAsync(async () => Require(await client.ControlParticipantMediaAsync(participant, MediaSfuHostControlType.Audio)));
        public async void RemoveParticipant(MediaSfuParticipant participant) => await RunAsync(async () => Require(await client.RemoveParticipantAsync(participant)));

        private static string MeetingId(JObject data) => data?.Value<string>("meetingID") ?? data?.Value<string>("meetingId") ?? data?.Value<string>("roomName");
        private void ReadLot() { var lot = Lot; lotTitle = lot?.Value<string>("title") ?? "Auction complete"; var cents = lot?.Value<int?>("highestBidCents") ?? lot?.Value<int?>("reserveCents") ?? 0; currentBid = "$" + (cents / 100f).ToString("0.##"); }
        private async Task RunAsync(Func<Task> work) { if (busy) return; busy = true; try { await work(); } catch (Exception error) { status = error.Message; } finally { busy = false; } }
        private static void Require(MediaSfuOperationResult<bool> result) { if (!result.Success) throw new InvalidOperationException(string.IsNullOrWhiteSpace(result.Error) ? "MediaSFU action failed." : result.Error); }
        private async Task<JObject> RequestAsync(string path, string method, JObject body, string token = "")
        {
            using var request = new UnityWebRequest(backendBaseUrl.TrimEnd('/') + path, method) { downloadHandler = new DownloadHandlerBuffer() };
            if (body != null) request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString()));
            request.SetRequestHeader("Content-Type", "application/json"); if (!string.IsNullOrWhiteSpace(token)) request.SetRequestHeader("Authorization", "Bearer " + token);
            await SendAsync(request); var response = string.IsNullOrWhiteSpace(request.downloadHandler.text) ? new JObject() : JObject.Parse(request.downloadHandler.text);
            if (request.result != UnityWebRequest.Result.Success || response.Value<bool?>("success") == false) throw new InvalidOperationException(response.Value<string>("error") ?? "Auction backend failed.");
            return response;
        }
        private static Task SendAsync(UnityWebRequest request) { var completion = new TaskCompletionSource<bool>(); var operation = request.SendWebRequest(); operation.completed += _ => completion.TrySetResult(true); return completion.Task; }

        private void OnGUI()
        {
            var width = Mathf.Min(Screen.width - 48, 1040); var x = (Screen.width - width) / 2f;
            GUI.backgroundColor = new Color(.04f, .08f, .13f); GUI.Box(new Rect(x, 22, width, Screen.height - 44), "");
            var gold = new GUIStyle(GUI.skin.label) { fontSize = 16, fontStyle = FontStyle.Bold }; gold.normal.textColor = new Color(1f, .84f, .04f);
            var hero = new GUIStyle(GUI.skin.label) { fontSize = 30, fontStyle = FontStyle.Bold }; hero.normal.textColor = Color.white;
            if (!entered)
            {
                GUI.Label(new Rect(x + 28, 70, width - 56, 34), "MEDIASFU SOLUTION STARTER", gold);
                GUI.Label(new Rect(x + 28, 112, width - 56, 52), string.IsNullOrWhiteSpace(invitationGrant) ? "Run a live auction" : "Enter the salesroom", hero);
                GUI.Label(new Rect(x + 28, 175, width - 56, 28), string.IsNullOrWhiteSpace(invitationGrant) ? "Premium Unity media, authoritative bids, and private backend credentials." : "Your single-use invitation decides whether you can bid or watch.");
                displayName = GUI.TextField(new Rect(x + 28, 220, 330, 42), displayName, 10);
                if (GUI.Button(new Rect(x + 28, 280, 250, 48), busy ? "Opening…" : string.IsNullOrWhiteSpace(invitationGrant) ? "Open salesroom" : "Enter auction")) EnterSalesroom();
                GUI.Label(new Rect(x + 28, 345, width - 56, 32), status); return;
            }
            GUI.Label(new Rect(x + 24, 42, width - 48, 32), "◆ NORTHSTAR AUCTION HOUSE", gold);
            GUI.Label(new Rect(x + 24, 78, width - 48, 28), "MediaSFU headless · " + role.ToUpperInvariant() + " · " + (connected ? "● LIVE" : status));
            if (IsHost && GUI.Button(new Rect(x + width - 150, 46, 120, 38), "End auction")) EndAuction();
            GUI.backgroundColor = new Color(.06f, .11f, .17f); GUI.Box(new Rect(x + 24, 120, width * .58f, 300), connected ? (screenOn ? "Screen share / remote media surface" : "Native camera / remote media surface") : "Auctioneer identity card · camera and mic off");
            GUI.Box(new Rect(x + width * .62f, 120, width * .34f - 24, 300), "");
            GUI.Label(new Rect(x + width * .64f, 145, width * .3f, 40), "NOW BIDDING", gold); GUI.Label(new Rect(x + width * .64f, 190, width * .3f, 70), lotTitle, hero); GUI.Label(new Rect(x + width * .64f, 270, width * .3f, 50), currentBid, hero);
            if (role == "bidder") { if (GUI.Button(new Rect(x + width * .64f, 340, 110, 40), "Bid +$25")) Bid(2500); if (GUI.Button(new Rect(x + width * .64f + 120, 340, 110, 40), "Bid +$100")) Bid(10000); }
            if (IsHost && GUI.Button(new Rect(x + width * .64f, 340, 220, 40), "Close lot and advance")) SettleLot();
            if (role != "viewer") { if (GUI.Button(new Rect(x + 24, 438, 110, 40), microphoneOn ? "Mute" : "Unmute")) ToggleMicrophone(); if (GUI.Button(new Rect(x + 144, 438, 110, 40), cameraOn ? "Camera off" : "Camera on")) ToggleCamera(); if (GUI.Button(new Rect(x + 264, 438, 110, 40), screenOn ? "Stop share" : "Share")) ToggleScreen(); }
            GUI.Label(new Rect(x + 24, 500, width - 48, 30), "BIDDING FLOOR · every participant keeps a card", gold);
            var participants = client.CurrentRoom?.Participants?.Where(item => !item.IsLocal && item.Role != MediaSfuParticipantRole.Host).ToList() ?? new List<MediaSfuParticipant>();
            var y = 535f; foreach (var participant in participants.Take(3)) { GUI.Box(new Rect(x + 24, y, width * .45f, 48), participant.DisplayName + " · " + (participant.VideoOn ? "Camera live" : participant.AudioOn ? "Mic live · camera off" : "Camera and mic off")); if (IsHost) { if (GUI.Button(new Rect(x + width * .47f, y, 70, 48), "Mute")) MuteParticipant(participant); if (GUI.Button(new Rect(x + width * .47f + 78, y, 78, 48), "Remove")) RemoveParticipant(participant); } y += 54; }
            if (participants.Count == 0) GUI.Box(new Rect(x + 24, y, width * .45f, 54), "No bidders on camera yet");
            var chatX = x + width * .64f; GUI.Label(new Rect(chatX, 500, width * .3f, 30), "SALESROOM CHAT", gold); var chatY = 532f; foreach (var message in chat.TakeLast(4)) { GUI.Label(new Rect(chatX, chatY, width * .3f, 24), message); chatY += 24; }
            if (role != "viewer") { chatDraft = GUI.TextField(new Rect(chatX, chatY + 8, width * .22f, 36), chatDraft, 240); if (GUI.Button(new Rect(chatX + width * .23f, chatY + 8, 65, 36), "Send")) SendChat(); }
            if (IsHost) { var inviteY = Mathf.Max(y + 15, 715); if (GUI.Button(new Rect(x + 24, inviteY, 160, 38), "Create bidder link")) CreateInvite("bidder"); if (GUI.Button(new Rect(x + 194, inviteY, 160, 38), "Create viewer link")) CreateInvite("viewer"); if (!string.IsNullOrWhiteSpace(bidderInvite) && GUI.Button(new Rect(x + 370, inviteY, 150, 38), "Copy bidder link")) GUIUtility.systemCopyBuffer = bidderInvite; if (!string.IsNullOrWhiteSpace(viewerInvite) && GUI.Button(new Rect(x + 530, inviteY, 150, 38), "Copy viewer link")) GUIUtility.systemCopyBuffer = viewerInvite; }
        }
    }
}
