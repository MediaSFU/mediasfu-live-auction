import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:mediasfu_sdk/mediasfu_sdk.dart';
import 'package:mediasfu_sdk/components_modern/mediasfu_components/modern_mediasfu_generic.dart';
import 'auction_rules.dart';

const _navy = Color(0xff070d1c);
const _panel = Color(0xff101b2a);
const _gold = Color(0xffffd60a);
const _muted = Color(0xff91a4b7);
const _configuredBackend = String.fromEnvironment('AUCTION_API_URL');
String get _backend => _configuredBackend.isNotEmpty
    ? _configuredBackend
    : kIsWeb || defaultTargetPlatform != TargetPlatform.android
    ? 'http://127.0.0.1:8791'
    : 'http://10.0.2.2:8791';

void runAuctionApp() => runApp(const AuctionApp());

class AuctionApp extends StatelessWidget {
  const AuctionApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'MediaSFU Live Auction',
    theme: ThemeData(
      brightness: Brightness.dark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _gold,
        brightness: Brightness.dark,
      ),
      useMaterial3: true,
    ),
    home: const AuctionHome(),
  );
}

class AuctionHome extends StatefulWidget {
  const AuctionHome({super.key});
  @override
  State<AuctionHome> createState() => _AuctionHomeState();
}

class _AuctionHomeState extends State<AuctionHome> {
  final room = MediasfuHeadlessController();
  final name = TextEditingController(text: 'Auctioneer');
  final chat = TextEditingController();
  Map<String, dynamic>? auction, roomData;
  String token = '', notice = '', meetingId = '', grant = '', role = 'host';
  bool launched = false, roleApplied = false, busy = false;
  Timer? poll;
  final invites = <Map<String, String>>[];

