# React live-room evidence

These images document the React live-auction acceptance completed on
2026-08-22. Two independent browser participants joined the same real MediaSFU
room and exchanged SDK-produced video while auction state synchronized through
the shared backend.

The camera source is intentionally synthetic and visibly labeled so the run is
repeatable. The images prove room lifecycle, video production and remote decode,
and bid propagation; they do not claim physical-camera or microphone quality.

| File | Participant view | Verified outcome |
| --- | --- | --- |
| `01-host-camera-live.png` | Host | Live host video production and self-rendering |
| `02-two-person-host.png` | Host | Self and bidder video plus the bidder's leading bid |
| `03-bidder-remote-media.png` | Bidder | Remote host video and submitted bid state |

No reusable credential, room URL, passcode, or room identifier is retained in
this public evidence set. See [the validation report](../../VALIDATION.md) for
the complete claim boundary.
