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
      // Fase 3+ — relevância de meta herdada da linha evolutiva (preenchida por analyze
      // quando há meta): true se alguma forma mais evoluída da família é meta, e o nome
      // da evolução-meta alvo (p/ o aviso "Evoluir → <alvo>").
      metaEvo: false,
      metaEvoTarget: null,
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

  // Uma espécie é meta-relevante se é atacante PvE (raid/pve/gym_atk) OU aparece no
  // ranking PvP de alguma liga. Sombrio prefere a entrada _shadow (como em evalMon).
  function _isMetaSpecies(id, isShadow, meta) {
    if (!meta) return false;
    var pve = meta.pveRanks;
    if (pve) {
      var pid = (isShadow && pve[id + '_shadow']) ? id + '_shadow' : id;
      var pr = pve[pid];
      if (pr && (pr.roles || []).some(function (r) { return r === 'raid' || r === 'pve' || r === 'gym_atk'; })) return true;
    }
    var pvp = meta.pvpRanks;
    if (pvp) {
      var vid = (isShadow && pvp[id + '_shadow']) ? id + '_shadow' : id;
      var vr = pvp[vid];
      if (vr && (vr.great || vr.ultra || vr.master)) return true;
    }
    return false;
  }

  // Índice família → evolução-meta. Para cada espécie BASE, guarda o id da forma mais
  // evoluída e meta da mesma família (a de maior base stats, quando há várias) — separado
  // por base/Sombrio. Sem arestas de evolução nos dados, usamos a soma de base stats como
  // proxy de estágio. O id do alvo serve para nomear o aviso "Evoluir → <alvo>".
  function _buildEvoMetaIndex(meta) {
    if (!meta || !meta.speciesIndex || !meta.speciesIndex.byId) return null;
    var byId = meta.speciesIndex.byId;
    var fam = {};
    for (var id in byId) {
      if (/_shadow$/.test(id)) continue;            // Sombrio não é espécie à parte aqui
      var o = byId[id];
      if (!o || !o.family || !o.baseStats) continue;
      (fam[o.family] = fam[o.family] || []).push(id);
    }
    var base = {}, shadow = {};
    for (var f in fam) {
      var ids = fam[f];
      for (var i = 0; i < ids.length; i++) {
        var myBst = _bst(byId[ids[i]].baseStats);
        var myRegion = _regionOf(ids[i]);
        var bBest = null, bBst = -1, sBest = null, sBst = -1;
        for (var j = 0; j < ids.length; j++) {
          if (i === j) continue;
          if (_regionOf(ids[j]) !== myRegion) continue;           // evolui dentro da região
          var jb = _bst(byId[ids[j]].baseStats);
          if (jb <= myBst) continue;                              // só formas mais evoluídas
          if (jb > bBst && _isMetaSpecies(ids[j], false, meta)) { bBest = ids[j]; bBst = jb; }
          if (jb > sBst && _isMetaSpecies(ids[j], true, meta))  { sBest = ids[j]; sBst = jb; }
        }
        if (bBest) base[ids[i]] = bBest;
        if (sBest) shadow[ids[i]] = sBest;
      }
    }
    return { base: base, shadow: shadow };
  }

  // id da evolução-meta desta cópia (ou null). Trata a variante Sombria.
  function _metaEvoFor(e, evoIdx) {
    if (!evoIdx || !e.speciesId) return null;
    var id = String(e.speciesId).replace(/_shadow$/, '');
    return (e.isShadow ? evoIdx.shadow[id] : evoIdx.base[id]) || null;
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

  // Nome de exibição de um moveId: namePt (moves.json) → senão inglês humanizado.
  function _moveName(id, meta) {
    const m = meta && meta.moves && meta.moves[id];
    return (m && m.namePt) || _humanMove(id);
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

  // Visão de exibição do moveset recomendado: [{ name, has }] (render não conhece meta).
  function _movesetView(rec, mine, meta) {
    if (!rec || !rec.length) return null;
    const m = mine || [];
    return rec.map(function (id) {
      return { name: _moveName(id, meta), has: m.indexOf(id) >= 0 };
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

  // Evoluir: a forma evoluída desta cópia é meta (metaEvo) e a cópia vale o investimento
  // — melhor da espécie OU IV alto (>=90%). Não dispara se a própria forma já é meta
  // (nesse caso o gancho de moveset/Fortalecer cuida) nem se nada herda relevância.
  const EVOLVE_MIN_IV = 90;
  function _evolveAction(e) {
    if (!e.metaEvo) return null;
    if (isPvpMeta(e) || isPveMeta(e)) return null;
    if (!(e.isBestOfSpecies || e.ivPct >= EVOLVE_MIN_IV)) return null;
    const alvo = e.metaEvoTarget || 'forma evoluída';
    const qual = e.isHundo ? '100%' : 'IV ' + e.ivPct + '%';
    return { kind: 'EVOLUIR', target: e.metaEvoTarget || null,
      reason: 'Evoluir p/ ' + alvo + ' — evolução é meta e esta cópia vale (' + qual + ')' };
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

  function analyze(fileData, getSize, refdata, getSizeScalar, meta) {
    const list = enrichCollection(fileData, getSize, refdata, getSizeScalar, meta);
    const evoIdx = _buildEvoMetaIndex(meta);
    for (const e of list) {
      e.pvpMeta = (meta && meta.cpm && meta.pvpRanks && PokePvp) ? PokePvp.evalMon(e, meta) : null;
      e.pveMeta = (meta && meta.pveRanks && PokePve) ? PokePve.evalMon(e, meta) : null;
      _attachMovesetViews(e, meta);
      e.isRocketReady = (meta && meta.moves && PokePve)
        ? PokePve.rocketSpam(e.moveIds, meta.moves) : false;
      const evoTarget = _metaEvoFor(e, evoIdx);
      e.metaEvo = !!evoTarget;
      e.metaEvoTarget = evoTarget ? _humanSpecies(evoTarget) : null;
      e.tags = computeTags(e);
      e.action = computeAction(e, meta);
      const v = computeVerdict(e);
      e.verdict = v.verdict;
      e.reason = v.reason;
      e.tradeBoost = tradeBoost(e);
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
