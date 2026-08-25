double auctionNumber(dynamic value) => value is num ? value.toDouble() : 0;

String auctionMoney(dynamic cents) =>
    '\$${(auctionNumber(cents) / 100).toStringAsFixed(0)}';

int nextBidAmount({
  required dynamic highestBidCents,
  required dynamic reserveCents,
  required int incrementCents,
}) => (auctionNumber(highestBidCents) + incrementCents)
    .clamp(auctionNumber(reserveCents), double.infinity)
    .toInt();
