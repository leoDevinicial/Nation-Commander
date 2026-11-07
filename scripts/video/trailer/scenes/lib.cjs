// Ajudantes das cenas: construir perto de um ponto (tenta células em espiral até a obra aparecer).
async function mine(ctx, slot = 0) { return (await ctx.info()).buildings.filter((b) => b[1] === slot); }
async function placeNear(ctx, type, cx, cy, { slot = 0, maxTries = 60, radius = 0 } = {}) {
  const before = new Set((await mine(ctx, slot)).filter((b) => b[2] === type).map((b) => b[0]));
  const cells = [];
  for (let r = radius; r <= radius + 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) cells.push([cx + dx, cy + dy]);
  for (let i = 0; i < Math.min(cells.length, maxTries); i++) {
    const [x, y] = cells[i];
    const c = { type: 'build', buildingType: type, cx: x, cy: y };
    if (slot === 0) await ctx.send(c); else await ctx.cmdAs(slot, c);
    await ctx.pump(2);
    const now = (await mine(ctx, slot)).filter((b) => b[2] === type && !before.has(b[0]));
    if (now.length) return now[0];
  }
  ctx.log('placeNear falhou', type, cx, cy);
  return null;
}
module.exports = { placeNear, mine };
