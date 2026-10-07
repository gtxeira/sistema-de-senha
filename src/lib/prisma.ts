import { MAX_QUEUE_NUMBER } from "./constants";

export function formatQueueNumber(num: number | null | undefined): string {
  if (!num || num <= 0) return '---';
  if (num >= MAX_QUEUE_NUMBER + 1) return String(MAX_QUEUE_NUMBER);
  return String(num).padStart(3, '0');
}