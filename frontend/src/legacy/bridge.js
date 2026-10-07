// The compatibility boundary is intentionally explicit. React owns authentication;
// existing feature screens keep their current behavior during component migration.
window.MiniDevOpsRuntime = {
  start: boot,
  async signIn(credentials, setup) {
    const result = await api(setup ? '/setup' : '/login', { method: 'POST', body: credentials });
    Object.assign(state, result);
    window.MiniDevOpsAuth.hide();
    await boot();
  },
};
