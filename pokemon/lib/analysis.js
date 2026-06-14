// pokemon/lib/analysis.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var PokeMatch = (typeof require === 'function')
    ? require('./meta/match.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokeMatch : null);

  var PokePvp = (typeof require === 'function')
    ? require('./meta/pvp.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokePvp : null);

  var PokePve = (typeof require === 'function')
    ? require('./meta/pve.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokePve : null);

  var TYPE_PT = ((typeof require === 'function')
    ? require('./refdata.js') : (typeof globalThis !== 'undefined' ? globalThis : {})).TYPE_PT || {};

  var MOVE_PT_OVERRIDE = ((typeof require === 'function')
    ? require('./refdata.js') : (typeof globalThis !== 'undefined' ? globalThis : {})).MOVE_PT_OVERRIDE || {};

  function speciesScalar(getSizeScalar, mon) {
    if (typeof getSizeScalar !== 'function') return null;
    return getSizeScalar(mon.mon_number, mon.mon_height, mon.mon_form) || null;
  }

  function ivPct(mon) {
    return Math.round((mon.mon_attack + mon.mon_defence + mon.mon_stamina) / 45 * 100);
  }

  // Mecânica de troca do Pokémon GO: ao trocar, cada IV (Atk/Def/HP) é
  // re-sorteado de forma independente e uniforme no intervalo [piso, 15]. O piso
  // sobe com o nível de amizade — Melhor Amigo usa piso 5 em cada IV.
  const BEST_FRIEND_FLOOR = 5;
  // Piso garantido após a troca: 3 × 5 / 45 → 33%.
  const TRADE_MIN_IV_PCT = Math.round(3 * BEST_FRIEND_FLOOR / 45 * 100);
  // Média esperada: cada IV vira (5 + 15) / 2 = 10 → 3 × 10 / 45 → 67%.
  const TRADE_EXPECTED_IV_PCT = Math.round(3 * (BEST_FRIEND_FLOOR + 15) / 2 / 45 * 100);

  function canBestFriendTrade(e) {
    // Sombrios não podem ser trocados no jogo. Shiny, Lucky, Lendário/Mítico e
    // Fantasia são colecionáveis valiosos demais para re-sortear só por IV.
    return !e.isShadow && !e.isShiny && !e.isLucky && !e.isLegendary && !e.isCostume;
  }

  // Vale trocar com Melhor Amigo só os Pokémons que você quer manter e cujo IV
  // está abaixo da média esperada da troca (~67%). Quem já vai pra TRANSFERIR não
  // entra — nesse caso você simplesmente transfere.
  function tradeBoost(e) {
    if (e.verdict === 'TRANSFERIR') return null;
    if (!canBestFriendTrade(e)) return null;
    if (e.ivPct >= TRADE_EXPECTED_IV_PCT) return null;
    const guaranteed = e.ivPct < TRADE_MIN_IV_PCT;
    return {
      expectedPct: TRADE_EXPECTED_IV_PCT,
      minPct: TRADE_MIN_IV_PCT,
      guaranteed,
      reason: guaranteed
        ? 'Troca Melhor Amigo: ganho garantido (mín. ' + TRADE_MIN_IV_PCT + '% > ' + e.ivPct + '%)'
        : 'Troca Melhor Amigo: IV médio esperado ~' + TRADE_EXPECTED_IV_PCT + '%',
    };
  }

  function speciesKey(mon) {
    // No JSON, a mesma espécie às vezes vem com mon_form "X_NORMAL" e às vezes
    // sem mon_form. Ambos são a forma base e devem agrupar juntos; só formas
    // especiais (regionais/Hisui/etc.) ganham chave própria.
    const f = mon.mon_form;
    if (!f || /_NORMAL$/.test(f)) return mon.mon_number + '_BASE';
    return mon.mon_number + '_' + f;
  }

  function enrichOne(mon, getSize, refdata, getSizeScalar, meta) {
    const iv = ivPct(mon);
    const size = getSize(mon.mon_number, mon.mon_height, mon.mon_form);
    const scalar = speciesScalar(getSizeScalar, mon);
    const sid = (meta && meta.speciesIndex && PokeMatch)
      ? PokeMatch.matchSpecies(mon, meta.speciesIndex) : null;
    const eliteMoves = (sid && meta.speciesIndex.byId && meta.speciesIndex.byId[sid] && meta.speciesIndex.byId[sid].eliteMoves)
      ? meta.speciesIndex.byId[sid].eliteMoves : [];
    return {
      raw: mon,
      name: mon.mon_name,
      number: mon.mon_number,
      form: mon.mon_form || null,
      cp: mon.mon_cp,
      ivPct: iv,
      ivs: { atk: mon.mon_attack, def: mon.mon_defence, sta: mon.mon_stamina },
      moves: [mon.mon_move_1, mon.mon_move_2, mon.mon_move_3].filter(Boolean),
      height: mon.mon_height,
      weight: mon.mon_weight,
      pvp: mon.mon_pvp_stats || null,
      size: size,
      sizeScalar: scalar,
      isShiny: mon.mon_isShiny === 'YES',
      isLucky: mon.mon_isLucky === 'YES',
      isShadow: mon.mon_alignment === 'SHADOW',
      isPurified: mon.mon_alignment === 'PURIFIED',
      isLegendary: refdata.LEGENDARY.has(mon.mon_number),
      isCostume: !!mon.mon_costume,
      isExtremeSize: size === 'XXS' || size === 'XXL',
      isXSComfort: size === 'XS' && scalar !== null && scalar < 0.70,
      isXLComfort: size === 'XL' && scalar !== null && scalar > 1.40,
      hasSecondCharge: !!mon.mon_move_3,
      isHundo: iv === 100,
      isNearPerfect: iv >= 96,
      isRegional: refdata.REGIONAL.has(mon.mon_number),
      isTradeEvo: refdata.TRADE_EVO.has(mon.mon_number),
      speciesKey: speciesKey(mon),
      // preenchidos por enrichCollection:
      id: null,
      isBestOfSpecies: false,
      isOnlyCopy: false,
      betterCopy: null,
      // preenchidos por analyze:
      verdict: null,
      reason: null,
      tags: [],
      tradeBoost: null,
      movesetTip: null,
      // Fase 0 — casamento com o meta (null/[] quando meta ausente):
      speciesId: sid,
      moveIds: (meta && meta.movesPt && PokeMatch)
        ? [mon.mon_move_1, mon.mon_move_2, mon.mon_move_3]
            .map(function (m) { return PokeMatch.matchMove(m, meta.movesPt); })
            .filter(Boolean)
        : [],
      eliteMoves: eliteMoves,
      // Fase 1 — avaliação PvP (preenchida por analyze quando há meta).
      // ATENÇÃO: chamar de pvpMeta, não pvp — pvp já existe (mon_pvp_stats).
      pvpMeta: null,
      pveMeta: null,
      isRocketReady: false,
      // Fase 3+ — relevância de meta da linha evolutiva (preenchida por analyze):
      // evoProj = projeção value-ok da forma evoluída (ou null); metaEvo = !!evoProj.
      // evoOwned (já tenho a evolução como keeper) é preenchido na passada de posse.
      metaEvo: false,
      metaEvoTarget: null,
      evoProj: null,
      evoOwned: false,
      action: null,
    };
  }

  function enrichCollection(fileData, getSize, refdata, getSizeScalar, meta) {
    const list = Object.keys(fileData).map(id => {
      const e = enrichOne(fileData[id], getSize, refdata, getSizeScalar, meta);
      e.id = id;
      return e;
    });
    const groups = {};
    for (const e of list) (groups[e.speciesKey] = groups[e.speciesKey] || []).push(e);
    for (const key in groups) {
      const g = groups[key];
      g.sort((a, b) => (b.ivPct - a.ivPct) || (b.cp - a.cp));
      g[0].isBestOfSpecies = true;
      const only = g.length === 1;
      for (const e of g) {
        e.isOnlyCopy = only;
        if (!e.isBestOfSpecies) e.betterCopy = g[0];
      }
    }
    return list;
  }

  function isPvpMeta(e) {
    return !!(e.pvpMeta && (e.pvpMeta.great.isMeta || e.pvpMeta.ultra.isMeta || e.pvpMeta.master.isMeta));
  }

  function isPveMeta(e) {
    return !!(e.pveMeta && (e.pveMeta.raid || e.pveMeta.pve || e.pveMeta.gymAtk || e.pveMeta.gymDef));
  }

  // Soma dos base stats — proxy de estágio evolutivo dentro de uma família.
  function _bst(b) { return b ? (b.atk + b.def + b.hp) : 0; }

  // Sufixo regional de um speciesId (ou '' p/ a forma normal). Uma forma regional só
  // evolui dentro da própria região, então a evolução-meta tem que casar a região.
  function _regionOf(id) {
    var m = /_(alolan|galarian|hisuian|paldean)$/.exec(String(id || ''));
    return m ? m[1] : '';
  }

  // Candidatos de evolução por speciesId base: formas MAIS evoluídas da mesma família e mesma
  // região (proxy: soma de base stats maior). Sem arestas reais de evolução nos dados.
  function _buildEvoCandidates(meta) {
    if (!meta || !meta.speciesIndex || !meta.speciesIndex.byId) return null;
    var byId = meta.speciesIndex.byId;
    var fam = {};
    for (var id in byId) {
      if (/_shadow$/.test(id)) continue;
      var o = byId[id];
      if (!o || !o.family || !o.baseStats) continue;
      (fam[o.family] = fam[o.family] || []).push(id);
    }
    var out = {};
    for (var f in fam) {
      var ids = fam[f];
      for (var i = 0; i < ids.length; i++) {
        var myBst = _bst(byId[ids[i]].baseStats);
        var myRegion = _regionOf(ids[i]);
        var cand = [];
        for (var j = 0; j < ids.length; j++) {
          if (i === j) continue;
          if (_regionOf(ids[j]) !== myRegion) continue;            // evolui dentro da região
          if (_bst(byId[ids[j]].baseStats) > myBst) cand.push(ids[j]);
        }
        if (cand.length) out[ids[i]] = cand;
      }
    }
    return out;
  }

  const PVP_PREFIX = 'pvp_';
  const PVP_TAG_ORDER = [PVP_PREFIX + 'great', PVP_PREFIX + 'ultra', PVP_PREFIX + 'master'];
  // Força relativa das projeções (maior = preferida) ao escolher entre vários candidatos.
  const EVO_SCORE = { pvp: { great: 5, ultra: 4, master: 3 }, pve: { raid: 2, gym_atk: 1, pve: 0 } };
  // Papéis PvE não filtram por IV (pve.js assume 15/15/15) → evolução só-PvE exige piso de IV.
  const EVOLVE_PVE_MIN_IV = 80;

  // Projeta UMA evolução com os IVs desta cópia pelos avaliadores reais. Retorna objeto
  // value-ok { target, targetId, kind, league, role, speciesRank, spPct, erRank, tipo } ou null.
  function _projectEvolution(e, evolvedId, meta) {
    var syn = { speciesId: evolvedId, ivs: e.ivs, ivPct: e.ivPct, isShadow: e.isShadow, moveIds: [] };
    var pvp = (meta && meta.cpm && meta.pvpRanks && PokePvp) ? PokePvp.evalMon(syn, meta) : null;
    var pve = (meta && meta.pveRanks && PokePve) ? PokePve.evalMon(syn, meta) : null;
    var pvpTags = (pvp && PokePvp) ? PokePvp.pvpTags(pvp, e.ivPct) : [];
    var target = _humanSpecies(evolvedId);
    // PvP tem prioridade e já vem gateado por spPct/ivRank (pvpTags).
    for (var i = 0; i < PVP_TAG_ORDER.length; i++) {
      if (pvpTags.indexOf(PVP_TAG_ORDER[i]) >= 0) {
        var lg = PVP_TAG_ORDER[i].slice(PVP_PREFIX.length);        // great|ultra|master
        var L = pvp[lg];
        return { target: target, targetId: evolvedId, kind: 'pvp', league: lg,
                 speciesRank: L.speciesRank, spPct: L.spPct, role: null, erRank: null, tipo: null };
      }
    }
    // Só PvE (atacante): exige piso de IV explícito.
    var pveAttacker = !!(pve && (pve.raid || pve.gymAtk || pve.pve));
    if (pveAttacker && e.ivPct >= EVOLVE_PVE_MIN_IV) {
      var role = pve.raid ? 'raid' : (pve.gymAtk ? 'gym_atk' : 'pve');
      var bt = pve.bestType && pve.byType ? pve.byType[pve.bestType] : null;
      return { target: target, targetId: evolvedId, kind: 'pve', league: null,
               role: role, speciesRank: null, spPct: null,
               erRank: (bt && typeof bt.erRank === 'number') ? bt.erRank : null,
               tipo: TYPE_PT[pve.bestType] || pve.bestType || 'ataque' };
    }
    return null;
  }

  // Melhor projeção entre os candidatos. Força: pvp_great>ultra>master>raid>gym_atk>pve.
  function _bestEvolveProjection(e, evoCandidates, meta) {
    if (!evoCandidates || !e.speciesId) return null;
    var base = String(e.speciesId).replace(/_shadow$/, '');
    var cands = evoCandidates[base];
    if (!cands) return null;
    var best = null, bestScore = -1;
    for (var i = 0; i < cands.length; i++) {
      var p = _projectEvolution(e, cands[i], meta);
      if (!p) continue;
      var s = p.kind === 'pvp' ? EVO_SCORE.pvp[p.league] : EVO_SCORE.pve[p.role];
      if (s > bestScore) { best = p; bestScore = s; }
    }
    return best;
  }

  // Humaniza um speciesId p/ exibição: 'machamp' → 'Machamp', 'mr_mime' → 'Mr Mime'.
  function _humanSpecies(id) {
    return String(id || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // Relevância de meta para o gancho de ação Aguardar-Rocket: a cópia é meta, OU é uma
  // pré-evolução de uma espécie meta (herda a relevância da linha evolutiva). Não afeta
  // proteção/transferência — só destrava o aviso de evento Rocket p/ Sombrios úteis.
  function isMetaRelevant(e) {
    return isPvpMeta(e) || isPveMeta(e) || !!e.metaEvo;
  }

  function isProtected(e) {
    return e.isShiny || e.isLucky || e.isShadow || e.isLegendary
        || e.isCostume || e.isExtremeSize || e.isHundo || e.isNearPerfect
        || e.isXSComfort || e.isXLComfort
        || e.hasSecondCharge
        || e.isTradeEvo || e.isRegional
        || isPvpMeta(e) || isPveMeta(e);
  }

  function investReason(e) {
    if (e.isHundo) return 'Perfeito (15/15/15)';
    if (e.isNearPerfect) return 'Quase perfeito (' + e.ivPct + '%)';
    return 'Melhor cópia · IV ' + e.ivPct + '%';
  }

  // Prioridade (mais forte → mais fraca): Hundo > Quase-perfeito > Shiny >
  // Lendário > Lucky > Shadow > Costume > XXS/XXL > XS/XL comfort >
  // 2º carregado > Trade evo > Regional.
  function specialReason(e) {
    if (e.isHundo)        return 'Perfeito (15/15/15)';
    if (e.isNearPerfect)  return 'Quase perfeito (' + e.ivPct + '%)';
    if (e.isShiny)        return 'Shiny — protegido';
    if (e.isLegendary)    return 'Lendário/mítico';
    if (e.isLucky)        return 'Lucky — protegido';
    if (e.isShadow)       return 'Sombrio — protegido';
    if (e.isCostume)      return 'Fantasia — colecionável';
    if (e.isExtremeSize)  return 'Tamanho ' + e.size + ' — raro';
    if (e.isXSComfort)    return 'XS — colecionável';
    if (e.isXLComfort)    return 'XL — colecionável';
    if (e.hasSecondCharge)return 'Tem 2º carregado — investido';
    if (e.isTradeEvo)     return 'Trade evolution — guarde pra troca';
    if (e.isRegional)     return 'Regional — raro de pegar';
    return 'Especial';
  }

  function computeVerdict(e) {
    if (e.action && (e.action.kind === 'FORTALECER' || e.action.kind === 'ENSINAR_TM'))
      return { verdict: 'INVESTIR', reason: e.action.reason };
    if (isProtected(e)) {
      if (e.isHundo || e.isNearPerfect || (e.isBestOfSpecies && e.ivPct >= 90))
        return { verdict: 'INVESTIR', reason: investReason(e) };
      return { verdict: 'MANTER', reason: specialReason(e) };
    }
    if (e.isOnlyCopy || e.isBestOfSpecies) {
      if (e.isBestOfSpecies && e.ivPct >= 90)
        return { verdict: 'INVESTIR', reason: investReason(e) };
      return { verdict: 'MANTER', reason: e.isOnlyCopy ? 'Única cópia da espécie' : 'Melhor cópia (IV ' + e.ivPct + '%)' };
    }
    if (e.ivPct < 80)
      return { verdict: 'TRANSFERIR', reason: 'Você já tem um ' + e.name + ' melhor' };
    return { verdict: 'MANTER', reason: 'Duplicata ok (IV ' + e.ivPct + '%)' };
  }

  const LEAGUE_PT = { great: 'Liga Grande', ultra: 'Liga Ultra', master: 'Liga Mestre' };
  const PVP_LEAGUE_ORDER = ['great', 'ultra', 'master'];

  // Escolhe a melhor liga em que a cópia é boa (tem tag pvp_<liga>), na ordem great>ultra>master.
  function _bestPvpLeague(e) {
    for (const lg of PVP_LEAGUE_ORDER) if (e.tags.includes('pvp_' + lg)) return lg;
    return null;
  }

  // Ação a partir do papel de atacante PvE (raid > gym_atk). null se o mon não é atacante.
  function _pveAction(e, meta) {
    if (!e.pveMeta) return null;
    const role = e.pveMeta.raid ? 'raid' : (e.pveMeta.gymAtk ? 'gym_atk' : null);
    if (!role) return null;
    const tipo = TYPE_PT[e.pveMeta.bestType] || e.pveMeta.bestType || 'ataque';
    const papel = role === 'raid' ? 'Raid' : 'Ataque de Ginásio';
    const bt = e.pveMeta.bestType && e.pveMeta.byType ? e.pveMeta.byType[e.pveMeta.bestType] : null;
    const rankTxt = (bt && typeof bt.erRank === 'number') ? ' — Top ' + bt.erRank + ' atacante de ' + tipo : '';
    if (e.pveMeta.movesetOk) {
      return { kind: 'FORTALECER', role: role,
        reason: 'Fortalecer p/ ' + papel + ' (' + tipo + ')' + rankTxt + ' (estimativa)' };
    }
    // PvE exige os dois golpes do bestMoveset; lista os que faltam.
    const mine = e.moveIds || [];
    const missing = (e.pveMeta.bestMoveset || []).filter(function (id) { return mine.indexOf(id) < 0; });
    return _notReadyAction(e,
      'Ensinar/TM p/ ' + papel + ' (' + tipo + ')' + rankTxt + ' — ' +
      (missing.length ? _faltaTxt(missing, meta) : 'falta o moveset de ataque') + ' (estimativa)', meta);
  }

  // Humaniza um moveId p/ exibição: 'CLOSE_COMBAT' → 'Close Combat'.
  function _humanMove(id) {
    return String(id || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // Nome de exibição de um moveId: namePt (moves.json) → override PT → inglês humanizado.
  function _moveName(id, meta) {
    const m = meta && meta.moves && meta.moves[id];
    return (m && m.namePt) || MOVE_PT_OVERRIDE[id] || _humanMove(id);
  }

  // Golpes que faltam segundo o critério do movesetOk PvP: o rápido se não o tem;
  // os carregados (todos) se não tem nenhum deles.
  function _missingPvpMoves(mine, rec) {
    if (!rec || rec.length < 2) return [];
    const m = mine || [];
    const out = [];
    if (m.indexOf(rec[0]) < 0) out.push(rec[0]);
    const charged = rec.slice(1);
    if (!charged.some(function (c) { return m.indexOf(c) >= 0; })) out.push.apply(out, charged);
    return out;
  }

  // "falta X" / "faltam X e Y" / "faltam X, Y e Z" com nomes de exibição.
  function _faltaTxt(ids, meta) {
    const names = ids.map(function (id) { return _moveName(id, meta); });
    const lista = names.length > 1
      ? names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1]
      : names[0];
    return (names.length > 1 ? 'faltam ' : 'falta ') + lista;
  }

  // Visão de exibição do moveset recomendado: [{ name, has, kind }] (render não conhece meta).
  function _movesetView(rec, mine, meta) {
    if (!rec || !rec.length) return null;
    const m = mine || [];
    return rec.map(function (id) {
      const mv = meta && meta.moves && meta.moves[id];
      return { name: _moveName(id, meta), has: m.indexOf(id) >= 0, kind: (mv && mv.kind) || 'charge' };
    });
  }

  function _attachMovesetViews(e, meta) {
    if (e.pvpMeta) for (const lg of PVP_LEAGUE_ORDER) {
      const L = e.pvpMeta[lg];
      if (L) L.movesetView = (L.isMeta && L.moveset) ? _movesetView(L.moveset, e.moveIds, meta) : null;
    }
    if (e.pveMeta)
      e.pveMeta.movesetView = _movesetView(e.pveMeta.bestMoveset, e.moveIds, meta);
  }

  // Aviso informativo (PvP): mon já tem moveset funcional mas falta o 2º carregado recomendado.
  // Não altera veredito/ação — só sugere desbloquear o 2º carregado. null se não se aplica.
  function _secondChargeTip(e, meta) {
    const lg = _bestPvpLeague(e);
    if (!lg || !e.pvpMeta) return null;
    const L = e.pvpMeta[lg];
    if (!L || !L.isMeta || !L.movesetOk || !L.moveset || L.moveset.length < 3) return null;
    const mine = e.moveIds || [];
    const charged = L.moveset.slice(1);                  // [carregado1, carregado2]
    const missing = charged.filter(function (c) { return mine.indexOf(c) < 0; });
    if (missing.length !== 1) return null;               // 0 = completo; 2 não ocorre (movesetOk exige >=1)
    return { move: missing[0], league: lg,
      reason: 'Desbloquear 2º carregado p/ ' + LEAGUE_PT[lg] + ': ' + _moveName(missing[0], meta) };
  }

  // Moveset recomendado do gancho ativo (PvP da melhor liga; senão PvE bestMoveset).
  function _recommendedMoveset(e) {
    const lg = _bestPvpLeague(e);
    if (lg && e.pvpMeta && e.pvpMeta[lg] && e.pvpMeta[lg].moveset) return e.pvpMeta[lg].moveset;
    if (e.pveMeta && e.pveMeta.bestMoveset) return e.pveMeta.bestMoveset;
    return null;
  }

  // 1º golpe recomendado que o mon NÃO tem E que é legado/Elite TM. null se não houver.
  function _missingLegacyMove(e) {
    const rec = _recommendedMoveset(e);
    if (!rec || !rec.length) return null;
    const mine = e.moveIds || [];
    const elite = e.eliteMoves || [];
    for (let i = 0; i < rec.length; i++) {
      if (mine.indexOf(rec[i]) < 0 && elite.indexOf(rec[i]) >= 0) return rec[i];
    }
    return null;
  }

  // Ação quando o moveset NÃO está pronto: AGUARDAR_EVENTO (golpe legado falta) senão ENSINAR_TM.
  function _notReadyAction(e, ensinarReason, meta) {
    const leg = _missingLegacyMove(e);
    if (leg) {
      return { kind: 'AGUARDAR_EVENTO', legacyMove: leg,
        reason: 'Aguardar Evento — moveset ótimo precisa do golpe legado "' + _moveName(leg, meta) +
                '"; espere Dia Comunitário / Elite TM' };
    }
    return { kind: 'ENSINAR_TM', reason: ensinarReason };
  }

  // Sombrio com Frustração: o golpe Frustração só sai em evento Rocket (Charged TM especial).
  function _isShadowFrustration(e) {
    return !!(e.isShadow && (e.moveIds || []).indexOf('FRUSTRATION') >= 0);
  }

  // Trocar/Reroll: só faz sentido em duplicata pior (você tem uma cópia melhor da espécie).
  function _trocaAction(e) {
    if (!e.betterCopy) return null;
    if (e.isShiny) {
      return { kind: 'TROCAR', reason: 'Trocar shiny duplicado p/ Lucky (Melhor Amigo)' };
    }
    if ((isPvpMeta(e) || isPveMeta(e)) && e.ivPct < 80) {
      return { kind: 'TROCAR',
        reason: 'Trocar p/ reroll de IV — espécie meta, cópia fraca (IV ' + e.ivPct + '%)' };
    }
    return null;
  }

  // Evoluir: a forma evoluída desta cópia é meta value-ok (e.evoProj) e a cópia vale evoluir.
  // _bestEvolveProjection NÃO filtra colecionável/posse — estas travas são o ponto de enforcement:
  // forma própria já meta (gancho de moveset cuida), colecionável de TAMANHO/FANTASIA
  // (shiny/lucky sobrevivem à evolução → não travam) e já possuir a evolução como keeper.
  function _evolveAction(e) {
    if (!e.evoProj) return null;
    if (isPvpMeta(e) || isPveMeta(e)) return null;
    if (e.isCostume || e.isExtremeSize || e.isXSComfort || e.isXLComfort) return null;
    if (e.evoOwned) return null;
    var p = e.evoProj;
    var reason = (p.kind === 'pvp')
      ? 'Evoluir → ' + p.target + ' · seria pick de ' + LEAGUE_PT[p.league] +
        ' (rank ' + p.speciesRank + ' da espécie · seu IV PvP ' + Math.round(p.spPct * 100) + '%)'
      : 'Evoluir → ' + p.target + ' · seria Top ' + (p.erRank != null ? p.erRank : '?') +
        ' atacante de ' + p.tipo + ' (estimativa)';
    return { kind: 'EVOLUIR', target: p.target, reason: reason };
  }

  function computeAction(e, meta) {
    // P1 (Fase 3): Sombrio meta com Frustração → aguardar evento Rocket (pré-empta Fortalecer).
    // "meta" inclui pré-evoluções de espécies meta (ex.: Machop Sombrio → Shadow Machamp).
    if (isMetaRelevant(e) && _isShadowFrustration(e)) {
      return { kind: 'AGUARDAR_ROCKET',
        reason: 'Aguardar Rocket — Sombrio com Frustração; troque o golpe em evento (Charged TM)' };
    }
    // P1b: evoluir cópia boa cuja evolução é meta (pré-evolução; própria forma não é meta).
    const evo = _evolveAction(e);
    if (evo) return evo;
    // P2–P4: gancho de moveset (PvP tem prioridade; senão PvE) → Fortalecer / Aguardar Evento / Ensinar-TM.
    const lg = _bestPvpLeague(e);
    if (lg && e.pvpMeta) {
      const L = e.pvpMeta[lg];
      const ligaPt = LEAGUE_PT[lg];
      const ivInfo = 'IV PvP ' + Math.round(L.spPct * 100) + '% (rank ' + L.ivRank + '/4096)';
      if (L.movesetOk) {
        return { kind: 'FORTALECER', league: lg,
          reason: 'Fortalecer p/ ' + ligaPt + ' — rank ' + L.speciesRank + ' da espécie, seu ' + ivInfo };
      }
      const missing = _missingPvpMoves(e.moveIds, L.moveset);
      return _notReadyAction(e,
        'Ensinar/TM p/ ' + ligaPt + ' — Top ' + L.speciesRank + ', ' +
        (missing.length ? _faltaTxt(missing, meta) : 'falta o moveset recomendado'), meta);
    }
    const pve = _pveAction(e, meta);
    if (pve) return pve;
    // P5: Trocar/Reroll (duplicata pior: shiny lucky ou meta IV baixo).
    return _trocaAction(e);
  }

  function computeTags(e) {
    const tags = [];
    if (e.isTradeEvo) tags.push('TROCAR_EVO');
    if (e.isRegional) tags.push('REGIONAL');
    if (e.pvpMeta && PokePvp) for (const t of PokePvp.pvpTags(e.pvpMeta, e.ivPct)) tags.push(t);
    if (e.pveMeta && PokePve) for (const t of PokePve.pveTags(e.pveMeta)) tags.push(t);
    if (e.isRocketReady) tags.push('rocket');
    return tags;
  }

  // Cópia "keeper" da evolução: vale tê-la em vez de evoluir outra pré-evolução. Espécie SER
  // meta não basta (uma cópia fraca de espécie meta não substitui evoluir uma boa) — exige
  // qualidade da cópia: hundo/quase, melhor da espécie com IV alto, ou pick de PvP (tag IV-gated).
  function _isEvoKeeper(e) {
    if (e.isHundo || e.isNearPerfect) return true;
    if (e.isBestOfSpecies && e.ivPct >= 90) return true;
    for (var i = 0; i < PVP_TAG_ORDER.length; i++) if (e.tags.indexOf(PVP_TAG_ORDER[i]) >= 0) return true;
    return false;
  }

  // Conjunto de speciesId (base, sem _shadow) que já têm ao menos uma cópia keeper. Base só em
  // flags+IV+tags (não no veredito) para não depender da ordem das passadas.
  function _buildOwnedKeepers(list) {
    var owned = {};
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.speciesId) continue;
      if (_isEvoKeeper(e)) owned[String(e.speciesId).replace(/_shadow$/, '')] = true;
    }
    return owned;
  }

  function analyze(fileData, getSize, refdata, getSizeScalar, meta) {
    const list = enrichCollection(fileData, getSize, refdata, getSizeScalar, meta);
    const evoCandidates = _buildEvoCandidates(meta);
    // Passada 1: meta + tags + projeção (sem ações/veredito).
    for (const e of list) {
      e.pvpMeta = (meta && meta.cpm && meta.pvpRanks && PokePvp) ? PokePvp.evalMon(e, meta) : null;
      e.pveMeta = (meta && meta.pveRanks && PokePve) ? PokePve.evalMon(e, meta) : null;
      _attachMovesetViews(e, meta);
      e.isRocketReady = (meta && meta.moves && PokePve)
        ? PokePve.rocketSpam(e.moveIds, meta.moves) : false;
      e.evoProj = _bestEvolveProjection(e, evoCandidates, meta);
      e.metaEvo = !!e.evoProj;
      e.metaEvoTarget = e.evoProj ? e.evoProj.target : null;
      e.tags = computeTags(e);
    }
    const owned = _buildOwnedKeepers(list);
    // Passada 2: posse → ações + veredito.
    for (const e of list) {
      e.evoOwned = !!(e.evoProj && owned[e.evoProj.targetId]);
      e.action = computeAction(e, meta);
      const v = computeVerdict(e);
      e.verdict = v.verdict;
      e.reason = v.reason;
      e.tradeBoost = tradeBoost(e);
      e.movesetTip = _secondChargeTip(e, meta);
    }
    return list;
  }

  function computeCounts(list) {
    const c = { total: list.length, INVESTIR:0, MANTER:0, TRANSFERIR:0,
                hundos:0, shinies:0, shadows:0, purified:0, extremeSizes:0, legendaries:0, luckies:0, tradeBoost:0,
                pvpGreat:0, pvpUltra:0, pvpMaster:0,
                raid:0, pve:0, gymAtk:0, gymDef:0, rocket:0, evoluir:0 };
    for (const e of list) {
      c[e.verdict]++;
      if (e.isHundo) c.hundos++;
      if (e.isShiny) c.shinies++;
      if (e.isShadow) c.shadows++;
      if (e.isPurified) c.purified++;
      if (e.isExtremeSize) c.extremeSizes++;
      if (e.isLegendary) c.legendaries++;
      if (e.isLucky) c.luckies++;
      if (e.tradeBoost) c.tradeBoost++;
      if (e.tags.includes('pvp_great'))  c.pvpGreat++;
      if (e.tags.includes('pvp_ultra'))  c.pvpUltra++;
      if (e.tags.includes('pvp_master')) c.pvpMaster++;
      if (e.tags.includes('raid'))    c.raid++;
      if (e.tags.includes('pve'))     c.pve++;
      if (e.tags.includes('gym_atk')) c.gymAtk++;
      if (e.tags.includes('gym_def')) c.gymDef++;
      if (e.tags.includes('rocket')) c.rocket++;
      if (e.action && e.action.kind === 'EVOLUIR') c.evoluir++;
    }
    return c;
  }

  return { ivPct, speciesKey, enrichOne, enrichCollection, isProtected, isPvpMeta, isPveMeta, isMetaRelevant, computeVerdict, computeTags, computeAction, canBestFriendTrade, tradeBoost, analyze, computeCounts,
           TRADE_MIN_IV_PCT, TRADE_EXPECTED_IV_PCT };
});
