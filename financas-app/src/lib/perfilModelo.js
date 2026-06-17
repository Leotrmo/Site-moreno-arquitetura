// Modelo do perfil.dados (jsonb) no formato que o analisador consome.
// perfilPadrao(): seed pré-preenchido usado quando não há perfil salvo.
// normalizarPerfil(): hidrata um perfil salvo garantindo o shape, SEM
// reinjetar fixos que o usuário tenha apagado.

export function perfilPadrao() {
  return {
    salarios: { leo: 0, luis: 0, diaPagamento: 5 },
    fixos: [
      { nome: 'Condomínio', valor: 525, pessoa: 'compartilhado' },
      { nome: 'Energia (Copel)', valor: 220, pessoa: 'compartilhado' },
      { nome: 'Seguro do carro', valor: 230, pessoa: 'leo' },
      { nome: 'IPTU', valor: 45, pessoa: 'compartilhado' },
      { nome: 'Simples Nacional', valor: 275, pessoa: 'leo' },
    ],
    metas: [],
  };
}

export function normalizarPerfil(dados) {
  const d = dados || {};
  const s = d.salarios || {};
  return {
    salarios: {
      leo: Number(s.leo) || 0,
      luis: Number(s.luis) || 0,
      diaPagamento: Number(s.diaPagamento) || 5,
    },
    fixos: Array.isArray(d.fixos) ? d.fixos : [],
    metas: Array.isArray(d.metas) ? d.metas : [],
  };
}

export function perfilVazio(dados) {
  return !dados || Object.keys(dados).length === 0;
}
