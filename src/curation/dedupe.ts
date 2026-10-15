import type { PostedRecord } from "./priceHistory.js";

export function shouldSkipAsDuplicate(
  posted: PostedRecord | undefined,
  currentPrice: number,
  thresholdPercent: number,
): boolean {
  if (!posted) {
    return false;
  }
  if (currentPrice >= posted.price) {
    return true;
  }
  const dropSincePosted = ((posted.price - currentPrice) / posted.price) * 100;
  return dropSincePosted < thresholdPercent;
}
