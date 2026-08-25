import {invitationUrl, liveVideo, money} from '../auctionUtils';

describe('auction presentation helpers', () => {
  test('formats integer cents without floating-point drift', () => {
    expect(money(12500)).toBe('$125');
    expect(money(null)).toBe('$0');
  });

  test('accepts a stream only while at least one video track is live', () => {
    expect(
      liveVideo({getVideoTracks: () => [{readyState: 'ended'}, {readyState: 'live'}]}),
    ).toBe(true);
    expect(liveVideo({getVideoTracks: () => [{readyState: 'ended'}]})).toBe(false);
    expect(liveVideo(null)).toBe(false);
  });

  test('keeps the invite opaque and URI encoded', () => {
    expect(invitationUrl('grant with/slash')).toBe(
      'mediasfu-auction://join?invite=grant%20with%2Fslash',
    );
  });
});
