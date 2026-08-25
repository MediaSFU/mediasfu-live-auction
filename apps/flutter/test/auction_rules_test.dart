import 'package:flutter_test/flutter_test.dart';
import 'package:mediasfu_live_auction/auction_rules.dart';

void main() {
  test('formats integer cents for auction labels', () {
    expect(auctionMoney(12500), r'$125');
    expect(auctionMoney(null), r'$0');
  });

  test('next bid respects reserve and increment', () {
    expect(
      nextBidAmount(
        highestBidCents: 10000,
        reserveCents: 15000,
        incrementCents: 2500,
      ),
      15000,
    );
    expect(
      nextBidAmount(
        highestBidCents: 15000,
        reserveCents: 15000,
        incrementCents: 2500,
      ),
      17500,
    );
  });
}
