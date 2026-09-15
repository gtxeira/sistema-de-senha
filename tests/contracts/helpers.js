/**
 * Contract test helpers — seed data, cleanup, and shared assertions.
 */

export const SECTORS = ["farmacia", "recepcao"];
export const CALL_TYPES = ["normal", "preferencial"];

/**
 * Generate a unique test ID to avoid collisions between parallel tests.
 */
export function testId() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a minimal valid call object for saveCall().
 */
export function makeCall(overrides = {}) {
  return {
    sector: "farmacia",
    number: 1,
    numberStr: "N001",
    sequenceType: "normal",
    callType: "normal",
    attendantId: null,
    ...overrides,
  };
}

/**
 * Create a minimal valid user for create().
 */
export function makeUser(overrides = {}) {
  return {
    username: `user.${testId()}`,
    password: "test123456",
    full_name: "Test User",
    role: "attendant",
    sector_id: "farmacia",
    ...overrides,
  };
}

/**
 * Create a minimal valid news item for create().
 */
export function makeNews(overrides = {}) {
  return {
    title: `News ${testId()}`,
    image: Buffer.from("fake-image-data"),
    ...overrides,
  };
}

/**
 * Format a number as queue string (N001, P001, etc).
 */
export function formatNumber(num, type) {
  const prefix = type === "preferencial" ? "P" : "N";
  return `${prefix}${String(num).padStart(3, "0")}`;
}
