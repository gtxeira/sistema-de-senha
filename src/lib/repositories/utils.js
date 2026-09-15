export function normalizeCallType(type) {
  const isPriority = type === "preferential" || type === "preferencial";
  return {
    sequenceType: isPriority ? "preferencial" : "normal",
    callType: isPriority ? "preferential" : "normal",
  };
}

export function formatNumberString(num, type) {
  const prefix =
    type === "preferencial" || type === "preferential" ? "P" : "N";
  if (Number(num) >= 1000) return "1000";
  return `${prefix}${String(Number(num) || 0).padStart(3, "0")}`;
}

export function isInvalidApiKeyError(error) {
  return /invalid api key/i.test(String(error?.message || error || ""));
}