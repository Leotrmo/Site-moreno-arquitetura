// pokemon/lib/refdata.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Lendários e míticos (Gen 1–9). Usado para proteção "nunca transferir".
  const LEGENDARY = new Set([
    144,145,146,150,151,                                 // Gen 1
    243,244,245,249,250,251,                             // Gen 2
    377,378,379,380,381,382,383,384,385,386,             // Gen 3
    480,481,482,483,484,485,486,487,488,489,490,491,492,493, // Gen 4
    494,638,639,640,641,642,643,644,645,646,647,648,649, // Gen 5
    716,717,718,719,720,721,                             // Gen 6
    772,773,785,786,787,788,789,790,791,792,793,794,795,796,797,798,799,
    800,801,802,803,804,805,806,807,808,809,             // Gen 7 (inclui Ultra Beasts)
    888,889,890,891,892,893,894,895,896,897,898,905,     // Gen 8
    1001,1002,1003,1004,1007,1008,1014,1015,1016,1017,   // Gen 9 (parcial)
  ]);

  // Region-exclusivos de alto valor de troca (lista comum em GO; extensível).
  const REGIONAL = new Set([
    83,115,122,128,                                      // Farfetch'd, Kangaskhan, Mr.Mime, Tauros
    214,222,                                             // Heracross, Corsola
    324,335,336,337,338,357,369,                         // Torkoal, Zangoose, Seviper, Lunatone, Solrock, Tropius, Relicanth
    417,441,455,                                         // Pachirisu, Chatot, Carnivine
    550,556,561,                                         // Basculin, Maractus, Sigilyph
    618,631,632,                                         // Stunfisk, Heatmor, Durant
    667,                                                 // Litleo (regional? mantém p/ exemplo)
    707,                                                 // Klefki
  ]);

  // Evoluem por troca (poupam doces ao trocar).
  const TRADE_EVO = new Set([
    64,  // Kadabra → Alakazam
    67,  // Machoke → Machamp
    75,  // Graveler → Golem
    93,  // Haunter → Gengar
    525, // Boldore → Gigalith
    533, // Gurdurr → Conkeldurr
    588, // Karrablast → Escavalier
    616, // Shelmet → Accelgor
    708, // Phantump → Trevenant
    710, // Pumpkaboo → Gourgeist
  ]);

  return { LEGENDARY, REGIONAL, TRADE_EVO };
});
