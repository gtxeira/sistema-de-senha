// Factory reutilizável para construir clientes Supabase mockados em testes.
// Retorna um objeto que espelha a superfície usada pelo código (auth, from().select/eq/...).

export function makeQueryBuilder(overrides = {}) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    ...overrides,
  };
  return builder;
}

export function makeSupabaseClient(config = {}) {
  const {
    rpc = vi.fn(),
    from = vi.fn(),
    auth = {},
    channel = vi.fn(),
    removeChannel = vi.fn(),
  } = config;

  const baseAuth = {
    signInWithPassword: vi.fn(),
    admin: {
      getUserById: vi.fn(),
      createUser: vi.fn(),
      deleteUser: vi.fn(),
    },
    ...auth,
  };

  return {
    rpc,
    from,
    auth: baseAuth,
    channel,
    removeChannel,
  };
}