  bool get isHost => role == 'host';
  dynamic get lot {
    final lots =
        (auction?['lots'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    for (final item in lots) {
      if (item['state'] == 'open') return item;
    }
    return lots.isEmpty ? null : lots.last;
  }

  String money(dynamic cents) => auctionMoney(cents);

  @override
  void initState() {
    super.initState();
    const configured = String.fromEnvironment('AUCTION_INVITE_GRANT');
    grant = configured.isNotEmpty
        ? configured
        : (Uri.base.queryParameters['invite'] ?? '');
    if (grant.isNotEmpty) {
      role = 'bidder';
      name.text = 'Bidder1';
    }
  }

  @override
  void dispose() {
    poll?.cancel();
    final current = room.parameters?.getCurrentParams();
    if (current != null) {
      unawaited(leaveRoom(current, endRoomOnHostExit: false));
    }
    name.dispose();
    chat.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final request = http.Request(method, Uri.parse(_backend + path));
    request.headers['content-type'] = 'application/json';
    if (token.isNotEmpty) request.headers['authorization'] = 'Bearer $token';
    if (body != null) request.body = jsonEncode(body);
    final sent = await request.send();
    final value =
        jsonDecode(await sent.stream.bytesToString()) as Map<String, dynamic>;
    if (sent.statusCode >= 400 || value['success'] == false) {
      throw Exception(value['error'] ?? 'Request failed');
    }
    return value;
  }

  Future<void> _enter() async {
    setState(() {
      busy = true;
      notice = '';
    });
    try {
      if (grant.isNotEmpty) {
        final value = await _request(
          '/api/invites/redeem',
          method: 'POST',
          body: {'grant': grant, 'displayName': name.text.trim()},
        );
        role = value['role'];
        auction = Map<String, dynamic>.from(value['auction']);
        token = value['participantToken'];
        roomData = Map<String, dynamic>.from(value['data']);
        meetingId = value['meetingId'];
      }
      if (mounted) setState(() => launched = true);
      _startPolling();
    } catch (error) {
      if (mounted) {
        setState(() => notice = '$error'.replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<CreateJoinRoomResult> _create(CreateMediaSFUOptions _) async {
    try {
      final value = await _request(
        '/api/auctions',
        method: 'POST',
        body: {'hostName': name.text.trim()},
      );
      if (mounted) {
        setState(() {
          auction = Map<String, dynamic>.from(value['auction']);
          token = value['hostToken'];
          roomData = Map<String, dynamic>.from(value['data']);
        });
      }
      _startPolling();
      return CreateJoinRoomResult(
        success: true,
        data: CreateJoinRoomResponse.fromJson(
          Map<String, dynamic>.from(value['data']),
        ),
      );
    } catch (error) {
      final message = '$error'.replaceFirst('Exception: ', '');
      if (mounted) setState(() => notice = message);
      return CreateJoinRoomResult(
        success: false,
        data: CreateJoinRoomError(error: message),
      );
    }
  }

  Future<CreateJoinRoomResult> _join(JoinMediaSFUOptions _) async =>
      CreateJoinRoomResult(
        success: true,
        data: CreateJoinRoomResponse.fromJson(
          roomData ?? const <String, dynamic>{},
        ),
      );
  void _startPolling() {
    poll?.cancel();
    poll = Timer.periodic(const Duration(milliseconds: 1500), (_) async {
      if (auction == null || token.isEmpty) return;
      try {
        final value = await _request("/api/auctions/${auction!['id']}");
        if (mounted) {
          setState(() => auction = Map<String, dynamic>.from(value['auction']));
        }
      } catch (error) {
        if (mounted) {
          setState(() => notice = '$error'.replaceFirst('Exception: ', ''));
        }
      }
    });
  }

  void _parameters(MediasfuParameters? parameters) {
    room.updateSourceParameters(parameters);
    if (parameters != null && !roleApplied) {
      parameters.updateIslevel(
        role == 'host'
            ? '2'
            : role == 'bidder'
            ? '1'
            : '0',
      );
      roleApplied = true;
    }
  }

  Future<void> _media(Future<void> Function(MediasfuParameters) action) async {
    final p = room.parameters?.getCurrentParams();
    if (p == null) return;
    final result = await runMediaControl(p, () => action(p));
    if (!result.ok && mounted) setState(() => notice = result.error);
  }

  Future<void> _action(Future<void> Function() work) async {
    if (mounted) {
      setState(() {
        busy = true;
        notice = '';
      });
    }
    try {
      await work();
    } catch (error) {
      if (mounted) {
        setState(() => notice = '$error'.replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _bid(int increment) => _action(() async {
    final amount = nextBidAmount(
      highestBidCents: lot?['highestBidCents'],
      reserveCents: lot?['reserveCents'],
      incrementCents: increment,
    );
    final value = await _request(
      "/api/auctions/${auction!['id']}/bids",
      method: 'POST',
      body: {
        'amountCents': amount,
        'idempotencyKey': 'bid_${DateTime.now().microsecondsSinceEpoch}',
      },
    );
    if (mounted) {
      setState(() => auction = Map<String, dynamic>.from(value['state']));
    }
  });
  Future<void> _settle() => _action(() async {
    final value = await _request(
      "/api/auctions/${auction!['id']}/settle",
      method: 'POST',
      body: const {},
    );
    if (mounted) {
      setState(() => auction = Map<String, dynamic>.from(value['auction']));
    }
  });
  Future<void> _invite(String inviteRole) => _action(() async {
    final value = await _request(
      "/api/auctions/${auction!['id']}/invites",
      method: 'POST',
      body: {'role': inviteRole},
    );
    final url =
        'mediasfu-auction://join?invite=${Uri.encodeQueryComponent(value['grant'])}';
    if (mounted) setState(() => invites.add({'role': inviteRole, 'url': url}));
  });
  Future<void> _sendChat() => _action(() async {
    final p = room.parameters?.getCurrentParams();
    if (p == null) throw Exception('Media room is not ready');
    final result = await sendChatMessage(p, chat.text, group: true);
    if (!result.ok) throw Exception(result.error);
    chat.clear();
  });
  Future<void> _moderate(String kind, String member) => _action(() async {
    final p = room.parameters?.getCurrentParams();
    if (p == null) return;
    final result = kind == 'mute'
        ? await muteParticipant(p, name: member)
        : await removeParticipant(p, name: member);
    if (!result.ok) throw Exception(result.error);
  });
  Future<void> _end() => _action(() async {
    final value = await _request(
      "/api/auctions/${auction!['id']}/end",
      method: 'POST',
      body: const {},
    );
    if (value['data']?['outcome'] != 'ended' ||
        value['data']?['residue'] != 'clear') {
      throw Exception('Room cleanup was not confirmed');
    }
    final p = room.parameters?.getCurrentParams();
    if (p != null) await leaveRoom(p, endRoomOnHostExit: true);
    if (mounted) {
      setState(() {
        launched = false;
        auction = null;
        token = '';
        roleApplied = false;
      });
    }
  });

  @override
  Widget build(BuildContext context) {
    if (!launched) {
      return Scaffold(
        backgroundColor: _navy,
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'MEDIASFU SOLUTION STARTER',
                      style: TextStyle(
                        color: _gold,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.3,
                      ),
                    ),
                    const SizedBox(height: 15),
                    Text(
                      grant.isNotEmpty
                          ? 'Enter the salesroom'
                          : 'Run a live auction',
                      style: const TextStyle(
                        fontSize: 40,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      grant.isNotEmpty
                          ? 'Your private invitation decides whether you can bid or watch.'
                          : 'Premium native media, authoritative bids, and secure room creation.',
                      style: const TextStyle(color: _muted),
                    ),
                    const SizedBox(height: 18),
                    TextField(
                      controller: name,
                      maxLength: 10,
                      decoration: const InputDecoration(
                        labelText: 'Display name',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    FilledButton(
                      onPressed: busy ? null : _enter,
                      child: Text(
                        busy
                            ? 'Opening…'
                            : grant.isNotEmpty
                            ? 'Enter auction →'
                            : 'Open salesroom →',
                      ),
                    ),
                    if (notice.isNotEmpty)
                      Text(
                        notice,
                        style: const TextStyle(color: Color(0xffffbdc7)),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }
    final options = ModernMediasfuGenericOptions(
      returnUI: false,
      noUIPreJoinOptionsCreate: isHost
          ? CreateMediaSFURoomOptions(
              action: 'create',
              duration: 120,
              capacity: 8,
              userName: name.text.trim(),
              eventType: EventType.conference,
            )
          : null,
      noUIPreJoinOptionsJoin: !isHost
          ? JoinMediaSFURoomOptions(
              action: 'join',
              meetingID: meetingId,
              userName: name.text.trim(),
            )
          : null,
      createMediaSFURoom: _create,
      joinMediaSFURoom: _join,
      updateSourceParameters: _parameters,
    );
    return Scaffold(
      backgroundColor: _navy,
      body: SafeArea(
        child: Stack(
          children: [
            ModernMediasfuGeneric(options: options),
            AnimatedBuilder(
              animation: room,
              builder: (context, _) => _surface(context),
            ),
          ],
        ),
      ),
    );
  }

  Widget _surface(BuildContext context) {
    final current = room.parameters?.getCurrentParams();
    final screen = room.screenShare;
    final remote = room.remoteVideos;
    final local = room.localVideo;
    dynamic stream;
    String producer = 'local';
    bool isScreen = false, isLocal = false;
    if (screen.stream != null) {
      stream = screen.stream;
      producer = current?.screenId ?? 'screen';
      isScreen = true;
      isLocal = screen.isLocal;
    } else if (isHost && local != null) {
      stream = local;
      isLocal = true;
    } else if (!isHost && remote.isNotEmpty) {
      stream = remote.first.stream;
      producer = remote.first.producerId;
    }
    final participants = room.participants
        .where((p) => !p.isSelf && !p.isHost)
        .toList();
    final remoteByName = {
      for (final item in room.remoteVideos) item.name: item,
    };
    final messages = (current?.messages ?? const [])
        .where((m) => m.receivers.isEmpty)
        .toList()
        .reversed
        .take(8)
        .toList()
        .reversed;
    final audio = current == null
        ? <Widget>[]
        : getAudioGridComponents(current);
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Card(
          color: _panel,
          child: ListTile(
            title: const Text(
              '◆ NORTHSTAR AUCTION HOUSE',
              style: TextStyle(color: _gold, fontWeight: FontWeight.w900),
            ),
            subtitle: Text('MediaSFU headless · $role'),
            trailing: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              children: [
                Text(
                  room.ready ? '● LIVE' : '● SECURING',
                  style: TextStyle(
                    color: room.ready ? const Color(0xff5ce0d3) : _muted,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (isHost)
                  FilledButton.tonal(
                    onPressed: busy ? null : _end,
                    child: const Text('End'),
                  ),
              ],
            ),
          ),
        ),
        ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: SizedBox(
            height: 330,
            child: stream != null
                ? CardVideoDisplay(
                    options: CardVideoDisplayOptions(
                      remoteProducerId: producer,
                      eventType: current?.eventType ?? EventType.conference,
                      forceFullDisplay: !isScreen,
                      videoStream: stream,
                      doMirror: isLocal && !isScreen,
                      backgroundColor: const Color(0xff091521),
                    ),
                  )
                : Container(
                    color: const Color(0xff0b1725),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircleAvatar(
                            radius: 50,
                            backgroundColor: const Color(0xff153441),
                            child: Text(
                              (auction?['hostName'] ?? name.text)[0],
                              style: const TextStyle(
                                fontSize: 42,
                                color: _gold,
                              ),
                            ),
                          ),
                          const Text('Camera and mic off'),
                        ],
                      ),
                    ),
                  ),
          ),
        ),
        if (role != 'viewer')
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            children: [
              OutlinedButton(
                onPressed: room.ready
                    ? () => _media(
                        (p) => clickAudio(ClickAudioOptions(parameters: p)),
                      )
                    : null,
                child: Text(
                  current?.audioAlreadyOn == true ? 'Mute' : 'Unmute',
                ),
              ),
              OutlinedButton(
                onPressed: room.ready
                    ? () => _media(
                        (p) => clickVideo(ClickVideoOptions(parameters: p)),
                      )
                    : null,
                child: Text(
                  current?.videoAlreadyOn == true ? 'Camera off' : 'Camera on',
                ),
              ),
              OutlinedButton(
                onPressed: room.ready
                    ? () => _media(
                        (p) => clickScreenShare(
                          ClickScreenShareOptions(
                            parameters: p,
                            context: context,
                          ),
                        ),
                      )
                    : null,
                child: const Text('Share screen'),
              ),
            ],
          ),
        Card(
          color: const Color(0xff101927),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  lot?['art'] ?? '◆',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 72),
                ),
                const Text(
                  'NOW BIDDING',
                  style: TextStyle(color: _gold, fontWeight: FontWeight.w900),
                ),
                Text(
                  lot?['title'] ?? 'Preparing lot',
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  money(lot?['highestBidCents'] ?? lot?['reserveCents']),
                  style: const TextStyle(
                    color: _gold,
                    fontSize: 36,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  "${lot?['highestBidderName'] ?? 'Reserve'} · ${lot?['bidCount'] ?? 0} bids",
                  style: const TextStyle(color: _muted),
                ),
                if (role == 'bidder')
                  ...[2500, 10000, 50000].map(
                    (increment) => FilledButton(
                      onPressed: busy || auction?['status'] != 'open'
                          ? null
                          : () => _bid(increment),
                      child: Text(
                        'Bid ${money(nextBidAmount(highestBidCents: lot?['highestBidCents'], reserveCents: lot?['reserveCents'], incrementCents: increment))}',
                      ),
                    ),
                  ),
                if (isHost)
                  FilledButton(
                    onPressed: busy || auction?['status'] != 'open'
                        ? null
                        : _settle,
                    child: const Text('🔨 Close lot and advance'),
                  ),
                if (role == 'viewer')
                  const Text(
                    'View-only invitation · bidding and publishing are disabled.',
                    style: TextStyle(color: _muted),
                  ),
              ],
            ),
          ),
        ),
        Card(
          color: _panel,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'BIDDING FLOOR',
                  style: TextStyle(color: _gold, fontWeight: FontWeight.w900),
                ),
                const Text(
                  'Every participant keeps a card',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                ),
                if (participants.isEmpty)
                  const Text(
                    'No bidders on camera yet. Every connected person retains an identity card.',
                    style: TextStyle(color: _muted),
                  ),
                ...participants.map((p) {
                  final video = remoteByName[p.name];
                  return ListTile(
                    leading: SizedBox(
                      width: 48,
                      height: 48,
                      child: ClipOval(
                        child: video != null
                            ? CardVideoDisplay(
                                options: CardVideoDisplayOptions(
                                  remoteProducerId: video.producerId,
                                  eventType:
                                      current?.eventType ??
                                      EventType.conference,
                                  forceFullDisplay: true,
                                  videoStream: video.stream,
                                  doMirror: false,
                                  backgroundColor: const Color(0xff091521),
                                ),
                              )
                            : CircleAvatar(child: Text(p.name[0])),
                      ),
                    ),
                    title: Text(p.name),
                    subtitle: Text(
                      p.cameraOn
                          ? 'Camera live'
                          : p.micOn
                          ? 'Mic live · camera off'
                          : 'Camera and mic off',
                    ),
                    trailing:
                        isHost &&
                            current != null &&
                            getModerationPermissions(
                              current,
                            ).canManageParticipants
                        ? PopupMenuButton<String>(
                            onSelected: (kind) => _moderate(kind, p.name),
                            itemBuilder: (_) => const [
                              PopupMenuItem(value: 'mute', child: Text('Mute')),
                              PopupMenuItem(
                                value: 'remove',
                                child: Text('Remove'),
                              ),
                            ],
                          )
                        : null,
                  );
                }),
              ],
            ),
          ),
        ),
        Card(
          color: const Color(0xff101927),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'SALESROOM CHAT',
                  style: TextStyle(color: _gold, fontWeight: FontWeight.w900),
                ),
                if (messages.isEmpty)
                  const Text(
                    'Messages from the live room appear here.',
                    style: TextStyle(color: _muted),
                  ),
                ...messages.map(
                  (m) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Text(
                      '${m.sender == current?.member ? 'You' : m.sender}: ${m.message}',
                    ),
                  ),
                ),
                if (role != 'viewer')
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: chat,
                          maxLength: 240,
                          decoration: const InputDecoration(
                            hintText: 'Message the salesroom',
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: room.ready && !busy ? _sendChat : null,
                        icon: const Icon(Icons.send),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
        if (isHost && auction?['id'] != null)
          Card(
            color: _panel,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'PRIVATE SINGLE-USE INVITES',
                    style: TextStyle(color: _gold, fontWeight: FontWeight.w900),
                  ),
                  const Text(
                    'Bidder links can bid and publish. Viewer links join WebRTC read-only.',
                    style: TextStyle(color: _muted),
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      FilledButton(
                        onPressed: () => _invite('bidder'),
                        child: const Text('Bidder link'),
                      ),
                      FilledButton(
                        onPressed: () => _invite('viewer'),
                        child: const Text('Viewer link'),
                      ),
                    ],
                  ),
                  ...invites.map(
                    (item) => ListTile(
                      title: Text('${item['role']!} link ready'),
                      subtitle: const Text('Expires in one hour · single use'),
                      trailing: IconButton(
                        onPressed: () => Clipboard.setData(
                          ClipboardData(text: item['url']!),
                        ),
                        icon: const Icon(Icons.copy),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (notice.isNotEmpty)
          Text(notice, style: const TextStyle(color: Color(0xffffbdc7))),
        SizedBox(
          width: 1,
          height: 1,
          child: AudioGrid(
            options: AudioGridOptions(componentsToRender: audio),
          ),
        ),
      ],
    );
  }
}
